import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from './api'
import { salesRpc } from './salesApi'

export interface PartnerPackage {
  id: string
  name: string
  image_url: string | null
  outcomes: string[]
  description: string | null
  can_do: string | null
  install_fee_cents: number
  monthly_fee_cents: number
  contract_months: number | null
  product_kind: 'tracker' | 'dashcam' | 'trailer' | 'other'
  sort_order: number
}

export interface PartnerInfo {
  id: string
  name: string
  slug: string
  logo_url: string | null
  intro: string | null
  install_areas: string[]
  contact_phone: string | null
  contact_email: string | null
  brokerage: string
  tenant_id: string
  category: DataCategory
}

export interface PartnerInstallRequest {
  id: string
  reference: string
  partner_id: string
  partner_name: string
  package_id: string
  package_name: string
  person_id: string | null
  insured_item_id: string | null
  vehicle_label: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  preferred_area: string | null
  request_kind: 'installation' | 'fleet_quote'
  status: 'requested' | 'partner_contacting' | 'booked' | 'fitted' | 'declined' | 'withdrawn'
  source: string
  share_with_partner: boolean
  appointment_at: string | null
  appointment_note: string | null
  device_details: Record<string, unknown>
  certificate_url: string | null
  next_action: string | null
  created_at: string
  updated_at: string
}

export interface PartnerVehicle {
  id: string
  display_label: string
  status: string
  details: Record<string, unknown>
}

export const OUTCOME_LABEL: Record<string, string> = {
  recovery: 'Helps recover a stolen vehicle',
  live_location: 'See where the vehicle is',
  alerts: 'Movement / theft alerts',
  dashcam: 'Records the road ahead',
  trailer: 'Tracks a trailer or towed asset',
}

export function centsToRand(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function installStatusLabel(status: PartnerInstallRequest['status']): string {
  switch (status) {
    case 'requested':
      return 'Installation requested'
    case 'partner_contacting':
      return 'Partner contacting you'
    case 'booked':
      return 'Installation booked'
    case 'fitted':
      return 'Device fitted'
    case 'declined':
      return 'Declined'
    case 'withdrawn':
      return 'Withdrawn'
    default:
      return status
  }
}

export const partnerTrackingApi = {
  page: (slug: string, category: DataCategory = 'sample') =>
    salesRpc<{
      valid: boolean
      reason?: string
      partner?: PartnerInfo
      trackers?: PartnerPackage[]
      other_products?: PartnerPackage[]
    }>('partner_tracking_page', { p_slug: slug, p_category: category }, null),

  defaultSlug: (category: DataCategory = 'sample') =>
    salesRpc<{ slug: string | null }>('partner_default_tracking_slug', { p_category: category }, null),

  myContext: (category: DataCategory) =>
    salesRpc<{
      signed_in: boolean
      customer_id?: string
      vehicles: PartnerVehicle[]
      requests: PartnerInstallRequest[]
    }>('partner_tracking_my_context', {}, category),

  requestInstallation: (
    category: DataCategory,
    a: {
      slug: string
      package_id: string
      request_kind?: 'installation' | 'fleet_quote'
      insured_item_ids?: string[]
      vehicle_label?: string
      contact_name?: string
      contact_phone?: string
      contact_email?: string
      preferred_area?: string
      share_with_partner?: boolean
      source?: 'my_area' | 'share_link' | 'broker'
      client_key: string
    },
  ) =>
    salesRpc<{
      ok: boolean
      reason?: string
      replayed?: boolean
      partner_name?: string
      package_name?: string
      requests?: PartnerInstallRequest[]
    }>('partner_request_installation', {
      p_slug: a.slug,
      p_package_id: a.package_id,
      p_request_kind: a.request_kind ?? 'installation',
      p_insured_item_ids: a.insured_item_ids?.length ? a.insured_item_ids : null,
      p_vehicle_label: a.vehicle_label ?? null,
      p_contact_name: a.contact_name ?? null,
      p_contact_phone: a.contact_phone ?? null,
      p_contact_email: a.contact_email ?? null,
      p_preferred_area: a.preferred_area ?? null,
      p_share_with_partner: a.share_with_partner ?? true,
      p_source: a.source ?? 'my_area',
      p_client_key: a.client_key,
      p_category: category,
    }, null),

  listForPerson: (category: DataCategory, personId: string) =>
    salesRpc<{ rows: PartnerInstallRequest[] }>('partner_list_person_install_requests', { p_person_id: personId }, category),

  updateStatus: (
    category: DataCategory,
    a: {
      request_id: string
      status: PartnerInstallRequest['status']
      appointment_at?: string | null
      appointment_note?: string | null
      next_action?: string | null
    },
  ) =>
    salesRpc<{ ok: boolean; reason?: string; request?: PartnerInstallRequest }>('partner_update_install_status', {
      p_request_id: a.request_id,
      p_status: a.status,
      p_appointment_at: a.appointment_at ?? null,
      p_appointment_note: a.appointment_note ?? null,
      p_next_action: a.next_action ?? null,
    }, category),
}

function useReady() {
  const auth = useSupabaseAuth()
  return {
    ready: auth.status !== 'signing_in',
    signedIn: auth.status === 'signed_in',
    category: useDataCategory(),
  }
}

export function usePartnerTrackingPage(slug: string | undefined, category: DataCategory = 'sample') {
  return useQuery({
    queryKey: ['partner-tracking-page', slug, category],
    queryFn: () => partnerTrackingApi.page(slug!, category),
    enabled: Boolean(slug),
    retry: false,
  })
}

export function usePartnerDefaultSlug(category: DataCategory = 'sample') {
  return useQuery({
    queryKey: ['partner-default-slug', category],
    queryFn: () => partnerTrackingApi.defaultSlug(category),
    retry: false,
  })
}

export function usePartnerMyContext() {
  const { ready, category } = useReady()
  return useQuery({
    queryKey: ['supabase', category, 'partner-my-context'],
    queryFn: () => partnerTrackingApi.myContext(category),
    enabled: ready,
    retry: false,
  })
}

export function usePersonInstallRequests(personId: string | null | undefined) {
  const { ready, category } = useReady()
  return useQuery({
    queryKey: ['supabase', category, 'partner-person-installs', personId],
    queryFn: () => partnerTrackingApi.listForPerson(category, personId!),
    enabled: ready && Boolean(personId),
    retry: false,
  })
}

export function usePartnerRequestMutation() {
  const category = useDataCategory()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: Parameters<typeof partnerTrackingApi.requestInstallation>[1]) =>
      partnerTrackingApi.requestInstallation(category, args).then((r) => {
        if (!r.ok) throw new CopilotError(400, r.reason || 'Could not submit request')
        return r
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supabase'] })
      void qc.invalidateQueries({ queryKey: ['partner-tracking-page'] })
    },
  })
}

export function usePartnerStatusMutation() {
  const category = useDataCategory()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: Parameters<typeof partnerTrackingApi.updateStatus>[1]) =>
      partnerTrackingApi.updateStatus(category, args).then((r) => {
        if (!r.ok) throw new CopilotError(400, r.reason || 'Could not update status')
        return r
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supabase'] })
    },
  })
}
