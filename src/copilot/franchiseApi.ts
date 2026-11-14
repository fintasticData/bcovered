// The franchise sales channel from the browser: the same Postgres functions the bcovered-mcp franchise jobs call.
// Reporting reads take an explicit category so the outlet grid can default to Live while the rest of the workspace is in Sample.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MemberRef } from '../../supabase/functions/copilot-agent/planner'
import type { DataCategory } from '@/lib/supabase/category'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { salesRpc, type SalesReceipt } from './salesApi'

export type SalesMode = 'refer' | 'sell'
export type EnquiryStage = 'received' | 'contacted' | 'offered' | 'sold'
export type EnquiryStatusFilter = 'uncontacted' | 'contacted' | 'offered' | 'sold'

export const ENQUIRY_STAGE_LABEL: Record<EnquiryStage, string> = { received: 'Received', contacted: 'Contacted', offered: 'Offer sent', sold: 'Sold' }

export interface Outlet {
  outlet_id: string
  id: string
  name: string
  label: string
  partner_id: string
  partner_name: string
  service_area: string | null
  sales_mode: SalesMode
  sales_mode_label: string
  status: 'active' | 'paused'
  partner_status: 'active' | 'paused'
  category: DataCategory
  referral_code: string
  referral_path: string
  receiving: MemberRef | null
  open_path: string
}

export interface OutletStaff {
  staff_id: string
  id: string
  name: string
  email: string | null
  phone: string | null
  outlet_role: 'manager' | 'staff'
  role_label: string
  referral_code: string
  referral_path: string
  can_sell: boolean
  seller: MemberRef | null
  status: 'invited' | 'active' | 'suspended'
  invite_status: 'joined' | 'pending' | 'needs_email' | 'not_sent' | 'expired' | 'revoked' | 'suspended'
  user_id: string | null
  outlet_id: string
  referrals?: number
}

export interface FranchiseList {
  category: DataCategory
  can_manage: boolean
  partners: Array<{ id: string; name: string; status: string; created_at: string; outlets: Array<Outlet & { staff: number; enquiries: number; sold: number }> }>
}

export interface OutletDetail extends Outlet {
  can_manage: boolean
  staff: OutletStaff[]
  counts: { enquiries: number; contacted: number; offered: number; sold: number }
  team: MemberRef[]
}

export interface FranchiseEnquiryRow {
  id: string
  reference: string
  received_at: string
  source: string
  stage: EnquiryStage
  stage_label: string
  contacted_at: string | null
  offered_at: string | null
  sold_at: string | null
  outlet: { id: string; label: string; area: string | null }
  referred_by: { id: string; name: string; code: string } | null
  client: { id: string; client_number: string; name: string } | null
  name: string
  phone: string | null
  email: string | null
  interest: string | null
  match_status: string
  handler: MemberRef | null
  next_follow_up: { id: string; title: string; due_date: string | null } | null
  open_path: string
}

export interface FranchiseEnquiryGrid {
  category: DataCategory
  status: string
  rows: FranchiseEnquiryRow[]
  totals: { received: number; uncontacted: number; contacted: number; offered: number; sold: number }
}

export interface PerformanceRow extends Outlet {
  enquiries: number
  offered: number
  sold: number
  conversion: number | null
}

export interface FranchisePerformance {
  category: DataCategory
  from: string | null
  to: string | null
  rows: PerformanceRow[]
  partners: Array<{ partner_id: string; name: string; outlets: number; enquiries: number; offered: number; sold: number; conversion: number | null }>
  totals: { outlets: number; enquiries: number; offered: number; sold: number; conversion: number | null }
  note: string | null
}

export interface FranchiseSale {
  id: string
  reference: string
  sold_at: string
  cover_start_date: string
  insurer_reference: string
  premium_amount: number
  premium_frequency: string
  outlet: { id: string; label: string }
  offer: { id: string; reference: string; insurer: string; product: string } | null
  enquiry: { id: string; reference: string; received_at: string } | null
  client: { id: string; client_number: string; name: string } | null
  referred_by: { id: string; name: string } | null
  seller: MemberRef | null
  open_path: string
}

export interface FranchiseSales {
  category: DataCategory
  rows: FranchiseSale[]
  by_outlet: Array<{ outlet_id: string; label: string; partner_id: string; sales: number; monthly_premium: number }>
  totals: { sales: number; outlets: number; monthly_premium: number }
  note: string | null
}

export interface EnquiryAttribution {
  id: string
  reference: string
  received_at: string
  source: string
  channel: 'direct' | 'franchise'
  stage: EnquiryStage
  stage_label: string
  outlet: { id: string; label: string } | null
  referred_by: { kind: 'outlet_staff' | 'member'; name: string; code: string } | null
  handled_by: MemberRef | null
  sold_by: MemberRef | null
  sale: { id: string; reference: string; sold_at: string } | null
}

export interface SetupReceipt extends SalesReceipt {
  outlet?: Outlet
  manager?: OutletStaff | null
  invite_path?: string | null
  created_partner?: boolean
  created_outlet?: boolean
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
/** Intake or sale-date presets in South African dates. */
export function periodPreset(preset: 'this_month' | 'last_month' | 'last_90' | 'this_year' | 'all'): { from: string | null; to: string | null } {
  const sa = new Date(Date.now() + 2 * 3_600_000)
  const y = sa.getUTCFullYear()
  const m = sa.getUTCMonth()
  const day = (yy: number, mm: number, dd: number) => ymd(new Date(Date.UTC(yy, mm, dd)))
  const today = day(y, m, sa.getUTCDate())
  if (preset === 'this_month') return { from: day(y, m, 1), to: today }
  if (preset === 'last_month') return { from: day(y, m - 1, 1), to: day(y, m, 0) }
  if (preset === 'last_90') return { from: day(y, m, sa.getUTCDate() - 89), to: today }
  if (preset === 'this_year') return { from: day(y, 0, 1), to: today }
  return { from: null, to: null }
}

export const franchiseApi = {
  list: (c: DataCategory) => salesRpc<FranchiseList>('franchise_list', {}, c),
  outlet: (c: DataCategory, outletId: string) => salesRpc<OutletDetail>('franchise_outlet_detail', { p_outlet_id: outletId }, c),
  enquiries: (c: DataCategory, a: { status?: EnquiryStatusFilter | null; outlet_id?: string | null; partner_id?: string | null; from?: string | null; to?: string | null; query?: string | null }) =>
    salesRpc<FranchiseEnquiryGrid>('franchise_enquiry_grid', {
      p_status: a.status ?? null, p_outlet_id: a.outlet_id ?? null, p_partner_id: a.partner_id ?? null, p_from: a.from ?? null, p_to: a.to ?? null,
      p_query: a.query || null, p_limit: 300,
    }, c),
  performance: (c: DataCategory, a: { from?: string | null; to?: string | null; partner_id?: string | null }) =>
    salesRpc<FranchisePerformance>('franchise_performance', { p_from: a.from ?? null, p_to: a.to ?? null, p_partner_id: a.partner_id ?? null }, c),
  sales: (c: DataCategory, a: { from?: string | null; to?: string | null; outlet_id?: string | null; partner_id?: string | null }) =>
    salesRpc<FranchiseSales>('franchise_sales', { p_from: a.from ?? null, p_to: a.to ?? null, p_outlet_id: a.outlet_id ?? null, p_partner_id: a.partner_id ?? null, p_limit: 500 }, c),
  attribution: (c: DataCategory, personId: string) => salesRpc<{ enquiries: EnquiryAttribution[] }>('franchise_client_attribution', { p_person_id: personId }, c),
  setup: (c: DataCategory, a: {
    partner_name?: string; partner_id?: string; outlet_name?: string; service_area?: string; receiving_member_id?: string; sales_mode?: SalesMode
    manager_name?: string; manager_email?: string; manager_phone?: string; key: string
  }) =>
    salesRpc<SetupReceipt>('franchise_setup', {
      p_partner_name: a.partner_name || null, p_idempotency_key: a.key, p_outlet_name: a.outlet_name || null, p_service_area: a.service_area || null,
      p_receiving_member_id: a.receiving_member_id || null, p_receiving_member_name: null, p_sales_mode: a.sales_mode ?? null,
      p_manager_name: a.manager_name || null, p_manager_email: a.manager_email || null, p_manager_phone: a.manager_phone || null,
      p_partner_id: a.partner_id || null, p_copilot: 'workspace',
    }, c),
  updateOutlet: (c: DataCategory, a: { outlet_id: string; name?: string; service_area?: string; receiving_member_id?: string; sales_mode?: SalesMode; status?: 'active' | 'paused'; key: string }) =>
    salesRpc<SetupReceipt>('franchise_update_outlet', {
      p_outlet_id: a.outlet_id, p_idempotency_key: a.key, p_name: a.name || null, p_service_area: a.service_area || null,
      p_receiving_member_id: a.receiving_member_id || null, p_receiving_member_name: null, p_sales_mode: a.sales_mode ?? null, p_status: a.status ?? null,
      p_partner_status: null, p_copilot: 'workspace',
    }, c),
  inviteStaff: (c: DataCategory, a: { outlet_id: string; full_name: string; email?: string; phone?: string; outlet_role: 'manager' | 'staff'; key: string }) =>
    salesRpc<SalesReceipt & { staff: OutletStaff; invite_path: string | null }>('franchise_invite_staff', {
      p_outlet_id: a.outlet_id, p_full_name: a.full_name, p_idempotency_key: a.key, p_email: a.email || null, p_phone: a.phone || null,
      p_outlet_role: a.outlet_role, p_copilot: 'workspace',
    }, c),
  staffInviteLink: (c: DataCategory, staffId: string) => salesRpc<{ staff: OutletStaff; invite_path: string }>('franchise_staff_invite_link', { p_staff_id: staffId }, c),
  linkSeller: (c: DataCategory, a: { outlet_id: string; member_id: string; key: string }) =>
    salesRpc<SalesReceipt & { staff: OutletStaff }>('franchise_link_seller', {
      p_outlet_id: a.outlet_id, p_idempotency_key: a.key, p_member_id: a.member_id, p_member_name: null, p_outlet_role: 'staff', p_copilot: 'workspace',
    }, c),
}

/** Franchise queries are cached per signed-in user and the category they read, so Live and Sample never mix. */
function useFranchiseKey(category: DataCategory, ...parts: unknown[]) {
  const auth = useSupabaseAuth()
  return { key: ['supabase', auth.userId, category, 'franchise', ...parts], ready: auth.status === 'signed_in' }
}

export function useFranchiseList(category: DataCategory) {
  const { key, ready } = useFranchiseKey(category, 'list')
  return useQuery({ queryKey: key, queryFn: () => franchiseApi.list(category), enabled: ready, retry: false })
}

export function useOutletDetail(category: DataCategory, outletId: string | null) {
  const { key, ready } = useFranchiseKey(category, 'outlet', outletId)
  return useQuery({ queryKey: key, queryFn: () => franchiseApi.outlet(category, outletId!), enabled: ready && Boolean(outletId), retry: false })
}

export function useFranchiseEnquiries(category: DataCategory, a: Parameters<typeof franchiseApi.enquiries>[1]) {
  const { key, ready } = useFranchiseKey(category, 'enquiries', a.status ?? null, a.outlet_id ?? null, a.partner_id ?? null, a.from ?? null, a.to ?? null, a.query ?? '')
  return useQuery({ queryKey: key, queryFn: () => franchiseApi.enquiries(category, a), enabled: ready, retry: false, placeholderData: (prev) => prev })
}

export function useFranchisePerformance(category: DataCategory, a: Parameters<typeof franchiseApi.performance>[1]) {
  const { key, ready } = useFranchiseKey(category, 'performance', a.from ?? null, a.to ?? null, a.partner_id ?? null)
  return useQuery({ queryKey: key, queryFn: () => franchiseApi.performance(category, a), enabled: ready, retry: false, placeholderData: (prev) => prev })
}

export function useFranchiseSales(category: DataCategory, a: Parameters<typeof franchiseApi.sales>[1], enabled = true) {
  const { key, ready } = useFranchiseKey(category, 'sales', a.from ?? null, a.to ?? null, a.outlet_id ?? null, a.partner_id ?? null)
  return useQuery({ queryKey: key, queryFn: () => franchiseApi.sales(category, a), enabled: ready && enabled, retry: false, placeholderData: (prev) => prev })
}

/** Attribution for the client record, in the workspace's active category. */
export function useEnquiryAttribution(personId: string | null | undefined) {
  const category = useDataCategory()
  const { key, ready } = useFranchiseKey(category, 'attribution', personId)
  return useQuery({ queryKey: key, queryFn: () => franchiseApi.attribution(category, personId!), enabled: ready && Boolean(personId), retry: false })
}

export type PersonSources = Record<string, { channel: 'direct' | 'franchise'; outlet: string | null; reference: string }>

/** Latest enquiry channel and outlet for the clients on screen (the client grid's Source column). */
export function usePersonSources(personIds: string[]) {
  const category = useDataCategory()
  const ids = [...personIds].sort()
  const { key, ready } = useFranchiseKey(category, 'sources', ids.join(','))
  return useQuery({
    queryKey: key,
    queryFn: () => salesRpc<PersonSources>('franchise_person_sources', { p_person_ids: ids }, category),
    enabled: ready && ids.length > 0,
    retry: false,
    staleTime: 30_000,
  })
}

/** A franchise write in the given category, refreshing every database-backed view when it succeeds. */
export function useFranchiseMutation<A, R>(category: DataCategory, fn: (category: DataCategory, args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (args: A) => fn(category, args), onSuccess: () => void qc.invalidateQueries({ queryKey: ['supabase'] }) })
}

// ------------------------------------------------------------------ Outlet portal (outlet managers and staff)

export interface OutletMembership {
  staff: OutletStaff
  outlet: { id: string; name: string; label: string; service_area: string | null; sales_mode: SalesMode; status: string; category: DataCategory; referral_code: string; referral_path: string; receiving_name: string | null }
  brokerage: string
  live_accepting: boolean
}

export interface OutletProfile {
  signed_in: boolean
  user_id?: string
  name?: string
  email?: string
  outlets: OutletMembership[]
}

export interface OutletReferral {
  id: string
  reference: string
  received_at: string
  customer: string
  interest: string | null
  stage: EnquiryStage
  progress: string
  contacted_at: string | null
  offered_at: string | null
  sold_at: string | null
  referred_by: string | null
  outlet: string
  category: DataCategory
}

export const outletApi = {
  profile: () => salesRpc<OutletProfile>('outlet_my_profile', {}, null),
  referrals: (outletId: string) =>
    salesRpc<{ scope: 'outlet' | 'mine'; rows: OutletReferral[]; totals: { received: number; contacted: number; offered: number; sold: number } }>('outlet_referrals', { p_outlet_id: outletId, p_limit: 500 }, null),
  capture: (a: { outlet_id: string; first_names: string; surname: string; phone: string; email: string; interest: string; message: string; consent: boolean; client_key: string }) =>
    salesRpc<{ ok: boolean; reference: string; progress: string; handler: string | null; outlet: string; category: DataCategory }>('outlet_capture_request', {
      p_outlet_id: a.outlet_id, p_first_names: a.first_names, p_surname: a.surname, p_phone: a.phone || null, p_email: a.email || null,
      p_interest: a.interest || null, p_message: a.message || null, p_consent: a.consent, p_client_key: a.client_key,
    }, null),
  invitation: (token: string) =>
    salesRpc<{ valid: boolean; reason?: string; email?: string; name?: string; role_label?: string; outlet?: string; brokerage?: string; invited_by?: string }>(
      'franchise_invitation_preview', { p_token: token }, null),
  accept: (token: string) => salesRpc<{ outcome: string; staff: OutletStaff; outlet: string; open_path: string }>('franchise_accept_invitation', { p_token: token }, null),
}

export function useOutletProfile() {
  const auth = useSupabaseAuth()
  return useQuery({ queryKey: ['supabase', auth.userId, 'outlet-profile'], queryFn: outletApi.profile, enabled: auth.status === 'signed_in', retry: false })
}

export function useOutletReferrals(outletId: string | null) {
  const auth = useSupabaseAuth()
  return useQuery({ queryKey: ['supabase', auth.userId, 'outlet-referrals', outletId], queryFn: () => outletApi.referrals(outletId!), enabled: auth.status === 'signed_in' && Boolean(outletId), retry: false })
}
