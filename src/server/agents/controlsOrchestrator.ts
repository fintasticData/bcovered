import type { CorrectionSchedule, FinancialException, ImportBatch, ReconciliationRun } from '../db/controlsSchema'
import { BX, DEMO_PERIOD } from '../db/benefitsSeed'
import type { Job, Json } from '../db/schema'
import type { Repo } from '../db/store'
import { kalahariScheduleCsv, karooPayrollCsv } from '../demo/payrollFixtures'
import { createJob, registerWorkflow, type StepContext } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import { randExact } from '../lib/money'
import { invokeTool, type Actor } from '../tools/registry'
import { TERMINAL_STATUSES } from './commercialOrchestrator'

export const CONTRIBUTION_RECON = 'payroll_contribution_reconciliation'

export interface ContributionReconInputs {
  employer_customer_id: string
  reporting_period: string
  payroll_batch_id: string
  admin_batch_id: string
}

const inputsOf = (ctx: StepContext) => ctx.job.inputs as unknown as ContributionReconInputs
const out = (ctx: StepContext, key: string) => (ctx.repo.require('jobs', ctx.job.id).outputs ?? {})[key] as Record<string, Json> | undefined
const rands = randExact

registerWorkflow({
  type: CONTRIBUTION_RECON,
  title: 'Contribution reconciliation: payroll vs administrator schedule',
  restartOnChangesFrom: 'correction',
  steps: [
    {
      key: 'validate',
      name: 'Validate both files against their source mappings',
      agent: 'group_membership',
      run: (ctx) => {
        const i = inputsOf(ctx)
        const payroll = ctx.call<ImportBatch>('import.validate', { batch_id: i.payroll_batch_id })
        const admin = ctx.call<ImportBatch>('import.validate', { batch_id: i.admin_batch_id })
        return { kind: 'done', output: { summary: `Payroll ${payroll.valid_count}/${payroll.row_count} valid rows; administrator ${admin.valid_count}/${admin.row_count} valid rows` } }
      },
    },
    {
      key: 'match',
      name: 'Match rows to members and detect duplicates',
      agent: 'group_membership',
      run: (ctx) => {
        const i = inputsOf(ctx)
        ctx.call('import.match', { batch_id: i.payroll_batch_id })
        ctx.call('import.match', { batch_id: i.admin_batch_id })
        const rows = ctx.repo.list('import_rows', (r) => r.batch_id === i.payroll_batch_id || r.batch_id === i.admin_batch_id)
        const count = (s: string) => rows.filter((r) => r.match_status === s).length
        return { kind: 'done', output: { summary: `${count('matched')} matched, ${count('probable')} probable, ${count('new')} new, ${count('duplicate')} duplicate, ${count('excluded')} excluded` } }
      },
    },
    {
      key: 'reconcile',
      name: 'Calculate expected contributions and reconcile with the administrator schedule',
      agent: 'contribution_reconciler',
      run: (ctx) => {
        const run = ctx.call<ReconciliationRun>('recon.run_contributions', inputsOf(ctx))
        return {
          kind: 'done',
          output: {
            run_id: run.id,
            summary: `Expected ${rands(run.left_total ?? 0)} vs reported ${rands(run.right_total ?? 0)}: difference ${rands(run.difference_total ?? 0)}; ${run.difference_count} differences, ${run.left_only_count} missing from the schedule, ${run.right_only_count} not on the payroll`,
          },
        }
      },
    },
    {
      key: 'exceptions',
      name: 'Raise one exception per member and problem',
      agent: 'contribution_reconciler',
      run: (ctx) => {
        const r = ctx.call<{ exceptions: FinancialException[]; created: number }>('exception.raise_from_run', { run_id: out(ctx, 'reconcile')!.run_id })
        return { kind: 'done', output: { summary: `${r.exceptions.length} open exceptions (${r.created} new)` } }
      },
    },
    {
      key: 'correction',
      name: 'Prepare the correction schedule and wait for approval',
      agent: 'contribution_reconciler',
      run: (ctx) => {
        const r = ctx.call<{ schedule: CorrectionSchedule; approval_id: string | null }>('correction.prepare', { run_id: out(ctx, 'reconcile')!.run_id })
        if (!r.approval_id) return { kind: 'done', output: { schedule_id: r.schedule.id, summary: 'Nothing to correct' } }
        return { kind: 'await_approval', approval_id: r.approval_id, output: { schedule_id: r.schedule.id, summary: `${r.schedule.lines.length} correction lines (${rands(r.schedule.total)}) held for approval` } }
      },
    },
    {
      key: 'release',
      name: 'Release the approved schedule as a preview for the administrator',
      agent: 'approval_engine',
      run: (ctx) => {
        const scheduleId = out(ctx, 'correction')!.schedule_id as string
        const s = ctx.repo.require('correction_schedules', scheduleId)
        if (!s.lines.length) return { kind: 'done', output: { summary: 'No schedule to release' } }
        ctx.call('correction.release', { schedule_id: scheduleId })
        return { kind: 'done', output: { summary: 'Released as a preview. Nothing was sent to the administrator and no money moved.' } }
      },
    },
  ],
})

export const GROUP_MOVEMENTS = 'group_movements'

export interface GroupMovementsInputs {
  employer_customer_id: string
  batch_id: string
}

registerWorkflow({
  type: GROUP_MOVEMENTS,
  title: 'Employee movements and group life cover recalculation',
  steps: [
    {
      key: 'register',
      name: 'Validate, match and commit the payroll to the membership register',
      agent: 'group_membership',
      run: (ctx) => {
        const i = ctx.job.inputs as unknown as GroupMovementsInputs
        let batch = ctx.repo.require('import_batches', i.batch_id)
        if (batch.status === 'uploaded') {
          ctx.call('import.validate', { batch_id: batch.id })
          batch = ctx.call<ImportBatch>('import.match', { batch_id: batch.id })
        }
        if (batch.status === 'committed') return { kind: 'done', output: { summary: 'Payroll already committed to the register' } }
        const approval = ctx.call<{ id: string; proposed_changes: { changes: unknown[] } }>('import.request_commit', { batch_id: batch.id })
        return { kind: 'await_approval', approval_id: approval.id, output: { summary: `${approval.proposed_changes.changes.length} member changes held for approval` } }
      },
    },
    {
      key: 'recalculate',
      name: 'Recalculate salary-linked group life cover from the scheme rules in force',
      agent: 'group_membership',
      run: (ctx) => {
        const i = ctx.job.inputs as unknown as GroupMovementsInputs
        const s = ctx.call<{ processed: number; cover_before: number; cover_after: number; above_fcl: number; ineligible: number }>('scheme.recalculate_cover', { employer_customer_id: i.employer_customer_id })
        const delta = s.cover_after - s.cover_before
        return {
          kind: 'done',
          output: { summary: `${s.processed} movements recalculated: net cover ${delta >= 0 ? '+' : '−'}R${Math.abs(delta).toLocaleString('en-ZA')}; ${s.above_fcl} above the free cover limit; ${s.ineligible} not eligible` },
        }
      },
    },
    {
      key: 'submission',
      name: 'Hold the insurer movement schedule for approval',
      agent: 'group_membership',
      run: (ctx) => {
        const i = ctx.job.inputs as unknown as GroupMovementsInputs
        const r = ctx.call<{ approval_ids: string[] }>('scheme.prepare_submission', { employer_customer_id: i.employer_customer_id })
        if (!r.approval_ids.length) return { kind: 'done', output: { summary: 'No movements to submit' } }
        return { kind: 'await_approval', approval_id: r.approval_ids[0], output: { summary: 'Movement schedule held for approval' } }
      },
    },
    {
      key: 'finalise',
      name: 'Mark the schedule ready for the insurer',
      agent: 'approval_engine',
      run: () => ({ kind: 'done', output: { summary: 'Schedule approved. Submit it through the insurer’s channel; B-Covered does not send it.' } }),
    },
  ],
})

/** Starts movement processing from the employer's latest payroll file. */
export function startGroupMovements(repo: Repo, actor: Actor, customerId: string): { job: Job; reused: boolean; loadedDemo: boolean } {
  const active = repo.list('jobs', (j) => j.workflow_type === GROUP_MOVEMENTS && !TERMINAL_STATUSES.includes(j.status) && (j.inputs as { employer_customer_id?: string }).employer_customer_id === customerId)[0]
  if (active) return { job: active, reused: true, loadedDemo: false }
  const sources = repo.list('data_sources', (s) => s.customer_id === customerId && s.dataset === 'payroll_schedule').map((s) => s.id)
  let batch = repo
    .list('import_batches', (b) => sources.includes(b.data_source_id) && !['superseded', 'rejected', 'failed'].includes(b.status))
    .sort((a, b) => (b.reporting_period ?? '').localeCompare(a.reporting_period ?? '') || b.created_at.localeCompare(a.created_at))[0]
  let loadedDemo = false
  if (!batch && customerId === BX.customers.karoo) {
    const files = loadOctoberFiles(repo, actor)
    batch = files.payroll
    loadedDemo = files.loaded
  }
  if (!batch) throw new ToolError('not_found', 'No payroll file has been imported for this employer')
  const job = createJob(repo, {
    workflow_type: GROUP_MOVEMENTS,
    inputs: { employer_customer_id: customerId, batch_id: batch.id },
    initiated_by: actor,
    links: { customer_id: customerId },
    idempotency_key: `group-movements:${batch.id}`,
  })
  return { job, reused: false, loadedDemo }
}

/** Registers the synthetic October files for Karoo Logistics, recognising them if they are already loaded. */
export function loadOctoberFiles(repo: Repo, actor: Actor) {
  const payroll = invokeTool<{ batch: ImportBatch; duplicate: boolean }>(
    'import.register',
    { data_source_id: BX.sources.karooPayroll, reporting_period: DEMO_PERIOD, file_name: 'karoo-payroll-2026-10.csv (synthetic)', content: karooPayrollCsv(), is_demo_fixture: true },
    { repo, actor },
  )
  const admin = invokeTool<{ batch: ImportBatch; duplicate: boolean }>(
    'import.register',
    { data_source_id: BX.sources.kalahariContrib, reporting_period: DEMO_PERIOD, file_name: 'kalahari-contributions-2026-10.csv (synthetic)', content: kalahariScheduleCsv(), is_demo_fixture: true },
    { repo, actor },
  )
  return { payroll: payroll.batch, admin: admin.batch, loaded: !payroll.duplicate || !admin.duplicate }
}

const latestBatch = (repo: Repo, customerId: string, dataset: string, period: string) => {
  const sources = repo.list('data_sources', (s) => s.customer_id === customerId && s.dataset === dataset).map((s) => s.id)
  return repo
    .list('import_batches', (b) => sources.includes(b.data_source_id) && b.reporting_period === period && !['superseded', 'rejected', 'failed'].includes(b.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

export function activeContributionRecon(repo: Repo, customerId: string, period: string): Job | undefined {
  return repo.list('jobs', (j) => j.workflow_type === CONTRIBUTION_RECON && !TERMINAL_STATUSES.includes(j.status) && (j.inputs as { employer_customer_id?: string; reporting_period?: string }).employer_customer_id === customerId && (j.inputs as { reporting_period?: string }).reporting_period === period)[0]
}

/** Starts the reconciliation for an employer and period from the latest files of each source. */
export function startContributionRecon(repo: Repo, actor: Actor, customerId: string, period: string): { job: Job; reused: boolean; loadedDemo: boolean } {
  const active = activeContributionRecon(repo, customerId, period)
  if (active) return { job: active, reused: true, loadedDemo: false }
  let payroll = latestBatch(repo, customerId, 'payroll_schedule', period)
  let admin = latestBatch(repo, customerId, 'contribution_schedule', period)
  let loadedDemo = false
  if ((!payroll || !admin) && customerId === BX.customers.karoo && period === DEMO_PERIOD) {
    const files = loadOctoberFiles(repo, actor)
    payroll = files.payroll
    admin = files.admin
    loadedDemo = files.loaded
  }
  if (!payroll) throw new ToolError('not_found', 'No payroll file has been imported for this employer and period')
  if (!admin) throw new ToolError('not_found', 'No administrator contribution schedule has been imported for this employer and period')
  const inputs: ContributionReconInputs = { employer_customer_id: customerId, reporting_period: period, payroll_batch_id: payroll.id, admin_batch_id: admin.id }
  const job = createJob(repo, {
    workflow_type: CONTRIBUTION_RECON,
    inputs: inputs as unknown as Record<string, Json>,
    initiated_by: actor,
    links: { customer_id: customerId },
    idempotency_key: `contribution-recon:${payroll.id}:${admin.id}`,
  })
  return { job, reused: false, loadedDemo }
}
