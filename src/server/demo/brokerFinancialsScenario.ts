import { brokerFinancialsApi } from '@/copilot/brokerFinancialsApi'
import type { DataCategory } from '@/lib/supabase/category'
import { DEMO_BROKERAGE } from '@/lib/supabase/demoBrokerage'

export const BROKER_FINANCIALS_SCENARIO_ID = 'broker-financials-highveld'
export const BROKER_FINANCIALS_COASTAL_ID = 'broker-financials-coastal'

export interface BfScenarioStep {
  id: string
  title: string
  description: string
  /** App route to open for this step */
  path: (ctx: Awaited<ReturnType<typeof brokerFinancialsApi.demoContext>>) => string
  run: (category: DataCategory, ctx: Awaited<ReturnType<typeof brokerFinancialsApi.demoContext>>) => Promise<{
    summary: string
    record?: string
    next?: string
    blocked?: boolean
  }>
}

export const HIGHVELD_STEPS: BfScenarioStep[] = [
  {
    id: 'review',
    title: '1. Review existing cover',
    description: 'Open Priya Naicker’s motor policy — eligible monthly premium R1,000 at 10% with 70/30 split.',
    path: (ctx) => `/broker/policies/${ctx.highveld_policy_id}?tab=rates`,
    run: async (category, ctx) => {
      const scales = await brokerFinancialsApi.listScales(category)
      const preview = await brokerFinancialsApi.previewCommission(category, {
        eligible_amount: 1000,
        insurer_id: 'a0000000-0000-4000-8000-000000000101',
        product_line: 'short_term_personal',
        section: 'vehicle',
        on: '2025-11-01',
      })
      return {
        summary: `Cover R1,000 · gross preview R${Number(preview.gross_amount)} · scales loaded: ${scales.length}`,
        record: ctx.highveld_policy_id ?? undefined,
        next: 'Replace vehicle with R1,400 premium',
      }
    },
  },
  {
    id: 'preview',
    title: '2. Preview replacement',
    description: 'Preview R1,400 premium: +R400, commission +R40, brokerage +R28, adviser +R12. Draft posts nothing.',
    path: (ctx) =>
      `/broker/policies/requests/new?policyId=${ctx.highveld_policy_id}&personId=${ctx.highveld_person_id}&itemId=${ctx.highveld_item_id}&type=vehicle_replacement&previewPremium=1400`,
    run: async (category) => {
      const before = await brokerFinancialsApi.previewCommission(category, {
        eligible_amount: 1000,
        insurer_id: 'a0000000-0000-4000-8000-000000000101',
        product_line: 'short_term_personal',
        section: 'vehicle',
      })
      const after = await brokerFinancialsApi.previewCommission(category, {
        eligible_amount: 1400,
        insurer_id: 'a0000000-0000-4000-8000-000000000101',
        product_line: 'short_term_personal',
        section: 'vehicle',
      })
      const delta = Number(after.gross_amount) - Number(before.gross_amount)
      return {
        summary: `Preview only: premium +R400, gross commission +R${delta.toFixed(0)}. No earning posted.`,
        next: 'Confirm endorsement and post November earning',
      }
    },
  },
  {
    id: 'earn',
    title: '3. Confirm and earn',
    description: 'Update premium R1,000→R1,400 and post November earning → R140 gross (R98 / R42).',
    path: () => '/broker/financials?tab=transactions',
    run: async (category, ctx) => {
      if (!ctx.highveld_policy_id) throw new Error('Highveld policy missing — switch to Highveld Demo Brokers')
      const posted = await brokerFinancialsApi.confirmReplacementAndEarn(category, {
        policy_id: ctx.highveld_policy_id,
        new_premium: 1400,
        period: '2025-11-01',
        section: 'vehicle',
        event_ref: 'bf:hv:earn:nov:1400',
        scenario_id: BROKER_FINANCIALS_SCENARIO_ID,
      })
      return {
        summary: String(posted.summary ?? `Posted R${posted.gross_amount}`),
        record: String(posted.earning_id ?? ''),
        next: 'Match the Protea November statement line',
      }
    },
  },
  {
    id: 'match',
    title: '4. Reconcile statement',
    description: 'Match sample insurer line R140 → variance R0. Cash still R0.',
    path: () => '/broker/financials?tab=statements',
    run: async (category) => {
      const batches = await brokerFinancialsApi.listStatements(category)
      const line = (batches as Array<{ lines: Array<{ id: string; source_ref?: string }> }>)
        .flatMap((b) => b.lines ?? [])
        .find((l) => (l as { source_ref?: string }).source_ref === 'bf:hv:stmt:nov:line')
        ?? (batches as Array<{ lines: Array<{ id: string }> }>)[0]?.lines?.[0]
      if (!line) throw new Error('Highveld statement line not found')
      const matched = await brokerFinancialsApi.matchStatementLine(category, { line_id: line.id })
      return {
        summary: String(matched.summary ?? matched.outcome),
        record: line.id,
        next: 'Record simulated insurer receipt R140',
        blocked: matched.outcome === 'exception',
      }
    },
  },
  {
    id: 'receipt',
    title: '5. Record receipt',
    description: 'Apply simulated insurer receipt R140 → adviser payable R42.',
    path: () => '/broker/financials?tab=transactions',
    run: async (category) => {
      const txns = await brokerFinancialsApi.listTransactions(category, { period: '2025-11-01' })
      const earning = txns.find((t) => t.event_ref?.includes('bf:hv:earn:nov')) ?? txns[0]
      if (!earning) throw new Error('November earning not found')
      const r = await brokerFinancialsApi.recordReceipt(category, {
        earning_id: earning.id,
        amount: 140,
        event_ref: 'bf:hv:receipt:140',
        scenario_id: BROKER_FINANCIALS_SCENARIO_ID,
      })
      return {
        summary: String(r.summary ?? 'Receipt recorded'),
        record: String(r.receipt_id ?? ''),
        next: 'Record adviser payout R42',
      }
    },
  },
  {
    id: 'payout',
    title: '6. Record payout',
    description: 'Pay adviser allocation R42 → payable R0, brokerage retained R98.',
    path: () => '/broker/financials?tab=payouts',
    run: async (category) => {
      const txns = await brokerFinancialsApi.listTransactions(category, { period: '2025-11-01' })
      const earning = txns.find((t) => t.event_ref?.includes('bf:hv:earn:nov')) ?? txns[0]
      if (!earning) throw new Error('November earning not found')
      const detail = await brokerFinancialsApi.getEarning(category, earning.id)
      const alloc = ((detail.allocations as Array<Record<string, unknown>>) ?? []).find(
        (a) => a.recipient_role === 'adviser' && Number(a.payable_amount) > 0,
      )
      if (!alloc) {
        return { summary: 'Adviser allocation already paid or missing', next: 'Done — open executive dashboard' }
      }
      const p = await brokerFinancialsApi.recordPayout(category, {
        allocation_id: String(alloc.id),
        amount: Number(alloc.payable_amount),
        event_ref: `bf:hv:payout:${alloc.id}`,
        scenario_id: BROKER_FINANCIALS_SCENARIO_ID,
      })
      return {
        summary: String(p.summary ?? 'Payout recorded'),
        record: String(p.payout_id ?? ''),
        next: 'Drill executive dashboard back to this earning',
      }
    },
  },
]

export const BROKER_FINANCIALS_SCENARIO = {
  id: BROKER_FINANCIALS_SCENARIO_ID,
  title: 'Broker financials — Highveld walkthrough',
  summary:
    'Replace a vehicle, post November commission, match the insurer statement, record a simulated receipt and pay the adviser. Default demo brokerage: Highveld Demo Brokers.',
  brokerage: DEMO_BROKERAGE.highveld,
  steps: HIGHVELD_STEPS,
}

export const COASTAL_SCENARIO = {
  id: BROKER_FINANCIALS_COASTAL_ID,
  title: 'Broker financials — Coastal shortfall',
  summary:
    'Commercial motor 10% + property 8% with 25% franchise on property. Investigate the R10 statement shortfall (R230 vs R240).',
  brokerage: DEMO_BROKERAGE.coastal,
}
