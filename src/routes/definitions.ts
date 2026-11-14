// Routes are business processes made of phases and actions. A definition is pure data plus handlers with stable ids;
// a run (route_runs) holds one client's progress. The guide buttons and Russ both run actions through the same engine.
import type { Json } from '@/server/db/schema'

export type ActionKind = 'select' | 'review' | 'form' | 'run' | 'decision'

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
}

/** Supabase writes a Route can confirm. Injected so the engine stays synchronous and the handlers stay testable. */
export interface RoutePort {
  clientRecord(personId: string): Promise<ClientSnapshot>
  logNote(a: { person_id: string; body: string; key: string }): Promise<{ id: string; reference: string }>
  followUp(a: { person_id: string; title: string; due_date: string; key: string }): Promise<{ id: string; reference: string }>
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
  category: 'sample'
  /** Lower-case phrases that ask Russ to start or continue this Route. */
  intents: string[]
  phases: RoutePhase[]
  /** The action that takes the client id when a run starts from a client record. */
  selectActionId: string
  /** Badge shown on the guide, e.g. Demo · Sample quotes. */
  badge?: string
}

const ROUTES = new Map<string, RouteDefinition>()

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
