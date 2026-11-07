import type { Job, JobStatus, JobStep, Json } from '../db/schema'
import { newId, nowIso, Repo } from '../db/store'
import { audit } from '../lib/audit'
import { JobCancelledError, ToolError } from '../lib/errors'
import { invokeTool, type Actor } from '../tools/registry'

export interface StepContext {
  repo: Repo
  job: Job
  step: JobStep
  /** Calls a registered tool as this step's agent, with an idempotency key unique to this call. */
  call<O = unknown>(tool: string, input: unknown): O
  link(links: Partial<Pick<Job, 'customer_id' | 'lead_id' | 'quote_id'>>): void
}

export type StepOutcome =
  | { kind: 'done'; output: Json }
  | { kind: 'await_approval'; approval_id: string; output: Json }

export interface WorkflowStep {
  key: string
  name: string
  agent: string
  run(ctx: StepContext): StepOutcome | Promise<StepOutcome>
}

export interface WorkflowDefinition {
  type: string
  title: string
  steps: WorkflowStep[]
  /** Step to restart from when a broker requests changes on this workflow's approval. */
  restartOnChangesFrom?: string
}

const workflows = new Map<string, WorkflowDefinition>()
export const registerWorkflow = (def: WorkflowDefinition) => void workflows.set(def.type, def)
export const listWorkflows = (): WorkflowDefinition[] => [...workflows.values()]
export function getWorkflow(type: string): WorkflowDefinition {
  const def = workflows.get(type)
  if (!def) throw new ToolError('not_found', `Unknown workflow ${type}`)
  return def
}

const TAB_ID = `tab-${newId().slice(0, 8)}`
const LOCK_STALE_MS = 8000
let stepDelayMs = 900
/** Returns the previous settings so a caller can restore them. */
export function configureRunner(opts: { stepDelayMs?: number }): { stepDelayMs: number } {
  const previous = { stepDelayMs }
  if (opts.stepDelayMs !== undefined) stepDelayMs = opts.stepDelayMs
  return previous
}

const active = new Map<string, Promise<void>>()
const SYSTEM: Actor = { type: 'system', id: 'job_runner', role: 'system' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const stepsOf = (repo: Repo, jobId: string) =>
  repo.list('job_steps', (s) => s.job_id === jobId).sort((a, b) => a.seq - b.seq)

const lockedElsewhere = (j: Job) =>
  Boolean(j.locked_by && j.locked_by !== TAB_ID && j.locked_at && Date.now() - Date.parse(j.locked_at) < LOCK_STALE_MS)

/** Runs a job until it finishes or stops for a person. Resolves immediately if it is already running here. */
export function kick(tenantId: string, jobId: string): Promise<void> {
  const running = active.get(jobId)
  if (running) return running
  const p = runLoop(new Repo(tenantId), jobId).finally(() => active.delete(jobId))
  active.set(jobId, p)
  return p
}

/** Starts work on the next tick, so callers can still cancel a job they just created. */
function schedule(repo: Repo, jobId: string) {
  setTimeout(() => void kick(repo.tenantId, jobId), 0)
}

export interface CreateJobInput {
  workflow_type: string
  inputs: Record<string, Json>
  initiated_by: Actor
  links?: Partial<Pick<Job, 'customer_id' | 'lead_id' | 'quote_id'>>
  idempotency_key?: string
}

export function createJob(repo: Repo, input: CreateJobInput): Job {
  const def = getWorkflow(input.workflow_type)
  if (input.idempotency_key) {
    const existing = repo.find('jobs', (j) => j.idempotency_key === input.idempotency_key)
    if (existing) return existing
  }
  const job = repo.insert('jobs', {
    workflow_type: def.type,
    agent: 'orchestrator',
    status: 'queued',
    initiated_by: input.initiated_by.type === 'user' && input.initiated_by.role !== 'visitor' ? input.initiated_by.id : null,
    inputs: input.inputs,
    outputs: null,
    error: null,
    customer_id: input.links?.customer_id ?? null,
    lead_id: input.links?.lead_id ?? null,
    quote_id: input.links?.quote_id ?? null,
    idempotency_key: input.idempotency_key ?? null,
    attempt: 0,
    revision: 0,
    cancel_requested: false,
    locked_by: null,
    locked_at: null,
    started_at: null,
    completed_at: null,
    archived_at: null,
  })
  def.steps.forEach((s, i) =>
    repo.insert('job_steps', {
      job_id: job.id,
      seq: i + 1,
      key: s.key,
      agent: s.agent,
      name: s.name,
      status: 'pending',
      input: null,
      output: null,
      error: null,
      started_at: null,
      completed_at: null,
    }),
  )
  audit(
    repo,
    input.initiated_by,
    'job.create',
    { table: 'jobs', id: job.id },
    { after: { workflow: def.type, plan: def.steps.map((s) => s.name) } },
    job.id,
  )
  schedule(repo, job.id)
  return job
}

function finalizeCancelled(repo: Repo, jobId: string, reason = 'Cancelled') {
  stepsOf(repo, jobId)
    .filter((s) => s.status === 'pending' || s.status === 'running')
    .forEach((s) => repo.update('job_steps', s.id, { status: 'cancelled', completed_at: nowIso() }))
  repo
    .list('agent_runs', (r) => r.job_id === jobId && r.status === 'running')
    .forEach((r) => repo.update('agent_runs', r.id, { status: 'cancelled', completed_at: nowIso() }))
  repo
    .list('approval_requests', (a) => a.job_id === jobId && a.status === 'pending')
    .forEach((a) => repo.update('approval_requests', a.id, { status: 'cancelled', decision_note: reason }))
  repo.update('jobs', jobId, { status: 'cancelled', completed_at: nowIso(), locked_by: null, locked_at: null })
  audit(repo, SYSTEM, 'job.cancelled', { table: 'jobs', id: jobId }, { after: { reason } }, jobId)
}

async function runLoop(repo: Repo, jobId: string): Promise<void> {
  let job = repo.get('jobs', jobId)
  if (!job || (job.status !== 'queued' && job.status !== 'running') || lockedElsewhere(job)) return
  if (job.cancel_requested) return finalizeCancelled(repo, jobId)
  const def = workflows.get(job.workflow_type)
  if (!def) {
    repo.update('jobs', jobId, { status: 'failed', error: { code: 'not_found', message: 'Workflow definition missing' } })
    return
  }

  job = repo.update('jobs', jobId, { status: 'running', started_at: job.started_at ?? nowIso(), locked_by: TAB_ID, locked_at: nowIso() })
  const outputs: Record<string, Json> = { ...(job.outputs ?? {}) }
  const unlock = (patch: Partial<Job>) => repo.update('jobs', jobId, { ...patch, locked_by: null, locked_at: null })
  const check = () => {
    const fresh = repo.get('jobs', jobId)
    if (!fresh || fresh.cancel_requested) return 'cancel'
    if (fresh.status === 'paused') return 'pause'
    return 'go'
  }

  for (const step of stepsOf(repo, jobId)) {
    if (step.status === 'completed' || step.status === 'skipped') continue
    const stepDef = def.steps.find((s) => s.key === step.key)
    if (!stepDef) continue

    const before = check()
    if (before === 'cancel') return finalizeCancelled(repo, jobId)
    if (before === 'pause') return void unlock({})

    repo.update('job_steps', step.id, { status: 'running', started_at: nowIso(), error: null })
    repo.update('jobs', jobId, { locked_at: nowIso() })
    if (stepDelayMs) await sleep(stepDelayMs)

    const after = check()
    if (after === 'cancel') return finalizeCancelled(repo, jobId)
    if (after === 'pause') {
      repo.update('job_steps', step.id, { status: 'pending', started_at: null })
      return void unlock({})
    }

    const current = repo.require('jobs', jobId)
    const run = repo.insert('agent_runs', {
      job_id: jobId,
      job_step_id: step.id,
      agent: stepDef.agent,
      adapter: 'deterministic',
      model: null,
      prompt_version: 'slice-1',
      status: 'running',
      tokens_in: null,
      tokens_out: null,
      started_at: nowIso(),
      completed_at: null,
    })
    let callIndex = 0
    const ctx: StepContext = {
      repo,
      job: current,
      step,
      call: <O>(tool: string, input: unknown) =>
        invokeTool<O>(tool, input, {
          repo,
          actor: { type: 'agent', id: stepDef.agent, role: 'agent' },
          jobId,
          agentRunId: run.id,
          idempotencyKey: `${jobId}:r${current.revision}:${step.key}:${tool}:${callIndex++}`,
          isCancelled: () => repo.get('jobs', jobId)?.cancel_requested ?? true,
        }),
      link: (links) => {
        ctx.job = repo.update('jobs', jobId, links)
      },
    }

    try {
      const outcome = await stepDef.run(ctx)
      repo.update('job_steps', step.id, { status: 'completed', output: outcome.output, completed_at: nowIso() })
      repo.update('agent_runs', run.id, { status: 'completed', completed_at: nowIso() })
      outputs[step.key] = outcome.output
      repo.update('jobs', jobId, { outputs })
      if (outcome.kind === 'await_approval') return void unlock({ status: 'awaiting_approval' })
    } catch (e) {
      if (e instanceof JobCancelledError) {
        repo.update('agent_runs', run.id, { status: 'cancelled', completed_at: nowIso() })
        return finalizeCancelled(repo, jobId)
      }
      const err = e instanceof ToolError ? e : new ToolError('internal', e instanceof Error ? e.message : String(e))
      const error = { code: err.code, message: err.message, step: step.key }
      repo.update('job_steps', step.id, { status: 'failed', error, completed_at: nowIso() })
      repo.update('agent_runs', run.id, { status: 'failed', completed_at: nowIso() })
      unlock({ status: 'failed', error })
      audit(repo, SYSTEM, 'job.failed', { table: 'jobs', id: jobId }, { after: error }, jobId)
      return
    }
  }

  unlock({ status: 'completed', completed_at: nowIso() })
  audit(repo, SYSTEM, 'job.completed', { table: 'jobs', id: jobId }, { after: { steps: Object.keys(outputs) } }, jobId)
}

// ---------------------------------------------------------------- controls

function guard(job: Job, allowed: JobStatus[], action: string) {
  if (!allowed.includes(job.status)) {
    throw new ToolError('conflict', `Cannot ${action} a job that is ${job.status.replace(/_/g, ' ')}`)
  }
}

export function pauseJob(repo: Repo, actor: Actor, jobId: string) {
  const job = repo.require('jobs', jobId)
  guard(job, ['queued', 'running'], 'pause')
  audit(repo, actor, 'job.paused', { table: 'jobs', id: jobId }, {}, jobId)
  return repo.update('jobs', jobId, { status: 'paused' })
}

export function resumeJob(repo: Repo, actor: Actor, jobId: string) {
  const job = repo.require('jobs', jobId)
  guard(job, ['paused', 'awaiting_information'], 'resume')
  audit(repo, actor, 'job.resumed', { table: 'jobs', id: jobId }, {}, jobId)
  const updated = repo.update('jobs', jobId, { status: 'queued' })
  schedule(repo, jobId)
  return updated
}

export function cancelJob(repo: Repo, actor: Actor, jobId: string) {
  const job = repo.require('jobs', jobId)
  guard(job, ['draft', 'queued', 'running', 'awaiting_information', 'awaiting_approval', 'paused'], 'cancel')
  audit(repo, actor, 'job.cancel_requested', { table: 'jobs', id: jobId }, {}, jobId)
  repo.update('jobs', jobId, { cancel_requested: true })
  if (!active.has(jobId)) finalizeCancelled(repo, jobId, 'Cancelled by user')
  return repo.require('jobs', jobId)
}

export function retryJob(repo: Repo, actor: Actor, jobId: string) {
  const job = repo.require('jobs', jobId)
  guard(job, ['failed'], 'retry')
  stepsOf(repo, jobId)
    .filter((s) => s.status === 'failed')
    .forEach((s) => repo.update('job_steps', s.id, { status: 'pending', error: null, started_at: null, completed_at: null }))
  audit(repo, actor, 'job.retried', { table: 'jobs', id: jobId }, { after: { attempt: job.attempt + 1 } }, jobId)
  const updated = repo.update('jobs', jobId, { status: 'queued', error: null, attempt: job.attempt + 1 })
  schedule(repo, jobId)
  return updated
}

export function archiveJob(repo: Repo, actor: Actor, jobId: string) {
  const job = repo.require('jobs', jobId)
  guard(job, ['completed', 'failed', 'cancelled'], 'archive')
  audit(repo, actor, 'job.archived', { table: 'jobs', id: jobId }, {}, jobId)
  return repo.update('jobs', jobId, { archived_at: nowIso() })
}

/** Moves the job on after a person decides on its approval request. */
export function onApprovalResolved(repo: Repo, approvalId: string) {
  const approval = repo.require('approval_requests', approvalId)
  if (!approval.job_id) return
  const job = repo.get('jobs', approval.job_id)
  if (!job || job.status !== 'awaiting_approval') return
  const def = workflows.get(job.workflow_type)

  if (approval.status === 'approved') {
    repo.update('jobs', job.id, { status: 'queued' })
    schedule(repo, job.id)
    return
  }
  if (approval.status === 'changes_requested' && def?.restartOnChangesFrom) {
    const fromSeq = def.steps.findIndex((s) => s.key === def.restartOnChangesFrom) + 1
    stepsOf(repo, job.id)
      .filter((s) => s.seq >= fromSeq)
      .forEach((s) => repo.update('job_steps', s.id, { status: 'pending', output: null, started_at: null, completed_at: null }))
    repo.update('jobs', job.id, { status: 'awaiting_information', revision: job.revision + 1 })
    audit(repo, SYSTEM, 'job.changes_requested', { table: 'jobs', id: job.id }, { after: { note: approval.decision_note } }, job.id)
    return
  }
  stepsOf(repo, job.id)
    .filter((s) => s.status === 'pending')
    .forEach((s) => repo.update('job_steps', s.id, { status: 'skipped', completed_at: nowIso() }))
  repo.update('jobs', job.id, {
    status: 'cancelled',
    completed_at: nowIso(),
    outputs: { ...(job.outputs ?? {}), outcome: 'rejected_by_broker', note: approval.decision_note },
  })
  audit(repo, SYSTEM, 'job.cancelled', { table: 'jobs', id: job.id }, { after: { reason: 'Rejected by broker' } }, job.id)
}

/** Restarts work interrupted by a page reload, unless another open tab holds a fresh lock on it. */
export function recoverJobs(tenantId: string) {
  const repo = new Repo(tenantId)
  repo
    .list('jobs', (j) => j.status === 'queued' || j.status === 'running')
    .forEach((j) => {
      if (active.has(j.id) || lockedElsewhere(j)) return
      stepsOf(repo, j.id)
        .filter((s) => s.status === 'running')
        .forEach((s) => repo.update('job_steps', s.id, { status: 'pending', started_at: null }))
      repo.update('jobs', j.id, { status: 'queued', locked_by: null, locked_at: null })
      void kick(tenantId, j.id)
    })
}
