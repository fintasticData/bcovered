import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSampleBookPortalEmail } from '@/lib/demo/samplePortal'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from '@/copilot/api'
import { salesRpc } from '@/copilot/salesApi'

export const newCustomerPageKey = () => `yp:${crypto.randomUUID()}`

export type CustomerItemStatus = 'covered' | 'view_quote' | 'request_sent' | 'awaiting_cover' | 'replaced' | 'removed'

export interface CustomerPageItem {
  id: string
  item_type: string
  display_label: string
  cover_status: string
  customer_status: CustomerItemStatus
  insured_value: number | null
  location_name: string | null
  location_id: string | null
  photo_url: string | null
  reference: string | null
  quote_id: string | null
  quote_request_id?: string | null
  quote_request_reference?: string | null
  details?: Record<string, unknown> | null
  policy_id: string | null
  policy_reference: string | null
  insurer_name?: string | null
  premium_amount: number | null
  premium_frequency: string | null
  premium_scope: 'policy' | 'item'
}

export interface CustomerQuoteRequest {
  id: string
  reference: string
  status: string
  cover_requested: string | null
  item_ids: string[]
  notes: string | null
  released_quote_id: string | null
  created_at: string
  next_step: string
  items: Array<{ id: string; label: string; item_type: string }>
}

export interface CustomerPageAttention {
  priority: number
  kind: string
  label: string
  href: string
  target_id: string
}

export interface CustomerPageDto {
  person_id: string
  customer_id: string
  is_preview: boolean
  is_sample: boolean
  data_category: DataCategory
  greeting_name: string
  full_name: string
  customer_type: string | null
  business: {
    id: string
    trading_name: string
    registered_name: string | null
    locations: Array<{ id: string; name: string; city: string | null }>
  } | null
  brokerage: {
    id: string
    trading_name: string
    logo_url: string | null
    brand_image_url: string | null
  }
  broker: {
    id: string | null
    name: string | null
    phone: string | null
    email: string | null
    russ_enabled: boolean
  } | null
  attention: CustomerPageAttention[]
  items: CustomerPageItem[]
  quote_requests?: CustomerQuoteRequest[]
  policies: Array<{
    id: string
    reference: string | null
    policy_number: string | null
    status: string
    inception_date: string | null
    premium_amount: number | null
    premium_frequency: string | null
    cover_type: string | null
    insurer_name: string | null
    items: Array<{ id: string; label: string; status: string }>
    documents: Array<{ id: string; label: string; url: string | null }>
  }>
  claims: Array<{
    id: string
    reference: string
    status: string
    incident_type: string
    incident_at: string | null
    next_action: string | null
    customer_update: string | null
  }>
  released_quote_count: number
}

export interface CustomerPageInvite {
  invite_id: string
  token: string
  path: string
  expires_at: string
  person_id: string
  customer_id: string
  is_sample: boolean
}

async function rpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory | null): Promise<T> {
  try {
    return await salesRpc<T>(fn, args, category)
  } catch (e) {
    if (e instanceof CopilotError) throw e
    throw new CopilotError(400, e instanceof Error ? e.message : 'Request failed')
  }
}

export const customerPageApi = {
  get: (c: DataCategory, personId?: string | null) =>
    rpc<CustomerPageDto>('customer_page_get', { p_person_id: personId ?? null }, c),
  requestItem: (
    c: DataCategory,
    a: {
      display_label: string
      item_type?: string
      declared_value?: number | null
      description?: string | null
      location_id?: string | null
      photo_url?: string | null
      media_asset_id?: string | null
      key: string
    },
  ) =>
    rpc<{ outcome: string; replayed?: boolean; item_id: string; reference: string; summary: string }>(
      'customer_page_request_item',
      {
        p_display_label: a.display_label,
        p_item_type: a.item_type ?? 'vehicle',
        p_declared_value: a.declared_value ?? null,
        p_description: a.description ?? null,
        p_location_id: a.location_id ?? null,
        p_photo_url: a.photo_url ?? null,
        p_media_asset_id: a.media_asset_id ?? null,
        p_idempotency_key: a.key,
        p_person_id: null,
      },
      c,
    ),
  updateItem: (
    c: DataCategory,
    a: {
      item_id: string
      display_label?: string | null
      declared_value?: number | null
      description?: string | null
      photo_url?: string | null
      details?: Record<string, unknown> | null
      key?: string
    },
  ) =>
    rpc<{ outcome: string; item_id: string; summary: string }>(
      'customer_page_update_item',
      {
        p_item_id: a.item_id,
        p_display_label: a.display_label ?? null,
        p_declared_value: a.declared_value ?? null,
        p_description: a.description ?? null,
        p_photo_url: a.photo_url ?? null,
        p_details: a.details ?? null,
        p_idempotency_key: a.key ?? null,
        p_person_id: null,
      },
      c,
    ),
  requestQuote: (
    c: DataCategory,
    a: {
      item_ids: string[]
      cover_requested?: string | null
      notes?: string | null
      key: string
    },
  ) =>
    rpc<{ outcome: string; replayed?: boolean; request_id: string; reference: string; summary: string }>(
      'customer_page_request_quote',
      {
        p_item_ids: a.item_ids,
        p_cover_requested: a.cover_requested ?? null,
        p_notes: a.notes ?? null,
        p_idempotency_key: a.key,
        p_person_id: null,
      },
      c,
    ),
  inviteCreate: (c: DataCategory, personId: string) =>
    rpc<CustomerPageInvite>('customer_page_invite_create', { p_person_id: personId }, c),
  invitePeek: (token: string) =>
    rpc<{
      invite_id: string
      expires_at: string
      redeemed: boolean
      is_sample: boolean
      brokerage: { trading_name: string; logo_url: string | null }
      greeting_name: string
    }>('customer_page_invite_peek', { p_token: token }, 'sample'),
  inviteRedeem: (token: string) =>
    rpc<{ outcome: string; customer_id: string; person_id: string; path: string; is_sample: boolean }>(
      'customer_page_invite_redeem',
      { p_token: token },
      'sample',
    ),
}

export function useCustomerPage(personId?: string | null, categoryOverride?: DataCategory | null) {
  const auth = useSupabaseAuth()
  const workspaceCategory = useDataCategory()
  // Sample-book VIP/demo customers only have rows in `sample`. Workspace may still be `live`.
  const category = isSampleBookPortalEmail(auth.email)
    ? 'sample'
    : (categoryOverride ?? workspaceCategory)
  const preview = Boolean(personId)
  const signedIn = auth.status === 'signed_in' && Boolean(auth.userId)
  const enabled = personId === null ? false : signedIn && Boolean(category)
  return useQuery({
    queryKey: ['customer-page', category, personId ?? 'me', auth.userId],
    enabled,
    queryFn: () => customerPageApi.get(category!, personId),
    staleTime: preview ? 15_000 : 8_000,
  })
}

function invalidateCustomerPage(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['customer-page'] })
  void qc.invalidateQueries({ queryKey: ['pc-my-cover'] })
}

export function useCustomerPageRequestItem(categoryOverride?: DataCategory | null) {
  const workspaceCategory = useDataCategory()
  const category = categoryOverride ?? workspaceCategory
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Parameters<typeof customerPageApi.requestItem>[1]) => {
      if (!category) throw new CopilotError(400, 'Choose Sample or Live first.')
      return customerPageApi.requestItem(category, a)
    },
    onSuccess: () => invalidateCustomerPage(qc),
  })
}

export function useCustomerPageUpdateItem(categoryOverride?: DataCategory | null) {
  const workspaceCategory = useDataCategory()
  const category = categoryOverride ?? workspaceCategory
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Parameters<typeof customerPageApi.updateItem>[1]) => {
      if (!category) throw new CopilotError(400, 'Choose Sample or Live first.')
      return customerPageApi.updateItem(category, a)
    },
    onSuccess: () => invalidateCustomerPage(qc),
  })
}

export function useCustomerPageRequestQuote(categoryOverride?: DataCategory | null) {
  const workspaceCategory = useDataCategory()
  const category = categoryOverride ?? workspaceCategory
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Parameters<typeof customerPageApi.requestQuote>[1]) => {
      if (!category) throw new CopilotError(400, 'Choose Sample or Live first.')
      return customerPageApi.requestQuote(category, a)
    },
    onSuccess: () => invalidateCustomerPage(qc),
  })
}

export function useCustomerPageInvite() {
  const category = useDataCategory()
  return useMutation({
    mutationFn: (personId: string) => {
      if (!category) throw new CopilotError(400, 'Choose Sample or Live first.')
      return customerPageApi.inviteCreate(category, personId)
    },
  })
}
