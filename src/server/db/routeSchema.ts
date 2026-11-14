// Routes: guided business processes. A run and its action results live in the browser store only (not synced to
// Supabase); every customer-facing step and recorded decision is written to the client's record in Supabase instead.
import type { ISODate, Json, UUID } from './schema'

export type RouteRunStatus = 'active' | 'completed' | 'abandoned'
export type RouteResultStatus = 'done' | 'needs_input' | 'blocked' | 'failed' | 'stale'

export interface RouteRun {
  id: UUID
  tenant_id: UUID
  definition_id: string
  subject_type: 'client'
  /** Supabase person id of the client the run is for, once selected. */
  subject_id: string | null
  subject_label: string | null
  category: 'sample'
  status: RouteRunStatus
  current_action_id: string | null
  /** Working data the actions build up: client snapshot, draft request, quotes and the outcome. */
  state: { [key: string]: Json }
  started_by: string
  started_by_name: string
  completed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface RouteActionResult {
  id: UUID
  tenant_id: UUID
  run_id: UUID
  action_id: string
  status: RouteResultStatus
  reason: string | null
  summary: string | null
  result: Json
  actor_type: 'user' | 'agent'
  actor_name: string
  /** A repeated button press or Russ retry with the same key returns this result instead of running again. */
  idempotency_key: string | null
  created_at: ISODate
}

export interface RouteTables {
  route_runs: RouteRun[]
  route_action_results: RouteActionResult[]
}
