// Routes, shaped like the future /api/v1/routes endpoints. Buttons call these as the signed-in person; Russ calls the
// same functions with as: 'russ'. Every path goes through the route.* tools, so permissions, audit and replay are shared.
import { checkAction, findAction, replayOf, requireRoute, requireRun, type ActionInput, type ActionOutcome, type RoutePort, type RouteProgress, type RunSummary } from '@/routes'
import { principal, type Auth } from './api'
import type { Json } from './db/schema'
import { invokeTool, type Actor } from './tools/registry'

export type RouteCaller = 'person' | 'russ'

const RUSS: Actor = { type: 'agent', id: 'russ', role: 'agent' }

function context(auth: Auth, as: RouteCaller = 'person') {
  const p = principal(auth)
  return { repo: p.repo, actor: as === 'russ' ? RUSS : p.actor }
}

export interface RouteCatalogue {
  routes: Array<{ id: string; title: string; outcome: string; badge: string | null; phases: Array<{ title: string; actions: string[] }> }>
  runs: RunSummary[]
}

export const listRoutesFor = (auth: Auth): RouteCatalogue => invokeTool('route.list', {}, context(auth))

export const getRouteProgress = (auth: Auth, body: { run_id: string }, as: RouteCaller = 'person'): RouteProgress =>
  invokeTool('route.progress', body, context(auth, as))

export interface RouteActionResponse {
  outcome: ActionOutcome
  progress: RouteProgress
}

/**
 * Runs one action. When the action writes to the client's record in Supabase, that write is made (with the same
 * idempotency key) and confirmed first; the action counts as done only with its receipt.
 */
export async function runRouteAction(
  auth: Auth,
  body: { run_id: string; action_id: string; input?: ActionInput; key: string },
  port: RoutePort,
  as: RouteCaller = 'person',
): Promise<RouteActionResponse> {
  const ctx = context(auth, as)
  const input = body.input ?? {}
  const run = requireRun(ctx.repo, body.run_id)
  const action = findAction(requireRoute(run.definition_id), body.action_id)
  let receipt: Json | undefined
  let effect_error: string | null = null
  if (action?.effect && !replayOf(ctx.repo, run.id, body.key) && checkAction(ctx.repo, { type: ctx.actor.type === 'agent' ? 'agent' : 'user' }, { ...body, input }).status === 'ok') {
    try {
      receipt = await action.effect({ state: run.state as { [key: string]: Json }, input, key: `route:${body.key}`, port })
    } catch (e) {
      effect_error = e instanceof Error ? e.message : String(e)
    }
  }
  const r = invokeTool<{ status: ActionOutcome['status']; message: string; fields: Record<string, string> | null; replayed: boolean }>(
    'route.action.run',
    { run_id: run.id, action_id: body.action_id, input, receipt, effect_error, key: body.key },
    ctx,
  )
  return { outcome: { status: r.status, message: r.message, fields: r.fields, replayed: r.replayed }, progress: getRouteProgress(auth, { run_id: run.id }, as) }
}

/** Starts or resumes a Route. From a client record the client is selected straight away, through the same action. */
export async function startRoute(
  auth: Auth,
  body: { definition_id: string; person_id?: string | null; key: string },
  port: RoutePort,
  as: RouteCaller = 'person',
): Promise<RouteActionResponse & { resumed: boolean }> {
  const ctx = context(auth, as)
  const def = requireRoute(body.definition_id)
  const started = invokeTool<{ run_id: string; resumed: boolean; subject_id: string | null }>(
    'route.start',
    { definition_id: def.id, subject_id: body.person_id ?? null },
    { ...ctx, idempotencyKey: null },
  )
  if (body.person_id && started.subject_id !== body.person_id) {
    const r = await runRouteAction(auth, { run_id: started.run_id, action_id: def.selectActionId, input: { person_id: body.person_id }, key: `${body.key}:select` }, port, as)
    return { ...r, resumed: started.resumed }
  }
  const progress = getRouteProgress(auth, { run_id: started.run_id }, as)
  return {
    outcome: { status: 'done', message: started.resumed ? `Resumed ${def.title}${progress.run.subject_label ? ` for ${progress.run.subject_label}` : ''}.` : `Started ${def.title}.`, fields: null, replayed: started.resumed },
    progress,
    resumed: started.resumed,
  }
}

export const abandonRoute = (auth: Auth, body: { run_id: string }) => invokeTool('route.abandon', body, context(auth))
