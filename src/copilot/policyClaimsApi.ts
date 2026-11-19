import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from './api'
import { salesRpc } from './salesApi'

export const newKey = () => `pc:${crypto.randomUUID()}`

export interface PolicyCoverRow {
  id: string
  policy_id: string
  reference: string | null
  policy_number: string | null
  client_number: string
  customer_name: string
  person_id: string
  insurer_name: string | null
  status: string
  item_summary: string | null
}

export interface ServiceRequestRow {
  id: string
  reference: string
  client_number: string
  customer_name: string
  person_id: string
  insurer_name: string | null
  item_label: string | null
  request_type: string
  status: string
  owner_name: string | null
  next_action: string | null
  due_at: string | null
  policy_id: string
}

export interface ClaimRow {
  id: string
  reference: string
  client_number: string
  customer_name: string
  person_id: string
  incident_type: string
  incident_at: string | null
  affected_summary: string | null
  insurer_name: string | null
  insurer_reference: string | null
  status: string
  owner_name: string | null
  next_action: string | null
  due_at: string | null
  version_review_needed?: boolean
}

export interface InsuredItemRow {
  id: string
  item_type: string
  status: string
  display_label: string
  details: Record<string, unknown>
  policy_id?: string | null
}

export interface PolicyDetail {
  policy_id: string
  person_id: string
  client_number: string
  customer_name: string
  insurer_name: string | null
  policy_number: string | null
  reference: string | null
  status: string
  current_version: { id: string; version_no: number; effective_at: string; terms: Record<string, unknown> } | null
  items: InsuredItemRow[]
  versions: Array<{ id: string; version_no: number; effective_at: string; superseded_at: string | null }>
  open_requests: Array<{ id: string; reference: string; status: string }>
  related_claims: Array<{ id: string; reference: string; status: string }>
}

export interface ServiceRequestDetail extends ServiceRequestRow {
  requested_change: Record<string, unknown>
  current_snapshot: Record<string, unknown> | null
  events: Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string }>
}

export interface ClaimDetail extends ClaimRow {
  policy_id: string | null
  policy_version_id: string | null
  description: string
  incident_time_unknown: boolean
  version_review_reason: string | null
  submitted_at: string | null
  decision: string | null
  decision_source: string | null
  settlement_amount: number | null
  affected_items: InsuredItemRow[]
  evidence: Array<{ id: string; label: string; status: string }>
  events: Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string; visibility: string }>
}

async function rpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory): Promise<T> {
  try {
    return await salesRpc<T>(fn, args, category)
  } catch (e) {
    if (e instanceof CopilotError) throw e
    throw new CopilotError(400, e instanceof Error ? e.message : 'Request failed')
  }
}

export const policyClaimsApi = {
  listCovers: (c: DataCategory, a: { query?: string | null; person_id?: string | null }) =>
    rpc<{ rows: PolicyCoverRow[] }>('pc_list_policy_covers', { p_query: a.query ?? null, p_person_id: a.person_id ?? null }, c),
  listRequests: (c: DataCategory, a: { query?: string | null; status?: string | null; person_id?: string | null }) =>
    rpc<{ rows: ServiceRequestRow[] }>('pc_list_service_requests', { p_query: a.query ?? null, p_status: a.status ?? null, p_person_id: a.person_id ?? null }, c),
  listClaims: (c: DataCategory, a: { query?: string | null; filter?: string | null; person_id?: string | null }) =>
    rpc<{ rows: ClaimRow[] }>('pc_list_claims', { p_query: a.query ?? null, p_filter: a.filter ?? null, p_person_id: a.person_id ?? null }, c),
  policyDetail: (c: DataCategory, policyId: string) => rpc<PolicyDetail>('pc_policy_detail', { p_policy_id: policyId }, c),
  requestDetail: (c: DataCategory, requestId: string) => rpc<ServiceRequestDetail>('pc_service_request_detail', { p_request_id: requestId }, c),
  claimDetail: (c: DataCategory, claimId: string) => rpc<ClaimDetail>('pc_claim_detail', { p_claim_id: claimId }, c),
  personItems: (c: DataCategory, personId: string) => rpc<{ rows: InsuredItemRow[] }>('pc_person_insured_items', { p_person_id: personId }, c),
  myItems: (c: DataCategory) => rpc<{ rows: InsuredItemRow[]; requests: ServiceRequestRow[]; claims: ClaimRow[] }>('pc_my_cover', {}, c),
  createVehicleReplacement: (c: DataCategory, a: {
    person_id: string; policy_id: string; item_id: string; requested_effective_at: string
    replacement: Record<string, unknown>; notes?: string | null; key: string
  }) =>
    rpc<{ outcome: string; request_id?: string; reference?: string; summary: string }>('pc_create_vehicle_replacement', {
      p_person_id: a.person_id, p_policy_id: a.policy_id, p_item_id: a.item_id, p_requested_effective_at: a.requested_effective_at,
      p_replacement: a.replacement, p_notes: a.notes ?? null, p_idempotency_key: a.key,
    }, c),
  transitionRequest: (c: DataCategory, a: { request_id: string; to_status: string; note?: string | null; key: string }) =>
    rpc<{ outcome: string; summary: string }>('pc_transition_service_request', {
      p_request_id: a.request_id, p_to_status: a.to_status, p_note: a.note ?? null, p_idempotency_key: a.key,
    }, c),
  confirmVehicleReplacement: (c: DataCategory, a: {
    request_id: string; confirmed_effective_at: string; confirmation_source: string
    insurer_reference?: string | null; revised_premium?: number | null; key: string
  }) =>
    rpc<{ outcome: string; summary: string; version_id?: string; replayed?: boolean }>('pc_confirm_vehicle_replacement', {
      p_request_id: a.request_id, p_confirmed_effective_at: a.confirmed_effective_at, p_confirmation_source: a.confirmation_source,
      p_insurer_reference: a.insurer_reference ?? null, p_revised_premium: a.revised_premium ?? null, p_idempotency_key: a.key,
    }, c),
  createEndorsement: (c: DataCategory, a: {
    person_id: string; policy_id: string; requested_effective_at: string; change: Record<string, unknown>
    item_id?: string | null; notes?: string | null; key: string
  }) =>
    rpc<{ outcome: string; request_id?: string; reference?: string; summary: string; replayed?: boolean }>('pc_create_endorsement', {
      p_person_id: a.person_id, p_policy_id: a.policy_id, p_requested_effective_at: a.requested_effective_at,
      p_change: a.change, p_item_id: a.item_id ?? null, p_notes: a.notes ?? null, p_idempotency_key: a.key,
    }, c),
  createRenewal: (c: DataCategory, a: {
    person_id: string; policy_id: string; requested_effective_at: string; change?: Record<string, unknown>
    notes?: string | null; key: string
  }) =>
    rpc<{ outcome: string; request_id?: string; reference?: string; summary: string; replayed?: boolean }>('pc_create_renewal', {
      p_person_id: a.person_id, p_policy_id: a.policy_id, p_requested_effective_at: a.requested_effective_at,
      p_change: a.change ?? {}, p_notes: a.notes ?? null, p_idempotency_key: a.key,
    }, c),
  createCancellation: (c: DataCategory, a: {
    person_id: string; policy_id: string; requested_effective_at: string; reason: string
    source?: string; notes?: string | null; key: string
  }) =>
    rpc<{ outcome: string; request_id?: string; reference?: string; summary: string; replayed?: boolean }>('pc_create_cancellation', {
      p_person_id: a.person_id, p_policy_id: a.policy_id, p_requested_effective_at: a.requested_effective_at,
      p_reason: a.reason, p_source: a.source ?? 'client', p_notes: a.notes ?? null, p_idempotency_key: a.key,
    }, c),
  confirmEndorsement: (c: DataCategory, a: {
    request_id: string; confirmed_effective_at: string; confirmation_source: string
    insurer_reference?: string | null; revised_terms?: Record<string, unknown> | null; key: string
  }) =>
    rpc<{ outcome: string; summary: string; version_id?: string; replayed?: boolean }>('pc_confirm_endorsement', {
      p_request_id: a.request_id, p_confirmed_effective_at: a.confirmed_effective_at, p_confirmation_source: a.confirmation_source,
      p_insurer_reference: a.insurer_reference ?? null, p_revised_terms: a.revised_terms ?? null, p_idempotency_key: a.key,
    }, c),
  createClaim: (c: DataCategory, a: {
    person_id: string; policy_id?: string | null; incident_at: string; incident_time_unknown: boolean
    incident_type: string; description: string; item_ids: string[]; key: string
  }) =>
    rpc<{ outcome: string; claim_id?: string; reference?: string; summary: string; version_review_needed?: boolean }>('pc_create_claim', {
      p_person_id: a.person_id, p_policy_id: a.policy_id ?? null, p_incident_at: a.incident_at, p_incident_time_unknown: a.incident_time_unknown,
      p_incident_type: a.incident_type, p_description: a.description, p_item_ids: a.item_ids, p_idempotency_key: a.key,
    }, c),
  transitionClaim: (c: DataCategory, a: { claim_id: string; to_status: string; note?: string | null; key: string }) =>
    rpc<{ outcome: string; summary: string }>('pc_transition_claim', {
      p_claim_id: a.claim_id, p_to_status: a.to_status, p_note: a.note ?? null, p_idempotency_key: a.key,
    }, c),
  recordClaimSubmission: (c: DataCategory, a: {
    claim_id: string; channel: string; insurer_reference?: string | null; submitted_at: string; key: string
  }) =>
    rpc<{ outcome: string; summary: string; replayed?: boolean }>('pc_record_claim_submission', {
      p_claim_id: a.claim_id, p_channel: a.channel, p_insurer_reference: a.insurer_reference ?? null,
      p_submitted_at: a.submitted_at, p_idempotency_key: a.key,
    }, c),
  recordClaimDecision: (c: DataCategory, a: {
    claim_id: string; decision: string; decision_source: string; settlement_amount?: number | null; closure_reason?: string | null; key: string
  }) =>
    rpc<{ outcome: string; summary: string; replayed?: boolean }>('pc_record_claim_decision', {
      p_claim_id: a.claim_id, p_decision: a.decision, p_decision_source: a.decision_source,
      p_settlement_amount: a.settlement_amount ?? null, p_closure_reason: a.closure_reason ?? null, p_idempotency_key: a.key,
    }, c),
  russPrepareEndorsement: (c: DataCategory, a: { request_id: string; approve: boolean; key: string }) =>
    rpc<{ outcome: string; draft?: string; summary: string }>('pc_russ_prepare_endorsement', {
      p_request_id: a.request_id, p_approve: a.approve, p_idempotency_key: a.key,
    }, c),
  russCheckEvidence: (c: DataCategory, a: { claim_id: string; approve: boolean; key: string }) =>
    rpc<{ outcome: string; missing?: string[]; draft?: string; summary: string }>('pc_russ_check_evidence', {
      p_claim_id: a.claim_id, p_approve: a.approve, p_idempotency_key: a.key,
    }, c),
  russDraftUpdate: (c: DataCategory, a: { claim_id?: string | null; request_id?: string | null; share: boolean; key: string }) =>
    rpc<{ outcome: string; draft?: string; summary: string }>('pc_russ_draft_customer_update', {
      p_claim_id: a.claim_id ?? null, p_request_id: a.request_id ?? null, p_share: a.share, p_idempotency_key: a.key,
    }, c),
  russCompareSchedule: (c: DataCategory, a: {
    request_id: string; proposed: Record<string, unknown>; approve: boolean; key: string
  }) =>
    rpc<{
      outcome: string
      summary: string
      draft?: string
      diffs?: Array<{ field: string; requested: string; proposed: string }>
    }>('pc_russ_compare_schedule', {
      p_request_id: a.request_id, p_proposed: a.proposed, p_approve: a.approve, p_idempotency_key: a.key,
    }, c),
  customerCreateClaim: (c: DataCategory, a: {
    incident_at: string; incident_time_unknown: boolean; incident_type: string; description: string
    policy_id?: string | null; item_ids: string[]; key: string
  }) =>
    rpc<{ outcome: string; claim_id?: string; reference?: string; summary: string; version_review_needed?: boolean }>('pc_customer_create_claim', {
      p_incident_at: a.incident_at, p_incident_time_unknown: a.incident_time_unknown, p_incident_type: a.incident_type,
      p_description: a.description, p_policy_id: a.policy_id ?? null, p_item_ids: a.item_ids, p_idempotency_key: a.key,
    }, c),
}

function usePcKey(...parts: unknown[]) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return { key: ['supabase', auth.userId, category, 'policy-claims', ...parts], category, ready: auth.status === 'signed_in' }
}

export function usePolicyCovers(a: { query?: string | null; person_id?: string | null }) {
  const { key, category, ready } = usePcKey('covers', a.query ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.listCovers(category, a), enabled: ready, retry: false })
}

export function usePolicyServiceRequests(a: { query?: string | null; status?: string | null; person_id?: string | null }) {
  const { key, category, ready } = usePcKey('requests', a.query ?? '', a.status ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.listRequests(category, a), enabled: ready, retry: false })
}

export function useClaimsQueue(a: { query?: string | null; filter?: string | null; person_id?: string | null }) {
  const { key, category, ready } = usePcKey('claims', a.query ?? '', a.filter ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.listClaims(category, a), enabled: ready, retry: false })
}

export function usePolicyDetail(policyId: string | null | undefined) {
  const { key, category, ready } = usePcKey('policy', policyId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.policyDetail(category, policyId!), enabled: ready && Boolean(policyId), retry: false })
}

export function useServiceRequestDetail(requestId: string | null | undefined) {
  const { key, category, ready } = usePcKey('request', requestId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.requestDetail(category, requestId!), enabled: ready && Boolean(requestId), retry: false })
}

export function useClaimDetail(claimId: string | null | undefined) {
  const { key, category, ready } = usePcKey('claim', claimId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.claimDetail(category, claimId!), enabled: ready && Boolean(claimId), retry: false })
}

export function usePersonInsuredItems(personId: string | null | undefined) {
  const { key, category, ready } = usePcKey('items', personId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.personItems(category, personId!), enabled: ready && Boolean(personId), retry: false })
}

export function useMyCover() {
  const { key, category, ready } = usePcKey('my-cover')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.myItems(category), enabled: ready, retry: false })
}

export function usePolicyClaimsMutation<A, R>(fn: (category: DataCategory, args: A) => Promise<R>) {
  const category = useDataCategory()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: A) => fn(category, args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supabase'] })
    },
  })
}
