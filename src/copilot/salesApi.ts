// The broker sales book from the browser: the same Postgres functions the bcovered-mcp sales jobs call, so a button and
// Russ make identical changes under the signed-in user's row-level security.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MemberRef } from '../../supabase/functions/copilot-agent/planner'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { supabase, useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from './api'

export type { MemberRef }
export { whatsappUrl } from '../../supabase/functions/copilot-agent/planner'

export type Stage = 'new_enquiry' | 'offer_sent' | 'accepted' | 'sold' | 'client'
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'sold' | 'declined' | 'withdrawn'
export type Frequency = 'monthly' | 'quarterly' | 'annually' | 'single'
export type Channel = 'whatsapp' | 'email' | 'call' | 'in_person' | 'other'
export type CommKind = 'call' | 'whatsapp' | 'email' | 'meeting' | 'note'
export type Direction = 'outbound' | 'inbound' | 'internal'

export const STAGE_LABEL: Record<Stage, string> = { new_enquiry: 'New enquiry', offer_sent: 'Offer sent', accepted: 'Accepted', sold: 'Sold', client: 'Client' }

export interface SalesProfile {
  signed_in: boolean
  has_workspace: boolean
  pending_brokerage?: string | null
  user_id?: string
  name?: string
  email?: string
  membership_role?: string | null
  book_restricted?: boolean
  can_manage_team?: boolean
  brokerage?: { id: string; name: string; lifecycle_status: string; live_available: boolean }
  member?: MemberRef | null
}

export interface TeamMember extends MemberRef {
  email: string | null
  phone: string | null
  invite_status: 'joined' | 'pending' | 'needs_email' | 'not_sent' | 'expired' | 'revoked' | 'suspended'
  is_me: boolean
  clients: number
  referrals: number
}

export interface GridRow {
  id: string
  client_number: string
  name: string
  contact_stage: 'prospect' | 'client'
  stage: Stage
  category: DataCategory
  account: { id: string; number: string; phone: string | null; email: string | null } | null
  assigned: MemberRef | null
  referred_by: MemberRef | null
  last_communication: { at: string; kind: string; direction: Direction; event: string; summary: string } | null
  next_follow_up: { id: string; title: string; due_date: string | null } | null
  offers: number
  sales: number
  open_path: string
}

export interface PendingMatch {
  id: string
  reference: string
  name: string
  phone: string | null
  email: string | null
  interest: string | null
  created_at: string
  referrer: MemberRef | null
  assigned: MemberRef | null
  candidates: Array<{ id: string; number: string; name: string; detail: string }>
}

export interface BookGrid {
  category: DataCategory
  scope: 'mine' | 'team'
  rows: GridRow[]
  totals: { people: number; prospects: number; new_enquiry: number; offer_sent: number; accepted: number; sold: number }
  member: MemberRef | null
  can_see_team: boolean
  pending_matches: PendingMatch[]
}

export interface Offer {
  id: string
  reference: string
  status: OfferStatus
  category: DataCategory
  insurer: string
  product: string
  premium_amount: number
  premium_frequency: Frequency
  from_sample_quote: boolean
  quote_id: string | null
  notes: string | null
  sent_at: string | null
  sent_channel: Channel | null
  accepted_at: string | null
  created_at: string
  responsible: MemberRef | null
  sale: { id: string; reference: string; insurer_reference: string; cover_start_date: string; created_at: string } | null
  person_id: string
}

export interface Communication {
  id: string
  reference: string
  kind: 'note' | 'call' | 'meeting' | 'email' | 'callback_request' | 'whatsapp'
  direction: Direction
  event: 'logged' | 'whatsapp_opened' | 'message_sent' | 'reply'
  body: string
  occurred_at: string
  created_at: string
  copilot: string | null
  author: string | null
  author_role: string | null
  assigned_at_time: string | null
  retention: 'permanent' | 'sample'
  corrects: { id: string; reference: string } | null
  correction_reason: string | null
  corrected_by: { id: string; reference: string } | null
  offer: { id: string; reference: string } | null
}

export interface ClientRecord {
  id: string
  client_number: string
  name: string
  first_names: string
  surname: string
  contact_stage: 'prospect' | 'client'
  category: DataCategory
  open_path: string
  stage: Stage
  date_of_birth: string | null
  brokerage: string
  account: { id: string; number: string; name: string; phone: string | null; email: string | null; status: string } | null
  assigned: MemberRef | null
  referred_by: MemberRef | null
  enquiries: Array<{ id: string; reference: string; source: string; referral_code: string | null; referrer: MemberRef | null; interest: string | null; message: string | null; match_status: string; created_at: string }>
  offers: Offer[]
  sales: Array<{ id: string; reference: string; offer_id: string; offer_reference: string; insurer_reference: string; cover_start_date: string; premium_amount: number; premium_frequency: Frequency; sold_by: MemberRef | null; referrer: MemberRef | null; created_at: string }>
  communications: Communication[]
  follow_ups: Array<{ id: string; reference: string; title: string; detail: string | null; due_date: string | null; status: string; offer_id: string | null; assigned_to: string | null }>
  assignment_history: Array<{ at: string; from: MemberRef | null; to: MemberRef | null; reason: string | null; by: string | null }>
  quotes: Array<{ quote_id: string; option_id: string; product: string; insurer: string; label: string; monthly_premium: number; is_sample: boolean; status: string }>
  can_reassign: boolean
  team: MemberRef[]
}

export interface FunnelRow extends MemberRef {
  enquiries: number
  prospects: number
  with_offer: number
  offers_sent: number
  accepted: number
  sold: number
  sold_premium: number
}

export interface OfferMessage {
  offer_id: string
  reference: string
  text: string
  phone: string | null
  email: string | null
  email_subject: string
  category: DataCategory
}

/** A saved receipt (or a question back) from a sales write. */
export interface SalesReceipt {
  outcome: 'saved' | 'needs_input'
  reference?: string
  summary: string
  open_path?: string
  replayed?: boolean
  reason?: string
  choices?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export async function salesRpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory | null): Promise<T> {
  if (!supabase) throw new CopilotError(503, 'Supabase is not configured for this build.')
  const body = category ? { p_category: category, ...args } : args
  const { data, error } = await supabase.rpc(fn, body).setHeader('x-data-category', category ?? 'sample')
  if (error) throw new CopilotError(error.message === 'not_found' ? 404 : error.message === 'forbidden' ? 403 : 400, error.details || error.message)
  return data as T
}

/** Public referral functions: callable without signing in. */
export const referralApi = {
  resolve: (code: string) =>
    salesRpc<{
      valid: boolean; code: string; reason?: string; referrer_name?: string; role_label?: string; brokerage?: string; live_accepting?: boolean
      kind?: 'member' | 'outlet'; outlet_label?: string; outlet_name?: string; partner_name?: string; service_area?: string | null; category?: DataCategory
    }>('referral_resolve', { p_code: code }, null),
  submit: (a: { code: string; first_names: string; surname: string; phone: string; email: string; interest: string; message: string; consent: boolean; client_key: string; category: DataCategory }) =>
    salesRpc<{ ok: boolean; reference: string; referrer_name: string; brokerage: string; category: DataCategory; outlet_label?: string | null }>('referral_submit_enquiry', {
      p_code: a.code, p_first_names: a.first_names, p_surname: a.surname, p_phone: a.phone || null, p_email: a.email || null, p_interest: a.interest || null,
      p_message: a.message || null, p_consent: a.consent, p_client_key: a.client_key, p_category: a.category,
    }, null),
  invitation: (token: string) =>
    salesRpc<{ valid: boolean; reason?: string; email?: string; name?: string; role_label?: string; brokerage?: string; invited_by?: string }>('sales_invitation_preview', { p_token: token }, null),
}

export const salesApi = {
  profile: () => salesRpc<SalesProfile>('sales_my_profile', {}, null),
  setup: (a: { brokerage_name?: string; full_name?: string; phone?: string; service_area?: string }) =>
    salesRpc<{ outcome: string; reopened: boolean; brokerage: SalesProfile['brokerage']; member: MemberRef; summary: string }>('sales_setup_workspace', {
      p_brokerage_name: a.brokerage_name ?? null, p_full_name: a.full_name ?? null, p_phone: a.phone ?? null, p_service_area: a.service_area ?? null,
    }, null),
  acceptInvitation: (token: string) => salesRpc<{ tenant_id: string; brokerage: string; member: MemberRef }>('sales_accept_invitation', { p_token: token }, null),
  grid: (c: DataCategory, a: { scope: 'mine' | 'team'; member_id?: string | null; stage?: Stage | null; query?: string | null }) =>
    salesRpc<BookGrid>('sales_book_grid', { p_scope: a.scope, p_member_id: a.member_id ?? null, p_stage: a.stage ?? null, p_query: a.query ?? null, p_limit: 200 }, c),
  record: (c: DataCategory, personId: string) => salesRpc<ClientRecord>('sales_client_record', { p_person_id: personId }, c),
  team: (c: DataCategory) => salesRpc<TeamMember[]>('sales_list_team', {}, c),
  funnel: (c: DataCategory) => salesRpc<{ members: FunnelRow[] }>('sales_referral_funnel', {}, c),
  message: (c: DataCategory, offerId: string) => salesRpc<OfferMessage>('sales_offer_message', { p_offer_id: offerId }, c),
  invite: (c: DataCategory, a: { full_name: string; role: 'agent' | 'sub_broker'; email?: string; phone?: string; service_area?: string; key: string }) =>
    salesRpc<SalesReceipt & { member: MemberRef; invite_path: string | null; invite_status: string }>('sales_invite_member', {
      p_full_name: a.full_name, p_role: a.role, p_idempotency_key: a.key, p_email: a.email || null, p_phone: a.phone || null, p_service_area: a.service_area || null,
      p_copilot: 'workspace',
    }, c),
  inviteLink: (c: DataCategory, memberId: string) => salesRpc<{ invite_path: string; invite_status: string; member: MemberRef }>('sales_invite_link', { p_member_id: memberId }, c),
  capture: (c: DataCategory, a: { first_names: string; surname: string; phone?: string; email?: string; interest?: string; note?: string; referral_code?: string; assign_member_id?: string; link_person_id?: string; force_new?: boolean; key: string }) =>
    salesRpc<SalesReceipt>('sales_capture_enquiry', {
      p_first_names: a.first_names, p_surname: a.surname, p_idempotency_key: a.key, p_phone: a.phone || null, p_email: a.email || null, p_interest: a.interest || null,
      p_note: a.note || null, p_referral_code: a.referral_code || null, p_source: 'phone', p_assign_member_id: a.assign_member_id || null,
      p_link_person_id: a.link_person_id || null, p_force_new: a.force_new ?? false, p_copilot: 'workspace',
    }, c),
  resolveMatch: (c: DataCategory, a: { enquiry_id: string; person_id?: string; create_new?: boolean; key: string }) =>
    salesRpc<SalesReceipt>('sales_resolve_enquiry_match', { p_enquiry_id: a.enquiry_id, p_idempotency_key: a.key, p_person_id: a.person_id ?? null, p_create_new: a.create_new ?? false, p_copilot: 'workspace' }, c),
  reassign: (c: DataCategory, a: { person_id: string; member_id: string; reason?: string; key: string }) =>
    salesRpc<SalesReceipt>('sales_reassign_client', { p_person_id: a.person_id, p_member_id: a.member_id, p_idempotency_key: a.key, p_reason: a.reason || null, p_copilot: 'workspace' }, c),
  createOffer: (c: DataCategory, a: { person_id: string; quote_option_id?: string; insurer_name?: string; product?: string; premium_amount?: number; premium_frequency?: Frequency; notes?: string; key: string }) =>
    salesRpc<SalesReceipt & { offer?: Offer; message?: OfferMessage }>('sales_create_offer', {
      p_person_id: a.person_id, p_idempotency_key: a.key, p_quote_option_id: a.quote_option_id ?? null, p_insurer_name: a.insurer_name ?? null, p_product: a.product ?? null,
      p_premium_amount: a.premium_amount ?? null, p_premium_frequency: a.premium_frequency ?? 'monthly', p_notes: a.notes || null, p_copilot: 'workspace',
    }, c),
  shareOpened: (c: DataCategory, a: { offer_id: string; channel: 'whatsapp' | 'email'; key: string }) =>
    salesRpc<{ outcome: string }>('sales_log_share_opened', { p_offer_id: a.offer_id, p_idempotency_key: a.key, p_channel: a.channel }, c),
  markSent: (c: DataCategory, a: { offer_id: string; channel: Channel; note?: string; key: string }) =>
    salesRpc<SalesReceipt>('sales_mark_offer_sent', { p_offer_id: a.offer_id, p_idempotency_key: a.key, p_channel: a.channel, p_note: a.note || null, p_copilot: 'workspace' }, c),
  accept: (c: DataCategory, a: { offer_id: string; accepted_on?: string; note?: string; key: string }) =>
    salesRpc<SalesReceipt>('sales_record_acceptance', { p_offer_id: a.offer_id, p_idempotency_key: a.key, p_accepted_on: a.accepted_on || null, p_note: a.note || null, p_copilot: 'workspace' }, c),
  recordSale: (c: DataCategory, a: { offer_id: string; insurer_reference: string; cover_start_date: string; key: string }) =>
    salesRpc<SalesReceipt & { already_recorded?: boolean }>('sales_record_sale', {
      p_offer_id: a.offer_id, p_idempotency_key: a.key, p_insurer_reference: a.insurer_reference, p_cover_start_date: a.cover_start_date, p_copilot: 'workspace',
    }, c),
  logComm: (c: DataCategory, a: { person_id: string; kind: CommKind; body: string; direction: Direction; offer_id?: string | null; occurred_at?: string | null; key: string }) =>
    salesRpc<SalesReceipt>('sales_log_communication', {
      p_person_id: a.person_id, p_kind: a.kind, p_body: a.body, p_idempotency_key: a.key, p_direction: a.direction, p_offer_id: a.offer_id || null,
      p_occurred_at: a.occurred_at || null, p_copilot: 'workspace',
    }, c),
  followUp: (c: DataCategory, a: { person_id: string; title: string; due_date?: string | null; offer_id?: string | null; key: string }) =>
    salesRpc<SalesReceipt>('sales_create_follow_up', { p_person_id: a.person_id, p_title: a.title, p_idempotency_key: a.key, p_due_date: a.due_date || null, p_offer_id: a.offer_id || null, p_copilot: 'workspace' }, c),
  correctComm: (c: DataCategory, a: { interaction_id: string; body: string; reason: string; key: string }) =>
    salesRpc<SalesReceipt>('sales_correct_communication', { p_interaction_id: a.interaction_id, p_body: a.body, p_reason: a.reason, p_idempotency_key: a.key, p_copilot: 'workspace' }, c),
  completeFollowUp: (c: DataCategory, taskId: string) => salesRpc<{ outcome: string }>('sales_complete_follow_up', { p_task_id: taskId }, c),
}

export const newKey = () => `ws:${crypto.randomUUID()}`

/** Sales queries are cached per signed-in user and category, so switching Sample / Live never shows stale rows. */
function useSalesKey(...parts: unknown[]) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return { key: ['supabase', auth.userId, category, 'sales', ...parts], category, ready: auth.status === 'signed_in' }
}

export function useSalesProfile() {
  const auth = useSupabaseAuth()
  return useQuery({ queryKey: ['supabase', auth.userId, 'sales-profile'], queryFn: salesApi.profile, enabled: auth.status === 'signed_in', staleTime: 60_000, retry: false })
}

export function useBookGrid(a: { scope: 'mine' | 'team'; member_id?: string | null; stage?: Stage | null; query?: string | null }) {
  const { key, category, ready } = useSalesKey('grid', a.scope, a.member_id ?? null, a.stage ?? null, a.query ?? '')
  return useQuery({ queryKey: key, queryFn: () => salesApi.grid(category, a), enabled: ready, retry: false, placeholderData: (prev) => prev })
}

export function useClientRecord(personId: string | null | undefined) {
  const { key, category, ready } = useSalesKey('record', personId)
  return useQuery({ queryKey: key, queryFn: () => salesApi.record(category, personId!), enabled: ready && Boolean(personId), retry: false })
}

export function useTeam(enabled = true) {
  const { key, category, ready } = useSalesKey('team')
  return useQuery({ queryKey: key, queryFn: () => salesApi.team(category), enabled: ready && enabled, retry: false })
}

export function useFunnel(enabled = true) {
  const { key, category, ready } = useSalesKey('funnel')
  return useQuery({ queryKey: key, queryFn: () => salesApi.funnel(category), enabled: ready && enabled, retry: false })
}

/** Refreshes every database-backed view after a sales write, whether it came from a button or a copilot. */
export function useRefreshSales() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['supabase'] })
}

/** A sales write bound to the active category, refreshing the book when it succeeds. */
export function useSalesMutation<A, R>(fn: (category: DataCategory, args: A) => Promise<R>) {
  const category = useDataCategory()
  const refresh = useRefreshSales()
  return useMutation({ mutationFn: (args: A) => fn(category, args), onSuccess: () => void refresh() })
}

export const referralUrl = (path: string) => `${window.location.origin}${path}`
/** Sample links create Sample enquiries, so a brokerage can demonstrate the journey before it is activated. */
export const referralPathFor = (code: string, category: DataCategory) => `/r/${code}${category === 'sample' ? '?mode=sample' : ''}`
export const shareText = (m: Pick<MemberRef, 'name' | 'referral_path'>) =>
  `Hi, I'm ${m.name.split(' ')[0]}. Tell me what cover you need and I'll come back to you with options: ${referralUrl(m.referral_path)}`
