import { beforeEach, describe, expect, it } from 'vitest'
import { decideApproval, listApprovals, principal, type Auth } from '../api'
import { loadOctoberFiles, startContributionRecon } from '../agents/controlsOrchestrator'
import { BX, DEMO_PERIOD, karooJoiner, karooRoster, OCTOBER_SCENARIO } from '../db/benefitsSeed'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { karooPayrollCsv, octoberPayrollEntry } from '../demo/payrollFixtures'
import { parseAmount } from '../domain/controls/money'
import { parseDelimited } from '../domain/controls/parse'
import { matchAll } from '../domain/controls/match'
import { reconcile } from '../domain/controls/reconcile'
import { getEmployer, getPortalEmployer, probeEmployerIsolation, uploadImport } from '../controlsApi'
import { ADAPTERS, liveAdaptersFor } from '../integrations/adapters'
import { configureRunner, kick } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import { invokeTool, type Actor } from '../tools/registry'

const manager: Auth = { userId: SEED_IDS.users.manager }
const hr: Auth = { userId: BX.users.hrKaroo }
const agent: Actor = { type: 'agent', id: 'test_agent', role: 'agent' }
const repo = () => new Repo(TENANT_ID)
const managerActor = () => principal(manager).actor

beforeEach(() => {
  db.reset()
  configureRunner({ stepDelayMs: 0 })
})

/** Expected and reported totals computed independently from the roster, in cents. */
function independentTotals() {
  const rate = { general: [7.5, 7.5], management: [10, 7.5] } as const
  const cents = (salary: number, pct: number) => Math.round(salary * pct)
  const payroll = [...karooRoster().filter((e) => e.n !== OCTOBER_SCENARIO.leaver), karooJoiner()]
  const left = payroll.reduce((s, e) => {
    const { salary, category } = e.n === 121 ? { salary: e.monthly_salary, category: e.category } : octoberPayrollEntry(e)
    return s + cents(salary, rate[category][0]) + cents(salary, rate[category][1])
  }, 0)
  const right = karooRoster().reduce((s, e) => s + cents(e.monthly_salary, rate[e.category][0]) + cents(e.monthly_salary, rate[e.category][1]), 0)
  return { left, right }
}

describe('controls building blocks', () => {
  it('parses quoted CSV and Excel copies, and South African amount formats', () => {
    const csv = parseDelimited('Name,Amount\n"Botha, Pieter","1,234.50"\nNkosi,99')
    expect(csv.rows).toEqual([
      { Name: 'Botha, Pieter', Amount: '1,234.50' },
      { Name: 'Nkosi', Amount: '99' },
    ])
    expect(parseDelimited('A\tB\n1\t2').delimiter).toBe('\t')
    expect(parseAmount('R 12 345,67')).toBe(12345.67)
    expect(parseAmount('12,345.67')).toBe(12345.67)
    expect(parseAmount('abc')).toBeNull()
  })

  it('matches and reconciles a 5 000-member file in linear time with exact totals', () => {
    const n = 5_000
    const candidates = Array.from({ length: n }, (_, i) => ({ person_id: `p${i}`, id_hash: `h${i}`, employee_number: `E${i}`, member_number: `M${i}`, surname: `S${i % 97}`, date_of_birth: `19${70 + (i % 30)}-01-01` }))
    const started = Date.now()
    const matches = matchAll(
      candidates.map((c, i) => ({ key: c.employee_number, id_hash: i % 10 === 0 ? null : c.id_hash, employee_number: c.employee_number, surname: c.surname })),
      candidates,
    )
    expect(matches.every((m) => m.status === 'matched')).toBe(true)
    const left = candidates.map((c, i) => ({ key: c.person_id, label: c.person_id, values: { er: 150_000 + i, ee: 150_000 } }))
    const right = candidates.map((c, i) => ({ key: c.person_id, label: c.person_id, values: { er: 150_000 + i - (i % 500 === 0 ? 1_000 : 0), ee: 150_000 } }))
    const r = reconcile(left, right, ['er', 'ee'], { er: 100, ee: 100 })
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(r.differences).toBe(10)
    expect(r.difference_total).toBe(10 * 1_000)
  })

  it('reconciles in integer cents with tolerances, one-sided items and duplicates', () => {
    const r = reconcile(
      [
        { key: 'a', label: 'A', values: { x: 1000 } },
        { key: 'b', label: 'B', values: { x: 2050 } },
        { key: 'c', label: 'C', values: { x: 500 } },
        { key: 'a', label: 'A again', values: { x: 1000 } },
      ],
      [
        { key: 'a', label: 'A', values: { x: 1000 } },
        { key: 'b', label: 'B', values: { x: 2000 } },
        { key: 'd', label: 'D', values: { x: 300 } },
      ],
      ['x'],
      { x: 10 },
    )
    expect(r).toMatchObject({ matched: 1, differences: 1, left_only: 1, right_only: 1, duplicates: 1, left_total: 3550, right_total: 3300, difference_total: 250 })
  })
})

describe('payroll vs administrator contribution reconciliation', () => {
  it('runs end to end: exact totals, one exception per problem, correction released only after approval', async () => {
    const { job, loadedDemo } = startContributionRecon(repo(), managerActor(), BX.customers.karoo, DEMO_PERIOD)
    expect(loadedDemo).toBe(true)
    await kick(TENANT_ID, job.id)
    expect(repo().require('jobs', job.id).status).toBe('awaiting_approval')

    const run = repo().find('reconciliation_runs', (r) => r.job_id === job.id)!
    const totals = independentTotals()
    expect(Math.round(run.left_total! * 100)).toBe(totals.left)
    expect(Math.round(run.right_total! * 100)).toBe(totals.right)
    expect(Math.round(run.difference_total! * 100)).toBe(totals.left - totals.right)
    expect(run).toMatchObject({ difference_count: 4, left_only_count: 1, right_only_count: 1 })

    const items = repo().list('reconciliation_items', (i) => i.run_id === run.id)
    expect(items.filter((i) => i.outcome === 'duplicate')).toHaveLength(1)
    const typo = repo().find('import_rows', (r) => r.batch_id === run.right_batch_id && (r.normalised as { member_number?: string })?.member_number === `KUP-${100000 + OCTOBER_SCENARIO.idTypoOnAdminSchedule}`)!
    expect(typo).toMatchObject({ match_status: 'matched', match_basis: 'Fund member number' })

    const exceptions = repo().list('financial_exceptions', (e) => e.run_id === run.id)
    expect(exceptions.map((e) => e.category).sort()).toEqual(['duplicate', 'incorrect_amount', 'incorrect_amount', 'incorrect_amount', 'incorrect_amount', 'missing_contribution', 'unmatched_member'])
    const again = invokeTool<{ created: number }>('exception.raise_from_run', { run_id: run.id }, { repo: repo(), actor: agent })
    expect(again.created).toBe(0)

    const schedule = repo().find('correction_schedules', (s) => s.run_id === run.id)!
    expect(schedule.status).toBe('awaiting_approval')
    expect(() => invokeTool('correction.release', { schedule_id: schedule.id }, { repo: repo(), actor: agent })).toThrow(/must approve/)
    const pending = listApprovals(manager, { status: ['pending'] }).find((a) => a.approval.subject_id === schedule.id)!
    expect(pending.detail?.lines[0]).toMatch(/6 correction lines/)
    decideApproval(manager, { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash })
    await kick(TENANT_ID, job.id)
    expect(repo().require('jobs', job.id).status).toBe('completed')
    expect(repo().require('correction_schedules', schedule.id).status).toBe('released')
    expect(repo().list('audit_evidence', (e) => e.entity_id === run.id || e.entity_id === schedule.id).map((e) => e.kind).sort()).toEqual(['calculation', 'report'])
  })

  it('recognises a re-imported file and lets a corrected file supersede the old one without double counting', () => {
    const first = loadOctoberFiles(repo(), managerActor())
    const batches = repo().list('import_batches').length
    const second = loadOctoberFiles(repo(), managerActor())
    expect(second.loaded).toBe(false)
    expect(second.payroll.id).toBe(first.payroll.id)
    expect(repo().list('import_batches').length).toBe(batches)

    const corrected = karooPayrollCsv().replace(/\n[^\n]*KL0063[^\n]*$/m, '')
    const r = uploadImport(manager, { data_source_id: BX.sources.karooPayroll, reporting_period: DEMO_PERIOD, file_name: 'karoo-payroll-2026-10-v2.csv', content: corrected })
    expect(r.duplicate).toBe(false)
    expect(r.batch.supersedes_batch_id).toBe(first.payroll.id)
    const approval = invokeTool<{ id: string; payload_hash: string }>('import.request_commit', { batch_id: r.batch.id }, { repo: repo(), actor: managerActor() })
    decideApproval(manager, { approval_id: approval.id, decision: 'approved', payload_hash: approval.payload_hash })
    expect(repo().require('import_batches', first.payroll.id).status).toBe('superseded')
    expect(repo().require('import_batches', r.batch.id).status).toBe('committed')
  })

  it('commits approved member changes once, with effective dates and movements', () => {
    const r = uploadImport(manager, { data_source_id: BX.sources.karooPayroll, reporting_period: DEMO_PERIOD, file_name: 'oct.csv', content: karooPayrollCsv() })
    expect(() => invokeTool('import.commit', { batch_id: r.batch.id }, { repo: repo(), actor: agent })).toThrow(ToolError)
    const approval = invokeTool<{ id: string; payload_hash: string; proposed_changes: { changes: Array<{ kind: string }> } }>('import.request_commit', { batch_id: r.batch.id }, { repo: repo(), actor: agent })
    const kinds = approval.proposed_changes.changes.map((c) => c.kind)
    expect(kinds.filter((k) => k === 'joiner')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'leaver')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'salary_change')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'category_change')).toHaveLength(1)
    decideApproval(manager, { approval_id: approval.id, decision: 'approved', payload_hash: approval.payload_hash })

    const leaver = karooRoster()[OCTOBER_SCENARIO.leaver - 1]
    expect(repo().require('employments', leaver.employment_id)).toMatchObject({ status: 'terminated', end_date: '2026-09-30' })
    const raised = karooRoster()[OCTOBER_SCENARIO.salaryIncreases[0] - 1]
    const salaries = repo().list('salary_history', (s) => s.employment_id === raised.employment_id).sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    expect(salaries.map((s) => [s.effective_from, s.effective_to])).toEqual([
      ['2026-03-01', '2026-09-30'],
      [DEMO_PERIOD, null],
    ])
    expect(repo().find('employments', (e) => e.employee_number === 'KL0121')).toBeTruthy()
    const movements = repo().list('member_movements').length
    expect(movements).toBe(6)
    invokeTool('import.commit', { batch_id: r.batch.id }, { repo: repo(), actor: agent })
    expect(repo().list('member_movements').length).toBe(movements)
  })

  it('keeps evidence append-only', () => {
    const e = invokeTool<{ id: string }>('evidence.capture', { entity_table: 'customers', entity_id: BX.customers.karoo, kind: 'finding', description: 'Test evidence', content: { a: 1 } }, { repo: repo(), actor: agent })
    expect(() => repo().update('audit_evidence', e.id, { description: 'changed' })).toThrow(/append-only/)
    expect(() => repo().remove('audit_evidence', e.id)).toThrow(/append-only/)
  })

  it('offers only tested file adapters and refuses provider adapters without a specification', () => {
    expect(liveAdaptersFor('employer_payroll', 'payroll_schedule').map((a) => a.key)).toEqual(['csv_upload', 'excel_paste'])
    expect(ADAPTERS.filter((a) => a.channel === 'api' || a.channel === 'sftp').every((a) => a.status !== 'live')).toBe(true)
    expect(() => invokeTool('integration.fetch', { adapter_key: 'administrator_sftp', data_source_id: BX.sources.kalahariContrib, reporting_period: DEMO_PERIOD }, { repo: repo(), actor: agent })).toThrow(/not available: it needs Administrator file specification/)
  })

  it('shows the employer HR portal only its own employees', () => {
    expect(getPortalEmployer(hr).members).toHaveLength(120)
    expect(probeEmployerIsolation(hr, { employer_customer_id: BX.customers.dental }).visible_employments).toBe(0)
    expect(probeEmployerIsolation(manager, { employer_customer_id: BX.customers.dental }).visible_employments).toBe(15)
    expect(() => getEmployer(hr, { customer_id: BX.customers.dental })).toThrow(ToolError)
  })
})
