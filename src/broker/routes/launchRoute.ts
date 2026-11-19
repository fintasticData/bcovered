import { businessKeyOf } from '@/routes'
import { newKey } from '@/copilot/salesApi'
import { api } from '@/api/client'

export interface LaunchRouteArgs {
  definition_id: string
  person_id?: string | null
  policy_id?: string | null
  claim_id?: string | null
  intent?: string | null
  business_key?: string | null
}

/** Shared start/resume used by the hub, lists, client tabs and Russ. */
export async function launchRoute(args: LaunchRouteArgs) {
  const key = newKey()
  const business_key =
    args.business_key ??
    businessKeyOf(args.definition_id, {
      person_id: args.person_id,
      policy_id: args.policy_id,
      claim_id: args.claim_id,
      intent: args.intent ?? args.definition_id,
    })
  const started = await api.routes.start({
    definition_id: args.definition_id,
    person_id: args.person_id ?? null,
    policy_id: args.policy_id ?? null,
    claim_id: args.claim_id ?? null,
    business_key,
    intent: args.intent ?? null,
    key,
  })
  return started
}

export function guidePath(runId: string, actionId?: string | null) {
  return `/broker/routes/runs/${runId}${actionId ? `?action=${encodeURIComponent(actionId)}` : ''}`
}
