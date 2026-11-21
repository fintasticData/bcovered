import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { CopilotError } from './api'
import { salesRpc } from './salesApi'

export const bfKey = () => `bf:${crypto.randomUUID()}`

export interface BfTxnRow {
  id: string
  period: string
  txn_type: string
  amount: number
  statement_matched: boolean
  cash_received_amount: number
  policy_id: string | null
  customer_id: string | null
  person_id: string | null
  section_code: string | null
  event_ref: string
  hold_reason: string | null
  scenario_id: string | null
  created_at: string
  customer_name: string | null
  policy_number: string | null
  adviser_payable: number
  status: string
  payer_name?: string | null
  payee_names?: string | null
  calc_method?: string | null
  rate?: number | null
}

export interface BfDemoContext {
  organisation_id: string
  organisation_name: string
  is_demo_brokerage: boolean
  slug: string
  data_category: string
  highveld_policy_id: string | null
  highveld_person_id: string | null
  highveld_customer_id: string | null
  highveld_item_id: string | null
  coastal_policy_id: string | null
  scenario_state: { scenario_id: string; step_index: number; status: string; last_summary: string | null; blocked_reason: string | null } | null
}

async function rpc<T>(fn: string, args: Record<string, unknown>, category: DataCategory): Promise<T> {
  try {
    return await salesRpc<T>(fn, args, category)
  } catch (e) {
    if (e instanceof CopilotError) throw e
    throw new CopilotError(400, e instanceof Error ? e.message : 'Broker financials request failed')
  }
}

export const brokerFinancialsApi = {
  listTransactions: (c: DataCategory, a: {
    period?: string | null; policy_id?: string | null; customer_id?: string | null; person_id?: string | null
  } = {}) =>
    rpc<BfTxnRow[]>('bf_list_transactions', {
      p_period: a.period ?? null,
      p_policy_id: a.policy_id ?? null,
      p_customer_id: a.customer_id ?? null,
      p_person_id: a.person_id ?? null,
    }, c),
  getEarning: (c: DataCategory, earningId: string) => rpc<Record<string, unknown>>('bf_get_earning', { p_earning_id: earningId }, c),
  listStatements: (c: DataCategory) => rpc<Array<Record<string, unknown>>>('bf_list_statements', {}, c),
  listPayouts: (c: DataCategory) => rpc<Array<Record<string, unknown>>>('bf_list_payouts', {}, c),
  listScales: (c: DataCategory) => rpc<Array<Record<string, unknown>>>('bf_list_scales', {}, c),
  previewCommission: (c: DataCategory, a: {
    eligible_amount: number; insurer_id: string; product_line: string; section: string; on?: string
  }) =>
    rpc<Record<string, unknown>>('bf_preview_commission', {
      p_eligible_amount: a.eligible_amount,
      p_insurer_id: a.insurer_id,
      p_product_line: a.product_line,
      p_section: a.section,
      p_on: a.on ?? '2025-11-01',
    }, c),
  postEarning: (c: DataCategory, a: {
    policy_id: string; eligible_amount: number; period: string; section?: string | null
    earning_type?: string; event_ref?: string; scenario_id?: string
  }) =>
    rpc<Record<string, unknown>>('bf_post_earning', {
      p_policy_id: a.policy_id,
      p_eligible_amount: a.eligible_amount,
      p_period: a.period,
      p_section: a.section ?? null,
      p_earning_type: a.earning_type ?? 'ongoing',
      p_event_ref: a.event_ref ?? null,
      p_scenario_id: a.scenario_id ?? null,
    }, c),
  confirmReplacementAndEarn: (c: DataCategory, a: {
    policy_id: string; new_premium: number; period?: string; section?: string
    event_ref?: string; scenario_id?: string
  }) =>
    rpc<Record<string, unknown>>('bf_confirm_replacement_and_earn', {
      p_policy_id: a.policy_id,
      p_new_premium: a.new_premium,
      p_period: a.period ?? '2025-11-01',
      p_section: a.section ?? 'vehicle',
      p_event_ref: a.event_ref ?? null,
      p_scenario_id: a.scenario_id ?? null,
    }, c),
  matchStatementLine: (c: DataCategory, a: { line_id: string; earning_id?: string | null }) =>
    rpc<Record<string, unknown>>('bf_match_statement_line', {
      p_line_id: a.line_id,
      p_earning_id: a.earning_id ?? null,
    }, c),
  resolveStatementException: (c: DataCategory, a: {
    line_id: string; resolution?: 'accept_shortfall' | 'write_off' | 'reopen'; note?: string | null
  }) =>
    rpc<Record<string, unknown>>('bf_resolve_statement_exception', {
      p_line_id: a.line_id,
      p_resolution: a.resolution ?? 'accept_shortfall',
      p_note: a.note ?? null,
    }, c),
  recordReceipt: (c: DataCategory, a: {
    earning_id: string; amount: number; received_on?: string; reference?: string
    event_ref?: string; scenario_id?: string
  }) =>
    rpc<Record<string, unknown>>('bf_record_receipt', {
      p_earning_id: a.earning_id,
      p_amount: a.amount,
      p_received_on: a.received_on ?? '2025-11-15',
      p_reference: a.reference ?? null,
      p_event_ref: a.event_ref ?? null,
      p_scenario_id: a.scenario_id ?? null,
    }, c),
  recordPayout: (c: DataCategory, a: {
    allocation_id: string; amount: number; paid_on?: string; reference?: string
    event_ref?: string; scenario_id?: string
  }) =>
    rpc<Record<string, unknown>>('bf_record_payout', {
      p_allocation_id: a.allocation_id,
      p_amount: a.amount,
      p_paid_on: a.paid_on ?? '2025-11-20',
      p_reference: a.reference ?? null,
      p_event_ref: a.event_ref ?? null,
      p_scenario_id: a.scenario_id ?? null,
    }, c),
  previewScaleAmount: (c: DataCategory, a: { scale_version_id: string; sample_amount: number }) =>
    rpc<Record<string, unknown>>('bf_preview_scale_amount', {
      p_scale_version_id: a.scale_version_id,
      p_sample_amount: a.sample_amount,
    }, c),
  upsertScaleVersion: (c: DataCategory, payload: Record<string, unknown>) =>
    rpc<Record<string, unknown>>('bf_upsert_scale_version', { p_payload: payload }, c),
  setScenarioStep: (c: DataCategory, a: {
    scenario_id: string; step_index: number; status?: string; summary?: string | null; blocked_reason?: string | null
  }) =>
    rpc<Record<string, unknown>>('bf_set_scenario_step', {
      p_scenario_id: a.scenario_id,
      p_step_index: a.step_index,
      p_status: a.status ?? 'running',
      p_summary: a.summary ?? null,
      p_blocked_reason: a.blocked_reason ?? null,
    }, c),
  executiveShortTerm: (c: DataCategory) => rpc<Record<string, unknown>>('bf_executive_short_term', {}, c),
  resetScenario: (c: DataCategory, scenarioId: string) =>
    rpc<Record<string, unknown>>('bf_reset_scenario', { p_scenario_id: scenarioId }, c),
  demoContext: (c: DataCategory) => rpc<BfDemoContext>('bf_demo_context', {}, c),
}

function useBfKey(...parts: unknown[]) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  return { key: ['supabase', auth.userId, category, 'broker-financials', ...parts], category, ready: auth.status === 'signed_in' }
}

export function useBfTransactions(a: {
  period?: string | null; policy_id?: string | null; customer_id?: string | null; person_id?: string | null
} = {}) {
  const { key, category, ready } = useBfKey('txns', a.period ?? '', a.policy_id ?? '', a.customer_id ?? '', a.person_id ?? '')
  return useQuery({ queryKey: key, queryFn: () => brokerFinancialsApi.listTransactions(category, a), enabled: ready, retry: false })
}

export function useBfStatements() {
  const { key, category, ready } = useBfKey('statements')
  return useQuery({ queryKey: key, queryFn: () => brokerFinancialsApi.listStatements(category), enabled: ready, retry: false })
}

export function useBfPayouts() {
  const { key, category, ready } = useBfKey('payouts')
  return useQuery({ queryKey: key, queryFn: () => brokerFinancialsApi.listPayouts(category), enabled: ready, retry: false })
}

export function useBfScales() {
  const { key, category, ready } = useBfKey('scales')
  return useQuery({ queryKey: key, queryFn: () => brokerFinancialsApi.listScales(category), enabled: ready, retry: false })
}

export function useBfEarning(earningId: string | null | undefined) {
  const { key, category, ready } = useBfKey('earning', earningId)
  return useQuery({
    queryKey: key,
    queryFn: () => brokerFinancialsApi.getEarning(category, earningId!),
    enabled: ready && Boolean(earningId),
    retry: false,
  })
}

export function useBfDemoContext() {
  const { key, category, ready } = useBfKey('demo-context')
  return useQuery({ queryKey: key, queryFn: () => brokerFinancialsApi.demoContext(category), enabled: ready, retry: false })
}

export function useBfExecutive() {
  const { key, category, ready } = useBfKey('executive')
  return useQuery({ queryKey: key, queryFn: () => brokerFinancialsApi.executiveShortTerm(category), enabled: ready, retry: false })
}

export function useBfMutation<A, R>(fn: (category: DataCategory, args: A) => Promise<R>) {
  const category = useDataCategory()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: A) => fn(category, args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supabase'] })
    },
  })
}
