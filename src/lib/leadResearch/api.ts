// Russ "Generate leads" from the browser: every call goes to the lead-research Edge Function as the signed-in broker.
// The browser drives a run one bounded step at a time, so progress is visible and a refresh can resume it.
import { useQuery } from '@tanstack/react-query'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { SUPABASE_KEY, SUPABASE_URL, supabaseAuth, useSupabaseAuth } from '@/lib/supabase/client'

export class LeadResearchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface LeadFilters {
  area: string | null
  radius_km: number | null
  business_function: string | null
  category: string | null
  industry: string | null
  cover_type: string | null
  requested_count: number | null
}

export interface LeadBudget {
  max_seconds: number
  max_searches: number
  max_page_fetches: number
  max_cost_usd: number
}

export interface AreaFinding {
  finding: string
  relevance_to_cover: string
  source_url: string
  published_on: string | null
}

export interface RunLead {
  match_id: string
  prospect_id: string
  lead_id: string | null
  customer_id: string | null
  business_name: string
  email: string
  website: string | null
  phone: string | null
  area: string
  address: string | null
  industry: string | null
  business_function: string | null
  category: string | null
  cover_type: string
  cover_fit: string
  evidence: {
    email_source_url: string
    location_source_url: string
    activity_source_url: string
    retrieved_at: string
    activity_quote?: string
    location_basis?: 'locality_match' | 'area_named'
    research?: { observed_activity?: string; location_quote?: string; assets?: string; current_insurance?: string; purchasing_intent?: string }
  }
  retrieved_at: string
  is_sample: boolean
  prospect_status: string
  open_path: string | null
}

export type StopReason = 'count_reached' | 'budget_exhausted' | 'cancelled' | 'no_more_candidates' | 'failed'

export interface RunProgress {
  found: number
  requested: number
  searches_used: number
  pages_fetched: number
  candidates_checked: number
  cost_usd: number
  elapsed_ms: number
  step: string
}

export interface LeadRun {
  id: string
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  cancel_requested: boolean
  category: DataCategory
  inputs: { prompt?: string; filters: LeadFilters; budget: LeadBudget }
  outputs: {
    phase: 'area' | 'discover' | 'done'
    area_findings: AreaFinding[]
    area_summary?: string | null
    localities: string[]
    rejected: Array<{ business_name: string; reason: string; url: string | null }>
    last_error?: string | null
    stop_reason: StopReason | null
    summary: string | null
    progress: RunProgress
    queued?: number
  }
  locked_by: string | null
  locked_at: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  open_path: string
  leads: RunLead[]
}

export interface RunSummary {
  id: string
  status: LeadRun['status']
  created_at: string
  completed_at: string | null
  filters: LeadFilters
  progress: RunProgress | null
  stop_reason: StopReason | null
  summary: string | null
  area_findings: AreaFinding[]
}

export const isFinished = (run: Pick<LeadRun, 'status'>) => ['completed', 'failed', 'cancelled'].includes(run.status)

/** A run nobody is working on: no lease, or one older than the server's 90-second lease. */
export const isIdle = (run: Pick<LeadRun, 'status' | 'locked_at'>) =>
  !isFinished(run) && (!run.locked_at || Date.now() - new Date(run.locked_at).getTime() > 95_000)

export const runTitle = (f: Partial<LeadFilters> | null | undefined) =>
  [f?.business_function ?? f?.category ?? f?.industry ?? 'Businesses', f?.area ? `near ${f.area}` : null].filter(Boolean).join(' ')

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new LeadResearchError(503, 'Supabase is not configured for this build.')
  const token = await supabaseAuth.accessToken()
  if (!token) throw new LeadResearchError(401, 'Sign in to the database first: choose a brokerage staff identity under “Demo as”.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/lead-research${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const issues = Array.isArray(body?.issues) ? ` (${body.issues.join('; ')})` : ''
    throw new LeadResearchError(res.status, `${body?.error ?? `Lead search request failed (${res.status})`}${issues}`)
  }
  return body as T
}

/** One id per browser tab, so the server's lease lets this tab keep working a run and stops a second tab doing the same. */
export function tabWorkerId() {
  const k = 'bcovered_leadgen_worker'
  let id = sessionStorage.getItem(k)
  if (!id) {
    id = `tab-${crypto.randomUUID()}`
    sessionStorage.setItem(k, id)
  }
  return id
}

export const leadResearchApi = {
  parse: (text: string) => call<{ filters: LeadFilters; source: 'model' | 'rules'; budget: LeadBudget; max_count: number }>('/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  create: (input: { category: DataCategory; prompt: string; filters: LeadFilters; idempotency_key: string }) =>
    call<{ run: LeadRun }>('/runs', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.run),
  step: (id: string, category: DataCategory) =>
    call<{ run: LeadRun; busy?: boolean }>(`/runs/${id}/step`, { method: 'POST', body: JSON.stringify({ category, worker: tabWorkerId() }) }),
  get: (id: string, category: DataCategory) => call<{ run: LeadRun }>(`/runs/${id}?category=${category}`).then((r) => r.run),
  cancel: (id: string, category: DataCategory) =>
    call<{ run: LeadRun }>(`/runs/${id}/cancel`, { method: 'POST', body: JSON.stringify({ category }) }).then((r) => r.run),
  list: (category: DataCategory) => call<{ runs: RunSummary[] }>(`/runs?category=${category}`).then((r) => r.runs ?? []),
}

export function useLeadRuns() {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['supabase', auth.userId, category, 'lead-runs'],
    queryFn: () => leadResearchApi.list(category),
    enabled: auth.status === 'signed_in',
    staleTime: 30_000,
    retry: false,
  })
}

export function useLeadRun(id: string | null | undefined) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return useQuery({
    queryKey: ['supabase', auth.userId, category, 'lead-run', id],
    queryFn: () => leadResearchApi.get(id!, category),
    enabled: auth.status === 'signed_in' && Boolean(id),
    refetchInterval: (q) => (q.state.data && !isFinished(q.state.data) ? 5000 : false),
    retry: false,
  })
}
