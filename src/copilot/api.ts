// AR, Ava and Russ from the browser: turns, typeahead search and the jobs menu go to the copilot-agent Edge Function,
// which runs MCP jobs as the signed-in broker. Record screens read the same database functions directly.
import { useQuery } from '@tanstack/react-query'
import type { EntityRef, PolicyRef, TurnInput, TurnResult } from '../../supabase/functions/copilot-agent/planner'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { SUPABASE_KEY, SUPABASE_URL, supabase, supabaseAuth, useSupabaseAuth } from '@/lib/supabase/client'

export type { EntityRef, PolicyRef, StepResult, TurnContext, TurnResult, CopilotId, Receipt } from '../../supabase/functions/copilot-agent/planner'

export class CopilotError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function agent<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new CopilotError(503, 'Supabase is not configured for this build.')
  const token = await supabaseAuth.accessToken()
  if (!token) throw new CopilotError(401, 'Sign in to the database first: choose a brokerage staff identity under “Demo as”.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/copilot-agent${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new CopilotError(res.status, (body?.error?.message ?? body?.error ?? body?.message ?? `Copilot request failed (${res.status})`) as string)
  return body as T
}

export interface CopilotJob {
  name: string
  title?: string
  description?: string
  copilot?: 'shared' | 'ava' | 'russ'
  write?: boolean
}

export interface CopilotHealth {
  signed_in: boolean
  user: { name: string; role: string; brokerage: string; can_write: boolean } | null
  hook_claims: boolean
  mcp: { ok: boolean; tools: number; error?: string }
  sample: { available: boolean }
  live: { available: boolean; reason: string | null }
}

export const copilotApi = {
  turn: (input: TurnInput) =>
    agent<TurnResult & { conversation_id: string; message_id: string; tools_discovered: number }>('/turn', { method: 'POST', body: JSON.stringify({ origin: window.location.origin, ...input }) }),
  search: (q: string, category: DataCategory, kinds?: string[]) =>
    agent<{ results: EntityRef[] }>(`/search?q=${encodeURIComponent(q)}&category=${category}${kinds?.length ? `&kinds=${kinds.join(',')}` : ''}`).then((r) =>
      r.results.map((e) => ({ ...e, category })),
    ),
  jobs: (category: DataCategory) => agent<{ tools: CopilotJob[] }>(`/jobs?category=${category}`).then((r) => r.tools),
  health: () => agent<CopilotHealth>('/health'),
}

async function rpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory): Promise<T> {
  if (!supabase) throw new CopilotError(503, 'Supabase is not configured for this build.')
  const { data, error } = await supabase.rpc(fn, { p_category: category, ...args }).setHeader('x-data-category', category)
  if (error) throw new CopilotError(error.message === 'not_found' ? 404 : error.message === 'forbidden' ? 403 : 400, error.details || error.message)
  return data as T
}

export interface Interaction {
  id: string
  reference: string
  kind: string
  body: string
  created_at: string
  copilot: string | null
}

export interface PolicyDetail extends PolicyRef {
  premium_amount: number | null
  premium_frequency: string | null
  inception_date: string | null
  category: DataCategory
  parties: Array<{ person_id: string; client_number: string; name: string; role: string; share_pct: number | null }>
  interactions: Interaction[]
}

export interface HistoryItem {
  at: string
  record_type: 'interaction' | 'task' | 'policy' | 'quote_request'
  kind: string
  reference: string
  title: string
  line: string | null
  copilot: string | null
  policy_number?: string | null
  due_date?: string | null
  open_path: string
}

export interface ClientOverview {
  record_type: 'client'
  client: { id: string; number: string; name: string; date_of_birth: string | null; open_path: string; category: DataCategory }
  accounts: Array<{ id: string; number: string; name: string; type: string; role: string; open_path: string }>
  policies: PolicyRef[]
  schemes: Array<{ scheme_id: string; name: string; employer: string; status: string; cover_amount: number | null; open_path: string }>
  interactions: Interaction[]
  open_tasks: Array<{ id: string; reference: string; title: string; due_date: string | null }>
}

export interface AccountOverview {
  record_type: 'account'
  account: { id: string; number: string; name: string; type: string; status: string; previous_ref: string | null; open_path: string; category: DataCategory }
  people: Array<{ id: string; number: string; name: string; role: string; open_path: string }>
  business: { id: string; registered_name: string; trading_name: string | null; industry: string; employees: number | null; open_path: string } | null
  policies: PolicyRef[]
  schemes: Array<{ scheme_id: string; name: string; benefit: string; policy_number: string | null; status: string; members: number }>
  interactions: Interaction[]
  open_tasks: Array<{ id: string; reference: string; title: string; due_date: string | null }>
}

export const recordsApi = {
  policy: (id: string, category: DataCategory) => rpc<PolicyDetail>('copilot_get_policy', { p_policy_id: id }, category),
  client: (id: string, category: DataCategory) => rpc<ClientOverview>('copilot_record_overview', { p_record_type: 'client', p_id: id, p_scope: 'all' }, category),
  account: (id: string, category: DataCategory) => rpc<AccountOverview>('copilot_record_overview', { p_record_type: 'account', p_id: id, p_scope: 'all' }, category),
  history: (who: { person_id?: string; customer_id?: string }, category: DataCategory) =>
    rpc<HistoryItem[]>('copilot_list_history', { p_person_id: who.person_id ?? null, p_customer_id: who.customer_id ?? null, p_limit: 100 }, category),
}

/** Copilot and record queries are cached per signed-in broker and category, so switching either never shows stale records. */
function useRecordKey(...parts: unknown[]) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return { key: ['supabase', auth.userId, category, ...parts], category, ready: auth.status === 'signed_in' }
}

export function useCopilotHealth() {
  const { key, ready } = useRecordKey('health')
  return useQuery({ queryKey: key, queryFn: copilotApi.health, enabled: ready, staleTime: 60_000, retry: false })
}

export function useCopilotJobs() {
  const { key, category, ready } = useRecordKey('jobs')
  return useQuery({ queryKey: key, queryFn: () => copilotApi.jobs(category), enabled: ready, staleTime: 300_000, retry: false })
}

export function usePolicyDetail(id: string | undefined) {
  const { key, category, ready } = useRecordKey('policy', id)
  return useQuery({ queryKey: key, queryFn: () => recordsApi.policy(id!, category), enabled: ready && Boolean(id), retry: false })
}

export function useClientOverview(id: string | undefined) {
  const { key, category, ready } = useRecordKey('client', id)
  return useQuery({ queryKey: key, queryFn: () => recordsApi.client(id!, category), enabled: ready && Boolean(id), retry: false })
}

export function useAccountOverview(id: string | undefined) {
  const { key, category, ready } = useRecordKey('account', id)
  return useQuery({ queryKey: key, queryFn: () => recordsApi.account(id!, category), enabled: ready && Boolean(id), retry: false })
}

export function useRecordHistory(who: { person_id?: string; customer_id?: string } | null) {
  const { key, category, ready } = useRecordKey('history', who?.person_id, who?.customer_id)
  return useQuery({ queryKey: key, queryFn: () => recordsApi.history(who!, category), enabled: ready && Boolean(who?.person_id || who?.customer_id), retry: false })
}
