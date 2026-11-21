// Routes, shaped like the future /api/v1/routes endpoints. Buttons call these as the signed-in person; Russ calls the
// same functions with as: 'russ'. Every path goes through the route.* tools, so permissions, audit and replay are shared.
import './tools'
import {
  businessKeyOf,
  checkAction,
  findAction,
  replayOf,
  requireRoute,
  requireRun,
  siblingActiveRuns,
  type ActionInput,
  type ActionOutcome,
  type RoutePort,
  type RouteProgress,
  type RunSummary,
} from '@/routes'
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
  routes: Array<{
    id: string
    title: string
    outcome: string
    group: string
    eligible: string[]
    category: string
    badge: string | null
    phases: Array<{ title: string; actions: string[] }>
  }>
  runs: RunSummary[]
}

export const listRoutesFor = (auth: Auth, body: { scope?: 'mine' | 'team' } = {}): RouteCatalogue =>
  invokeTool('route.list', { scope: body.scope }, context(auth))

export const getRouteProgress = (auth: Auth, body: { run_id: string }, as: RouteCaller = 'person'): RouteProgress =>
  invokeTool('route.progress', body, context(auth, as))

export interface RouteActionResponse {
  outcome: ActionOutcome
  progress: RouteProgress
  siblings?: Array<{ id: string; definition_id: string; title: string }>
}

async function persistProgress(port: RoutePort, auth: Auth, runId: string) {
  if (!port.persistRun) return
  const progress = getRouteProgress(auth, { run_id: runId })
  const run = progress.run
  await port.persistRun({
    id: run.id,
    definition_id: run.definition_id,
    definition_version: run.definition_version,
    subject_type: run.subject_type,
    subject_id: run.subject_id,
    subject_label: run.subject_label,
    policy_id: run.policy_id,
    claim_id: run.claim_id,
    business_key: run.business_key,
    category: run.category,
    status: run.status,
    current_action_id: run.current_action_id,
    waiting_on: run.waiting_on,
    owner_user_id: run.owner_user_id,
    due_at: run.due_at,
    state: run.state,
    started_by: run.started_by,
    started_by_name: run.started_by_name,
    completed_at: run.completed_at,
    created_at: run.created_at,
  })
}

/**
 * Runs one action. When the action writes to the client's record in Supabase, that write is made (with the same
 * idempotency key) and confirmed first; the action counts as done only with its receipt.
 */
export async function runRouteAction(
  auth: Auth,
  body: { run_id: string; action_id: string; input?: ActionInput; key: string; confirm_siblings?: boolean },
  port: RoutePort,
  as: RouteCaller = 'person',
): Promise<RouteActionResponse> {
  const ctx = context(auth, as)
  const input = body.input ?? {}
  const run = requireRun(ctx.repo, body.run_id)
  const siblings = siblingActiveRuns(ctx.repo, run.id).map((r) => ({
    id: r.id,
    definition_id: r.definition_id,
    title: requireRoute(r.definition_id).title,
  }))
  const actionDef = findAction(requireRoute(run.definition_id), body.action_id)
  if (siblings.length && !body.confirm_siblings && actionDef?.effect && (actionDef.confirm || body.action_id.includes('apply') || body.action_id.includes('confirm'))) {
    const progress = getRouteProgress(auth, { run_id: run.id }, as)
    return {
      outcome: {
        status: 'needs_input',
        message: `Another open job on this record may be affected (${siblings.map((s) => s.title).join(', ')}). Confirm refreshed details before applying.`,
        fields: { confirm_siblings: 'Set confirm_siblings to continue.' },
        replayed: false,
      },
      progress,
      siblings,
    }
  }
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
  const progress = getRouteProgress(auth, { run_id: run.id }, as)
  await persistProgress(port, auth, run.id)
  return { outcome: { status: r.status, message: r.message, fields: r.fields, replayed: r.replayed }, progress, siblings }
}

export interface StartRouteBody {
  definition_id: string
  person_id?: string | null
  policy_id?: string | null
  claim_id?: string | null
  /** Accepted sales offer to confirm cover from (seeds policy_setup). */
  offer_id?: string | null
  business_key?: string | null
  intent?: string | null
  key: string
  /** Optional prefill when starting from an accepted offer. */
  offer_prefill?: {
    insurer_name?: string | null
    cover_type?: string | null
    premium_amount?: number | null
    item_label?: string | null
    item_type?: string | null
    reference?: string | null
  } | null
}

/** Starts or resumes a Route. From a client record the client is selected straight away, through the same action. */
export async function startRoute(
  auth: Auth,
  body: StartRouteBody,
  port: RoutePort,
  as: RouteCaller = 'person',
): Promise<RouteActionResponse & { resumed: boolean }> {
  const ctx = context(auth, as)
  const def = requireRoute(body.definition_id)
  const key =
    body.business_key ??
    businessKeyOf(def.id, {
      person_id: body.person_id,
      policy_id: body.policy_id,
      claim_id: body.claim_id,
      intent: body.intent ?? def.id,
      draft_id: body.offer_id ?? null,
    })
  const started = invokeTool<{ run_id: string; resumed: boolean; subject_id: string | null }>(
    'route.start',
    {
      definition_id: def.id,
      subject_id: body.person_id ?? null,
      policy_id: body.policy_id ?? null,
      claim_id: body.claim_id ?? null,
      business_key: key,
    },
    { ...ctx, idempotencyKey: null },
  )
  await persistProgress(port, auth, started.run_id)
  const progressBefore = getRouteProgress(auth, { run_id: started.run_id }, as)
  const selectDone = progressBefore.phases.flatMap((p) => p.actions).find((a) => a.id === def.selectActionId)?.status === 'done'
  let last = null as Awaited<ReturnType<typeof runRouteAction>> | null
  if (body.person_id && !selectDone) {
    last = await runRouteAction(
      auth,
      {
        run_id: started.run_id,
        action_id: def.selectActionId,
        input: { person_id: body.person_id, ...(body.policy_id ? { policy_id: body.policy_id } : {}), ...(body.claim_id ? { claim_id: body.claim_id } : {}) },
        key: `${body.key}:select`,
      },
      port,
      as,
    )
  }
  // Seed accepted-offer source for Confirm cover → policy_setup.
  if (body.offer_id && def.id === 'policy_setup') {
    const sourceDone = getRouteProgress(auth, { run_id: started.run_id }, as)
      .phases.flatMap((p) => p.actions)
      .find((a) => a.id === 'policy_setup.source.confirm')?.status === 'done'
    if (!sourceDone) {
      const pre = body.offer_prefill
      last = await runRouteAction(
        auth,
        {
          run_id: started.run_id,
          action_id: 'policy_setup.source.confirm',
          input: {
            source_type: 'accepted_quote',
            quote_id: body.offer_id,
            offer_id: body.offer_id,
            draft_id: body.offer_id,
            ...(pre?.insurer_name ? { insurer_name: pre.insurer_name } : {}),
            ...(pre?.cover_type ? { cover_type: pre.cover_type } : {}),
            ...(pre?.premium_amount != null ? { premium_amount: pre.premium_amount } : {}),
            ...(pre?.item_label ? { item_label: pre.item_label } : {}),
            ...(pre?.item_type ? { item_type: pre.item_type } : {}),
          },
          key: `${body.key}:source`,
        },
        port,
        as,
      )
    }
  }
  if (last) return { ...last, resumed: started.resumed }
  const progress = getRouteProgress(auth, { run_id: started.run_id }, as)
  return {
    outcome: {
      status: 'done',
      message: started.resumed
        ? `Resumed ${def.title}${progress.run.subject_label ? ` for ${progress.run.subject_label}` : ''}.`
        : `Started ${def.title}.`,
      fields: null,
      replayed: started.resumed,
    },
    progress,
    resumed: started.resumed,
  }
}

export const abandonRoute = (auth: Auth, body: { run_id: string }) => invokeTool('route.abandon', body, context(auth))
