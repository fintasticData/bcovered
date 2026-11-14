// Financial controls and employer request handlers. Reached only through src/api/client.ts.
import { agentLabel } from './agents/catalog'
import { loadOctoberFiles, startContributionRecon } from './agents/controlsOrchestrator'
import { STAFF_ROLES, principal, requireCustomer, requireRole, type Auth } from './api'
import type { BenefitEvent, ContributionRuleVersion, GroupScheme, MemberMovement, RetirementFund, SchemeRuleVersion } from './db/benefitsSchema'
import {
  DATASET_LABEL,
  OPEN_EXCEPTION,
  type AuditEvidence,
  type CorrectionSchedule,
  type DataSource,
  type ExceptionResolution,
  type FinancialException,
  type ImportBatch,
  type ImportRow,
  type ReconciliationDefinition,
  type ReconciliationItem,
  type ReconciliationRun,
} from './db/controlsSchema'
import type { ApprovalRequest, Customer } from './db/schema'
import type { Repo } from './db/store'
import { ToolError } from './lib/errors'
import { payrollChanges, type MemberChange } from './tools/controls'
import { invokeTool } from './tools/registry'

const customerName = (repo: Repo, id: string | null | undefined) => (id ? (repo.get('customers', id)?.full_name ?? 'Unknown') : null)
const userName = (repo: Repo, id: string | null | undefined) => (id ? (repo.get('app_users', id)?.full_name ?? null) : null)

// ---------------------------------------------------------------- imports

export interface ImportRowView {
  batch: ImportBatch
  source: DataSource
  dataset_label: string
  customer: string | null
  uploaded_by: string | null
}

export function listDataSources(auth: Auth): Array<DataSource & { customer: string | null; provider: string | null }> {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo.list('data_sources', (s) => s.is_active).map((s) => ({ ...s, customer: customerName(p.repo, s.customer_id), provider: s.provider_id ? (p.repo.get('insurers', s.provider_id)?.name ?? null) : null }))
}

export function listImports(auth: Auth): ImportRowView[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('import_batches')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((batch) => {
      const source = p.repo.require('data_sources', batch.data_source_id)
      return { batch, source, dataset_label: DATASET_LABEL[source.dataset], customer: customerName(p.repo, source.customer_id), uploaded_by: userName(p.repo, batch.uploaded_by) ?? (batch.uploaded_by_agent ? agentLabel(batch.uploaded_by_agent) : null) }
    })
}

export interface ImportDetail extends ImportRowView {
  rows: ImportRow[]
  changes: MemberChange[]
  approvals: ApprovalRequest[]
  supersedes: ImportBatch | null
  superseded_by: ImportBatch | null
  evidence: AuditEvidence[]
}

export function getImport(auth: Auth, body: { batch_id: string }): ImportDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const batch = p.repo.require('import_batches', body.batch_id)
  const source = p.repo.require('data_sources', batch.data_source_id)
  return {
    batch,
    source,
    dataset_label: DATASET_LABEL[source.dataset],
    customer: customerName(p.repo, source.customer_id),
    uploaded_by: userName(p.repo, batch.uploaded_by) ?? (batch.uploaded_by_agent ? agentLabel(batch.uploaded_by_agent) : null),
    rows: p.repo.list('import_rows', (r) => r.batch_id === batch.id).sort((a, b) => a.row_number - b.row_number),
    changes: ['matched', 'awaiting_approval'].includes(batch.status) ? payrollChanges(p.repo, batch.id) : [],
    approvals: p.repo.list('approval_requests', (a) => a.subject_id === batch.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    supersedes: batch.supersedes_batch_id ? (p.repo.get('import_batches', batch.supersedes_batch_id) ?? null) : null,
    superseded_by: p.repo.find('import_batches', (b) => b.supersedes_batch_id === batch.id) ?? null,
    evidence: p.repo.list('audit_evidence', (e) => e.entity_id === batch.id),
  }
}

/** Registers, validates and matches an uploaded file in one go. A repeated file returns the existing batch. */
export function uploadImport(auth: Auth, body: { data_source_id: string; reporting_period: string | null; file_name: string | null; content: string }): { batch: ImportBatch; duplicate: boolean } {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const ctx = { repo: p.repo, actor: p.actor }
  const r = invokeTool<{ batch: ImportBatch; duplicate: boolean }>('import.register', body, ctx)
  if (!r.duplicate) {
    invokeTool('import.validate', { batch_id: r.batch.id }, ctx)
    invokeTool('import.match', { batch_id: r.batch.id }, ctx)
  }
  return { batch: p.repo.require('import_batches', r.batch.id), duplicate: r.duplicate }
}

export function requestCommit(auth: Auth, body: { batch_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<ApprovalRequest>('import.request_commit', body, { repo: p.repo, actor: p.actor })
}

export function loadDemoFiles(auth: Auth) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const files = loadOctoberFiles(p.repo, p.actor)
  for (const b of [files.payroll, files.admin]) {
    if (b.status === 'uploaded') {
      invokeTool('import.validate', { batch_id: b.id }, { repo: p.repo, actor: p.actor })
      invokeTool('import.match', { batch_id: b.id }, { repo: p.repo, actor: p.actor })
    }
  }
  return { payroll_batch_id: files.payroll.id, admin_batch_id: files.admin.id, loaded: files.loaded }
}

// ---------------------------------------------------------------- reconciliations

export interface ReconRow {
  run: ReconciliationRun
  definition: ReconciliationDefinition
  customer: string | null
  open_exceptions: number
}

export function listReconciliations(auth: Auth): ReconRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('reconciliation_runs')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((run) => ({
      run,
      definition: p.repo.require('reconciliation_definitions', run.definition_id),
      customer: customerName(p.repo, run.customer_id) ?? (run.scope_ref.portfolio_id ? (p.repo.get('investment_portfolios', run.scope_ref.portfolio_id)?.name ?? null) : run.scope_ref.fund_id ? (p.repo.get('retirement_funds', run.scope_ref.fund_id)?.name ?? null) : null),
      open_exceptions: p.repo.list('financial_exceptions', (e) => e.run_id === run.id && OPEN_EXCEPTION.includes(e.status)).length,
    }))
}

export interface ReconDetail extends ReconRow {
  items: ReconciliationItem[]
  exceptions: FinancialException[]
  correction: CorrectionSchedule | null
  evidence: AuditEvidence[]
  approvals: ApprovalRequest[]
  left_label: string
  right_label: string
}

export function getReconciliation(auth: Auth, body: { run_id: string }): ReconDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const run = p.repo.require('reconciliation_runs', body.run_id)
  const definition = p.repo.require('reconciliation_definitions', run.definition_id)
  const correction = p.repo.list('correction_schedules', (s) => s.run_id === run.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  const labels: Record<string, [string, string]> = {
    payroll_vs_admin_contributions: ['Expected (payroll × rules)', 'Administrator schedule'],
    admin_vs_manager_holdings: ['Administrator register', 'Investment manager'],
    fund_balance_rollforward: ['Calculated roll-forward', 'Administrator statement'],
    transfer_values: ['Transferor value', 'Transferee allocation'],
  }
  const [left_label, right_label] = labels[definition.key] ?? ['Left', 'Right']
  return {
    run,
    definition,
    customer: customerName(p.repo, run.customer_id),
    open_exceptions: p.repo.list('financial_exceptions', (e) => e.run_id === run.id && OPEN_EXCEPTION.includes(e.status)).length,
    items: p.repo.list('reconciliation_items', (i) => i.run_id === run.id),
    exceptions: p.repo.list('financial_exceptions', (e) => e.run_id === run.id),
    correction,
    evidence: p.repo.list('audit_evidence', (e) => e.entity_id === run.id || (correction !== null && e.entity_id === correction.id)),
    approvals: correction ? p.repo.list('approval_requests', (a) => a.subject_id === correction.id) : [],
    left_label,
    right_label,
  }
}

/** The latest reconciliation run created by a job, for Russ's result panel. */
export function getRunForJob(auth: Auth, body: { job_id: string }): ReconDetail | null {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const run = p.repo.list('reconciliation_runs', (r) => r.job_id === body.job_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return run ? getReconciliation(auth, { run_id: run.id }) : null
}

export function startContributionReconciliation(auth: Auth, body: { employer_customer_id: string; reporting_period: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const { job, reused, loadedDemo } = startContributionRecon(p.repo, p.actor, body.employer_customer_id, body.reporting_period)
  return { job_id: job.id, reused, loaded_demo: loadedDemo }
}

// ---------------------------------------------------------------- exceptions

export interface ExceptionRow {
  exception: FinancialException
  customer: string | null
  fund: string | null
  portfolio: string | null
  assignee: string | null
  resolutions: ExceptionResolution[]
  age_days: number
}

export function listExceptions(auth: Auth, body: { open_only?: boolean } = {}): ExceptionRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const now = Date.now()
  return p.repo
    .list('financial_exceptions', (e) => !body.open_only || OPEN_EXCEPTION.includes(e.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((exception) => ({
      exception,
      customer: customerName(p.repo, exception.customer_id),
      fund: exception.fund_id ? (p.repo.get('retirement_funds', exception.fund_id)?.name ?? null) : null,
      portfolio: exception.portfolio_id ? (p.repo.get('investment_portfolios', exception.portfolio_id)?.name ?? null) : null,
      assignee: userName(p.repo, exception.assigned_to),
      resolutions: p.repo.list('exception_resolutions', (r) => r.exception_id === exception.id),
      age_days: Math.floor((now - Date.parse(exception.created_at)) / 86_400_000),
    }))
}

export function updateExceptions(auth: Auth, body: { exception_ids: string[]; status?: 'open' | 'investigating' | 'awaiting_third_party'; assign_to_me?: boolean }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return body.exception_ids.map((exception_id) =>
    invokeTool<FinancialException>('exception.update', { exception_id, status: body.status, assigned_to: body.assign_to_me ? p.user!.id : undefined }, { repo: p.repo, actor: p.actor }),
  )
}

export function resolveException(auth: Auth, body: { exception_id: string; resolution: ExceptionResolution['resolution']; note: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<{ exception: FinancialException; approval_id: string | null }>('exception.resolve', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- employers

export interface EmployerRow {
  customer: Customer
  members: number
  schemes: number
  funds: number
  salary_roll_annual: number
  open_exceptions: number
  last_reconciliation: string | null
}

const employerIds = (repo: Repo) =>
  [...new Set([...repo.list('employments').map((e) => e.employer_customer_id), ...repo.list('group_schemes').map((s) => s.employer_customer_id), ...repo.list('fund_participations').map((f) => f.employer_customer_id)])]

function salaryRoll(repo: Repo, customerId: string) {
  const active = new Set(repo.list('employments', (e) => e.employer_customer_id === customerId && e.status === 'active').map((e) => e.id))
  return repo.list('salary_history', (s) => active.has(s.employment_id) && !s.effective_to).reduce((sum, s) => sum + s.annual_amount, 0)
}

export function listEmployers(auth: Auth): EmployerRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return employerIds(p.repo).map((id) => ({
    customer: p.repo.require('customers', id),
    members: p.repo.list('employments', (e) => e.employer_customer_id === id && e.status === 'active').length,
    schemes: p.repo.list('group_schemes', (s) => s.employer_customer_id === id && s.status === 'active').length,
    funds: p.repo.list('fund_participations', (f) => f.employer_customer_id === id && f.status === 'active').length,
    salary_roll_annual: salaryRoll(p.repo, id),
    open_exceptions: p.repo.list('financial_exceptions', (e) => e.customer_id === id && OPEN_EXCEPTION.includes(e.status)).length,
    last_reconciliation: p.repo.list('reconciliation_runs', (r) => r.customer_id === id && r.status === 'completed').sort((a, b) => b.reporting_period.localeCompare(a.reporting_period))[0]?.reporting_period ?? null,
  }))
}

export interface EmployerDetail {
  customer: Customer
  members: number
  leavers: number
  salary_roll_annual: number
  schemes: Array<GroupScheme & { provider: string; rules: SchemeRuleVersion | null; members: number; covered: number; above_fcl: number; monthly_premium_estimate: number }>
  funds: Array<{ fund: RetirementFund; participation_number: string | null; rules: ContributionRuleVersion | null; members: number; administrator: string; reported_value: number; valuation_date: string | null }>
  imports: ImportRowView[]
  reconciliations: ReconRow[]
  exceptions: FinancialException[]
  movements: MemberMovement[]
  benefit_events: Array<BenefitEvent & { person: string }>
}

function employerDetail(repo: Repo, customerId: string): EmployerDetail {
  const customer = repo.require('customers', customerId)
  const employments = repo.list('employments', (e) => e.employer_customer_id === customerId)
  const roll = salaryRoll(repo, customerId)
  const sources = repo.list('data_sources', (s) => s.customer_id === customerId).map((s) => s.id)
  return {
    customer,
    members: employments.filter((e) => e.status === 'active').length,
    leavers: employments.filter((e) => e.status === 'terminated').length,
    salary_roll_annual: roll,
    schemes: repo
      .list('group_schemes', (s) => s.employer_customer_id === customerId)
      .map((s) => {
        const rules = repo.list('scheme_rule_versions', (r) => r.scheme_id === s.id && !r.effective_to).sort((a, b) => b.version - a.version)[0] ?? null
        const members = repo.list('scheme_memberships', (m) => m.scheme_id === s.id && m.status === 'active')
        return {
          ...s,
          provider: repo.get('insurers', s.provider_id)?.name ?? 'Unknown',
          rules,
          members: members.length,
          covered: members.reduce((sum, m) => sum + (m.cover_amount ?? 0), 0),
          above_fcl: members.filter((m) => m.above_free_cover_limit).length,
          monthly_premium_estimate: rules ? Math.round(((roll / 12) * rules.rules.premium_rate_pct) / 100) : 0,
        }
      }),
    funds: repo
      .list('fund_participations', (f) => f.employer_customer_id === customerId)
      .map((f) => {
        const fund = repo.require('retirement_funds', f.fund_id)
        const memberships = repo.list('fund_memberships', (m) => m.participation_id === f.id && m.status === 'active')
        const valuations = repo.list('administrator_valuations', (v) => memberships.some((m) => m.id === v.fund_membership_id))
        const latest = valuations.map((v) => v.valuation_date).sort().at(-1) ?? null
        return {
          fund,
          participation_number: f.participation_number,
          rules: repo.list('contribution_rule_versions', (r) => r.participation_id === f.id && !r.effective_to).sort((a, b) => b.version - a.version)[0] ?? null,
          members: memberships.length,
          administrator: repo.get('insurers', fund.administrator_id)?.name ?? 'Unknown',
          reported_value: Math.round(valuations.filter((v) => v.valuation_date === latest).reduce((s, v) => s + v.total_value, 0) * 100) / 100,
          valuation_date: latest,
        }
      }),
    imports: repo
      .list('import_batches', (b) => sources.includes(b.data_source_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((batch) => {
        const source = repo.require('data_sources', batch.data_source_id)
        return { batch, source, dataset_label: DATASET_LABEL[source.dataset], customer: customer.full_name, uploaded_by: null }
      }),
    reconciliations: repo
      .list('reconciliation_runs', (r) => r.customer_id === customerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((run) => ({ run, definition: repo.require('reconciliation_definitions', run.definition_id), customer: customer.full_name, open_exceptions: repo.list('financial_exceptions', (e) => e.run_id === run.id && OPEN_EXCEPTION.includes(e.status)).length })),
    exceptions: repo.list('financial_exceptions', (e) => e.customer_id === customerId && OPEN_EXCEPTION.includes(e.status)),
    movements: repo.list('member_movements', (m) => m.employer_customer_id === customerId).sort((a, b) => b.processing_date.localeCompare(a.processing_date)),
    benefit_events: repo.list('benefit_events', (e) => e.employer_customer_id === customerId).map((e) => {
      const person = repo.get('persons', e.person_id)
      return { ...e, person: person ? `${person.first_names} ${person.surname}` : 'Unknown' }
    }),
  }
}

export function getEmployer(auth: Auth, body: { customer_id: string }): EmployerDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return employerDetail(p.repo, body.customer_id)
}

export interface PortalEmployerView {
  detail: EmployerDetail
  members: Array<{ person_id: string; name: string; employee_number: string; category: string; status: string; cover: number | null }>
}

/** The employer HR portal. Reads go through the scoped repository, so other employers’ people are invisible. */
export function getPortalEmployer(auth: Auth): PortalEmployerView {
  const p = principal(auth)
  const customer = requireCustomer(p)
  const repo = p.repo
  if (!repo.list('access_grants', (g) => g.user_id === p.user!.id && g.scope_type === 'employer' && g.scope_id === customer.id && !g.revoked_at).length) {
    throw new ToolError('forbidden', 'This identity has no employer access')
  }
  const detail = employerDetail(repo, customer.id)
  return {
    detail: { ...detail, imports: [], reconciliations: detail.reconciliations.map((r) => ({ ...r })), exceptions: detail.exceptions },
    members: repo
      .list('employments', (e) => e.employer_customer_id === customer.id)
      .map((e) => {
        const person = repo.require('persons', e.person_id)
        return {
          person_id: person.id,
          name: `${person.first_names} ${person.surname}`,
          employee_number: e.employee_number,
          category: e.category,
          status: e.status,
          cover: repo.find('scheme_memberships', (m) => m.employment_id === e.id && m.status === 'active')?.cover_amount ?? null,
        }
      })
      .sort((a, b) => a.employee_number.localeCompare(b.employee_number)),
  }
}

/** How many of an employer's employments the calling identity can see. Used to prove isolation. */
export function probeEmployerIsolation(auth: Auth, body: { employer_customer_id: string }) {
  const p = principal(auth)
  return { visible_employments: p.repo.list('employments', (e) => e.employer_customer_id === body.employer_customer_id).length }
}
