import type { z } from 'zod'
import { db, type Repo } from '../db/store'
import type { Json, Role, TableName } from '../db/schema'
import { audit } from '../lib/audit'
import { JobCancelledError, ToolError } from '../lib/errors'

export type ActorRole = Role | 'agent' | 'system'

export interface Actor {
  type: 'user' | 'agent' | 'system'
  /** User id for people, agent name for agents. */
  id: string
  role: ActorRole
}

export interface ToolContext {
  repo: Repo
  actor: Actor
  jobId?: string | null
  agentRunId?: string | null
  idempotencyKey?: string | null
  isCancelled?: () => boolean
}

export interface ToolDef<S extends z.ZodType = z.ZodType, O = unknown> {
  name: string
  description: string
  allow: ActorRole[]
  /** Side-effecting tools are audited, deduplicated by idempotency key and blocked once a job is cancelled. */
  sideEffect: boolean
  input: S
  run: (ctx: ToolContext, input: z.infer<S>) => O
  auditEntity?: (result: O) => { table: TableName; id: string } | null
}

export const STAFF: ActorRole[] = ['broker', 'manager', 'admin']

export function defineTool<S extends z.ZodType, O>(def: ToolDef<S, O>): ToolDef<S, O> {
  return def
}

const registry = new Map<string, ToolDef>()

export function registerTools(defs: ToolDef[]) {
  defs.forEach((d) => registry.set(d.name, d))
}

export function listTools() {
  return [...registry.values()].map((d) => ({
    name: d.name,
    description: d.description,
    allow: d.allow,
    sideEffect: d.sideEffect,
  }))
}

function recordCall(
  ctx: ToolContext,
  tool: string,
  args: unknown,
  status: 'ok' | 'error' | 'blocked',
  result: unknown,
  started: number,
) {
  if (!ctx.agentRunId) return
  ctx.repo.insert('agent_tool_calls', {
    agent_run_id: ctx.agentRunId,
    tool,
    args: structuredClone(args ?? null) as Json,
    result: structuredClone(result ?? null) as Json,
    status,
    idempotency_key: status === 'ok' ? (ctx.idempotencyKey ?? null) : null,
    duration_ms: Date.now() - started,
  })
}

/**
 * The only way agents (and the API layer) change data. Validates input, checks the caller's role,
 * respects cancellation, replays completed side effects for a repeated idempotency key,
 * runs the tool atomically and records the call plus an audit event.
 */
export function invokeTool<O = unknown>(name: string, rawInput: unknown, ctx: ToolContext): O {
  const started = Date.now()
  const def = registry.get(name) as ToolDef<z.ZodType, O> | undefined
  if (!def) throw new ToolError('not_found', `Unknown tool ${name}`)

  if (ctx.idempotencyKey) {
    const prior = ctx.repo.find(
      'agent_tool_calls',
      (c) => c.idempotency_key === ctx.idempotencyKey && c.status === 'ok' && c.tool === name,
    )
    if (prior) return structuredClone(prior.result) as O
  }

  if (!def.allow.includes(ctx.actor.role)) {
    const err = new ToolError('forbidden', `${ctx.actor.role} is not permitted to call ${name}`)
    recordCall(ctx, name, rawInput, 'blocked', { error: err.message }, started)
    audit(ctx.repo, ctx.actor, 'tool.blocked', null, { after: { tool: name, reason: err.message } }, ctx.jobId ?? null)
    throw err
  }

  if (def.sideEffect && ctx.isCancelled?.()) {
    recordCall(ctx, name, rawInput, 'blocked', { error: 'job cancelled' }, started)
    throw new JobCancelledError()
  }

  const parsed = def.input.safeParse(rawInput)
  if (!parsed.success) {
    const err = new ToolError('validation', `Invalid input for ${name}`, parsed.error.issues)
    recordCall(ctx, name, rawInput, 'error', { error: err.message, issues: parsed.error.issues }, started)
    throw err
  }

  try {
    const result = db.transaction(() => {
      const out = def.run(ctx, parsed.data)
      if (def.sideEffect) {
        audit(ctx.repo, ctx.actor, name, def.auditEntity?.(out) ?? null, { after: out }, ctx.jobId ?? null)
      }
      return out
    })
    recordCall(ctx, name, parsed.data, 'ok', result, started)
    return structuredClone(result)
  } catch (e) {
    const err = e instanceof ToolError ? e : new ToolError('internal', e instanceof Error ? e.message : String(e))
    recordCall(ctx, name, parsed.data, err.code === 'approval_required' ? 'blocked' : 'error', { error: err.message, code: err.code }, started)
    if (err.code === 'approval_required' || err.code === 'approval_stale') {
      audit(ctx.repo, ctx.actor, 'tool.blocked', null, { after: { tool: name, reason: err.message } }, ctx.jobId ?? null)
    }
    throw err
  }
}
