// Concierge "Find providers": simple directory search via provider-find Edge Function.
// One bounded step per call — each successful step auto-saves one provider (no manual Add click).
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { SUPABASE_KEY, SUPABASE_URL, supabaseAuth } from '@/lib/supabase/client'

export class ProviderFindError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type ProviderFindStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface FoundProvider {
  id: string
  created?: boolean
  trading_name: string
  phone: string | null
  email: string | null
  website: string | null
  street_address: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  address_formatted: string | null
  source_url: string | null
}

export interface ProviderFindProgress {
  found: number
  requested: number
  searches_used: number
  step: string
  elapsed_ms: number
}

export interface ProviderFindRun {
  id: string
  status: ProviderFindStatus
  cancel_requested?: boolean
  category?: DataCategory
  inputs: {
    area: string
    trade_code?: string | null
    trade_label?: string | null
    requested_count: number
  }
  outputs: {
    phase?: string
    queue?: unknown[]
    saved: FoundProvider[]
    rejected?: Array<{ trading_name: string; reason: string }>
    progress: ProviderFindProgress
    stop_reason: string | null
    summary: string | null
    last_added?: FoundProvider | null
  }
  created_at?: string
  completed_at?: string | null
}

export const isFindFinished = (run: Pick<ProviderFindRun, 'status'>) =>
  ['completed', 'failed', 'cancelled'].includes(run.status)

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new ProviderFindError(503, 'Supabase is not configured for this build.')
  }
  const token = await supabaseAuth.accessToken()
  if (!token) {
    throw new ProviderFindError(
      401,
      'Sign in to the database first: choose a brokerage staff identity under “Demo as”.',
    )
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-find${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ProviderFindError(res.status, body?.error ?? `Provider search failed (${res.status})`)
  }
  return body as T
}

export function providerFindWorkerId() {
  const k = 'bcovered_provider_find_worker'
  let id = sessionStorage.getItem(k)
  if (!id) {
    id = `tab-${crypto.randomUUID()}`
    sessionStorage.setItem(k, id)
  }
  return id
}

export const providerFindApi = {
  create: (a: {
    category: DataCategory
    area: string
    tradeTypeId: string
    tradeCode?: string | null
    tradeLabel?: string | null
    requestedCount?: number
    idempotencyKey: string
  }) =>
    call<{ run: ProviderFindRun }>('/runs', {
      method: 'POST',
      body: JSON.stringify({
        category: a.category,
        area: a.area,
        trade_type_id: a.tradeTypeId,
        trade_code: a.tradeCode ?? null,
        trade_label: a.tradeLabel ?? null,
        requested_count: a.requestedCount ?? 10,
        idempotency_key: a.idempotencyKey,
      }),
    }).then((r) => r.run),

  step: (runId: string, category: DataCategory) =>
    call<{ run: ProviderFindRun; done: boolean; last_added?: FoundProvider | null }>('/runs/' + runId + '/step', {
      method: 'POST',
      body: JSON.stringify({ category, worker: providerFindWorkerId() }),
    }),

  get: (runId: string, category: DataCategory) =>
    call<{ run: ProviderFindRun }>(`/runs/${runId}?category=${category}`).then((r) => r.run),

  cancel: (runId: string, category: DataCategory) =>
    call<{ run: ProviderFindRun }>('/runs/' + runId + '/cancel', {
      method: 'POST',
      body: JSON.stringify({ category }),
    }).then((r) => r.run),
}

/** Hook helper — category from context for callers that prefer it. */
export function useProviderFindCategory() {
  return useDataCategory()
}
