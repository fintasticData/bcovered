import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ServiceJob } from '@/api/serviceProviders'
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
  created_at?: string | null
  intake_source?: 'customer' | 'broker' | string | null
  broker_acknowledged_at?: string | null
}

export interface BrokerClaimAlertRow {
  id: string
  reference: string
  person_id: string
  customer_name: string
  incident_type: string
  status: string
  created_at: string
  incident_at: string | null
}

export interface InsuredItemRow {
  id: string
  item_type: string
  status: string
  display_label: string
  details: Record<string, unknown>
  policy_id?: string | null
  photo_url?: string | null
  section_code?: string | null
  policy_number?: string | null
  insurer_name?: string | null
}

/** Prefer top-level photo_url; fall back to details.photo_url from seed/legacy rows. */
export function insuredItemPhotoUrl(item: Pick<InsuredItemRow, 'photo_url' | 'details'>): string | null {
  if (item.photo_url) return item.photo_url
  const raw = item.details?.photo_url
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export interface PremiumRateRow {
  id: string
  amount: number
  frequency: string
  effective_from: string
  effective_to: string | null
  source: string
  reason: string | null
  status: string
  included_in_policy: boolean
  breakdown_available: boolean
  section_code: string | null
}

export interface PolicyTxnRow {
  id: string
  txn_type: string
  amount: number
  txn_date: string
  reference: string | null
  source: string
  reconciliation_status: string
}

export interface ClaimTxnRow {
  id: string
  txn_type: string
  payee: string | null
  amount: number
  status: string
  txn_date: string
  reference: string | null
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
  inception_date?: string | null
  premium_amount?: number | null
  premium_frequency?: string | null
  cover_type?: string | null
  schedule_required?: boolean
  next_action?: string | null
  current_version: { id: string; version_no: number; effective_at: string; terms: Record<string, unknown> } | null
  items: Array<InsuredItemRow & { item_terms?: Record<string, unknown> }>
  versions: Array<{
    id: string
    version_no: number
    effective_at: string
    superseded_at: string | null
    terms?: Record<string, unknown> | null
    items?: Array<{ id: string; display_label: string; item_type: string; item_terms?: Record<string, unknown> | null }>
  }>
  premium_rates?: PremiumRateRow[]
  transactions?: PolicyTxnRow[]
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
  as_of_excess?: number | null
  schedule_effective_at?: string | null
  schedule_superseded_at?: string | null
  submitted_at: string | null
  decision: string | null
  decision_source: string | null
  settlement_amount: number | null
  approved_settlement?: number
  confirmed_payments?: number
  outstanding?: number
  recoveries?: number
  /** True when insurer accepted — repair quotes / claim-linked jobs allowed. */
  quotes_unlocked?: boolean
  suggested_trade_codes?: string[]
  service_jobs?: ServiceJob[]
  affected_items: Array<InsuredItemRow & { section_code?: string | null; policy_version_id?: string | null }>
  settlement_transactions?: ClaimTxnRow[]
  evidence: Array<{
    id: string
    label: string
    status: string
    media_asset_id?: string | null
    attachments?: ClaimEvidenceAttachment[]
  }>
  events: Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string; visibility: string }>
}

export interface ClaimEvidenceAttachment {
  id: string
  media_asset_id: string
  file_name: string
  kind: string
  bucket: string
  mime_type?: string | null
  storage_path: string
  public_url: string | null
  url: string
  created_at: string
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
  brokerClaimAlerts: (c: DataCategory) =>
    rpc<{ count: number; rows: BrokerClaimAlertRow[] }>('pc_broker_claim_alerts', {}, c),
  acknowledgeClaimAlert: (c: DataCategory, claimId: string) =>
    rpc<{ outcome: string; claim_id?: string; reference?: string; summary: string }>(
      'pc_acknowledge_claim_alert',
      { p_claim_id: claimId },
      c,
    ),
  policyDetail: (c: DataCategory, policyId: string) => rpc<PolicyDetail>('pc_policy_detail', { p_policy_id: policyId }, c),
  requestDetail: (c: DataCategory, requestId: string) => rpc<ServiceRequestDetail>('pc_service_request_detail', { p_request_id: requestId }, c),
  claimDetail: (c: DataCategory, claimId: string) => rpc<ClaimDetail>('pc_claim_detail', { p_claim_id: claimId }, c),
  personItems: (c: DataCategory, personId: string) => rpc<{ rows: InsuredItemRow[] }>('pc_person_insured_items', { p_person_id: personId }, c),
  myItems: (c: DataCategory) =>
    rpc<{
      tenant_id?: string | null
      customer_id?: string | null
      rows: InsuredItemRow[]
      requests: ServiceRequestRow[]
      claims: ClaimRow[]
    }>('pc_my_cover', {}, c),
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
  filePolicy: (c: DataCategory, a: {
    person_id: string; policy_number: string; confirmed_effective_at: string; confirmation_source: string
    provider_id?: string | null; insurer_name?: string | null; quote_id?: string | null; source_type?: string | null
    schedule_note?: string | null; insurer_reference?: string | null; cover_type?: string | null
    premium_amount?: number | null; premium_frequency?: string | null
    item_label?: string | null; item_type?: string | null; excess?: number | null; key: string
  }) =>
    rpc<{
      outcome: string; policy_id?: string; cover_id?: string; version_id?: string; item_id?: string
      reference?: string; policy_number?: string | null; summary: string; replayed?: boolean
    }>('pc_file_policy', {
      p_person_id: a.person_id,
      p_policy_number: a.policy_number,
      p_confirmed_effective_at: a.confirmed_effective_at,
      p_confirmation_source: a.confirmation_source,
      p_provider_id: a.provider_id ?? null,
      p_insurer_name: a.insurer_name ?? null,
      p_quote_id: a.quote_id ?? null,
      p_source_type: a.source_type ?? null,
      p_schedule_note: a.schedule_note ?? null,
      p_insurer_reference: a.insurer_reference ?? null,
      p_cover_type: a.cover_type ?? null,
      p_premium_amount: a.premium_amount ?? null,
      p_premium_frequency: a.premium_frequency ?? null,
      p_idempotency_key: a.key,
      p_item_label: a.item_label ?? null,
      p_item_type: a.item_type ?? null,
      p_excess: a.excess ?? null,
    }, c),
  addPolicyItem: (c: DataCategory, a: {
    policy_id: string; item_label: string; item_type?: string | null; key: string
  }) =>
    rpc<{ outcome: string; item_id?: string; summary: string; replayed?: boolean }>('pc_add_policy_item', {
      p_policy_id: a.policy_id,
      p_item_label: a.item_label,
      p_item_type: a.item_type ?? 'vehicle',
      p_idempotency_key: a.key,
    }, c),
  syncCoverConfirmation: (c: DataCategory, a: {
    person_id: string
    policy_id: string
    offer_id?: string | null
    insurer_reference?: string | null
    cover_start_date?: string | null
    key: string
  }) =>
    rpc<{
      outcome: string
      policy_id?: string
      open_path?: string
      summary?: string
      lead_updated?: boolean
      sale_id?: string | null
      offer_id?: string | null
    }>('pc_sync_cover_confirmation', {
      p_person_id: a.person_id,
      p_policy_id: a.policy_id,
      p_offer_id: a.offer_id ?? null,
      p_insurer_reference: a.insurer_reference ?? null,
      p_cover_start_date: a.cover_start_date ?? null,
      p_idempotency_key: a.key,
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
  attachClaimEvidence: (c: DataCategory, a: { requirement_id: string; media_asset_ids: string[]; key: string }) =>
    rpc<{ outcome: string; requirement_id?: string; attached_count?: number; status?: string; summary: string; replayed?: boolean }>(
      'pc_attach_claim_evidence',
      { p_requirement_id: a.requirement_id, p_media_asset_ids: a.media_asset_ids, p_idempotency_key: a.key },
      c,
    ),
  removeClaimEvidenceAttachment: (c: DataCategory, a: { attachment_id: string; key: string }) =>
    rpc<{ outcome: string; requirement_id?: string; remaining?: number; status?: string; summary: string }>(
      'pc_remove_claim_evidence_attachment',
      { p_attachment_id: a.attachment_id, p_idempotency_key: a.key },
      c,
    ),
  setClaimEvidenceStatus: (c: DataCategory, a: { requirement_id: string; status: string; key: string }) =>
    rpc<{ outcome: string; requirement_id?: string; status?: string; summary: string }>(
      'pc_set_claim_evidence_status',
      { p_requirement_id: a.requirement_id, p_status: a.status, p_idempotency_key: a.key },
      c,
    ),
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
  russSummariseCover: (c: DataCategory, a: { claim_id: string; loss_at?: string | null; key: string }) =>
    rpc<{ outcome: string; summary: string; schedule_path?: string | null; policy_version_id?: string | null }>(
      'pc_russ_summarise_cover',
      { p_claim_id: a.claim_id, p_loss_at: a.loss_at ?? null, p_idempotency_key: a.key },
      c,
    ),
  russCreateFollowUps: (c: DataCategory, a: { claim_id: string; key: string }) =>
    rpc<{ outcome: string; summary: string; replayed?: boolean }>('pc_russ_create_followups', {
      p_claim_id: a.claim_id, p_idempotency_key: a.key,
    }, c),
  recordPremiumRate: (c: DataCategory, a: {
    policy_id: string; amount: number; frequency: string; effective_from: string
    reason?: string | null; source?: string; key: string
  }) =>
    rpc<{ outcome: string; rate_id?: string; summary: string; replayed?: boolean }>('pc_record_premium_rate', {
      p_policy_id: a.policy_id, p_amount: a.amount, p_frequency: a.frequency, p_effective_from: a.effective_from,
      p_reason: a.reason ?? null, p_source: a.source ?? 'broker', p_idempotency_key: a.key, p_source_ref: a.key,
    }, c),
  recordPolicyTransaction: (c: DataCategory, a: {
    policy_id: string; txn_type: string; amount: number; txn_date: string
    reference?: string | null; source?: string; key: string
  }) =>
    rpc<{ outcome: string; transaction_id?: string; summary: string; replayed?: boolean }>('pc_record_policy_transaction', {
      p_policy_id: a.policy_id, p_txn_type: a.txn_type, p_amount: a.amount, p_txn_date: a.txn_date,
      p_reference: a.reference ?? null, p_source: a.source ?? 'broker', p_idempotency_key: a.key, p_source_ref: a.key,
    }, c),
  recordClaimTransaction: (c: DataCategory, a: {
    claim_id: string; txn_type: string; amount: number; txn_date: string
    payee?: string | null; reference?: string | null; key: string
  }) =>
    rpc<{
      outcome: string; transaction_id?: string; summary: string; replayed?: boolean
      approved_settlement?: number; confirmed_payments?: number; outstanding?: number
    }>('pc_record_claim_transaction', {
      p_claim_id: a.claim_id, p_txn_type: a.txn_type, p_amount: a.amount, p_txn_date: a.txn_date,
      p_payee: a.payee ?? null, p_reference: a.reference ?? null, p_idempotency_key: a.key, p_source_ref: a.key,
    }, c),
  customerCreateClaim: (c: DataCategory, a: {
    incident_at: string; incident_time_unknown: boolean; incident_type: string; description: string
    policy_id?: string | null; item_ids: string[]; key: string
    photo_media_asset_ids?: string[]
  }) =>
    rpc<{
      outcome: string; claim_id?: string; reference?: string; summary: string
      version_review_needed?: boolean; photos_attached?: number
    }>('pc_customer_create_claim', {
      p_incident_at: a.incident_at, p_incident_time_unknown: a.incident_time_unknown, p_incident_type: a.incident_type,
      p_description: a.description, p_policy_id: a.policy_id ?? null, p_item_ids: a.item_ids, p_idempotency_key: a.key,
      p_photo_media_asset_ids: a.photo_media_asset_ids ?? [],
    }, c),
}

function usePcKey(categoryOverride?: DataCategory | null, ...parts: unknown[]) {
  const auth = useSupabaseAuth()
  const workspaceCategory = useDataCategory()
  const category = categoryOverride ?? workspaceCategory
  return { key: ['supabase', auth.userId, category, 'policy-claims', ...parts], category, ready: auth.status === 'signed_in' }
}

export function usePolicyCovers(a: { query?: string | null; person_id?: string | null }) {
  const { key, category, ready } = usePcKey(null, 'covers', a.query ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.listCovers(category, a), enabled: ready, retry: false })
}

export function usePolicyServiceRequests(a: { query?: string | null; status?: string | null; person_id?: string | null }) {
  const { key, category, ready } = usePcKey(null, 'requests', a.query ?? '', a.status ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.listRequests(category, a), enabled: ready, retry: false })
}

export function useClaimsQueue(a: { query?: string | null; filter?: string | null; person_id?: string | null }) {
  const { key, category, ready } = usePcKey(null, 'claims', a.query ?? '', a.filter ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.listClaims(category, a), enabled: ready, retry: false })
}

export function useBrokerClaimAlerts() {
  const { key, category, ready } = usePcKey(null, 'claim-alerts')
  return useQuery({
    queryKey: key,
    queryFn: () => policyClaimsApi.brokerClaimAlerts(category),
    enabled: ready,
    retry: false,
    refetchInterval: 60_000,
  })
}

export function usePolicyDetail(policyId: string | null | undefined) {
  const { key, category, ready } = usePcKey(null, 'policy', policyId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.policyDetail(category, policyId!), enabled: ready && Boolean(policyId), retry: false })
}

export function useServiceRequestDetail(requestId: string | null | undefined) {
  const { key, category, ready } = usePcKey(null, 'request', requestId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.requestDetail(category, requestId!), enabled: ready && Boolean(requestId), retry: false })
}

export function useClaimDetail(claimId: string | null | undefined) {
  const { key, category, ready } = usePcKey(null, 'claim', claimId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.claimDetail(category, claimId!), enabled: ready && Boolean(claimId), retry: false })
}

export function usePersonInsuredItems(personId: string | null | undefined) {
  const { key, category, ready } = usePcKey(null, 'items', personId)
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.personItems(category, personId!), enabled: ready && Boolean(personId), retry: false })
}

export function useMyCover(categoryOverride?: DataCategory | null) {
  const { key, category, ready } = usePcKey(categoryOverride ?? null, 'my-cover')
  return useQuery({ queryKey: key, queryFn: () => policyClaimsApi.myItems(category), enabled: ready, retry: false })
}

export function usePolicyClaimsMutation<A, R>(
  fn: (category: DataCategory, args: A) => Promise<R>,
  categoryOverride?: DataCategory | null,
) {
  const workspaceCategory = useDataCategory()
  const category = categoryOverride ?? workspaceCategory
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: A) => fn(category, args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supabase'] })
      void qc.invalidateQueries({ queryKey: ['customer-page'] })
    },
  })
}
