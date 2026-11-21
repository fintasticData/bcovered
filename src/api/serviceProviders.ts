import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from '@/copilot/api'
import { salesRpc } from '@/copilot/salesApi'

export const newServiceKey = () => `sp:${crypto.randomUUID()}`

export type ServiceJobStatus =
  | 'draft'
  | 'seeking_provider'
  | 'awaiting_acceptance'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'cancelled'

export interface ServiceTradeType {
  id: string
  code: string
  label: string
  active: boolean
}

export interface ServiceProviderSummary {
  id: string
  trading_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  website?: string | null
  street_address?: string | null
  suburb?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  address_formatted?: string | null
  after_hours_available: boolean
  standard_callout_fee_zar: number | null
  preferred: boolean
  active: boolean
  updated_at?: string
  trades?: Array<{ id: string; code: string; label: string }>
  areas?: string[] | Array<{ id: string; area_label: string; area_kind: string }>
}

export interface ServiceProviderDetail extends ServiceProviderSummary {
  source_url?: string | null
  operating_hours: Record<string, unknown>
  after_hours_callout_fee_zar: number | null
  internal_notes: string | null
  created_at: string
  panels: Array<{
    id: string
    insurer_id: string
    insurer_name: string
    trade_type_id: string
    trade_label: string
    active: boolean
  }>
  areas: Array<{ id: string; area_label: string; area_kind: string }>
  trades: Array<{ id: string; code: string; label: string }>
  jobs_current?: ServiceJob[]
  jobs_history?: ServiceJob[]
  duplicate_warnings?: Array<{ id: string; trading_name: string; phone: string | null; email: string | null }>
}

export interface ServiceProviderMatch extends ServiceProviderSummary {
  match_reasons: string[]
  on_insurer_panel: boolean
  after_hours_callout_fee_zar: number | null
  areas: string[]
}

export interface ServiceJobAllocation {
  id: string
  provider_id: string
  attempt_no: number
  is_current?: boolean
  status: string
  provider_notified_at: string | null
  acceptance_channel?: string | null
  accepted_at: string | null
  declined_at?: string | null
  decline_reason?: string | null
  quoted_callout_fee_zar?: number | null
  provider_name?: string | null
  provider_phone?: string | null
  provider_email?: string | null
  contact_person?: string | null
  after_hours_available?: boolean | null
  created_at?: string
}

export interface ServiceJob {
  id: string
  concierge_request_id: string | null
  claim_id: string | null
  policy_id: string | null
  insured_item_id: string | null
  person_id: string
  customer_id: string
  trade_type_id: string
  trade_code: string
  trade_label: string
  work_description: string
  urgency: string
  preferred_window: Record<string, unknown>
  service_address: string
  status: ServiceJobStatus
  authority_status: string | null
  payment_responsibility: string | null
  quoted_callout_fee_zar: number | null
  agreed_amount_zar: number | null
  appointment_at: string | null
  completed_at: string | null
  outcome: Record<string, unknown>
  next_action: string | null
  responsible_party: string
  created_at: string
  updated_at: string
  current_allocation: ServiceJobAllocation | null
  allocations: ServiceJobAllocation[]
}

export const JOB_STATUS_LABEL: Record<ServiceJobStatus, string> = {
  draft: 'Draft',
  seeking_provider: 'Seeking provider',
  awaiting_acceptance: 'Awaiting acceptance',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

async function rpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory | null): Promise<T> {
  try {
    return await salesRpc<T>(fn, args, category)
  } catch (e) {
    if (e instanceof CopilotError) throw e
    throw new CopilotError(400, e instanceof Error ? e.message : 'Request failed')
  }
}

export const serviceProvidersApi = {
  tradeTypes: (c: DataCategory) => rpc<ServiceTradeType[]>('service_trade_types_list', {}, c),
  list: (
    c: DataCategory,
    a?: { query?: string; tradeTypeId?: string | null; area?: string; active?: boolean | null },
  ) =>
    rpc<ServiceProviderSummary[]>('service_provider_list', {
      p_query: a?.query ?? null,
      p_trade_type_id: a?.tradeTypeId ?? null,
      p_area: a?.area ?? null,
      p_active: a?.active ?? null,
    }, c),
  get: (c: DataCategory, providerId: string) =>
    rpc<ServiceProviderDetail>('service_provider_get', { p_provider_id: providerId }, c),
  upsert: (
    c: DataCategory,
    a: {
      providerId?: string | null
      tradingName: string
      contactPerson?: string | null
      phone?: string | null
      email?: string | null
      website?: string | null
      streetAddress?: string | null
      suburb?: string | null
      city?: string | null
      province?: string | null
      postalCode?: string | null
      operatingHours?: Record<string, unknown>
      afterHoursAvailable?: boolean
      standardCalloutFeeZar?: number | null
      afterHoursCalloutFeeZar?: number | null
      preferred?: boolean
      active?: boolean
      internalNotes?: string | null
      tradeTypeIds: string[]
      areas: Array<{ area_label: string; area_kind?: string }>
      panels?: Array<{ insurer_id: string; trade_type_id: string; active?: boolean }>
    },
  ) =>
    rpc<ServiceProviderDetail>('service_provider_upsert', {
      p_provider_id: a.providerId ?? null,
      p_trading_name: a.tradingName,
      p_contact_person: a.contactPerson ?? null,
      p_phone: a.phone ?? null,
      p_email: a.email ?? null,
      p_website: a.website ?? null,
      p_street_address: a.streetAddress ?? null,
      p_suburb: a.suburb ?? null,
      p_city: a.city ?? null,
      p_province: a.province ?? null,
      p_postal_code: a.postalCode ?? null,
      p_operating_hours: a.operatingHours ?? {},
      p_after_hours_available: a.afterHoursAvailable ?? false,
      p_standard_callout_fee_zar: a.standardCalloutFeeZar ?? null,
      p_after_hours_callout_fee_zar: a.afterHoursCalloutFeeZar ?? null,
      p_preferred: a.preferred ?? false,
      p_active: a.active ?? true,
      p_internal_notes: a.internalNotes ?? null,
      p_trade_type_ids: a.tradeTypeIds,
      p_areas: a.areas,
      p_panels: a.panels ?? [],
    }, c),
  match: (
    c: DataCategory,
    a: { tradeTypeId: string; area?: string; insurerId?: string | null; broaden?: boolean },
  ) =>
    rpc<ServiceProviderMatch[]>('service_provider_match', {
      p_trade_type_id: a.tradeTypeId,
      p_area: a.area ?? null,
      p_insurer_id: a.insurerId ?? null,
      p_broaden: a.broaden ?? false,
    }, c),
  createJob: (
    c: DataCategory,
    a: {
      requestId?: string | null
      claimId?: string | null
      personId?: string | null
      tradeTypeId: string
      workDescription: string
      urgency?: string
      preferredWindow?: Record<string, unknown>
      serviceAddress?: string | null
      authorityStatus?: string
      paymentResponsibility?: string
      key: string
    },
  ) =>
    rpc<ServiceJob>('service_job_create', {
      p_concierge_request_id: a.requestId ?? null,
      p_claim_id: a.claimId ?? null,
      p_person_id: a.personId ?? null,
      p_trade_type_id: a.tradeTypeId,
      p_work_description: a.workDescription,
      p_urgency: a.urgency ?? 'standard',
      p_preferred_window: a.preferredWindow ?? {},
      p_service_address: a.serviceAddress ?? null,
      p_authority_status: a.authorityStatus ?? 'pending',
      p_payment_responsibility: a.paymentResponsibility ?? 'unconfirmed',
      p_idempotency_key: a.key,
    }, c),
  allocate: (
    c: DataCategory,
    a: {
      jobId: string
      providerId: string
      quotedCalloutFeeZar?: number | null
      sharePhone?: boolean
      shareEmail?: boolean
      key: string
    },
  ) =>
    rpc<ServiceJob>('service_job_allocate', {
      p_job_id: a.jobId,
      p_provider_id: a.providerId,
      p_quoted_callout_fee_zar: a.quotedCalloutFeeZar ?? null,
      p_share_phone: a.sharePhone ?? true,
      p_share_email: a.shareEmail ?? true,
      p_idempotency_key: a.key,
    }, c),
  recordResponse: (
    c: DataCategory,
    a: {
      jobId: string
      response: 'accepted' | 'declined' | 'notified'
      channel?: string
      declineReason?: string | null
      markNotified?: boolean
      key: string
    },
  ) =>
    rpc<ServiceJob>('service_job_record_response', {
      p_job_id: a.jobId,
      p_response: a.response,
      p_channel: a.channel ?? 'phone',
      p_decline_reason: a.declineReason ?? null,
      p_mark_notified: a.markNotified ?? false,
      p_idempotency_key: a.key,
    }, c),
  schedule: (c: DataCategory, a: { jobId: string; appointmentAt: string; key: string }) =>
    rpc<ServiceJob>('service_job_schedule', {
      p_job_id: a.jobId,
      p_appointment_at: a.appointmentAt,
      p_idempotency_key: a.key,
    }, c),
  setStatus: (
    c: DataCategory,
    a: {
      jobId: string
      status: 'in_progress' | 'completed' | 'cancelled'
      outcomeSummary?: string | null
      agreedAmountZar?: number | null
      key: string
    },
  ) =>
    rpc<ServiceJob>('service_job_set_status', {
      p_job_id: a.jobId,
      p_status: a.status,
      p_outcome_summary: a.outcomeSummary ?? null,
      p_agreed_amount_zar: a.agreedAmountZar ?? null,
      p_idempotency_key: a.key,
    }, c),
  reassign: (
    c: DataCategory,
    a: { jobId: string; providerId: string; quotedCalloutFeeZar?: number | null; key: string },
  ) =>
    rpc<ServiceJob>('service_job_reassign', {
      p_job_id: a.jobId,
      p_provider_id: a.providerId,
      p_quoted_callout_fee_zar: a.quotedCalloutFeeZar ?? null,
      p_idempotency_key: a.key,
    }, c),
  jobsForClaim: (c: DataCategory, claimId: string) =>
    rpc<ServiceJob[]>('service_jobs_for_claim', { p_claim_id: claimId }, c),
  suggestedTrades: (c: DataCategory, incidentType: string) =>
    rpc<ServiceTradeType[]>('claim_suggested_trades', { p_incident_type: incidentType }, c),
}

function useInvalidateService() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['service-providers'] })
    void qc.invalidateQueries({ queryKey: ['service-provider'] })
    void qc.invalidateQueries({ queryKey: ['service-trades'] })
    void qc.invalidateQueries({ queryKey: ['service-jobs-for-claim'] })
    void qc.invalidateQueries({ queryKey: ['claim-suggested-trades'] })
    void qc.invalidateQueries({ queryKey: ['supabase'] })
    void qc.invalidateQueries({ queryKey: ['concierge-request'] })
    void qc.invalidateQueries({ queryKey: ['concierge-home'] })
    void qc.invalidateQueries({ queryKey: ['concierge-broker-queue'] })
  }
}

export function useServiceJobsForClaim(claimId: string | null | undefined) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['service-jobs-for-claim', category, claimId],
    enabled: auth.status === 'signed_in' && Boolean(category) && Boolean(claimId),
    queryFn: () => serviceProvidersApi.jobsForClaim(category!, claimId!),
    staleTime: 5_000,
  })
}

export function useClaimSuggestedTrades(incidentType: string | null | undefined) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['claim-suggested-trades', category, incidentType ?? ''],
    enabled: auth.status === 'signed_in' && Boolean(category) && Boolean(incidentType),
    queryFn: () => serviceProvidersApi.suggestedTrades(category!, incidentType!),
    staleTime: 60_000,
  })
}

export function useServiceTradeTypes() {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['service-trades', category],
    enabled: auth.status === 'signed_in' && Boolean(category),
    queryFn: () => serviceProvidersApi.tradeTypes(category!),
    staleTime: 60_000,
  })
}

export function useServiceProviders(filters?: {
  query?: string
  tradeTypeId?: string | null
  area?: string
  active?: boolean | null
}) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['service-providers', category, filters?.query ?? '', filters?.tradeTypeId ?? null, filters?.area ?? '', filters?.active ?? null],
    enabled: auth.status === 'signed_in' && Boolean(category),
    queryFn: () => serviceProvidersApi.list(category!, filters),
    staleTime: 8_000,
  })
}

export function useServiceProvider(providerId: string | undefined) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['service-provider', category, providerId],
    enabled: auth.status === 'signed_in' && Boolean(category) && Boolean(providerId),
    queryFn: () => serviceProvidersApi.get(category!, providerId!),
    staleTime: 5_000,
  })
}

export function useServiceProviderMutations() {
  const category = useDataCategory()
  const invalidate = useInvalidateService()
  const requireCat = () => {
    if (!category) throw new CopilotError(400, 'Choose Sample or Live first.')
    return category
  }
  return {
    upsert: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.upsert>[1]) =>
        serviceProvidersApi.upsert(requireCat(), a),
      onSuccess: invalidate,
    }),
    createJob: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.createJob>[1]) =>
        serviceProvidersApi.createJob(requireCat(), a),
      onSuccess: invalidate,
    }),
    allocate: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.allocate>[1]) =>
        serviceProvidersApi.allocate(requireCat(), a),
      onSuccess: invalidate,
    }),
    recordResponse: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.recordResponse>[1]) =>
        serviceProvidersApi.recordResponse(requireCat(), a),
      onSuccess: invalidate,
    }),
    schedule: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.schedule>[1]) =>
        serviceProvidersApi.schedule(requireCat(), a),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.setStatus>[1]) =>
        serviceProvidersApi.setStatus(requireCat(), a),
      onSuccess: invalidate,
    }),
    reassign: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.reassign>[1]) =>
        serviceProvidersApi.reassign(requireCat(), a),
      onSuccess: invalidate,
    }),
    match: useMutation({
      mutationFn: (a: Parameters<typeof serviceProvidersApi.match>[1]) =>
        serviceProvidersApi.match(requireCat(), a),
    }),
  }
}
