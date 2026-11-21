import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from '@/copilot/api'
import { salesRpc } from '@/copilot/salesApi'
import type { ServiceJob } from '@/api/serviceProviders'

export const newConciergeKey = () => `cg:${crypto.randomUUID()}`

export type ConciergeStatus =
  | 'received'
  | 'with_concierge'
  | 'action_needed'
  | 'with_insurer'
  | 'completed'
  | 'withdrawn'

export type ConciergeItemStatus =
  | 'covered'
  | 'awaiting_quote'
  | 'awaiting_acceptance'
  | 'awaiting_cover'
  | 'replaced'
  | 'removed'

export interface ConciergeHome {
  enabled: boolean
  reason?: string
  data_category?: DataCategory
  person_id?: string
  customer_id?: string
  greeting_name?: string
  full_name?: string
  brokerage?: {
    id: string
    trading_name: string
    logo_url: string | null
    brand_image_url: string | null
  }
  concierge?: {
    member_id: string
    user_id: string | null
    name: string
    email: string | null
    phone: string | null
    photo_url: string | null
  } | null
  items?: Array<{
    id: string
    item_type: string
    display_label: string
    cover_status: string
    customer_status: ConciergeItemStatus
    photo_url: string | null
    policy_id: string | null
    policy_number?: string | null
    policy_reference?: string | null
    cover_type?: string | null
    section_code?: string | null
    insured_value?: number | null
    premium_amount?: number | null
    premium_frequency?: string | null
    insurer_name?: string | null
    details: Record<string, unknown>
  }>
  policies?: Array<{
    id: string
    reference: string | null
    policy_number: string | null
    status: string
    inception_date: string | null
    premium_amount: number | null
    premium_frequency: string | null
    cover_type: string | null
    insurer_name: string | null
    items: Array<{ id: string; label: string; status: string; item_type?: string }>
  }>
  requests?: Array<{
    id: string
    reference: string | null
    title: string
    request_kind: string
    status: ConciergeStatus
    next_action: string | null
    responsible_party: string
    insured_item_id: string | null
    follow_up_at: string | null
    updated_at: string
    created_at: string
    owner_name: string | null
    item_label: string | null
  }>
}

export interface ConciergeRequestDetail {
  id: string
  reference: string | null
  title: string
  request_kind: string
  status: ConciergeStatus
  next_action: string | null
  responsible_party: string
  person_id: string
  customer_id: string
  customer_name: string | null
  insured_item_id: string | null
  item_label: string | null
  item_address?: string | null
  policy_id: string | null
  quote_id: string | null
  owner_member_id: string | null
  owner_name: string | null
  servicing_insurer_id: string | null
  servicing_insurer_name: string | null
  partner_team_id: string | null
  partner_team_name: string | null
  follow_up_at: string | null
  outcome: Record<string, unknown>
  details: Record<string, unknown>
  created_at: string
  updated_at: string
  viewer: 'customer' | 'broker' | 'insurer'
  concierge_name: string | null
  events: Array<{
    id: string
    event_type: string
    from_status: string | null
    to_status: string | null
    body: string | null
    visibility: string
    payload: Record<string, unknown>
    created_at: string
    author: string | null
  }>
  documents: Array<{
    id: string
    label: string
    url: string | null
    kind: string
    created_at: string
  }>
  pilot_partners: Array<{
    team_id: string
    name: string
    insurer_id: string
    insurer_name: string
  }>
  service_jobs?: ServiceJob[]
  /** Mutation envelope field when present alongside the detail payload. */
  option_id?: string
  mutation_outcome?: string
}

export interface ConciergeQueueRow {
  id: string
  reference: string | null
  title: string
  status: ConciergeStatus
  next_action: string | null
  responsible_party: string
  customer_id: string
  customer_name: string
  person_id: string
  owner_member_id: string | null
  owner_name: string | null
  servicing_insurer_id: string | null
  servicing_partner: string | null
  partner_team_id: string | null
  follow_up_at: string | null
  created_at: string
  updated_at: string
  age_hours: number
}

export type CommsThreadKind = 'concierge' | 'claim' | 'quote' | 'request' | 'ava'

export interface CommsInboxThread {
  id: string
  reference: string | null
  title: string
  request_kind: string
  status: ConciergeStatus
  next_action: string | null
  updated_at: string
  created_at: string
  sort_at: string
  is_chat_thread: boolean
  linked_claim_id: string | null
  linked_quote_request_id: string | null
  thread_kind: CommsThreadKind
  owner_name: string | null
  last_body: string | null
  last_at: string | null
  linked_claim_reference: string | null
  linked_quote_reference: string | null
}

export interface CommsInbox {
  data_category: DataCategory
  customer_id: string
  concierge_enabled: boolean
  concierge_name: string | null
  threads: CommsInboxThread[]
}

async function rpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory | null): Promise<T> {
  try {
    return await salesRpc<T>(fn, args, category)
  } catch (e) {
    if (e instanceof CopilotError) throw e
    throw new CopilotError(400, e instanceof Error ? e.message : 'Request failed')
  }
}

export const STATUS_LABEL: Record<ConciergeStatus, string> = {
  received: 'Received',
  with_concierge: 'With your concierge',
  action_needed: 'Your action needed',
  with_insurer: 'With insurer',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
}

export const ITEM_STATUS_LABEL: Record<ConciergeItemStatus, string> = {
  covered: 'Covered',
  awaiting_quote: 'Awaiting quote',
  awaiting_acceptance: 'Awaiting acceptance',
  awaiting_cover: 'Awaiting cover',
  replaced: 'Replaced',
  removed: 'Removed',
}

/** Customer-facing cover section labels (SA STI: MOT / HOB / HCAT / PAV). */
export const COVER_SECTION_LABEL: Record<string, string> = {
  MOT: 'Motor',
  HOB: 'Buildings',
  HCAT: 'Home contents',
  PAV: 'Portable valuables',
  motor: 'Motor',
  home: 'Buildings',
  contents: 'Home contents',
  valuables: 'Portable valuables',
  vehicle: 'Motor',
  building: 'Buildings',
  equipment: 'Portable valuables',
}

export function coverSectionLabel(code?: string | null, coverType?: string | null, itemType?: string | null) {
  const key = (code || coverType || itemType || '').trim()
  if (!key) return null
  return COVER_SECTION_LABEL[key] ?? COVER_SECTION_LABEL[key.toUpperCase()] ?? key.replace(/_/g, ' ')
}

export const conciergeApi = {
  home: (c: DataCategory, personId?: string | null) =>
    rpc<ConciergeHome>('concierge_customer_home', personId ? { p_person_id: personId } : {}, c),
  get: (c: DataCategory, id: string) => rpc<ConciergeRequestDetail>('concierge_request_get', { p_request_id: id }, c),
  create: (
    c: DataCategory,
    a: {
      kind?: string
      title?: string
      itemId?: string | null
      message?: string | null
      details?: Record<string, unknown>
      key: string
      newItemLabel?: string | null
      newItemType?: string | null
      declaredValue?: number | null
    },
  ) =>
    rpc<ConciergeRequestDetail>('concierge_request_create', {
      p_request_kind: a.kind ?? 'assist',
      p_title: a.title ?? null,
      p_insured_item_id: a.itemId ?? null,
      p_message: a.message ?? null,
      p_details: a.details ?? {},
      p_idempotency_key: a.key,
      p_new_item_label: a.newItemLabel ?? null,
      p_new_item_type: a.newItemType ?? null,
      p_declared_value: a.declaredValue ?? null,
    }, c),
  openChat: (c: DataCategory, key?: string) =>
    rpc<ConciergeRequestDetail & { outcome?: string; chat_opened?: boolean }>('concierge_open_chat', {
      p_idempotency_key: key ?? null,
    }, c),
  openSubjectChat: (
    c: DataCategory,
    a: { claimId?: string | null; quoteRequestId?: string | null; key?: string },
  ) =>
    rpc<ConciergeRequestDetail & { outcome?: string; chat_opened?: boolean; subject?: string }>(
      'concierge_open_subject_chat',
      {
        p_claim_id: a.claimId ?? null,
        p_quote_request_id: a.quoteRequestId ?? null,
        p_idempotency_key: a.key ?? null,
      },
      c,
    ),
  commsInbox: (c: DataCategory) => rpc<CommsInbox>('concierge_comms_inbox', {}, c),
  message: (c: DataCategory, a: { requestId: string; body: string; visibility?: string; key: string }) =>
    rpc<ConciergeRequestDetail>('concierge_request_message', {
      p_request_id: a.requestId,
      p_body: a.body,
      p_visibility: a.visibility ?? 'customer',
      p_idempotency_key: a.key,
    }, c),
  uploadDoc: (c: DataCategory, a: { requestId: string; label: string; url: string; key: string }) =>
    rpc<ConciergeRequestDetail>('concierge_request_upload_doc', {
      p_request_id: a.requestId,
      p_label: a.label,
      p_url: a.url,
      p_media_asset_id: null,
      p_idempotency_key: a.key,
    }, c),
  brokerQueue: (c: DataCategory, a?: { personId?: string | null; status?: string | null }) =>
    rpc<{ rows: ConciergeQueueRow[] }>('concierge_broker_queue', {
      p_person_id: a?.personId ?? null,
      p_status: a?.status ?? null,
    }, c),
  assign: (c: DataCategory, requestId: string, memberId: string) =>
    rpc<ConciergeRequestDetail>('concierge_assign', { p_request_id: requestId, p_member_id: memberId }, c),
  requestInfo: (c: DataCategory, a: { requestId: string; nextAction: string; message: string; key: string }) =>
    rpc<ConciergeRequestDetail>('concierge_request_info', {
      p_request_id: a.requestId,
      p_next_action: a.nextAction,
      p_customer_message: a.message,
      p_idempotency_key: a.key,
    }, c),
  referPartner: (c: DataCategory, a: { requestId: string; teamId: string; note?: string; key: string }) =>
    rpc<ConciergeRequestDetail>('concierge_refer_partner', {
      p_request_id: a.requestId,
      p_team_id: a.teamId,
      p_note: a.note ?? null,
      p_idempotency_key: a.key,
    }, c),
  recordOutcome: (c: DataCategory, a: { requestId: string; summary: string; completed?: boolean }) =>
    rpc<ConciergeRequestDetail>('concierge_record_outcome', {
      p_request_id: a.requestId,
      p_outcome_summary: a.summary,
      p_mark_completed: a.completed ?? false,
    }, c),
  partnerQueue: (c: DataCategory) =>
    rpc<{
      team_id: string
      team_name: string
      insurer_name: string
      rows: Array<{
        id: string
        reference: string | null
        title: string
        status: ConciergeStatus
        next_action: string | null
        customer_name: string
        concierge_name: string | null
        item_label: string | null
        updated_at: string
        created_at: string
      }>
    }>('concierge_partner_queue', {}, c),
  returnQuote: (
    c: DataCategory,
    a: { requestId: string; monthly?: number; sumInsured?: number; label?: string; key: string },
  ) =>
    rpc<ConciergeRequestDetail>('concierge_partner_return_quote', {
      p_request_id: a.requestId,
      p_monthly_premium: a.monthly ?? 189,
      p_sum_insured: a.sumInsured ?? 45000,
      p_option_label: a.label ?? 'Pilot quote',
      p_idempotency_key: a.key,
    }, c),
}

export function useConciergeHome(opts?: {
  enabled?: boolean
  authEmail?: string | null
  personId?: string | null
  /** Staff preview skips customer-email Auth match. */
  staffPreview?: boolean
  /** Pin sample/live for My Page / demo portal (ignore staff workspace toggle). */
  categoryOverride?: DataCategory | null
}) {
  const auth = useSupabaseAuth()
  const workspaceCategory = useDataCategory()
  const category = opts?.categoryOverride ?? workspaceCategory
  const enabled = opts?.enabled !== false
  // Wait until Supabase Auth matches the Demo-as customer — avoids 403 while the bridge is still switching.
  const authReady =
    auth.status === 'signed_in' &&
    Boolean(auth.userId) &&
    (opts?.staffPreview || !opts?.authEmail || auth.email?.toLowerCase() === opts.authEmail.toLowerCase())
  return useQuery({
    queryKey: ['concierge-home', category, auth.userId, opts?.personId ?? null],
    enabled: enabled && authReady && Boolean(category),
    queryFn: () => conciergeApi.home(category!, opts?.personId),
    staleTime: 8_000,
  })
}

export function useConciergeRequest(
  requestId: string | undefined,
  opts?: { categoryOverride?: DataCategory | null },
) {
  const auth = useSupabaseAuth()
  const workspaceCategory = useDataCategory()
  const category = opts?.categoryOverride ?? workspaceCategory
  return useQuery({
    queryKey: ['concierge-request', category, requestId],
    enabled: auth.status === 'signed_in' && Boolean(category) && Boolean(requestId),
    queryFn: () => conciergeApi.get(category!, requestId!),
    staleTime: 5_000,
  })
}

export function useConciergeBrokerQueue(personId?: string | null) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['concierge-broker-queue', category, personId ?? 'all'],
    enabled: auth.status === 'signed_in' && Boolean(category),
    queryFn: () => conciergeApi.brokerQueue(category!, { personId }),
    staleTime: 8_000,
  })
}

export function useConciergePartnerQueue() {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['concierge-partner-queue', category, auth.userId],
    enabled: auth.status === 'signed_in' && Boolean(category),
    queryFn: () => conciergeApi.partnerQueue(category!),
    staleTime: 8_000,
  })
}

function useInvalidateConcierge() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['concierge-home'] })
    void qc.invalidateQueries({ queryKey: ['concierge-request'] })
    void qc.invalidateQueries({ queryKey: ['concierge-broker-queue'] })
    void qc.invalidateQueries({ queryKey: ['concierge-partner-queue'] })
    void qc.invalidateQueries({ queryKey: ['concierge-comms-inbox'] })
  }
}

export function useCommsInbox(opts?: { categoryOverride?: DataCategory | null; enabled?: boolean }) {
  const auth = useSupabaseAuth()
  const workspaceCategory = useDataCategory()
  const category = opts?.categoryOverride ?? workspaceCategory
  return useQuery({
    queryKey: ['concierge-comms-inbox', category, auth.userId],
    enabled: (opts?.enabled !== false) && auth.status === 'signed_in' && Boolean(category),
    queryFn: () => conciergeApi.commsInbox(category!),
    staleTime: 5_000,
  })
}

export function useConciergeMutations(opts?: { categoryOverride?: DataCategory | null }) {
  const workspaceCategory = useDataCategory()
  const category = opts?.categoryOverride ?? workspaceCategory
  const invalidate = useInvalidateConcierge()
  const requireCat = () => {
    if (!category) throw new CopilotError(400, 'Choose Sample or Live first.')
    return category
  }
  return {
    create: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.create>[1]) => conciergeApi.create(requireCat(), a),
      onSuccess: invalidate,
    }),
    openChat: useMutation({
      mutationFn: (key?: string) => conciergeApi.openChat(requireCat(), key),
      onSuccess: invalidate,
    }),
    openSubjectChat: useMutation({
      mutationFn: (a: { claimId?: string | null; quoteRequestId?: string | null; key?: string }) =>
        conciergeApi.openSubjectChat(requireCat(), a),
      onSuccess: invalidate,
    }),
    message: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.message>[1]) => conciergeApi.message(requireCat(), a),
      onSuccess: invalidate,
    }),
    uploadDoc: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.uploadDoc>[1]) => conciergeApi.uploadDoc(requireCat(), a),
      onSuccess: invalidate,
    }),
    requestInfo: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.requestInfo>[1]) => conciergeApi.requestInfo(requireCat(), a),
      onSuccess: invalidate,
    }),
    referPartner: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.referPartner>[1]) => conciergeApi.referPartner(requireCat(), a),
      onSuccess: invalidate,
    }),
    recordOutcome: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.recordOutcome>[1]) => conciergeApi.recordOutcome(requireCat(), a),
      onSuccess: invalidate,
    }),
    returnQuote: useMutation({
      mutationFn: (a: Parameters<typeof conciergeApi.returnQuote>[1]) => conciergeApi.returnQuote(requireCat(), a),
      onSuccess: invalidate,
    }),
  }
}
