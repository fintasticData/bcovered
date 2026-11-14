// Retirement funds, investments, transfers and group movements. Reached only through src/api/client.ts.
import { startGroupMovements } from './agents/controlsOrchestrator'
import { STAFF_ROLES, principal, requireRole, type Auth } from './api'
import type {
  AdministratorValuation,
  BenefitEvent,
  FundBalanceStatement,
  FundTransfer,
  InvestmentBenchmark,
  InvestmentHolding,
  InvestmentPortfolio,
  InvestmentValuation,
  RetirementFund,
  TransferMember,
} from './db/benefitsSchema'
import { OPEN_EXCEPTION, type FinancialException, type ReconciliationRun } from './db/controlsSchema'
import type { GovernanceItem, TrusteePack } from './db/specialistSchema'
import { NotFoundError, type Repo } from './db/store'
import { savingsWithdrawalIndicator, twoPotRulesOn, type TwoPotRules } from './domain/funds/twoPot'
import { compound, mandateCheck, moneyWeightedReturn, timeWeightedReturn, unusualMovements, type AllocationCheck, type MwrResult, type TwrResult } from './domain/investments/performance'
import { invokeTool } from './tools/registry'

const r2 = (n: number) => Math.round(n * 100) / 100
const name = (repo: Repo, id: string | null) => {
  const p = id ? repo.get('persons', id) : undefined
  return p ? `${p.first_names} ${p.surname}` : 'Unknown'
}
const latestRun = (repo: Repo, key: string, match: (r: ReconciliationRun) => boolean) => {
  const def = repo.find('reconciliation_definitions', (d) => d.key === key)
  return def ? (repo.list('reconciliation_runs', (r) => r.definition_id === def.id && r.status === 'completed' && match(r)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null) : null
}

// ---------------------------------------------------------------- funds

export interface FundRow {
  fund: RetirementFund
  administrator: string
  employers: number
  members: number
  reported_value: number
  valuation_date: string | null
  open_events: number
}

function latestValuations(repo: Repo, fundId: string): AdministratorValuation[] {
  const all = repo.list('administrator_valuations', (v) => v.fund_id === fundId)
  const latest = new Map<string, AdministratorValuation>()
  all.forEach((v) => {
    const prev = latest.get(v.fund_membership_id)
    if (!prev || prev.valuation_date < v.valuation_date) latest.set(v.fund_membership_id, v)
  })
  return [...latest.values()]
}

export function listFunds(auth: Auth): FundRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo.list('retirement_funds').map((fund) => {
    const vals = latestValuations(p.repo, fund.id)
    return {
      fund,
      administrator: p.repo.get('insurers', fund.administrator_id)?.name ?? 'Unknown',
      employers: p.repo.list('fund_participations', (x) => x.fund_id === fund.id && x.status === 'active').length,
      members: p.repo.list('fund_memberships', (m) => m.fund_id === fund.id && m.status === 'active').length,
      reported_value: r2(vals.reduce((s, v) => s + v.total_value, 0)),
      valuation_date: vals.map((v) => v.valuation_date).sort().at(-1) ?? null,
      open_events: p.repo.list('benefit_events', (e) => e.fund_id === fund.id && e.broker_status !== 'closed').length,
    }
  })
}

export interface FundDetail extends FundRow {
  two_pot: { vested: number; savings: number; retirement: number; rules: TwoPotRules | null; may_qualify: number }
  members_view: Array<{ membership_id: string; person_id: string; name: string; member_number: string; employer: string; status: string; vested: number | null; savings: number | null; retirement: number | null; total: number | null; valuation_date: string | null; indicator: string | null }>
  events: Array<BenefitEvent & { person: string }>
  statements: Array<FundBalanceStatement & { run: ReconciliationRun | null }>
  participations: Array<{ id: string; employer_id: string; employer: string; participation_number: string | null; members: number }>
  portfolios: InvestmentPortfolio[]
  transfers: FundTransfer[]
  exceptions: FinancialException[]
  governance: GovernanceItem[]
  packs: TrusteePack[]
}

export function getFund(auth: Auth, body: { fund_id: string }): FundDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const repo = p.repo
  const row = listFunds(auth).find((f) => f.fund.id === body.fund_id)
  if (!row) throw new NotFoundError('retirement_funds', body.fund_id)
  const vals = latestValuations(repo, body.fund_id)
  const date = row.valuation_date ?? new Date().toISOString().slice(0, 10)
  const memberships = repo.list('fund_memberships', (m) => m.fund_id === body.fund_id)
  return {
    ...row,
    two_pot: {
      vested: r2(vals.reduce((s, v) => s + v.vested_component, 0)),
      savings: r2(vals.reduce((s, v) => s + v.savings_component, 0)),
      retirement: r2(vals.reduce((s, v) => s + v.retirement_component, 0)),
      rules: twoPotRulesOn(date),
      may_qualify: vals.filter((v) => savingsWithdrawalIndicator(v.savings_component, date).indicator === 'may_qualify').length,
    },
    members_view: memberships
      .map((m) => {
        const v = vals.find((x) => x.fund_membership_id === m.id)
        return {
          membership_id: m.id,
          person_id: m.person_id,
          name: name(repo, m.person_id),
          member_number: m.member_number,
          employer: repo.get('customers', m.employer_customer_id)?.full_name ?? 'Unknown',
          status: m.status,
          vested: v?.vested_component ?? null,
          savings: v?.savings_component ?? null,
          retirement: v?.retirement_component ?? null,
          total: v?.total_value ?? null,
          valuation_date: v?.valuation_date ?? null,
          indicator: v ? savingsWithdrawalIndicator(v.savings_component, v.valuation_date).indicator : null,
        }
      })
      .sort((a, b) => a.member_number.localeCompare(b.member_number)),
    events: repo.list('benefit_events', (e) => e.fund_id === body.fund_id).map((e) => ({ ...e, person: name(repo, e.person_id) })),
    statements: repo
      .list('fund_balance_statements', (s) => s.fund_id === body.fund_id)
      .map((s) => ({ ...s, run: latestRun(repo, 'fund_balance_rollforward', (r) => r.scope_ref.fund_id === s.fund_id && r.reporting_period === s.period_end.slice(0, 8) + '01') })),
    participations: repo.list('fund_participations', (x) => x.fund_id === body.fund_id).map((x) => ({ id: x.id, employer_id: x.employer_customer_id, employer: repo.get('customers', x.employer_customer_id)?.full_name ?? 'Unknown', participation_number: x.participation_number, members: memberships.filter((m) => m.participation_id === x.id && m.status === 'active').length })),
    portfolios: repo.list('investment_portfolios', (x) => x.fund_id === body.fund_id),
    transfers: repo.list('fund_transfers', (t) => t.transferor_fund_id === body.fund_id || t.transferee_fund_id === body.fund_id),
    exceptions: repo.list('financial_exceptions', (e) => e.fund_id === body.fund_id && OPEN_EXCEPTION.includes(e.status)),
    governance: repo.list('governance_items', (g) => g.fund_id === body.fund_id).sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '')),
    packs: repo.list('trustee_packs', (t) => t.fund_id === body.fund_id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}

export function reconcileFundBalance(auth: Auth, body: { statement_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<{ run: ReconciliationRun; calculated_closing: number; difference: number }>('fund.reconcile_balances', body, { repo: p.repo, actor: p.actor })
}

export function updateBenefitStatus(auth: Auth, body: { event_id: string; broker_status: BenefitEvent['broker_status'] }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<BenefitEvent>('benefit.update_broker_status', body, { repo: p.repo, actor: p.actor })
}

export function recordProviderDecision(auth: Auth, body: { event_id: string; decision: 'admitted' | 'declined' | 'paid'; decision_date: string; provider_reference: string; amount_paid?: number | null }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<BenefitEvent>('benefit.record_provider_decision', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- investments

export interface PortfolioRow {
  portfolio: InvestmentPortfolio
  fund: string
  manager: string
  market_value: number | null
  valuation_date: string | null
  open_exceptions: number
}

export function listPortfolios(auth: Auth): PortfolioRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo.list('investment_portfolios').map((portfolio) => {
    const v = p.repo.list('investment_valuations', (x) => x.portfolio_id === portfolio.id).sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))[0]
    return {
      portfolio,
      fund: p.repo.get('retirement_funds', portfolio.fund_id)?.name ?? 'Unknown',
      manager: p.repo.get('insurers', portfolio.manager_id)?.name ?? 'Unknown',
      market_value: v?.market_value ?? null,
      valuation_date: v?.valuation_date ?? null,
      open_exceptions: p.repo.list('financial_exceptions', (e) => e.portfolio_id === portfolio.id && OPEN_EXCEPTION.includes(e.status)).length,
    }
  })
}

export interface PortfolioDetail extends PortfolioRow {
  holdings: Array<{ instrument: string; asset_class: string; administrator: InvestmentHolding | null; manager: InvestmentHolding | null }>
  valuations: InvestmentValuation[]
  benchmarks: InvestmentBenchmark[]
  twr: TwrResult
  mwr: MwrResult
  benchmark_cumulative: number
  allocation: AllocationCheck[]
  unusual: ReturnType<typeof unusualMovements>
  last_run: ReconciliationRun | null
  exceptions: FinancialException[]
}

export function getPortfolio(auth: Auth, body: { portfolio_id: string }): PortfolioDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const repo = p.repo
  const row = listPortfolios(auth).find((x) => x.portfolio.id === body.portfolio_id)
  if (!row) throw new NotFoundError('investment_portfolios', body.portfolio_id)
  const holdings = repo.list('investment_holdings', (h) => h.portfolio_id === body.portfolio_id)
  const date = holdings.map((h) => h.valuation_date).sort().at(-1)
  const current = holdings.filter((h) => h.valuation_date === date)
  const instruments = [...new Set(current.map((h) => h.instrument))]
  const valuations = repo.list('investment_valuations', (v) => v.portfolio_id === body.portfolio_id).sort((a, b) => a.valuation_date.localeCompare(b.valuation_date))
  const benchmarks = repo.list('investment_benchmarks', (b) => b.portfolio_id === body.portfolio_id).sort((a, b) => a.period_end.localeCompare(b.period_end))
  const points = valuations.map((v) => ({ date: v.valuation_date, market_value: v.market_value, net_cash_flow: v.net_cash_flow }))
  const twr = timeWeightedReturn(points)
  return {
    ...row,
    holdings: instruments.map((instrument) => {
      const a = current.find((h) => h.instrument === instrument && h.source_kind === 'administrator') ?? null
      const m = current.find((h) => h.instrument === instrument && h.source_kind === 'investment_manager') ?? null
      return { instrument, asset_class: (m ?? a)!.asset_class, administrator: a, manager: m }
    }),
    valuations,
    benchmarks,
    twr,
    mwr: moneyWeightedReturn(points),
    benchmark_cumulative: compound(benchmarks.map((b) => b.benchmark_return)),
    allocation: mandateCheck(current.filter((h) => h.source_kind === 'investment_manager'), row.portfolio.mandate.asset_ranges),
    unusual: unusualMovements(twr.periods, benchmarks),
    last_run: latestRun(repo, 'admin_vs_manager_holdings', (r) => r.scope_ref.portfolio_id === body.portfolio_id),
    exceptions: repo.list('financial_exceptions', (e) => e.portfolio_id === body.portfolio_id && OPEN_EXCEPTION.includes(e.status)),
  }
}

export function reconcileHoldings(auth: Auth, body: { portfolio_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<{ run: ReconciliationRun; exceptions: number }>('investment.reconcile_holdings', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- transfers

export interface TransferRow {
  transfer: FundTransfer
  from: string
  to: string
  employer: string | null
  members: number
  reconciled: number
  value_reported: number
}

export function listTransfers(auth: Auth): TransferRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo.list('fund_transfers').map((transfer) => {
    const members = p.repo.list('transfer_members', (m) => m.transfer_id === transfer.id)
    return {
      transfer,
      from: p.repo.get('retirement_funds', transfer.transferor_fund_id)?.name ?? 'Unknown',
      to: p.repo.get('retirement_funds', transfer.transferee_fund_id)?.name ?? 'Unknown',
      employer: transfer.employer_customer_id ? (p.repo.get('customers', transfer.employer_customer_id)?.full_name ?? null) : null,
      members: members.length,
      reconciled: members.filter((m) => m.status === 'reconciled').length,
      value_reported: r2(members.reduce((s, m) => s + (m.transfer_value_reported ?? 0), 0)),
    }
  })
}

export interface TransferDetail extends TransferRow {
  member_rows: Array<TransferMember & { name: string }>
  last_run: ReconciliationRun | null
  exceptions: FinancialException[]
}

export function getTransfer(auth: Auth, body: { transfer_id: string }): TransferDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const row = listTransfers(auth).find((t) => t.transfer.id === body.transfer_id)
  if (!row) throw new NotFoundError('fund_transfers', body.transfer_id)
  return {
    ...row,
    member_rows: p.repo.list('transfer_members', (m) => m.transfer_id === body.transfer_id).map((m) => ({ ...m, name: name(p.repo, m.person_id) })),
    last_run: latestRun(p.repo, 'transfer_values', (r) => r.scope_ref.transfer_id === body.transfer_id),
    exceptions: p.repo.list('financial_exceptions', (e) => e.dedupe_key?.startsWith(`transfer:`) === true && OPEN_EXCEPTION.includes(e.status) && p.repo.list('reconciliation_runs', (r) => r.id === e.run_id && r.scope_ref.transfer_id === body.transfer_id).length > 0),
  }
}

export function reconcileTransfer(auth: Auth, body: { transfer_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool('transfer.reconcile', body, { repo: p.repo, actor: p.actor })
}

export function recordAllocation(auth: Auth, body: { transfer_member_id: string; value_received: number }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<TransferMember>('transfer.record_allocation', body, { repo: p.repo, actor: p.actor })
}

export function advanceTransfer(auth: Auth, body: { transfer_id: string; note?: string | null; evidence_ref?: string | null }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<FundTransfer>('transfer.advance_stage', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- movements

export function startMovements(auth: Auth, body: { employer_customer_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const { job, reused, loadedDemo } = startGroupMovements(p.repo, p.actor, body.employer_customer_id)
  return { job_id: job.id, reused, loaded_demo: loadedDemo }
}
