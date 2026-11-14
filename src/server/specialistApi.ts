// Cell captives, governance, investigations, executive reporting and the compliance register.
import { COMPLIANCE_QUESTIONS, type ComplianceQuestion } from '../data/complianceQuestions'
import { STAFF_ROLES, principal, requireCustomer, requireRole, type Auth } from './api'
import { OPEN_EXCEPTION, type AuditEvidence } from './db/controlsSchema'
import { FAIS_LABEL, type AdviserAuthorisation } from './db/lifeSchema'
import type { CellArrangement, CellFinancialPeriod, CommissionRecord, GovernanceItem, Investigation, InvestigationFinding, TrusteePack } from './db/specialistSchema'
import type { Repo } from './db/store'
import type { CellPeriodResult } from './domain/cells/results'
import { ToolError } from './lib/errors'
import { growthOpportunities, type Opportunity } from './tools/growth'
import { cellReport } from './tools/specialist'
import { invokeTool } from './tools/registry'

const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- cells

export interface CellView {
  cell: CellArrangement
  owner: string
  insurer: string
  periods: CellFinancialPeriod[]
  results: CellPeriodResult[]
  totals: ReturnType<typeof cellReport>['totals']
  evidence: AuditEvidence[]
}

function cellView(repo: Repo, cellId: string): CellView {
  const report = cellReport(repo, cellId)
  return {
    ...report,
    owner: repo.get('customers', report.cell.cell_owner_customer_id)?.full_name ?? 'Unknown',
    insurer: repo.get('insurers', report.cell.insurer_id)?.name ?? 'Unknown',
    evidence: repo.list('audit_evidence', (e) => e.entity_id === cellId),
  }
}

export function listCells(auth: Auth): CellView[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo.list('cell_arrangements').map((c) => cellView(p.repo, c.id))
}

export function getCell(auth: Auth, body: { cell_id: string }): CellView {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return cellView(p.repo, body.cell_id)
}

export function prepareCellReport(auth: Auth, body: { cell_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  invokeTool('cell.prepare_report', body, { repo: p.repo, actor: p.actor })
  return cellView(p.repo, body.cell_id)
}

/** Cell owner portal: the scoped repository only returns cells this identity has a grant for. */
export function getPortalCell(auth: Auth): CellView[] {
  const p = principal(auth)
  requireCustomer(p)
  const cells = p.repo.list('cell_arrangements')
  if (!cells.length) throw new ToolError('forbidden', 'This identity has no cell captive access')
  return cells.map((c) => cellView(p.repo, c.id))
}

// ---------------------------------------------------------------- governance

export interface GovernanceView {
  funds: Array<{ id: string; name: string; items: GovernanceItem[]; packs: TrusteePack[] }>
}

export function getGovernance(auth: Auth): GovernanceView {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return {
    funds: p.repo.list('retirement_funds').map((f) => ({
      id: f.id,
      name: f.name,
      items: p.repo.list('governance_items', (g) => g.fund_id === f.id).sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '')),
      packs: p.repo.list('trustee_packs', (t) => t.fund_id === f.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    })),
  }
}

export function getPack(auth: Auth, body: { pack_id: string }): { pack: TrusteePack; fund: string; issued_by: string | null } {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const pack = p.repo.require('trustee_packs', body.pack_id)
  return { pack, fund: p.repo.get('retirement_funds', pack.fund_id)?.name ?? 'Unknown', issued_by: pack.issued_by ? (p.repo.get('app_users', pack.issued_by)?.full_name ?? null) : null }
}

export function buildPack(auth: Auth, body: { fund_id: string; period_end: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<TrusteePack>('governance.build_pack', body, { repo: p.repo, actor: p.actor })
}

export function issuePack(auth: Auth, body: { pack_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<TrusteePack>('governance.issue_pack', body, { repo: p.repo, actor: p.actor })
}

export function recordGovernanceItem(auth: Auth, body: { fund_id: string; kind: GovernanceItem['kind']; title: string; detail?: string | null; owner?: string | null; due_date?: string | null; decided_by_trustees?: string | null }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<GovernanceItem>('governance.record_item', body, { repo: p.repo, actor: p.actor })
}

export function updateGovernanceItem(auth: Auth, body: { item_id: string; status: GovernanceItem['status'] }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<GovernanceItem>('governance.update_item', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- investigations

export function listInvestigations(auth: Auth): Array<Investigation & { findings: number; evidence: number }> {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('investigations')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => ({ ...i, findings: p.repo.list('investigation_findings', (f) => f.investigation_id === i.id).length, evidence: p.repo.list('audit_evidence', (e) => e.entity_id === i.id).length }))
}

export interface InvestigationDetail {
  investigation: Investigation
  evidence: AuditEvidence[]
  findings: InvestigationFinding[]
  runs: Array<{ id: string; label: string }>
  batches: Array<{ id: string; label: string }>
}

export function getInvestigation(auth: Auth, body: { investigation_id: string }): InvestigationDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return {
    investigation: p.repo.require('investigations', body.investigation_id),
    evidence: p.repo.list('audit_evidence', (e) => e.entity_id === body.investigation_id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    findings: p.repo.list('investigation_findings', (f) => f.investigation_id === body.investigation_id),
    runs: p.repo
      .list('reconciliation_runs')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({ id: r.id, label: `${p.repo.get('reconciliation_definitions', r.definition_id)?.name ?? 'Run'} · ${r.reporting_period.slice(0, 7)} · ${r.status} · ${r.created_at.slice(0, 16).replace('T', ' ')}` })),
    batches: p.repo.list('import_batches').map((b) => ({ id: b.id, label: `${b.file_name} · ${b.status}` })),
  }
}

const tool =
  <B extends object, R = unknown>(name: string) =>
  (auth: Auth, body: B): R => {
    const p = principal(auth)
    requireRole(p, STAFF_ROLES)
    return invokeTool<R>(name, body, { repo: p.repo, actor: p.actor })
  }

export const openInvestigation = tool<{ title: string; scope: string }, Investigation>('investigation.open')
export const snapshotDataset = tool<{ investigation_id: string; dataset: 'reconciliation_run' | 'import_batch' | 'open_exceptions' | 'member_movements'; ref_id?: string | null }, AuditEvidence>('investigation.snapshot')
export const recordFinding = tool<{ investigation_id: string; title: string; detail: string; basis: 'record_supported' | 'hypothesis'; evidence_ids: string[] }, InvestigationFinding>('investigation.record_finding')
export const investigationReport = tool<{ investigation_id: string }, { text: string; evidence_id: string }>('investigation.report')
export const closeInvestigation = tool<{ investigation_id: string }, Investigation>('investigation.close')
export const compareRunsApi = tool<{ run_a: string; run_b: string }, Array<{ key: string; label: string; before: unknown; after: unknown }>>('investigation.compare_runs')

// ---------------------------------------------------------------- growth

export function listOpportunities(auth: Auth): Opportunity[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return growthOpportunities(p.repo)
}

// ---------------------------------------------------------------- executive

export interface ExecutiveView {
  premiums: { individual_life_annual: number; group_risk_annual_estimate: number; short_term_note: string }
  contributions: { period: string | null; expected: number | null; reported: number | null }
  assets: { member_values_reported: number; member_values_date: string | null; portfolio_value_reported: number | null; portfolio_date: string | null }
  revenue: { by_period: Array<{ period: string; amount: number }>; by_type: Array<{ type: CommissionRecord['commission_type']; amount: number }>; total: number }
  processing: { imports: number; reconciliations: number; exceptions_open: number; exceptions_closed: number; approvals_pending: number; jobs_completed: number; median_approval_hours: number | null }
  compliance: { placed_without_roa: number; compliance_tasks_open: number; questions_open: number; advisers_long_term: number }
  growth: { opportunities: number }
  book: { people: number; employers: number; schemes: number; funds: number; policies_in_force: number }
}

export function getExecutive(auth: Auth): ExecutiveView {
  const p = principal(auth)
  requireRole(p, ['manager', 'admin'])
  const repo = p.repo
  const inForce = repo.list('policies', (x) => x.line === 'individual_life' && ['in_force', 'accepted', 'reinstated'].includes(x.status))
  const groupEstimate = repo
    .list('group_schemes', (s) => s.status === 'active')
    .reduce((sum, s) => {
      const rules = repo.list('scheme_rule_versions', (r) => r.scheme_id === s.id && !r.effective_to)[0]?.rules
      const active = new Set(repo.list('employments', (e) => e.employer_customer_id === s.employer_customer_id && e.status === 'active').map((e) => e.id))
      const roll = repo.list('salary_history', (x) => active.has(x.employment_id) && !x.effective_to).reduce((t, x) => t + x.annual_amount, 0)
      return sum + (rules ? (roll * rules.premium_rate_pct) / 100 : 0)
    }, 0)
  const contribDef = repo.find('reconciliation_definitions', (d) => d.key === 'payroll_vs_admin_contributions')
  const lastContrib = contribDef ? repo.list('reconciliation_runs', (r) => r.definition_id === contribDef.id && r.status === 'completed').sort((a, b) => b.reporting_period.localeCompare(a.reporting_period))[0] : undefined
  const vals = repo.list('administrator_valuations')
  const latestByMember = new Map<string, (typeof vals)[number]>()
  vals.forEach((v) => {
    const prev = latestByMember.get(v.fund_membership_id)
    if (!prev || prev.valuation_date < v.valuation_date) latestByMember.set(v.fund_membership_id, v)
  })
  const portfolioVal = repo.list('investment_valuations').sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))[0]
  const commissions = repo.list('commission_records')
  const periods = [...new Set(commissions.map((c) => c.period))].sort()
  const decided = repo.list('approval_requests', (a) => a.status !== 'pending' && a.decided_at !== null).map((a) => (Date.parse(a.decided_at!) - Date.parse(a.created_at)) / 3_600_000).sort((a, b) => a - b)
  return {
    premiums: {
      individual_life_annual: r2(inForce.reduce((s, x) => s + (x.premium_amount ?? 0) * (x.premium_frequency === 'annually' ? 1 : 12), 0)),
      group_risk_annual_estimate: r2(groupEstimate),
      short_term_note: 'Short-term placements are not yet recorded as policies in this build, so short-term premium is not shown.',
    },
    contributions: { period: lastContrib?.reporting_period ?? null, expected: lastContrib?.left_total ?? null, reported: lastContrib?.right_total ?? null },
    assets: {
      member_values_reported: r2([...latestByMember.values()].reduce((s, v) => s + v.total_value, 0)),
      member_values_date: [...latestByMember.values()].map((v) => v.valuation_date).sort().at(-1) ?? null,
      portfolio_value_reported: portfolioVal?.market_value ?? null,
      portfolio_date: portfolioVal?.valuation_date ?? null,
    },
    revenue: {
      by_period: periods.map((period) => ({ period, amount: r2(commissions.filter((c) => c.period === period).reduce((s, c) => s + c.amount, 0)) })),
      by_type: (['initial', 'ongoing', 'fee'] as const).map((type) => ({ type, amount: r2(commissions.filter((c) => c.commission_type === type).reduce((s, c) => s + c.amount, 0)) })),
      total: r2(commissions.reduce((s, c) => s + c.amount, 0)),
    },
    processing: {
      imports: repo.list('import_batches').length,
      reconciliations: repo.list('reconciliation_runs').length,
      exceptions_open: repo.list('financial_exceptions', (e) => OPEN_EXCEPTION.includes(e.status)).length,
      exceptions_closed: repo.list('financial_exceptions', (e) => !OPEN_EXCEPTION.includes(e.status)).length,
      approvals_pending: repo.list('approval_requests', (a) => a.status === 'pending').length,
      jobs_completed: repo.list('jobs', (j) => j.status === 'completed').length,
      median_approval_hours: decided.length ? Math.round(decided[Math.floor(decided.length / 2)] * 10) / 10 : null,
    },
    compliance: {
      placed_without_roa: repo.list('policies', (x) => x.origin === 'placed' && x.status !== 'proposed' && !['signed_off', 'delivered'].includes(repo.get('records_of_advice', x.record_of_advice_id ?? '')?.status ?? '')).length,
      compliance_tasks_open: repo.list('tasks', (t) => t.status === 'open' && t.created_by_agent === 'compliance_monitor').length,
      questions_open: COMPLIANCE_QUESTIONS.filter((q) => q.status === 'open').length,
      advisers_long_term: new Set(repo.list('adviser_authorisations', (a) => a.status === 'active' && a.product_category.startsWith('lt_')).map((a) => a.user_id)).size,
    },
    growth: { opportunities: growthOpportunities(repo).length },
    book: {
      people: repo.list('persons').length,
      employers: new Set(repo.list('employments').map((e) => e.employer_customer_id)).size,
      schemes: repo.list('group_schemes', (s) => s.status === 'active').length,
      funds: repo.list('retirement_funds', (f) => f.status === 'active').length,
      policies_in_force: inForce.length,
    },
  }
}

// ---------------------------------------------------------------- compliance register

export interface ComplianceView {
  questions: ComplianceQuestion[]
  advisers: Array<{ user_id: string; name: string; role: string; categories: Array<AdviserAuthorisation & { label: string }> }>
  findings: Array<{ id: string; title: string; detail: string | null; created_at: string; link: string | null }>
}

export function getCompliance(auth: Auth): ComplianceView {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const auths = p.repo.list('adviser_authorisations')
  return {
    questions: COMPLIANCE_QUESTIONS,
    advisers: [...new Set(auths.map((a) => a.user_id))].map((id) => {
      const u = p.repo.get('app_users', id)
      return { user_id: id, name: u?.full_name ?? 'Unknown', role: u?.role ?? '', categories: auths.filter((a) => a.user_id === id).map((a) => ({ ...a, label: FAIS_LABEL[a.product_category] })) }
    }),
    findings: p.repo
      .list('tasks', (t) => t.status === 'open' && t.created_by_agent === 'compliance_monitor')
      .map((t) => ({ id: t.id, title: t.title, detail: t.detail, created_at: t.created_at, link: t.subject_table === 'policies' ? `/broker/life/policies/${t.subject_id}` : null })),
  }
}
