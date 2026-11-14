// Russ on a Route: resumes the run in context (or starts one for the client in context), runs the actions Russ may do
// on its own one at a time through the same route operations as the guide's buttons, and pauses at the first action
// that needs the broker.
import type { ActionInput, ActionOutcome, RouteProgress } from '.'
import { getRoute, isContinueIntent, routeIntentOf, type RouteDefinition } from './definitions'

interface ActionResponse {
  outcome: ActionOutcome
  progress: RouteProgress
}

/** The route operations Russ uses: api.routes in the browser (as Russ), the routesApi functions in tests. */
export interface RouteOps {
  start(body: { definition_id: string; person_id?: string | null; key: string }): Promise<ActionResponse>
  progress(runId: string): Promise<RouteProgress>
  runAction(body: { run_id: string; action_id: string; input?: ActionInput; key: string }): Promise<ActionResponse>
}

export interface RussRouteTurn {
  route: { id: string; title: string }
  run_id: string
  ran: Array<{ action_id: string; label: string; summary: string }>
  paused_at: { id: string; label: string; handover: string; reason: string | null } | null
  complete: boolean
  progress: RouteProgress
  reply: string
  /** Deep link to the guide, opened on the action that needs the broker. */
  guide_path: string
}

const MAX_STEPS = 12
const turnKey = (runId: string, step: number) => `russ:${runId}:${Date.now().toString(36)}:${step}:${Math.random().toString(36).slice(2, 8)}`

export const guidePath = (runId: string, actionId?: string | null) => `/broker/routes/runs/${runId}${actionId ? `?action=${encodeURIComponent(actionId)}` : ''}`

/** Whether a message is about a Route at all: a Route intent, or "continue" while a run is in context. */
export function routeTurnFor(text: string, runId?: string | null): RouteDefinition | 'continue' | null {
  return routeIntentOf(text) ?? (runId && isContinueIntent(text) ? 'continue' : null)
}

export async function runRussRouteTurn(
  ops: RouteOps,
  req: { text: string; run_id?: string | null; person_id?: string | null },
): Promise<RussRouteTurn | null> {
  const asked = routeTurnFor(req.text, req.run_id)
  if (!asked) return null

  let progress: RouteProgress | null = req.run_id ? await ops.progress(req.run_id).catch(() => null) : null
  const def = asked === 'continue' ? (progress ? getRoute(progress.route.id)! : null) : asked
  if (!def) return null
  const notes: string[] = []

  const sameRun = progress && progress.route.id === def.id && !progress.complete && progress.run.status === 'active'
  const otherClient = sameRun && req.person_id && progress!.run.subject_id && progress!.run.subject_id !== req.person_id && asked !== 'continue'
  if (!sameRun || otherClient) {
    const started = await ops.start({ definition_id: def.id, person_id: req.person_id ?? null, key: turnKey('start', 0) })
    progress = started.progress
    if (started.outcome.status !== 'done') notes.push(started.outcome.message)
    else notes.push(started.outcome.message.startsWith('Resumed') ? started.outcome.message : `Started ${def.title}${progress.run.subject_label ? ` for ${progress.run.subject_label}` : ''}.`)
  } else {
    notes.push(`Resumed ${def.title}${progress!.run.subject_label ? ` for ${progress!.run.subject_label}` : ''}.`)
  }

  const ran: RussRouteTurn['ran'] = []
  let paused: RussRouteTurn['paused_at'] = null
  for (let step = 0; step < MAX_STEPS && progress!.next; step++) {
    const next = progress!.next
    const action = progress!.phases.flatMap((p) => p.actions).find((a) => a.id === next.id)!
    if (next.russ === 'person') {
      paused = { id: next.id, label: next.label, handover: next.handover, reason: action.reason }
      break
    }
    const input: ActionInput = next.id === def.selectActionId ? (req.person_id ? { person_id: req.person_id } : {}) : {}
    if (next.id === def.selectActionId && !req.person_id) {
      paused = { id: next.id, label: next.label, handover: next.handover, reason: 'Open a Sample client in My workspace, or pick one in the guide.' }
      break
    }
    const r = await ops.runAction({ run_id: progress!.run.id, action_id: next.id, input, key: turnKey(progress!.run.id, step) })
    progress = r.progress
    if (r.outcome.status !== 'done') {
      paused = { id: next.id, label: next.label, handover: next.handover, reason: r.outcome.message }
      break
    }
    ran.push({ action_id: next.id, label: next.label, summary: r.outcome.message })
  }

  const p = progress!
  if (ran.length) notes.push(`Done: ${ran.map((r) => `${r.label} (${r.summary})`).join('; ')}.`)
  if (p.complete) notes.push(`${def.title} is complete.`)
  else if (paused) notes.push(`Paused at ${paused.label}: ${paused.reason ?? paused.handover}${paused.reason ? '' : ' Open the guide to do it.'}`)
  return {
    route: { id: def.id, title: def.title },
    run_id: p.run.id,
    ran,
    paused_at: paused,
    complete: p.complete,
    progress: p,
    reply: notes.join(' '),
    guide_path: guidePath(p.run.id, paused?.id ?? null),
  }
}
