// Routes are business processes made of phases and actions. A definition is pure data plus handlers with stable ids;
// a run (route_runs) holds one client's progress. The guide buttons and Russ both run actions through the same engine.
import type { Json } from '@/server/db/schema'

export type ActionKind = 'select' | 'review' | 'form' | 'run' | 'decision'
export type RouteGroup = 'policies' | 'claims' | 'quotes'
export type RouteEligible = 'client' | 'policy' | 'claim' | 'quote'
export type RouteCategoryScope = 'sample' | 'live' | 'both'

/** auto: Russ may run it on its own. person: Russ pauses and hands over to the broker. */
export type RussMode = 'auto' | 'person'

export type RouteState = { [key: string]: Json }
export type ActionInput = { [key: string]: Json }

/** A handler's answer before anything is saved. */
export type Check =
  | { status: 'ok' }
  | { status: 'needs_input' | 'blocked'; reason: string; fields?: Record<string, string> }

export interface Applied {
  patch: RouteState
  summary: string
  result?: Json
  /** True when the action changed what later results were based on; the engine then marks them stale. */
  changed?: boolean
  /** Sets the client the run is for. */
  subject?: { id: string; label: string }
  policy_id?: string | null
  claim_id?: string | null
  waiting_on?: string | null
  due_at?: string | null
  business_key?: string | null
}

/** Supabase writes a Route can confirm. Injected so the engine stays synchronous and the handlers stay testable. */
export interface RoutePort {
  clientRecord(personId: string): Promise<ClientSnapshot>
  logNote(a: { person_id: string; body: string; key: string }): Promise<{ id: string; reference: string }>
  followUp(a: { person_id: string; title: string; due_date: string; key: string }): Promise<{ id: string; reference: string }>
  createEndorsement?(a: {
    person_id: string
    policy_id: string
    requested_effective_at: string
    change: Json
    item_id?: string | null
    notes?: string | null
    key: string
  }): Promise<{ id: string; reference: string }>
  createClaim?(a: {
    person_id: string
    policy_id?: string | null
    incident_at: string
    incident_time_unknown: boolean
    incident_type: string
    description: string
    item_ids: string[]
    key: string
  }): Promise<{ id: string; reference: string; version_review_needed?: boolean }>
  transitionServiceRequest?(a: { request_id: string; to_status: string; note?: string | null; key: string }): Promise<{ summary: string }>
  confirmEndorsement?(a: {
    request_id: string
    confirmed_effective_at: string
    confirmation_source: string
    insurer_reference?: string | null
    key: string
  }): Promise<{ summary: string; version_id?: string }>
  transitionClaim?(a: { claim_id: string; to_status: string; note?: string | null; key: string }): Promise<{ summary: string }>
  recordClaimSubmission?(a: {
    claim_id: string
    channel: string
    insurer_reference?: string | null
    key: string
  }): Promise<{ summary: string }>
  recordClaimDecision?(a: {
    claim_id: string
    decision: string
    decision_source: string
    settlement_amount?: number | null
    key: string
  }): Promise<{ summary: string }>
  createRenewal?(a: {
    person_id: string
    policy_id: string
    requested_effective_at: string
    change?: Json
    notes?: string | null
    key: string
  }): Promise<{ id: string; reference: string }>
  createCancellation?(a: {
    person_id: string
    policy_id: string
    requested_effective_at: string
    reason: string
    source?: string
    notes?: string | null
    key: string
  }): Promise<{ id: string; reference: string }>
  persistRun?(run: Json): Promise<void>
  persistResult?(result: Json): Promise<void>
}

export interface ClientSnapshot {
  person_id: string
  client_number: string
  name: string
  first_names: string
  surname: string
  phone: string | null
  email: string | null
  category: 'sample' | 'live'
  [key: string]: Json
}

export interface EffectContext {
  state: RouteState
  input: ActionInput
  /** Idempotency key for the Supabase write, so a retried click never saves twice. */
  key: string
  port: RoutePort
}

export interface RouteAction {
  id: string
  label: string
  kind: ActionKind
  /** Actions that must be done (and not stale) first. */
  requires: string[]
  /** Review and decision actions need an explicit confirmation from the person doing them. */
  confirm?: boolean
  russ: RussMode
  /** What Russ says when it pauses here. */
  handover: string
  /** Later actions whose results stop being valid when this action changes the run. */
  invalidates?: { actions: string[]; reason: string }
  check(state: RouteState, input: ActionInput): Check
  /** A Supabase write that must be confirmed before the action counts as done. */
  effect?(ctx: EffectContext): Promise<Json>
  apply(state: RouteState, input: ActionInput, receipt: Json): Applied
}

export interface RoutePhase {
  id: string
  title: string
  /** all: every action. any: one of them (alternative outcomes). */
  complete: 'all' | 'any'
  actions: RouteAction[]
}

export interface RouteDefinition {
  id: string
  title: string
  /** What finishing the Route produces. */
  outcome: string
  subject: 'client'
  group: RouteGroup
  eligible: RouteEligible[]
  category: RouteCategoryScope
  /** Lower-case phrases that ask Russ to start or continue this Route. */
  intents: string[]
  phases: RoutePhase[]
  /** The action that takes the client id when a run starts from a client record. */
  selectActionId: string
  /** Badge shown on the guide, e.g. Demo · Sample quotes. */
  badge?: string
  version?: string
}

/** Survive Vite HMR the same way as the tool registry — keep definitions across module reloads. */
const ROUTES: Map<string, RouteDefinition> = (() => {
  const g = globalThis as typeof globalThis & { __bcoveredRouteDefs?: Map<string, RouteDefinition> }
  return (g.__bcoveredRouteDefs ??= new Map())
})()

export function registerRoute(def: RouteDefinition) {
  const ids = def.phases.flatMap((p) => p.actions.map((a) => a.id))
  if (new Set(ids).size !== ids.length) throw new Error(`Route ${def.id} repeats an action id`)
  const unknown = def.phases.flatMap((p) => p.actions.flatMap((a) => [...a.requires, ...(a.invalidates?.actions ?? [])])).filter((id) => !ids.includes(id))
  if (unknown.length) throw new Error(`Route ${def.id} refers to unknown actions: ${unknown.join(', ')}`)
  if (!ids.includes(def.selectActionId)) throw new Error(`Route ${def.id} has no ${def.selectActionId} action`)
  ROUTES.set(def.id, def)
  return def
}

export const getRoute = (id: string) => ROUTES.get(id)
export const listRoutes = () => [...ROUTES.values()]

export const actionsOf = (def: RouteDefinition) => def.phases.flatMap((p) => p.actions)
export const findAction = (def: RouteDefinition, actionId: string) => actionsOf(def).find((a) => a.id === actionId)
export const phaseOf = (def: RouteDefinition, actionId: string) => def.phases.find((p) => p.actions.some((a) => a.id === actionId))

/** The Route a message asks for, if any. */
export function routeIntentOf(text: string): RouteDefinition | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  return listRoutes().find((d) => d.intents.some((phrase) => t.includes(phrase))) ?? null
}

/** "continue", "carry on", "next step": resume the run already in context. */
export const isContinueIntent = (text: string) => /^\s*(please\s+)?(continue|carry on|keep going|go on|next( step)?|resume|do the next step)\b/i.test(text)

/** Build a stable business key for deduping an open run. */
export function businessKeyOf(defId: string, parts: { person_id?: string | null; policy_id?: string | null; claim_id?: string | null; intent?: string | null; draft_id?: string | null }) {
  const intent = parts.intent ?? defId
  if (parts.claim_id) return `${defId}:claim:${parts.claim_id}:${intent}`
  if (parts.policy_id && parts.draft_id) return `${defId}:policy:${parts.policy_id}:draft:${parts.draft_id}`
  if (parts.policy_id) return `${defId}:policy:${parts.policy_id}:${intent}`
  if (parts.person_id) return `${defId}:person:${parts.person_id}:${intent}`
  return null
}
