// The Route engine: progress, prerequisites, the stale rule and recorded results. Synchronous and store-backed, so the
// route.* tools run it inside one transaction; Supabase writes (effects) are confirmed before an action is applied.
import type { RouteActionResult, RouteResultStatus, RouteRun } from '@/server/db/routeSchema'
import type { Json } from '@/server/db/schema'
import type { Repo } from '@/server/db/store'
import { ToolError } from '@/server/lib/errors'
import { actionsOf, findAction, getRoute, type ActionInput, type ActionKind, type Check, type RouteAction, type RouteDefinition, type RouteState, type RussMode } from './definitions'

export interface RouteActor {
  type: 'user' | 'agent'
  id: string
  name: string
}

export type ActionStatus = 'done' | 'available' | 'blocked' | 'stale' | 'not_needed'

export interface ActionProgress {
  id: string
  label: string
  kind: ActionKind
  russ: RussMode
  confirm: boolean
  handover: string
  status: ActionStatus
  /** Why it is blocked or out of date. */
  reason: string | null
  /** The latest unsuccessful attempt, until the action is done. */
  last_issue: { status: RouteResultStatus; reason: string; fields: Record<string, string> | null; by: string; at: string } | null
  done: { by: string; by_type: 'user' | 'agent'; at: string; summary: string | null } | null
  is_next: boolean
}

export interface PhaseProgress {
  id: string
  title: string
  status: 'done' | 'current' | 'upcoming'
  actions: ActionProgress[]
}

export interface RouteProgress {
  run: RouteRun
  route: { id: string; title: string; outcome: string; badge: string | null }
  phases: PhaseProgress[]
  next: { id: string; label: string; russ: RussMode; handover: string; phase: string } | null
  complete: boolean
  done_count: number
  total_count: number
  /** Newest first. */
  history: RouteActionResult[]
}

export interface ActionOutcome {
  status: RouteResultStatus
  /** What was done, or why not. */
  message: string
  fields: Record<string, string> | null
  replayed: boolean
}

interface Effective {
  done: RouteActionResult | null
  stale: RouteActionResult | null
  issue: RouteActionResult | null
}

export function requireRoute(id: string): RouteDefinition {
  const def = getRoute(id)
  if (!def) throw new ToolError('not_found', `There is no Route called ${id}.`)
  return def
}

const resultsOf = (repo: Repo, runId: string) => repo.list('route_action_results', (r) => r.run_id === runId)

/** Walks results in order: a done result stands until a later stale result; failed attempts are kept as the latest issue. */
function effective(results: RouteActionResult[]): Map<string, Effective> {
  const m = new Map<string, Effective>()
  for (const r of results) {
    const e = m.get(r.action_id) ?? { done: null, stale: null, issue: null }
    if (r.status === 'done') m.set(r.action_id, { done: r, stale: null, issue: null })
    else if (r.status === 'stale') m.set(r.action_id, { done: null, stale: r, issue: e.issue })
    else m.set(r.action_id, { ...e, issue: r })
  }
  return m
}

function phaseComplete(def: RouteDefinition, phaseId: string, eff: Map<string, Effective>) {
  const phase = def.phases.find((p) => p.id === phaseId)!
  const done = phase.actions.filter((a) => eff.get(a.id)?.done)
  return phase.complete === 'any' ? done.length > 0 : done.length === phase.actions.length
}

function statusOf(def: RouteDefinition, action: RouteAction, eff: Map<string, Effective>): { status: ActionStatus; reason: string | null } {
  const e = eff.get(action.id)
  if (e?.done) return { status: 'done', reason: null }
  const phase = def.phases.find((p) => p.actions.includes(action))!
  if (phase.complete === 'any' && phase.actions.some((a) => eff.get(a.id)?.done)) return { status: 'not_needed', reason: 'Another outcome is already recorded.' }
  for (const req of action.requires) {
    const r = eff.get(req)
    if (r?.done) continue
    return { status: 'blocked', reason: r?.stale?.reason ?? `${findAction(def, req)!.label} comes first.` }
  }
  if (e?.stale) return { status: 'stale', reason: e.stale.reason }
  return { status: 'available', reason: null }
}

export function computeProgress(def: RouteDefinition, run: RouteRun, results: RouteActionResult[]): RouteProgress {
  const eff = effective(results)
  const statuses = new Map(actionsOf(def).map((a) => [a.id, statusOf(def, a, eff)]))
  const complete = def.phases.every((p) => phaseComplete(def, p.id, eff))
  const nextAction = complete
    ? undefined
    : actionsOf(def).find((a) => ['available', 'stale'].includes(statuses.get(a.id)!.status))
  let current = false
  const phases: PhaseProgress[] = def.phases.map((p) => {
    const done = phaseComplete(def, p.id, eff)
    const status = done ? 'done' : current ? 'upcoming' : ((current = true), 'current')
    return {
      id: p.id,
      title: p.title,
      status,
      actions: p.actions.map((a) => {
        const e = eff.get(a.id)
        const s = statuses.get(a.id)!
        return {
          id: a.id,
          label: a.label,
          kind: a.kind,
          russ: a.russ,
          confirm: Boolean(a.confirm),
          handover: a.handover,
          status: s.status,
          reason: s.reason,
          last_issue:
            e?.issue && !e.done
              ? { status: e.issue.status, reason: e.issue.reason ?? '', fields: (e.issue.result as { fields?: Record<string, string> } | null)?.fields ?? null, by: e.issue.actor_name, at: e.issue.created_at }
              : null,
          done: e?.done ? { by: e.done.actor_name, by_type: e.done.actor_type, at: e.done.created_at, summary: e.done.summary } : null,
          is_next: a.id === nextAction?.id,
        }
      }),
    }
  })
  const phaseFor = (id: string) => def.phases.find((p) => p.actions.some((a) => a.id === id))!
  const counted = def.phases.flatMap((p) => (p.complete === 'any' ? [p.actions.some((a) => eff.get(a.id)?.done)] : p.actions.map((a) => Boolean(eff.get(a.id)?.done))))
  return {
    run,
    route: { id: def.id, title: def.title, outcome: def.outcome, badge: def.badge ?? null },
    phases,
    next: nextAction ? { id: nextAction.id, label: nextAction.label, russ: nextAction.russ, handover: nextAction.handover, phase: phaseFor(nextAction.id).title } : null,
    complete,
    done_count: counted.filter(Boolean).length,
    total_count: counted.length,
    history: [...results].reverse().slice(0, 30),
  }
}

export function requireRun(repo: Repo, runId: string): RouteRun {
  const run = repo.get('route_runs', runId)
  if (!run) throw new ToolError('not_found', 'That Route run is not available in this workspace.')
  return run
}

export function progress(repo: Repo, runId: string): RouteProgress {
  const run = requireRun(repo, runId)
  return computeProgress(requireRoute(run.definition_id), run, resultsOf(repo, run.id))
}

/** Starts a run, or returns the active one for the same Route and client so progress is never split. */
export function startOrResume(repo: Repo, actor: RouteActor, body: { definition_id: string; subject_id?: string | null }): { run: RouteRun; resumed: boolean } {
  const def = requireRoute(body.definition_id)
  const active = (r: RouteRun) => r.definition_id === def.id && r.status === 'active'
  const existing = body.subject_id
    ? repo.find('route_runs', (r) => active(r) && r.subject_id === body.subject_id)
    : repo.find('route_runs', (r) => active(r) && !r.subject_id && r.started_by === actor.id)
  if (existing) return { run: existing, resumed: true }
  const run = repo.insert('route_runs', {
    definition_id: def.id,
    subject_type: def.subject,
    subject_id: null,
    subject_label: null,
    category: def.category,
    status: 'active',
    current_action_id: actionsOf(def)[0].id,
    state: {},
    started_by: actor.id,
    started_by_name: actor.name,
    completed_at: null,
  })
  return { run, resumed: false }
}

/** Everything that decides whether an action may run now, without saving anything. */
export function checkAction(repo: Repo, actor: Pick<RouteActor, 'type'>, body: { run_id: string; action_id: string; input: ActionInput }): Check & { record: boolean } {
  const run = requireRun(repo, body.run_id)
  const def = requireRoute(run.definition_id)
  const action = findAction(def, body.action_id)
  if (!action) throw new ToolError('validation', `${def.title} has no action ${body.action_id}.`)
  if (run.status !== 'active') return { status: 'blocked', reason: `This Route is ${run.status === 'completed' ? 'complete' : 'closed'}.`, record: false }
  if (actor.type === 'agent' && action.russ === 'person') return { status: 'blocked', reason: `Needs you: ${action.handover}`, record: false }
  const s = statusOf(def, action, effective(resultsOf(repo, run.id)))
  if (s.status === 'blocked' || s.status === 'not_needed') return { status: 'blocked', reason: s.reason!, record: true }
  if (action.confirm && body.input.confirmed !== true) return { status: 'needs_input', reason: `Confirm “${action.label}” to continue.`, record: true }
  return { ...action.check(run.state as RouteState, body.input), record: true }
}

export function replayOf(repo: Repo, runId: string, key: string | null | undefined) {
  return key ? repo.find('route_action_results', (r) => r.run_id === runId && r.idempotency_key === key) : undefined
}

const outcomeOf = (r: RouteActionResult, replayed: boolean): ActionOutcome => ({
  status: r.status,
  message: (r.status === 'done' ? r.summary : r.reason) ?? '',
  fields: (r.result as { fields?: Record<string, string> } | null)?.fields ?? null,
  replayed,
})

/**
 * Runs one action: checks prerequisites, category, role and input, applies the handler with the confirmed effect
 * receipt, records who did it, marks later results stale when the action changed what they were based on, and moves
 * the run on. A failed action stays open with its reason and can be retried.
 */
export function runAction(
  repo: Repo,
  actor: RouteActor,
  body: { run_id: string; action_id: string; input: ActionInput; receipt?: Json; effect_error?: string | null; key?: string | null },
): ActionOutcome {
  const prior = replayOf(repo, body.run_id, body.key)
  if (prior) return outcomeOf(prior, true)
  const run = requireRun(repo, body.run_id)
  const def = requireRoute(run.definition_id)
  const action = findAction(def, body.action_id)!
  const record = (status: RouteResultStatus, values: { reason?: string | null; summary?: string | null; result?: Json; action_id?: string; key?: string | null }) =>
    repo.insert('route_action_results', {
      run_id: run.id,
      action_id: values.action_id ?? action.id,
      status,
      reason: values.reason ?? null,
      summary: values.summary ?? null,
      result: values.result ?? null,
      actor_type: actor.type,
      actor_name: actor.name,
      idempotency_key: values.key === undefined ? (body.key ?? null) : values.key,
    })
  const move = () => {
    const p = computeProgress(def, repo.require('route_runs', run.id), resultsOf(repo, run.id))
    repo.update('route_runs', run.id, {
      current_action_id: p.next?.id ?? null,
      status: p.complete ? 'completed' : run.status,
      completed_at: p.complete ? new Date().toISOString() : null,
    })
  }

  const check = checkAction(repo, actor, body)
  if (check.status !== 'ok') {
    if (!check.record) return { status: check.status, message: check.reason, fields: check.fields ?? null, replayed: false }
    const r = record(check.status, { reason: check.reason, result: check.fields ? { fields: check.fields } : null })
    return outcomeOf(r, false)
  }
  if (action.effect && (body.receipt === undefined || body.receipt === null)) {
    const r = record('failed', { reason: body.effect_error || 'The change was not confirmed. Try again.' })
    return outcomeOf(r, false)
  }

  const applied = action.apply(run.state as RouteState, body.input, body.receipt ?? null)
  const state = { ...(run.state as RouteState), ...applied.patch }
  repo.update('route_runs', run.id, {
    state,
    ...(applied.subject ? { subject_id: applied.subject.id, subject_label: applied.subject.label } : {}),
  })
  const done = record('done', { summary: applied.summary, result: applied.result ?? { input: body.input } })
  if (applied.changed && action.invalidates) {
    const eff = effective(resultsOf(repo, run.id))
    for (const id of action.invalidates.actions) {
      const e = eff.get(id)
      if (e?.done || (e?.stale && e.stale.reason !== action.invalidates.reason)) record('stale', { action_id: id, reason: action.invalidates.reason, key: null })
    }
  }
  move()
  return outcomeOf(done, false)
}

export function abandonRun(repo: Repo, runId: string): RouteRun {
  const run = requireRun(repo, runId)
  if (run.status !== 'active') throw new ToolError('validation', 'Only an active Route run can be closed.')
  return repo.update('route_runs', run.id, { status: 'abandoned', current_action_id: null })
}

export interface RunSummary {
  id: string
  definition_id: string
  title: string
  subject_label: string | null
  status: RouteRun['status']
  next_label: string | null
  done_count: number
  total_count: number
  started_by_name: string
  updated_at: string
}

export function listRuns(repo: Repo): RunSummary[] {
  return repo
    .list('route_runs', (r) => Boolean(getRoute(r.definition_id)))
    .map((run) => {
      const p = computeProgress(getRoute(run.definition_id)!, run, resultsOf(repo, run.id))
      return {
        id: run.id,
        definition_id: run.definition_id,
        title: p.route.title,
        subject_label: run.subject_label,
        status: run.status,
        next_label: p.next?.label ?? null,
        done_count: p.done_count,
        total_count: p.total_count,
        started_by_name: run.started_by_name,
        updated_at: run.updated_at,
      }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}
