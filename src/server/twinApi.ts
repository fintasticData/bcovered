// Risk Twin workspace handlers shaped like the future FastAPI routes (/api/v1/commercial/twins/...). Reached only via src/api/client.ts.
import { principal, requireRole, STAFF_ROLES, summariseJob, type Auth, type JobSummary } from './api'
import { RISK_ASSESSMENT, RISK_INVESTIGATION, startAssessment, startInvestigation } from './agents/commercialOrchestrator'
import type { InvestigationInputs } from './agents/commercial/assessment'
import { businessDetail, type BusinessDetail } from './commercialApi'
import type {
  AssessmentType,
  BusinessDependencyLink,
  BusinessDocument,
  CompletenessItem,
  CoverageFinding,
  CoverageStatus,
  InsurancePolicy,
  PolicySection,
  RiskAssessmentFinding,
  RiskAssessmentRecord,
  RiskTwinChangeEvent,
  TwinTable,
  TwinUpdateProposal,
  AssessmentPriority,
  Task,
} from './db/commercialSchema'
import type { ApprovalRequest } from './db/schema'
import type { Repo } from './db/store'
import { coverLabel } from './domain/commercial/coverClasses'
import { fixturesFor } from './domain/commercial/documentFixtures'
import { describeNode, type ImpactReport, type TraceResult } from './domain/commercial/graph'
import { compareValuations, type ValuationFinding } from './domain/commercial/valuation'
import { ToolError } from './lib/errors'
import { ASSESSMENT_TYPE_LABEL, completenessFor, refreshOpenAssessments } from './tools/assessment'
import { db } from './db/store'
import { profileSnapshot } from './tools/business'
import { describeProposal } from './tools/coverage'
import { invokeTool, type Actor } from './tools/registry'
import { comparisonBaseline, currentTwinOf, type ChangeReport, type NodeDetail } from './tools/twin'

const DOCUMENT_AGENT: Actor = { type: 'agent', id: 'document_intelligence', role: 'agent' }

const staff = (auth: Auth) => {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return { ...p, ctx: { repo: p.repo, actor: p.actor } }
}

export type StageStatus = 'completed' | 'in_progress' | 'review_required' | 'not_started' | 'pending'

export interface WorkflowStage {
  key: 'discovery' | 'assets' | 'exposures' | 'insurance' | 'signoff'
  label: string
  status: StageStatus
  detail: string
}

export interface InvestigationView extends JobSummary {
  kind: InvestigationInputs['kind']
  exposure_title: string | null
  findings: Array<{ title: string; detail: string; status: string; page_ref: string | null }>
  actions: Array<{ title: string; detail: string; audience: string }>
}

export interface LinkView extends BusinessDependencyLink {
  from_label: string
  to_label: string
}

export interface ProposalView extends TwinUpdateProposal {
  current_text: string
  suggested_text: string
  document_name: string
}

export interface TwinWorkspace {
  business: BusinessDetail
  links: LinkView[]
  assessments: RiskAssessmentRecord[]
  /** The latest assessment that is not superseded: a formal one if any, else the exposure screening. */
  assessment: RiskAssessmentRecord | null
  findings: RiskAssessmentFinding[]
  completeness: CompletenessItem[]
  policies: InsurancePolicy[]
  sections: PolicySection[]
  coverage: CoverageFinding[]
  documents: BusinessDocument[]
  proposals: ProposalView[]
  samples: Array<{ key: string; file_name: string; doc_type: string; summary: string; added: boolean }>
  changes: RiskTwinChangeEvent[]
  baseline: { label: string; version: number } | null
  investigations: InvestigationView[]
  assessment_jobs: JobSummary[]
  pending_approvals: ApprovalRequest[]
  valuations: ValuationFinding[]
  stages: WorkflowStage[]
  kpis: { exposures: number; information_requests: number; verified_facts: number; declared_facts: number; inferred_links: number; open_broker_tasks: number }
  assessment_type_labels: Record<AssessmentType, string>
}

const TERMINAL = ['completed', 'failed', 'cancelled']
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

function countFacts(repo: Repo, profileId: string) {
  const s = profileSnapshot(repo, profileId)
  const sources = [
    ...Object.values(s.profile.field_sources),
    ...s.legal_entities.map((e) => e.source),
    ...s.locations.map((l) => l.source),
    ...s.activities.map((a) => a.source),
    ...s.assets.map((a) => a.source),
  ]
  return { verified: sources.filter((x) => x === 'verified').length, declared: sources.filter((x) => x === 'declared' || x === 'extracted').length }
}

function stagesFor(w: Omit<TwinWorkspace, 'stages' | 'kpis' | 'assessment_type_labels'>): WorkflowStage[] {
  const c = Object.fromEntries(w.completeness.map((x) => [x.key, x])) as Record<CompletenessItem['key'], CompletenessItem>
  const formal = w.assessment && w.assessment.status !== 'draft' ? w.assessment : null
  const running = w.assessment_jobs.find((j) => !TERMINAL.includes(j.status))
  const exposures = w.business.exposures
  const reviewed = exposures.filter((e) => w.coverage.some((f) => f.exposure_id === e.id && f.reviewed_by))
  const proposed = exposures.filter((e) => w.coverage.some((f) => f.exposure_id === e.id))
  const fromCompleteness = (x: CompletenessItem | undefined): StageStatus =>
    !x ? 'not_started' : x.status === 'complete' ? 'completed' : x.status === 'missing' ? 'not_started' : 'review_required'
  const assetStatus: StageStatus =
    c.assets?.status === 'complete' && c.dependencies?.status === 'complete' ? 'completed' : c.assets?.status === 'missing' ? 'not_started' : 'review_required'
  return [
    {
      key: 'discovery',
      label: 'Business discovery',
      status: fromCompleteness(c.business),
      detail: c.business?.missing.length ? `Missing: ${c.business.missing.slice(0, 3).join(', ')}` : 'Business profile complete',
    },
    {
      key: 'assets',
      label: 'Assets and dependencies',
      status: assetStatus,
      detail: [...(c.assets?.missing ?? []), ...(c.dependencies?.missing ?? [])].slice(0, 2).join('; ') || 'Assets and dependencies recorded',
    },
    {
      key: 'exposures',
      label: 'Risk exposure analysis',
      status: !w.business.risk_profile ? 'not_started' : running && !formal?.status.match(/awaiting|approved/) ? 'in_progress' : formal ? 'completed' : 'in_progress',
      detail: !w.business.risk_profile
        ? 'Build the Risk Twin first'
        : formal
          ? `${w.findings.length} findings, ${w.findings.filter((f) => f.is_priority_area).length} priority areas`
          : `${exposures.length} exposures screened; run an assessment to prioritise them`,
    },
    {
      key: 'insurance',
      label: 'Insurance evidence review',
      status: !w.policies.length ? 'not_started' : reviewed.length === exposures.length && exposures.length ? 'completed' : proposed.length ? 'review_required' : 'in_progress',
      detail: !w.policies.length
        ? 'No policy schedule on file'
        : `${proposed.length} of ${exposures.length} exposures checked against policy evidence, ${reviewed.length} reviewed by a broker`,
    },
    {
      key: 'signoff',
      label: 'Broker sign-off',
      status: formal?.status === 'approved' ? 'completed' : 'pending',
      detail: formal?.status === 'approved' ? `Signed off ${longDate(formal.updated_at)}` : formal?.status === 'awaiting_review' ? 'Awaiting your sign-off' : 'No assessment submitted yet',
    },
  ]
}

function investigationView(repo: Repo, j: JobSummary): InvestigationView {
  const inputs = j.inputs as unknown as InvestigationInputs
  const out = (j.outputs ?? {}) as { investigate?: { findings?: InvestigationView['findings']; actions?: InvestigationView['actions'] } }
  return {
    ...j,
    kind: inputs.kind,
    exposure_title: inputs.exposure_id ? (repo.get('risk_exposures', inputs.exposure_id)?.title ?? null) : null,
    findings: out.investigate?.findings ?? [],
    actions: out.investigate?.actions ?? [],
  }
}

export function twinWorkspace(repo: Repo, profileId: string): TwinWorkspace {
  const business = businessDetail(repo, profileId)
  const of = <T extends { business_profile_id: string }>(rows: T[]) => rows.filter((r) => r.business_profile_id === profileId)
  const label = (t: TwinTable, id: string) => describeNode(repo, t, id)?.label ?? 'Removed record'
  const assessments = of(repo.list('risk_assessments')).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const live = assessments.filter((a) => a.status !== 'superseded')
  const assessment = live.find((a) => a.status !== 'draft') ?? live[0] ?? null
  const jobs = repo
    .list('jobs', (j) => j.customer_id === business.profile.customer_id && [RISK_ASSESSMENT, RISK_INVESTIGATION].includes(j.workflow_type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((j) => summariseJob(repo, j))
  const documents = of(repo.list('business_documents')).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const policies = of(repo.list('insurance_policies'))
  const sections = of(repo.list('policy_sections'))
  const base = comparisonBaseline(repo, profileId)
  const partial = {
    business,
    links: of(repo.list('business_dependency_links'))
      .filter((l) => l.status === 'active')
      .map((l) => ({ ...l, from_label: label(l.from_table, l.from_id), to_label: label(l.to_table, l.to_id) })),
    assessments,
    assessment,
    findings: assessment ? repo.list('risk_assessment_findings', (f) => f.assessment_id === assessment.id).sort((a, b) => a.rank - b.rank) : [],
    completeness: completenessFor(repo, profileId, assessment),
    policies,
    sections,
    coverage: of(repo.list('coverage_findings')),
    documents,
    proposals: of(repo.list('twin_update_proposals'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({ ...p, ...(({ current, suggested }) => ({ current_text: current, suggested_text: suggested }))(describeProposal(p)), document_name: documents.find((d) => d.id === p.document_id)?.file_name ?? 'Document' })),
    samples: fixturesFor(profileId).map((f) => ({ key: f.key, file_name: f.file_name, doc_type: f.doc_type, summary: f.summary, added: documents.some((d) => d.fixture_key === f.key && d.status !== 'rejected') })),
    changes: of(repo.list('risk_twin_change_events')).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    baseline: base ? { label: base.label, version: base.rp.version } : null,
    investigations: jobs.filter((j) => j.workflow_type === RISK_INVESTIGATION).map((j) => investigationView(repo, j)),
    assessment_jobs: jobs.filter((j) => j.workflow_type === RISK_ASSESSMENT),
    pending_approvals: repo.list(
      'approval_requests',
      (a) => a.status === 'pending' && ((a.subject_table === 'risk_assessments' && assessments.some((x) => x.id === a.subject_id)) || (a.subject_table === 'jobs' && jobs.some((j) => j.id === a.subject_id))),
    ),
    valuations: compareValuations(business.assets, policies, sections),
  }
  const facts = countFacts(repo, profileId)
  return {
    ...partial,
    stages: stagesFor(partial),
    kpis: {
      exposures: business.exposures.length,
      information_requests: business.tasks.filter((t) => t.status === 'open' && t.audience === 'customer').length,
      verified_facts: facts.verified,
      declared_facts: facts.declared,
      inferred_links: partial.links.filter((l) => l.source === 'inferred').length,
      open_broker_tasks: business.tasks.filter((t) => t.status === 'open' && t.audience === 'broker').length,
    },
    assessment_type_labels: ASSESSMENT_TYPE_LABEL,
  }
}

// ---------------------------------------------------------------- handlers

export function getTwinWorkspace(auth: Auth, body: { profile_id: string }): TwinWorkspace {
  const p = staff(auth)
  return twinWorkspace(p.repo, body.profile_id)
}

export function startAssessmentForProfile(auth: Auth, body: { profile_id: string; assessment_type: AssessmentType; focus?: string }) {
  const p = staff(auth)
  const { job, reused } = startAssessment(p.repo, p.actor, body.profile_id, body.assessment_type, undefined, body.focus)
  return { job_id: job.id, reused }
}

export function startInvestigationForProfile(auth: Auth, body: { profile_id: string; kind: InvestigationInputs['kind']; exposure_id?: string; node_id?: string }) {
  const p = staff(auth)
  const { job, reused } = startInvestigation(p.repo, p.actor, body.profile_id, body.kind, { exposure_id: body.exposure_id, node_id: body.node_id })
  return { job_id: job.id, reused }
}

export function getTwinNode(auth: Auth, body: { risk_profile_id: string; table: TwinTable; id: string }): NodeDetail {
  return invokeTool<NodeDetail>('risk.get_node', body, staff(auth).ctx)
}

export function traceTwinImpact(auth: Auth, body: { risk_profile_id: string; table: TwinTable; id: string }): ImpactReport {
  return invokeTool<ImpactReport>('risk.trace_impact', body, staff(auth).ctx)
}

export function traceTwinDependencies(auth: Auth, body: { risk_profile_id: string; table: TwinTable; id: string }): TraceResult {
  return invokeTool<TraceResult>('risk.trace_dependencies', { ...body, direction: 'upstream' }, staff(auth).ctx)
}

export function overrideExposurePriority(auth: Auth, body: { exposure_id: string; priority: AssessmentPriority | null; reason: string }) {
  invokeTool('risk.override_priority', body, staff(auth).ctx)
  return { ok: true }
}

export function decideFinding(auth: Auth, body: { finding_id: string; status: 'accepted' | 'rejected' | 'proposed'; note?: string | null }) {
  return invokeTool<RiskAssessmentFinding>('risk.finding_decide', body, staff(auth).ctx)
}

export function reviewCoverageFinding(auth: Auth, body: { finding_id: string; status: CoverageStatus; note?: string | null }) {
  return invokeTool<CoverageFinding>('risk.coverage_review_finding', body, staff(auth).ctx)
}

export function checkCoverageEvidence(auth: Auth, body: { profile_id: string }) {
  const p = staff(auth)
  const rp = currentTwinOf(p.repo, body.profile_id)
  if (!rp) throw new ToolError('conflict', 'Build the Risk Twin before checking coverage')
  const agent: Actor = { type: 'agent', id: 'coverage_analyst', role: 'agent' }
  const findings = p.repo
    .list('risk_exposures', (e) => e.risk_profile_id === rp.id)
    .map((e) => invokeTool<CoverageFinding>('risk.coverage_compare_exposure', { exposure_id: e.id }, { repo: p.repo, actor: agent }))
  db.transaction(() => refreshOpenAssessments(p.repo, body.profile_id))
  return { checked: findings.length }
}

export function addBusinessDocument(auth: Auth, body: { profile_id: string; fixture_key?: string; file_name?: string; file_size?: number | null }) {
  const p = staff(auth)
  const doc = invokeTool<BusinessDocument>('document.register', body, p.ctx)
  const agent = { repo: p.repo, actor: DOCUMENT_AGENT }
  const extraction = invokeTool<{ extracted: boolean }>('document.extract_business_facts', { document_id: doc.id }, agent)
  const proposals = extraction.extracted ? invokeTool<TwinUpdateProposal[]>('document.propose_twin_updates', { document_id: doc.id }, agent) : []
  return { document_id: doc.id, extracted: extraction.extracted, proposals: proposals.length }
}

export function decideTwinProposal(auth: Auth, body: { proposal_id: string; decision: 'apply' | 'reject'; confirm_conflict?: boolean }) {
  return invokeTool<TwinUpdateProposal>('document.apply_proposal', body, staff(auth).ctx)
}

export function compareTwinWithBaseline(auth: Auth, body: { profile_id: string }): ChangeReport {
  return invokeTool<ChangeReport>('risk.compare_versions', { profile_id: body.profile_id }, staff(auth).ctx)
}

export function gatherMissingInformation(auth: Auth, body: { profile_id: string }) {
  const p = staff(auth)
  const rp = currentTwinOf(p.repo, body.profile_id)
  if (!rp) throw new ToolError('conflict', 'Build the Risk Twin first')
  const assessment = p.repo
    .list('risk_assessments', (a) => a.risk_profile_id === rp.id && a.status !== 'superseded')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!assessment) return { created: invokeTool<{ created: number }>('risk.identify_gaps', { risk_profile_id: rp.id }, p.ctx).created }
  return { created: invokeTool<{ created: number }>('risk.assessment_identify_gaps', { assessment_id: assessment.id }, p.ctx).created }
}

export function createTwinTask(
  auth: Auth,
  body: { profile_id: string; node_id: string; kind: 'broker_review' | 'information_request'; title: string; detail?: string | null },
) {
  const p = staff(auth)
  const profile = p.repo.require('business_profiles', body.profile_id)
  return invokeTool<{ task: Task; created: boolean }>(
    'task.create',
    {
      customer_id: profile.customer_id,
      subject_table: 'business_profiles',
      subject_id: profile.id,
      kind: body.kind,
      audience: body.kind === 'information_request' ? 'customer' : 'broker',
      title: body.title,
      detail: body.detail ?? null,
      assigned_to: body.kind === 'broker_review' ? (profile.assigned_broker_id ?? p.user?.id ?? null) : null,
      due_in_days: body.kind === 'broker_review' ? 3 : 7,
      dedupe_key: `${profile.id}:node:${body.node_id}:${body.title.toLowerCase()}`,
    },
    p.ctx,
  )
}

export function decideDependency(auth: Auth, body: { link_id: string; decision: 'confirm' | 'reject' }) {
  return invokeTool<BusinessDependencyLink>('risk.confirm_dependency', body, staff(auth).ctx)
}

export function updateCommercialAsset(
  auth: Auth,
  body: { asset_id: string; quantity?: number; declared_value?: number | null; value_basis?: 'replacement' | 'market' | 'book' | 'unknown'; verified: boolean },
) {
  const { verified, ...changes } = body
  return invokeTool('business.update_asset', { ...changes, source: verified ? 'verified' : 'declared' }, staff(auth).ctx)
}

// ---------------------------------------------------------------- report

export interface ReportFact {
  label: string
  value: string
  source: string | null
}

export interface AssessmentReport {
  generated_at: string
  assessment: RiskAssessmentRecord
  type_label: string
  conclusions_approved: boolean
  signoff: { status: string; decided_by: string | null; decided_at: string | null; note: string | null }
  business: { name: string; registered_name: string; industry: string; broker: string | null; twin_version: number | null }
  overview: ReportFact[]
  operations: ReportFact[]
  locations: Array<{ name: string; facts: ReportFact[]; assets: ReportFact[] }>
  dependencies: Array<{ text: string; source: string }>
  findings: RiskAssessmentFinding[]
  insurance: Array<{ policy: string; source: string; sections: ReportFact[] }>
  coverage_gaps: string[]
  missing: Array<{ label: string; items: string[] }>
  investigations: Array<{ title: string; status: string; detail: string }>
  actions: Array<{ title: string; audience: string; due: string | null }>
  assumptions: string[]
}

export function getAssessmentReport(auth: Auth, body: { assessment_id: string }): AssessmentReport {
  const p = staff(auth)
  const repo = p.repo
  const a = repo.require('risk_assessments', body.assessment_id)
  const w = twinWorkspace(repo, a.business_profile_id)
  const b = w.business
  const prof = b.profile
  const money = (v: number | null) => (v === null ? 'Not recorded' : `R${v.toLocaleString('en-ZA')}`)
  const approval = a.approval_id ? repo.get('approval_requests', a.approval_id) : undefined
  const findings = repo.list('risk_assessment_findings', (f) => f.assessment_id === a.id).sort((x, y) => x.rank - y.rank)
  const recommended = findings
    .filter((f) => f.is_priority_area && ['unknown', 'awaiting_broker_review'].includes(f.coverage.status))
    .map((f) => ({ title: `Investigate coverage for “${f.title}”`, status: 'Recommended', detail: f.coverage.note }))
  return {
    generated_at: new Date().toISOString(),
    assessment: a,
    type_label: ASSESSMENT_TYPE_LABEL[a.assessment_type],
    conclusions_approved: a.status === 'approved',
    signoff: {
      status: a.status,
      decided_by: approval?.decided_by ? (repo.get('app_users', approval.decided_by)?.full_name ?? null) : null,
      decided_at: approval?.decided_at ?? null,
      note: approval?.decision_note ?? null,
    },
    business: {
      name: prof.trading_name ?? prof.registered_name,
      registered_name: prof.registered_name,
      industry: b.industry.name,
      broker: b.assigned_broker,
      twin_version: repo.get('business_risk_profiles', a.risk_profile_id)?.version ?? null,
    },
    overview: [
      { label: 'Registered name', value: prof.registered_name, source: prof.field_sources.registered_name ?? 'declared' },
      { label: 'Registration number', value: prof.registration_number ?? 'Not recorded', source: prof.registration_number ? (prof.field_sources.registration_number ?? 'declared') : 'missing' },
      { label: 'Industry', value: b.industry.name, source: prof.field_sources.industry_key ?? 'declared' },
      { label: 'Activities', value: prof.activities_summary ?? 'Not recorded', source: prof.activities_summary ? 'declared' : 'missing' },
      { label: 'Annual turnover', value: money(prof.annual_turnover), source: prof.annual_turnover === null ? 'missing' : (prof.field_sources.annual_turnover ?? 'declared') },
      { label: 'Employees', value: prof.employee_count === null ? 'Not recorded' : String(prof.employee_count), source: prof.field_sources.employee_count ?? 'declared' },
      { label: 'Years trading', value: prof.years_trading === null ? 'Not recorded' : String(prof.years_trading), source: prof.field_sources.years_trading ?? 'declared' },
      { label: 'Current insurer', value: prof.existing_cover?.insurer ?? 'Not recorded', source: prof.field_sources.existing_cover ?? 'missing' },
      { label: 'Claims in five years', value: prof.loss_history ? `${prof.loss_history.claims_last_5_years ?? '?'}${prof.loss_history.notes ? `: ${prof.loss_history.notes}` : ''}` : 'Not recorded', source: prof.field_sources.loss_history ?? 'missing' },
    ],
    operations: b.activities.map((x) => ({
      label: x.kind.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()),
      value: `${x.name}${x.share_of_revenue !== null ? ` (about ${Math.round(x.share_of_revenue * 100)}% of revenue)` : ''}`,
      source: x.source,
    })),
    locations: b.locations.map((l) => ({
      name: l.name,
      facts: [
        { label: 'Address', value: [l.suburb, l.city, l.province].filter(Boolean).join(', ') || 'Not recorded', source: l.source },
        { label: 'Occupancy and tenure', value: `${l.occupancy}, ${l.ownership}`, source: l.source },
        { label: 'Construction', value: l.construction ?? 'Not recorded', source: l.construction ? l.source : 'missing' },
        { label: 'Fire protection', value: l.fire_protection.join(', ') || 'None recorded', source: l.fire_protection.length ? l.source : 'missing' },
        { label: 'Security', value: l.security.join(', ') || 'None recorded', source: l.security.length ? l.source : 'missing' },
        { label: 'Backup power', value: l.backup_power === null ? 'Not stated' : l.backup_power ? 'Yes' : 'No', source: l.backup_power === null ? 'missing' : l.source },
      ],
      assets: b.assets
        .filter((x) => x.location_id === l.id)
        .map((x) => ({ label: x.description, value: `${x.quantity > 1 ? `${x.quantity} × ` : ''}${money(x.declared_value)} (${x.value_basis})`, source: x.declared_value === null ? 'missing' : x.source })),
    })),
    dependencies: w.links.map((l) => ({ text: `${l.from_label} ${l.relation} ${l.to_label}`, source: l.source })),
    findings,
    insurance: w.policies.map((pol) => ({
      policy: `${pol.insurer} ${pol.policy_number ?? ''}${pol.renewal_date ? `, renews ${longDate(pol.renewal_date)}` : ''}`.trim(),
      source: pol.source,
      sections: w.sections
        .filter((s) => s.policy_id === pol.id)
        .map((s) => ({
          label: `${s.section_name} (${coverLabel(s.cover_class)})`,
          value: `${s.sum_insured !== null ? `Sum insured ${money(s.sum_insured)}` : s.limit_of_indemnity !== null ? `Limit ${money(s.limit_of_indemnity)}` : 'No amount'}${s.exclusions.length ? ` · Exclusions: ${s.exclusions.join('; ')}` : ''}${s.page_ref ? ` · ${s.page_ref}` : ''}`,
          source: s.source,
        })),
    })),
    coverage_gaps: [
      ...findings.filter((f) => f.coverage.status !== 'potentially_covered' && f.coverage.status !== 'confirmed_covered').map((f) => `${f.title}: ${f.coverage.note}`),
      ...w.valuations.filter((v) => v.status === 'below_declared' || v.status === 'no_section').map((v) => v.finding),
    ],
    missing: w.completeness.filter((c) => c.missing.length).map((c) => ({ label: c.label, items: c.missing })),
    investigations: [
      ...w.investigations.map((i) => ({
        title: i.kind === 'underinsurance' ? 'Underinsurance investigation' : `Exposure investigation: ${i.exposure_title ?? ''}`,
        status: i.status.replace(/_/g, ' '),
        detail: i.findings.map((f) => f.detail).join(' '),
      })),
      ...recommended,
    ],
    actions: b.tasks.filter((t) => t.status === 'open').map((t) => ({ title: t.title, audience: t.audience, due: t.due_date })),
    assumptions: [
      'Potential exposures come from the industry template and the facts recorded. They are areas for a broker to investigate, not confirmed cover.',
      'Priorities are qualitative and explained by their listed factors. They are not actuarially validated.',
      'Values are as declared or as read from documents. No loss or premium has been estimated.',
      ...(w.documents.some((d) => d.is_simulated) ? ['Some document extractions in this demo come from synthetic sample documents and are labelled simulated.'] : []),
    ],
  }
}
