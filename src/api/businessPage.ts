import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api, session } from '@/api/client'
import type { BusinessDetail, PortalBusinessView } from '@/api/client'
import type { ValueBasis } from '@/server/db/commercialSchema'

function useSessionToken() {
  return useSyncExternalStore(session.subscribe, session.token, () => null)
}

function useBizKey(...parts: unknown[]) {
  return [useSessionToken() ?? 'visitor', ...parts]
}

export type BusinessAssetCoverStatus = 'covered' | 'awaiting_cover' | 'review_needed' | 'not_confirmed'

export interface BusinessPageLocation {
  id: string
  name: string
  city: string | null
  /** When set, Map uses Site layout for this place. */
  floor_plan_url?: string | null
}

export type BusinessAssetMobility = 'fixed' | 'portable' | 'vehicle'

export interface BusinessPageAsset {
  id: string
  asset_class: string
  display_label: string
  description: string
  quantity: number
  declared_value: number | null
  value_basis: ValueBasis | string
  valuation_date: string | null
  location_id: string | null
  location_name: string | null
  cover_status: BusinessAssetCoverStatus
  photo_url: string | null
  source: string | null
  /** Purchase / acquisition price when known. */
  purchase_price?: number | null
  purchase_date?: string | null
  /** Explicit insured amount from active cover (not declared value). */
  insured_value?: number | null
  replacement_value?: number | null
  premium_amount?: number | null
  premium_frequency?: string | null
  policy_id?: string | null
  mobility_type?: BusinessAssetMobility
  usual_base_place_id?: string | null
  usual_base_place_name?: string | null
  typically_used_place_ids?: string[]
  typically_used_place_names?: string[]
  /** Policy coverage territory — separate from places of use. */
  coverage_territory?: string | null
}

export interface BusinessPageAttention {
  priority: number
  kind: string
  label: string
  href: string
  target_id: string
}

export interface BusinessPageOpenRequest {
  id: string
  title: string
  detail: string | null
  kind: string
  due_date: string | null
}

export interface BusinessPageDto {
  profile_id: string
  customer_id: string
  is_preview: boolean
  is_sample: boolean
  trading_name: string
  registered_name: string
  industry_name: string
  greeting_name: string
  review_status: string | null
  assigned_broker: string | null
  brokerage: {
    trading_name: string
    logo_url: string | null
  }
  locations: BusinessPageLocation[]
  assets: BusinessPageAsset[]
  attention: BusinessPageAttention[]
  open_requests: BusinessPageOpenRequest[]
  open_request_count: number
  exposure_count: number
}

function locationName(
  locations: Array<{ id: string; name: string; city?: string | null }>,
  locationId: string | null,
): string | null {
  if (!locationId) return null
  const loc = locations.find((l) => l.id === locationId)
  if (!loc) return null
  return loc.city ? `${loc.name} · ${loc.city}` : loc.name
}

function mapAssetMobility(
  a: {
    id: string
    location_id: string | null
    mobility_type?: string | null
    usual_base_place_id?: string | null
  },
  locations: Array<{ id: string; name: string; city?: string | null }>,
  placesOfUse: Array<{ asset_id: string; place_id: string }>,
): Pick<
  BusinessPageAsset,
  | 'mobility_type'
  | 'usual_base_place_id'
  | 'usual_base_place_name'
  | 'typically_used_place_ids'
  | 'typically_used_place_names'
  | 'coverage_territory'
> {
  const mobility =
    a.mobility_type === 'portable' || a.mobility_type === 'vehicle' || a.mobility_type === 'fixed'
      ? a.mobility_type
      : 'fixed'
  const used = placesOfUse.filter((p) => p.asset_id === a.id).map((p) => p.place_id)
  const names = used
    .map((id) => locationName(locations, id))
    .filter((n): n is string => Boolean(n))
  const usualId = a.usual_base_place_id ?? a.location_id
  return {
    mobility_type: mobility,
    usual_base_place_id: usualId,
    usual_base_place_name: locationName(locations, usualId ?? null),
    typically_used_place_ids: used,
    typically_used_place_names: names,
    // Places of use ≠ policy territory — territory comes from cover when linked.
    coverage_territory: null,
  }
}

function coverForAsset(asset: {
  declared_value: number | null
  value_basis: string
  source?: string
}): BusinessAssetCoverStatus {
  // Commercial book has no live policy link on assets yet — values drive readiness.
  if (asset.declared_value == null) return 'not_confirmed'
  if (asset.value_basis === 'unknown' || asset.source === 'declared') return 'review_needed'
  if (asset.source === 'verified') return 'awaiting_cover'
  return 'not_confirmed'
}

function buildAttention(opts: {
  openRequests: Array<{ id: string; title: string }>
  assets: BusinessPageAsset[]
  reviewStatus: string | null
  basePath: string
}): BusinessPageAttention[] {
  const out: BusinessPageAttention[] = []
  if (opts.openRequests[0]) {
    out.push({
      priority: 1,
      kind: 'open_request',
      label: opts.openRequests[0].title,
      href: `${opts.basePath}?tab=requests`,
      target_id: opts.openRequests[0].id,
    })
  }
  const missingValue = opts.assets.find((a) => a.declared_value == null)
  if (missingValue) {
    out.push({
      priority: 2,
      kind: 'value_missing',
      label: `Confirm replacement value for ${missingValue.display_label}`,
      href: `${opts.basePath}?item=${encodeURIComponent(missingValue.display_label)}`,
      target_id: missingValue.id,
    })
  }
  if (opts.reviewStatus && /not started|preparing/i.test(opts.reviewStatus) && out.length === 0) {
    out.push({
      priority: 3,
      kind: 'review',
      label: opts.reviewStatus,
      href: `${opts.basePath ?? '/my/business'}/risk-profile`,
      target_id: 'risk',
    })
  }
  return out.sort((a, b) => a.priority - b.priority)
}

export function mapPortalBusinessToDto(
  view: PortalBusinessView,
  opts?: { basePath?: string },
): BusinessPageDto {
  const basePath = opts?.basePath ?? '/my/business'
  const locations: BusinessPageLocation[] = view.locations.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    floor_plan_url: (l as { floor_plan_url?: string | null }).floor_plan_url ?? null,
  }))
  const placesOfUse = view.places_of_use ?? []
  const assets: BusinessPageAsset[] = view.assets.map((a) => ({
    id: a.id,
    asset_class: a.asset_class,
    display_label: a.description || a.asset_class.replace(/_/g, ' '),
    description: a.description,
    quantity: a.quantity,
    declared_value: a.declared_value,
    value_basis: a.value_basis,
    valuation_date: a.valuation_date,
    location_id: a.location_id,
    location_name: locationName(view.locations, a.location_id),
    cover_status: coverForAsset(a),
    photo_url: null,
    source: a.source,
    purchase_price: (a as { purchase_price?: number | null }).purchase_price ?? null,
    purchase_date: (a as { purchase_date?: string | null }).purchase_date ?? null,
    insured_value: (a as { insured_value?: number | null }).insured_value ?? null,
    replacement_value: a.value_basis === 'replacement' ? a.declared_value : null,
    ...mapAssetMobility(a, view.locations, placesOfUse),
  }))
  const open_requests: BusinessPageOpenRequest[] = view.open_requests.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail ?? null,
    kind: t.kind,
    due_date: t.due_date ?? null,
  }))
  const contact = view.profile.primary_contact?.name?.split(' ')[0]
  const trading = view.profile.trading_name ?? view.profile.registered_name
  return {
    profile_id: view.profile.id,
    customer_id: view.customer.id,
    is_preview: false,
    is_sample: Boolean(view.profile.is_synthetic),
    trading_name: trading,
    registered_name: view.profile.registered_name,
    industry_name: view.industry_name,
    greeting_name: contact ?? trading,
    review_status: view.review_status,
    assigned_broker: null,
    brokerage: {
      trading_name: 'Your brokerage',
      logo_url: null,
    },
    locations,
    assets,
    attention: buildAttention({
      openRequests: open_requests,
      assets,
      reviewStatus: view.review_status,
      basePath,
    }),
    open_requests,
    open_request_count: open_requests.length,
    exposure_count: view.exposures.length,
  }
}

export function mapBusinessDetailToDto(
  detail: BusinessDetail,
  opts?: { basePath?: string },
): BusinessPageDto {
  const basePath = opts?.basePath ?? `/broker/customers/businesses/${detail.profile.id}/business-page`
  const locations: BusinessPageLocation[] = detail.locations.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    floor_plan_url: (l as { floor_plan_url?: string | null }).floor_plan_url ?? null,
  }))
  const placesOfUse = detail.places_of_use ?? []
  const assets: BusinessPageAsset[] = detail.assets.map((a) => ({
    id: a.id,
    asset_class: a.asset_class,
    display_label: a.description || a.asset_class.replace(/_/g, ' '),
    description: a.description,
    quantity: a.quantity,
    declared_value: a.declared_value,
    value_basis: a.value_basis,
    valuation_date: a.valuation_date,
    location_id: a.location_id,
    location_name: locationName(detail.locations, a.location_id),
    cover_status: coverForAsset(a),
    photo_url: null,
    source: a.source,
    purchase_price: (a as { purchase_price?: number | null }).purchase_price ?? null,
    purchase_date: (a as { purchase_date?: string | null }).purchase_date ?? null,
    insured_value: (a as { insured_value?: number | null }).insured_value ?? null,
    ...mapAssetMobility(a, detail.locations, placesOfUse),
    replacement_value: a.value_basis === 'replacement' ? a.declared_value : null,
  }))
  const customerTasks = detail.tasks.filter((t) => t.audience === 'customer' && t.status === 'open')
  const open_requests: BusinessPageOpenRequest[] = customerTasks.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail ?? null,
    kind: t.kind,
    due_date: t.due_date ?? null,
  }))
  const trading = detail.profile.trading_name ?? detail.profile.registered_name
  const contact = detail.profile.primary_contact?.name?.split(' ')[0]
  return {
    profile_id: detail.profile.id,
    customer_id: detail.customer.id,
    is_preview: true,
    is_sample: Boolean(detail.profile.is_synthetic),
    trading_name: trading,
    registered_name: detail.profile.registered_name,
    industry_name: detail.industry.name,
    greeting_name: contact ?? trading,
    review_status: detail.submissions[0]?.status ?? null,
    assigned_broker: detail.assigned_broker,
    brokerage: {
      trading_name: 'Broker preview',
      logo_url: null,
    },
    locations,
    assets,
    attention: buildAttention({
      openRequests: open_requests,
      assets,
      reviewStatus: detail.submissions[0] ? `Submission ${detail.submissions[0].status}` : null,
      basePath,
    }),
    open_requests,
    open_request_count: open_requests.length,
    exposure_count: detail.exposures.length,
  }
}

/** Customer-facing My Business Page book. */
export function useBusinessPage(opts?: { enabled?: boolean; basePath?: '/my/business' | '/demo/my/business' }) {
  const enabled = opts?.enabled !== false
  const basePath = opts?.basePath ?? '/my/business'
  return useQuery({
    queryKey: useBizKey('business-page', 'me', basePath),
    enabled,
    queryFn: async (): Promise<BusinessPageDto> => {
      const view = await api.commercial.portal()
      return mapPortalBusinessToDto(view, { basePath })
    },
    staleTime: 8_000,
    retry: (count, err) => {
      if (err instanceof ApiError && err.code === 'not_found') return false
      return count < 2
    },
  })
}

/** Broker preview of the same book for a profile. */
export function useBusinessPagePreview(profileId: string | null | undefined) {
  return useQuery({
    queryKey: useBizKey('business-page-preview', profileId),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<BusinessPageDto> => {
      const detail = await api.commercial.client(profileId!)
      return mapBusinessDetailToDto(detail)
    },
    staleTime: 15_000,
  })
}

/** True when portal business exists (for nav). Soft — swallows not_found. */
export function useHasBusinessPage() {
  return useQuery({
    queryKey: useBizKey('business-page-exists'),
    queryFn: async () => {
      try {
        await api.commercial.portal()
        return true
      } catch (e) {
        if (e instanceof ApiError && e.code === 'not_found') return false
        throw e
      }
    },
    staleTime: 30_000,
    retry: false,
  })
}
