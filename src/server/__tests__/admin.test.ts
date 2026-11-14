import { beforeEach, describe, expect, it } from 'vitest'
import { decideApproval, listApprovals, principal, type Auth } from '../api'
import { handleCopilotCommand } from '../agents/copilotCommands'
import { startGroupMovements } from '../agents/controlsOrchestrator'
import { BX, karooJoiner, karooRoster, OCTOBER_SCENARIO } from '../db/benefitsSeed'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { octoberPayrollEntry } from '../demo/payrollFixtures'
import { compound, moneyWeightedReturn, timeWeightedReturn } from '../domain/investments/performance'
import { getPortfolio } from '../fundsApi'
import { configureRunner, kick } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import { getExecutive, getPortalCell } from '../specialistApi'
import { invokeTool, type Actor } from '../tools/registry'

const manager: Auth = { userId: SEED_IDS.users.manager }
const broker: Auth = { userId: SEED_IDS.users.broker }
const agent: Actor = { type: 'agent', id: 'test_agent', role: 'agent' }
const repo = () => new Repo(TENANT_ID)
const managerActor = () => principal(manager).actor

beforeEach(() => {
  db.reset()
  configureRunner({ stepDelayMs: 0 })
})

async function approveFor(jobId: string, type: string) {
  const pending = listApprovals(manager, { status: ['pending'] }).find((a) => a.approval.job_id === jobId && a.approval.approval_type === type)
  expect(pending, `pending ${type}`).toBeTruthy()
  decideApproval(manager, { approval_id: pending!.approval.id, decision: 'approved', payload_hash: pending!.approval.payload_hash })
  await kick(TENANT_ID, jobId)
}

describe('group risk movements', () => {
  it('commits the payroll, recalculates cover from the scheme rules and holds the insurer schedule for approval', async () => {
    const { job } = startGroupMovements(repo(), managerActor(), BX.customers.karoo)
    await kick(TENANT_ID, job.id)
    await approveFor(job.id, 'import_commit')
    expect(repo().require('jobs', job.id).status).toBe('awaiting_approval')
    await approveFor(job.id, 'movement_submission')
    expect(repo().require('jobs', job.id).status).toBe('completed')

    const memberships = repo().list('scheme_memberships', (m) => m.scheme_id === BX.schemes.karooLife)
    const joiner = karooJoiner()
    const joinerEmployment = repo().find('employments', (e) => e.employee_number === joiner.employee_number)!
    expect(memberships.find((m) => m.employment_id === joinerEmployment.id && m.status === 'active')!.cover_amount).toBe(joiner.monthly_salary * 12 * 3)
    const leaver = karooRoster()[OCTOBER_SCENARIO.leaver - 1]
    expect(memberships.find((m) => m.employment_id === leaver.employment_id)).toMatchObject({ status: 'exited', exited_on: '2026-09-30' })
    const raised = karooRoster()[OCTOBER_SCENARIO.salaryIncreases[0] - 1]
    const expected = Math.min(10_000_000, octoberPayrollEntry(raised).salary * 12 * (raised.category === 'management' ? 4 : 3))
    expect(memberships.find((m) => m.employment_id === raised.employment_id)!.cover_amount).toBe(expected)
    const promoted = karooRoster()[OCTOBER_SCENARIO.categoryChange - 1]
    expect(memberships.find((m) => m.employment_id === promoted.employment_id)!.cover_amount).toBe(promoted.monthly_salary * 12 * 4)
    expect(repo().list('member_movements').every((m) => m.status === 'approved' && m.cover_after !== null)).toBe(true)
  })
})

describe('retirement fund oversight', () => {
  it('keeps broker progress separate from the administrator’s decision, and flags Section 37C', () => {
    const e = invokeTool<{ id: string; section_37c: boolean; notes: string }>(
      'benefit.log_event',
      { arrangement: 'retirement_fund', person_id: karooRoster()[9].person_id, event_type: 'death', event_date: '2026-10-20', fund_id: BX.funds.kalahari, employer_customer_id: BX.customers.karoo },
      { repo: repo(), actor: agent },
    )
    expect(e.section_37c).toBe(true)
    expect(e.notes).toMatch(/Section 37C/)
    invokeTool('benefit.update_broker_status', { event_id: e.id, broker_status: 'submitted' }, { repo: repo(), actor: agent })
    expect(repo().require('benefit_events', e.id).provider_decision).toBe('pending')
    expect(() => invokeTool('benefit.record_provider_decision', { event_id: e.id, decision: 'paid', decision_date: '2026-11-01', provider_reference: 'X-1' }, { repo: repo(), actor: agent })).toThrow(ToolError)
    invokeTool('benefit.record_provider_decision', { event_id: e.id, decision: 'admitted', decision_date: '2026-11-01', provider_reference: 'KUP-DB-1' }, { repo: repo(), actor: managerActor() })
    expect(repo().require('benefit_events', e.id)).toMatchObject({ broker_status: 'submitted', provider_decision: 'admitted' })
  })

  it('finds the unexplained roll-forward difference to the cent', () => {
    const statement = repo().list('fund_balance_statements')[0]
    const r = invokeTool<{ difference: number; exceptions: number }>('fund.reconcile_balances', { statement_id: statement.id }, { repo: repo(), actor: agent })
    expect(r.difference).toBe(1240.55)
    expect(r.exceptions).toBe(1)
  })
})

describe('investment oversight', () => {
  it('reconciles administrator and manager holdings, including a missing price', () => {
    const r = invokeTool<{ run: { difference_count: number }; exceptions: number; missing_prices: number }>('investment.reconcile_holdings', { portfolio_id: BX.portfolio }, { repo: repo(), actor: agent })
    expect(r.run.difference_count).toBe(2)
    expect(r.missing_prices).toBe(1)
    const categories = repo()
      .list('financial_exceptions', (e) => e.portfolio_id === BX.portfolio)
      .map((e) => e.category)
      .sort()
    expect(categories).toEqual(['missing_price', 'unit_allocation', 'valuation_difference'])
  })

  it('calculates time- and money-weighted returns from dated valuations', () => {
    const d = getPortfolio(manager, { portfolio_id: BX.portfolio })
    const truth = compound([0.012, -0.004, 0.018, 0.009, -0.011, 0.015, 0.007, 0.003, 0.013, -0.006, 0.01, 0.008])
    expect(Math.abs(d.twr.cumulative - truth)).toBeLessThan(1e-6)
    expect(d.mwr.converged).toBe(true)
    const flat = timeWeightedReturn([
      { date: '2026-01-31', market_value: 100, net_cash_flow: 0 },
      { date: '2026-02-28', market_value: 160, net_cash_flow: 50 },
    ])
    expect(flat.cumulative).toBeCloseTo(160 / 150 - 1, 10)
    expect(moneyWeightedReturn([
      { date: '2026-01-31', market_value: 100, net_cash_flow: 0 },
      { date: '2026-02-28', market_value: 110, net_cash_flow: 0 },
    ]).periodic).toBeCloseTo(0.1, 6)
  })
})

describe('Section 14 transfers', () => {
  it('reconciles member values and will not confirm allocations until every member reconciles', () => {
    const r = invokeTool<{ reconciled: number; differences: number; missing: number; exceptions: number }>('transfer.reconcile', { transfer_id: BX.transfer }, { repo: repo(), actor: agent })
    expect(r).toMatchObject({ reconciled: 12, differences: 1, missing: 2, exceptions: 3 })
    expect(() => invokeTool('transfer.advance_stage', { transfer_id: BX.transfer }, { repo: repo(), actor: managerActor() })).toThrow(/not reconciled/)
    repo()
      .list('transfer_members', (m) => m.transfer_id === BX.transfer && m.status !== 'reconciled')
      .forEach((m) => invokeTool('transfer.record_allocation', { transfer_member_id: m.id, value_received: m.transfer_value_reported! }, { repo: repo(), actor: managerActor() }))
    invokeTool('transfer.reconcile', { transfer_id: BX.transfer }, { repo: repo(), actor: agent })
    invokeTool('transfer.advance_stage', { transfer_id: BX.transfer, note: 'All allocations confirmed' }, { repo: repo(), actor: managerActor() })
    const closed = invokeTool<{ status: string; stage: string }>('transfer.advance_stage', { transfer_id: BX.transfer, note: 'Closed' }, { repo: repo(), actor: managerActor() })
    expect(closed).toMatchObject({ status: 'closed', stage: 'close' })
  })
})

describe('specialist capabilities', () => {
  it('calculates cell results with deficit carry-forward and shows each cell only to its owner', () => {
    const report = invokeTool<{ results: Array<{ net_result: number; profit_share_accrued: number; profit_share_movement: number }>; totals: { net_result: number; profit_share_accrued: number } }>('cell.prepare_report', { cell_id: BX.cell }, { repo: repo(), actor: agent })
    expect(report.totals.profit_share_accrued).toBeCloseTo(Math.max(0, report.totals.net_result) * 0.8, 2)
    expect(report.results.some((r) => r.profit_share_movement < 0)).toBe(true)
    const owner: Auth = { userId: BX.users.cellOwner }
    expect(getPortalCell(owner)).toHaveLength(1)
    expect(principal(owner).repo.list('employments')).toHaveLength(0)
    expect(() => getPortalCell({ userId: BX.users.hrKaroo })).toThrow(ToolError)
  })

  it('builds labelled trustee packs that only a person can issue', () => {
    const pack = invokeTool<{ id: string; sections: Array<{ basis: string; title: string }> }>('governance.build_pack', { fund_id: BX.funds.kalahari, period_end: '2026-10-31' }, { repo: repo(), actor: agent })
    expect(pack.sections.length).toBe(9)
    expect(pack.sections.every((s) => ['reported', 'calculated', 'mixed'].includes(s.basis))).toBe(true)
    expect(() => invokeTool('governance.issue_pack', { pack_id: pack.id }, { repo: repo(), actor: agent })).toThrow(ToolError)
    invokeTool('governance.issue_pack', { pack_id: pack.id }, { repo: repo(), actor: managerActor() })
    expect(repo().list('audit_evidence', (e) => e.entity_id === pack.id && e.kind === 'report')).toHaveLength(1)
    expect(() => invokeTool('governance.record_item', { fund_id: BX.funds.kalahari, kind: 'decision', title: 'Approve new administrator' }, { repo: repo(), actor: managerActor() })).toThrow(/which body/)
  })

  it('separates findings supported by records from hypotheses in investigations', () => {
    const inv = invokeTool<{ id: string }>('investigation.open', { title: 'Holdings differences', scope: 'Unit register vs manager report, September 2026' }, { repo: repo(), actor: managerActor() })
    const r = invokeTool<{ run: { id: string } }>('investment.reconcile_holdings', { portfolio_id: BX.portfolio }, { repo: repo(), actor: agent })
    const snap = invokeTool<{ id: string }>('investigation.snapshot', { investigation_id: inv.id, dataset: 'reconciliation_run', ref_id: r.run.id }, { repo: repo(), actor: agent })
    expect(() => invokeTool('investigation.record_finding', { investigation_id: inv.id, title: 'Units differ', detail: 'Global Equity Feeder differs by 1 500 units', basis: 'record_supported', evidence_ids: [snap.id] }, { repo: repo(), actor: agent })).toThrow(/hypotheses/)
    expect(() => invokeTool('investigation.record_finding', { investigation_id: inv.id, title: 'Units differ', detail: 'x x x', basis: 'record_supported', evidence_ids: [] }, { repo: repo(), actor: managerActor() })).toThrow(/cite evidence/)
    invokeTool('investigation.record_finding', { investigation_id: inv.id, title: 'Units differ', detail: 'Global Equity Feeder differs by 1 500 units', basis: 'record_supported', evidence_ids: [snap.id] }, { repo: repo(), actor: managerActor() })
    invokeTool('investigation.record_finding', { investigation_id: inv.id, title: 'Possible unprocessed switch', detail: 'A switch may not have been processed by the administrator', basis: 'hypothesis' }, { repo: repo(), actor: agent })
    const report = invokeTool<{ text: string }>('investigation.report', { investigation_id: inv.id }, { repo: repo(), actor: agent })
    expect(report.text.indexOf('Findings supported by records')).toBeLessThan(report.text.indexOf('Units differ'))
    expect(report.text.indexOf('Hypotheses requiring investigation')).toBeLessThan(report.text.indexOf('Possible unprocessed switch'))
  })

  it('reports premiums, contributions, assets and broker revenue as separate measures, for managers only', () => {
    expect(() => getExecutive(broker)).toThrow(ToolError)
    const x = getExecutive(manager)
    expect(x.revenue.total).toBe(2 * 48 + 2 * 3_250 + 2 * 5_800)
    expect(x.premiums.individual_life_annual).toBe(640 * 12)
    expect(x.assets.member_values_reported).toBeGreaterThan(0)
    expect(x.assets.portfolio_value_reported).toBeGreaterThan(0)
  })
})

describe('Russ handles the addendum’s example requests', () => {
  const ask = (text: string) => handleCopilotCommand(repo(), managerActor(), text)
  it.each([
    ['Russ, reconcile the October payroll against the administrator contribution schedule and show me all differences.', 'reconciliation'],
    ['Russ, compare our fund’s investment performance with its benchmarks and identify unusual movements.', 'links'],
    ['Russ, process this month’s employee movements and calculate the changes to group life cover.', 'movements'],
    ['Russ, show the outstanding Section 14 transfer items and identify any unreconciled member balances.', 'links'],
    ['Russ, prepare the monthly cell captive performance report, including claims ratios and underwriting results.', 'links'],
    ['Russ, identify employers with outstanding contribution reconciliations and prioritise the exceptions.', 'links'],
  ])('%s', (text, kind) => {
    const turn = ask(text)
    expect(turn.view.kind).toBe(kind)
    expect(turn.reply.length).toBeGreaterThan(40)
  })
})
