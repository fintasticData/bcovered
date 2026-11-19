// Routes: guided business processes. Runs sync to Supabase via route_* RPCs; domain data stays on claims / PSR.
import type { ISODate, Json, UUID } from './schema'

export type RouteRunStatus = 'active' | 'completed' | 'abandoned'
export type RouteResultStatus = 'done' | 'needs_input' | 'blocked' | 'failed' | 'stale'
export type RouteCategory = 'sample' | 'live'

export interface RouteRun {
  id: UUID
  tenant_id: UUID
  definition_id: string
  definition_version: string | null
  subject_type: 'client'
  /** Supabase person id of the client the run is for, once selected. */
  subject_id: string | null
  subject_label: string | null
  policy_id: string | null
  claim_id: string | null
  /** Dedup key for the business intent (e.g. policy:{id}:change, claim:{id}:follow_up). */
  business_key: string | null
  category: RouteCategory
  status: RouteRunStatus
  current_action_id: string | null
  waiting_on: string | null
  owner_user_id: string | null
  due_at: ISODate | null
  /** Working data the actions build up. */
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
