// Commercial request handlers shaped like the future FastAPI routes (/api/v1/commercial/...). Reached only via src/api/client.ts.
import { principal, requireCustomer, requireRole, STAFF_ROLES, summariseJob, type Auth, type JobSummary } from './api'
import { activeCommercialJob, BUSINESS_WORKFLOWS, COMMERCIAL_REVIEW, RISK_ASSESSMENT, startCommercialReview, startTwinBuild } from './agents/commercialOrchestrator'
import { DEMO_SUBMISSION_PROFILE_IDS, demoDecisions, sectionDecision } from './demo/completedSubmissions'
import { insertDemoBusinesses } from './demo/demoBusinesses'
import { configureRunner, kick, onApprovalResolved } from './jobs/runner'
import type {
  BusinessActivity,
  BusinessLegalEntity,
  BusinessLocation,
  BusinessProfile,
  BusinessRiskProfile,
  CommercialAsset,
  CommercialSubmission,
  CoverageStatus,
  IndustryRiskTemplate,
  RiskAssessmentRecord,
  RiskDependency,
  RiskExposure,
  RiskPriority,
  SubmissionSection,
  Task,
} from './db/commercialSchema'
import type { ApprovalRequest, Communication, Customer } from './db/schema'
import type { Repo } from './db/store'
import { coverLabel, coverOrder } from './domain/commercial/coverClasses'
import { audit } from './lib/audit'
import { hashPayload } from './lib/hash'
import { ToolError } from './lib/errors'
import type { EditableProfileField } from './tools/business'
import { templateFor } from './tools/risk'
import { invokeTool } from './tools/registry'

const nameOf = (p: BusinessProfile) => p.trading_name ?? p.registered_name
const currentTwin = (repo: Repo, profileId: string) =>
  repo.find('business_risk_profiles', (r) => r.business_profile_id === profileId && r.status === 'current') ?? null
const latestSubmission = (repo: Repo, profileId: string) =>
  repo.list('commercial_submissions', (s) => s.business_profile_id === profileId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null

// ---------------------------------------------------------------- public catalogue

export function listIndustries(): IndustryRiskTemplate[] {
  const p = principal({ userId: null })
  return p.repo.list('industry_risk_templates', (t) => t.is_active).sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------- broker: clients

export interface BusinessRow {
  profile: BusinessProfile
  customer_name: string
  industry_name: string
  location_count: number
  asset_count: number
  exposure_count: number
  high_priority_count: number
  assigned_broker: string | null
  /** As declared on the current cover; never turned into a date. */
  renewal_month: string | null
  twin_version: number | null
  submission: Pick<CommercialSubmission, 'id' | 'status' | 'completeness'> | null
  open_broker_tasks: number
  open_customer_tasks: number
  active_job_id: string | null
}

function businessRow(repo: Repo, profile: BusinessProfile): BusinessRow {
  const twin = currentTwin(repo, profile.id)
  const exposures = twin ? repo.list('risk_exposures', (e) => e.risk_profile_id === twin.id) : []
  const tasks = repo.list('tasks', (t) => t.subject_id === profile.id && t.status === 'open')
  const sub = latestSubmission(repo, profile.id)
  const job = activeCommercialJob(repo, profile.customer_id)
  return {
    profile,
    customer_name: repo.get('customers', profile.customer_id)?.full_name ?? 'Unknown',
    industry_name: templateFor(repo, profile.industry_key).name,
    location_count: repo.list('business_locations', (l) => l.business_profile_id === profile.id).length,
    asset_count: repo.list('commercial_assets', (a) => a.business_profile_id === profile.id).length,
    exposure_count: exposures.length,
    high_priority_count: exposures.filter((e) => e.priority === 'high').length,
    assigned_broker: profile.assigned_broker_id ? (repo.get('app_users', profile.assigned_broker_id)?.full_name ?? null) : null,
    renewal_month: profile.existing_cover?.renewal_month ?? null,
    twin_version: twin?.version ?? null,
    submission: sub ? { id: sub.id, status: sub.status, completeness: sub.completeness } : null,
    open_broker_tasks: tasks.filter((t) => t.audience === 'broker').length,
    open_customer_tasks: tasks.filter((t) => t.audience === 'customer').length,
    active_job_id: job?.id ?? null,
  }
}

export function listBusinessProfiles(auth: Auth): BusinessRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('business_profiles', (b) => b.status !== 'archived')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((b) => businessRow(p.repo, b))
}

export interface BusinessDetail {
  profile: BusinessProfile
  customer: Customer
  industry: IndustryRiskTemplate
  legal_entities: BusinessLegalEntity[]
  locations: BusinessLocation[]
  activities: BusinessActivity[]
  assets: CommercialAsset[]
  risk_profile: BusinessRiskProfile | null
  risk_versions: BusinessRiskProfile[]
  dependencies: RiskDependency[]
  exposures: RiskExposure[]
  assessment: RiskAssessmentRecord | null
  tasks: Task[]
  submissions: CommercialSubmission[]
  jobs: JobSummary[]
  approvals: ApprovalRequest[]
  assigned_broker: string | null
}

export function businessDetail(repo: Repo, profileId: string): BusinessDetail {
  const profile = repo.require('business_profiles', profileId)
  const of = <T extends { business_profile_id: string }>(rows: T[]) => rows.filter((r) => r.business_profile_id === profileId)
  const twin = currentTwin(repo, profileId)
  const order = { high: 0, medium: 1, low: 2 }
  const submissions = of(repo.list('commercial_submissions')).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    profile,
    customer: repo.require('customers', profile.customer_id),
    industry: templateFor(repo, profile.industry_key),
    legal_entities: of(repo.list('business_legal_entities')),
    locations: of(repo.list('business_locations')).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name)),
    activities: of(repo.list('business_activities')),
    assets: of(repo.list('commercial_assets')),
    risk_profile: twin,
    risk_versions: of(repo.list('business_risk_profiles')).sort((a, b) => b.version - a.version),
    dependencies: twin ? repo.list('risk_dependencies', (d) => d.risk_profile_id === twin.id) : [],
    exposures: twin ? repo.list('risk_exposures', (e) => e.risk_profile_id === twin.id).sort((a, b) => order[a.priority] - order[b.priority]) : [],
    assessment: twin ? (repo.find('risk_assessments', (a) => a.risk_profile_id === twin.id) ?? null) : null,
    tasks: repo.list('tasks', (t) => t.subject_id === profileId || submissions.some((s) => s.id === t.subject_id)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    submissions,
    jobs: repo
      .list('jobs', (j) => BUSINESS_WORKFLOWS.includes(j.workflow_type) && j.customer_id === profile.customer_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => summariseJob(repo, j)),
    approvals: repo.list('approval_requests', (a) => submissions.some((s) => s.id === a.subject_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    assigned_broker: profile.assigned_broker_id ? (repo.get('app_users', profile.assigned_broker_id)?.full_name ?? null) : null,
  }
}

export function getBusinessProfile(auth: Auth, body: { profile_id: string }): BusinessDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return businessDetail(p.repo, body.profile_id)
}

export function updateBusinessProfile(
  auth: Auth,
  body: { profile_id: string; changes: Partial<Record<EditableProfileField, string | number | null>>; verified: boolean },
): BusinessDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const ctx = { repo: p.repo, actor: p.actor }
  invokeTool('business.update_profile', { profile_id: body.profile_id, changes: body.changes, source: body.verified ? 'verified' : 'declared' }, ctx)
  const open = latestSubmission(p.repo, body.profile_id)
  if (open && ['draft', 'awaiting_approval'].includes(open.status)) invokeTool('underwriting.refresh_pack', { submission_id: open.id }, ctx)
  return businessDetail(p.repo, body.profile_id)
}

export function updateTask(auth: Auth, body: { task_id: string; status: Task['status'] }): Task {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<Task>('task.update', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- broker: Risk Twins

/** screened: exposures identified by a Twin build, no formal assessment yet. signed_off: approved by a broker. */
export type AssessmentStatus = 'not_assessed' | 'screened' | 'in_progress' | 'awaiting_review' | 'signed_off'

const ASSESSMENT_STATUS: Record<RiskAssessmentRecord['status'], AssessmentStatus> = {
  draft: 'screened',
  in_progress: 'in_progress',
  awaiting_review: 'awaiting_review',
  approved: 'signed_off',
  superseded: 'not_assessed',
}

export interface RiskTwinRow extends BusinessRow {
  risk_profile: BusinessRiskProfile
  priority_counts: Record<RiskPriority, number>
  coverage: Record<CoverageStatus, number>
  /** Exposures whose coverage is unknown or still awaiting broker review. */
  coverage_gap_count: number
  assessment_status: AssessmentStatus
  last_assessed_at: string | null
}

export interface RiskTwinPortfolio {
  twins: RiskTwinRow[]
  without_twin: BusinessRow[]
}

const UNCONFIRMED: CoverageStatus[] = ['unknown', 'awaiting_broker_review']

export function getRiskTwinPortfolio(auth: Auth): RiskTwinPortfolio {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const rows = listBusinessProfiles(auth)
  const twins: RiskTwinRow[] = []
  const without_twin: BusinessRow[] = []
  rows.forEach((row) => {
    const rp = currentTwin(p.repo, row.profile.id)
    if (!rp) return void without_twin.push(row)
    const exposures = p.repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id)
    const coverage: Record<CoverageStatus, number> = { confirmed_covered: 0, confirmed_excluded: 0, potentially_covered: 0, unknown: 0, awaiting_broker_review: 0 }
    const priority_counts: Record<RiskPriority, number> = { high: 0, medium: 0, low: 0 }
    exposures.forEach((e) => {
      coverage[e.coverage_status]++
      priority_counts[e.priority]++
    })
    const live = p.repo
      .list('risk_assessments', (a) => a.business_profile_id === row.profile.id && a.status !== 'superseded')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const assessment = live.find((a) => a.status !== 'draft' && a.risk_profile_id === rp.id) ?? live.find((a) => a.risk_profile_id === rp.id) ?? live[0]
    const running = p.repo.find('jobs', (j) => j.workflow_type === RISK_ASSESSMENT && j.customer_id === row.profile.customer_id && !['completed', 'failed', 'cancelled', 'awaiting_approval'].includes(j.status))
    twins.push({
      ...row,
      risk_profile: rp,
      priority_counts,
      coverage,
      coverage_gap_count: exposures.filter((e) => UNCONFIRMED.includes(e.coverage_status)).length,
      assessment_status: running || (row.active_job_id && !assessment) ? 'in_progress' : assessment ? ASSESSMENT_STATUS[assessment.status] : 'not_assessed',
      last_assessed_at: assessment?.created_at ?? null,
    })
  })
  twins.sort((a, b) => b.risk_profile.created_at.localeCompare(a.risk_profile.created_at))
  return { twins, without_twin }
}

export function startTwinBuildForProfile(auth: Auth, body: { profile_id: string }): { job_id: string; reused: boolean } {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const { job, reused } = startTwinBuild(p.repo, p.actor, body.profile_id)
  return { job_id: job.id, reused }
}

export function loadDemoBusinesses(auth: Auth): { inserted: number; builds_started: number; profile_ids: string[] } {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const { inserted, profile_ids } = insertDemoBusinesses(p.repo)
  if (inserted) audit(p.repo, p.actor, 'demo.load_businesses', null, { after: { inserted, profile_ids } }, null)
  let builds_started = 0
  profile_ids.forEach((id) => {
    if (currentTwin(p.repo, id)) return
    if (!startTwinBuild(p.repo, p.actor, id).reused) builds_started++
  })
  return { inserted, builds_started, profile_ids }
}

export interface CompletedSubmissionsResult {
  completed: number
  already_completed: number
  failed: Array<{ business_name: string; reason: string }>
}

/**
 * Takes each synthetic demo business through the full review workflow: Risk Twin, exposures, draft pack, broker decisions on
 * every proposed section, broker approval by the signed-in person and "ready for market". Businesses that already have a
 * ready-for-market pack are left alone.
 */
export async function loadCompletedSubmissions(auth: Auth): Promise<CompletedSubmissionsResult> {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const { inserted } = insertDemoBusinesses(p.repo)
  if (inserted) audit(p.repo, p.actor, 'demo.load_businesses', null, { after: { inserted } }, null)

  const result: CompletedSubmissionsResult = { completed: 0, already_completed: 0, failed: [] }
  const previous = configureRunner({ stepDelayMs: 0 })
  try {
    for (const profileId of DEMO_SUBMISSION_PROFILE_IDS) {
      const profile = p.repo.require('business_profiles', profileId)
      if (latestSubmission(p.repo, profileId)?.status === 'ready_for_market') {
        result.already_completed++
        continue
      }
      try {
        await completeDemoSubmission(p.repo, auth, profileId)
        result.completed++
      } catch (e) {
        result.failed.push({ business_name: nameOf(profile), reason: e instanceof Error ? e.message : String(e) })
      }
    }
  } finally {
    configureRunner(previous)
  }
  if (result.completed) audit(p.repo, p.actor, 'demo.load_completed_submissions', null, { after: { completed: result.completed } }, null)
  return result
}

async function completeDemoSubmission(repo: Repo, auth: Auth, profileId: string) {
  const p = principal(auth)
  const profile = repo.require('business_profiles', profileId)
  let job = activeCommercialJob(repo, profile.customer_id)
  if (job && job.workflow_type !== COMMERCIAL_REVIEW) {
    await kick(repo.tenantId, job.id)
    job = undefined
  }
  job ??= startCommercialReview(repo, p.actor, { source: 'broker_copilot', business_profile_id: profileId })
  await kick(repo.tenantId, job.id)

  job = repo.require('jobs', job.id)
  if (job.status !== 'awaiting_approval') throw new Error(`The review stopped at "${job.status.replace(/_/g, ' ')}"`)
  const submissionId = (job.outputs as { submission?: { submission_id?: string } } | null)?.submission?.submission_id
  if (!submissionId) throw new Error('The review did not produce a submission pack')

  const decisions = demoDecisions(profileId)
  repo
    .list('submission_sections', (x) => x.submission_id === submissionId && x.status === 'proposed')
    .forEach((x) => invokeTool('underwriting.update_section', { section_id: x.id, ...sectionDecision(x, decisions) }, { repo, actor: p.actor }))

  if (submissionDetail(repo, submissionId).approval_state === 'pending_stale') requestSubmissionApproval(auth, { submission_id: submissionId })
  const pending = submissionDetail(repo, submissionId).pending_approval
  if (!pending) throw new Error('No pending approval for the pack')
  invokeTool(
    'approval.resolve',
    { approval_id: pending.id, decision: 'approved', note: 'Sections, limits and notes reviewed. Approved as ready for market.', payload_hash: pending.payload_hash },
    { repo, actor: p.actor },
  )
  onApprovalResolved(repo, pending.id)
  await kick(repo.tenantId, job.id)

  if (repo.require('commercial_submissions', submissionId).status !== 'ready_for_market') throw new Error('The pack was approved but not finalised')
}

// ---------------------------------------------------------------- broker: submissions

export interface SubmissionRow {
  submission: CommercialSubmission
  profile_id: string
  business_name: string
  industry_name: string
  section_count: number
  pending_approval: boolean
}

export function listSubmissions(auth: Auth): SubmissionRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('commercial_submissions')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((s) => {
      const profile = p.repo.require('business_profiles', s.business_profile_id)
      return {
        submission: s,
        profile_id: profile.id,
        business_name: nameOf(profile),
        industry_name: templateFor(p.repo, profile.industry_key).name,
        section_count: p.repo.list('submission_sections', (x) => x.submission_id === s.id).length,
        pending_approval: p.repo.list('approval_requests', (a) => a.subject_id === s.id && a.status === 'pending').length > 0,
      }
    })
}

export interface SectionView extends SubmissionSection {
  label: string
}

export type SubmissionApprovalState = 'none' | 'pending_current' | 'pending_stale' | 'approved' | 'changes_requested' | 'rejected'

export interface SubmissionDetail {
  submission: CommercialSubmission
  sections: SectionView[]
  business: BusinessDetail
  pending_approval: ApprovalRequest | null
  approval_state: SubmissionApprovalState
  can_request_approval: boolean
  job: JobSummary | null
}

function submissionDetail(repo: Repo, submissionId: string): SubmissionDetail {
  const submission = repo.require('commercial_submissions', submissionId)
  const approvals = repo
    .list('approval_requests', (a) => a.subject_id === submissionId && a.approval_type === 'underwriting_submission')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pending = approvals.find((a) => a.status === 'pending') ?? null
  const latest = approvals.find((a) => a.status !== 'cancelled')
  const job = submission.job_id ? repo.get('jobs', submission.job_id) : undefined
  const hash = hashPayload(submission.pack)
  const state: SubmissionApprovalState = pending
    ? pending.payload_hash === hash
      ? 'pending_current'
      : 'pending_stale'
    : latest?.status === 'approved'
      ? 'approved'
      : latest?.status === 'changes_requested'
        ? 'changes_requested'
        : latest?.status === 'rejected'
          ? 'rejected'
          : 'none'
  return {
    submission,
    sections: repo
      .list('submission_sections', (x) => x.submission_id === submissionId)
      .sort((a, b) => coverOrder(a.cover_class) - coverOrder(b.cover_class))
      .map((x) => ({ ...x, label: coverLabel(x.cover_class) })),
    business: businessDetail(repo, submission.business_profile_id),
    pending_approval: pending,
    approval_state: state,
    can_request_approval: Boolean(submission.pack && job?.status === 'awaiting_approval' && state === 'pending_stale'),
    job: job ? summariseJob(repo, job) : null,
  }
}

export function getSubmission(auth: Auth, body: { submission_id: string }): SubmissionDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return submissionDetail(p.repo, body.submission_id)
}

export function updateSubmissionSection(
  auth: Auth,
  body: { section_id: string; status?: SubmissionSection['status']; sum_insured?: number | null; limit_of_indemnity?: number | null; notes?: string | null },
): SubmissionDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const out = invokeTool<{ section: SubmissionSection }>('underwriting.update_section', body, { repo: p.repo, actor: p.actor })
  return submissionDetail(p.repo, out.section.submission_id)
}

/** Re-pins the pending approval to the pack as it is now, after the broker edited it. */
export function requestSubmissionApproval(auth: Auth, body: { submission_id: string }): SubmissionDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const detail = submissionDetail(p.repo, body.submission_id)
  if (!detail.can_request_approval || !detail.submission.pack) {
    throw new ToolError('conflict', 'Approval can be re-requested only while the review job is waiting for approval and the pack has changed')
  }
  const s = detail.submission
  invokeTool(
    'approval.request',
    {
      approval_type: 'underwriting_submission',
      subject_table: 'commercial_submissions',
      subject_id: s.id,
      summary: `Approve the ${s.pack!.business.trading_name ?? s.pack!.business.registered_name} submission pack as ready for market (${s.pack!.sections.length} sections, simulated, edited by broker)`,
      proposed_changes: s.pack,
      risk_flags: detail.pending_approval?.risk_flags ?? [],
      evidence: detail.pending_approval?.evidence ?? [],
    },
    { repo: p.repo, actor: p.actor, jobId: s.job_id },
  )
  return submissionDetail(p.repo, s.id)
}

// ---------------------------------------------------------------- customer portal

export interface PortalBusinessView {
  customer: Customer
  profile: BusinessProfile
  industry_name: string
  locations: BusinessLocation[]
  assets: CommercialAsset[]
  activities: BusinessActivity[]
  exposures: Array<Pick<RiskExposure, 'id' | 'title' | 'description' | 'category' | 'coverage_status'> & { classes: string[] }>
  review_status: string
  open_requests: Task[]
  completed_requests: Task[]
  notifications: Communication[]
}

const CUSTOMER_REVIEW_LABEL: Record<CommercialSubmission['status'], string> = {
  draft: 'Your broker is preparing your review',
  awaiting_approval: 'With your broker for review',
  approved: 'Approved by your broker',
  ready_for_market: 'Reviewed by your broker. Not yet sent to any insurer',
  rejected: 'Your broker will contact you',
}

export function getPortalBusiness(auth: Auth): PortalBusinessView {
  const p = principal(auth)
  const customer = requireCustomer(p)
  const profile = p.repo.find('business_profiles', (b) => b.customer_id === customer.id)
  if (!profile) throw new ToolError('not_found', 'No business profile is linked to this customer.')
  const twin = currentTwin(p.repo, profile.id)
  const sub = latestSubmission(p.repo, profile.id)
  const tasks = p.repo.list('tasks', (t) => t.subject_id === profile.id && t.audience === 'customer')
  return {
    customer,
    profile,
    industry_name: templateFor(p.repo, profile.industry_key).name,
    locations: p.repo.list('business_locations', (l) => l.business_profile_id === profile.id),
    assets: p.repo.list('commercial_assets', (a) => a.business_profile_id === profile.id),
    activities: p.repo.list('business_activities', (a) => a.business_profile_id === profile.id),
    exposures: twin
      ? p.repo
          .list('risk_exposures', (e) => e.risk_profile_id === twin.id)
          .map((e) => ({ id: e.id, title: e.title, description: e.description, category: e.category, coverage_status: e.coverage_status, classes: e.potential_classes.map(coverLabel) }))
      : [],
    review_status: sub ? CUSTOMER_REVIEW_LABEL[sub.status] : 'Your review has not started yet',
    open_requests: tasks.filter((t) => t.status === 'open'),
    completed_requests: tasks.filter((t) => t.status === 'done'),
    notifications: p.repo
      .list('communications', (c) => c.customer_id === customer.id && c.channel === 'in_app' && c.status === 'sent')
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}
