import type { AssessmentType } from '../db/commercialSchema'
import type { Job, Json } from '../db/schema'
import type { Repo } from '../db/store'
import { createJob, registerWorkflow } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import type { Actor } from '../tools/registry'
import {
  runAssessmentFinaliseStep,
  runAssessmentGapStep,
  runAssessmentReviewStep,
  runAssessStep,
  runCoverageStep,
  runEnsureTwinStep,
  runInvestigateStep,
  runInvestigationActionsStep,
  runInvestigationFinaliseStep,
  runInvestigationReviewStep,
  type AssessmentInputs,
  type InvestigationInputs,
} from './commercial/assessment'
import { runDiscoverStep, type CommercialReviewInputs } from './commercial/discovery'
import { runExposureStep, runGapStep, runTwinStep } from './commercial/riskAnalyst'
import {
  runCommercialSummaryStep,
  runFinaliseStep,
  runSubmissionApprovalStep,
  runSubmissionStep,
} from './commercial/underwriting'

export const COMMERCIAL_REVIEW = 'commercial_discovery_review'

registerWorkflow({
  type: COMMERCIAL_REVIEW,
  title: 'Business risk review to broker-approved submission pack',
  restartOnChangesFrom: 'submission',
  steps: [
    { key: 'discover', name: 'Build or retrieve the business profile', agent: 'business_discovery', run: runDiscoverStep },
    { key: 'twin', name: 'Build the Business Risk Twin', agent: 'industry_risk_analyst', run: runTwinStep },
    { key: 'exposures', name: 'Identify potential exposures', agent: 'industry_risk_analyst', run: runExposureStep },
    { key: 'gaps', name: 'Find missing information and request documents', agent: 'industry_risk_analyst', run: runGapStep },
    { key: 'submission', name: 'Draft the underwriting submission pack', agent: 'commercial_underwriting', run: runSubmissionStep },
    { key: 'summary', name: 'Write the broker review summary', agent: 'broker_copilot', run: runCommercialSummaryStep },
    { key: 'approval', name: 'Wait for broker approval', agent: 'approval_engine', run: runSubmissionApprovalStep },
    { key: 'finalise', name: 'Mark the pack ready for market', agent: 'approval_engine', run: runFinaliseStep },
  ],
})

export const RISK_TWIN_BUILD = 'risk_twin_build'

registerWorkflow({
  type: RISK_TWIN_BUILD,
  title: 'Build the Business Risk Twin from existing records',
  steps: [
    { key: 'discover', name: 'Retrieve the business profile', agent: 'business_discovery', run: runDiscoverStep },
    { key: 'twin', name: 'Build the Business Risk Twin', agent: 'industry_risk_analyst', run: runTwinStep },
    { key: 'exposures', name: 'Identify potential exposures', agent: 'industry_risk_analyst', run: runExposureStep },
    { key: 'gaps', name: 'Find missing information and request documents', agent: 'industry_risk_analyst', run: runGapStep },
  ],
})

export const RISK_ASSESSMENT = 'risk_assessment'

registerWorkflow({
  type: RISK_ASSESSMENT,
  title: 'Business risk assessment to broker sign-off',
  restartOnChangesFrom: 'assess',
  steps: [
    { key: 'discover', name: 'Retrieve the business profile', agent: 'business_discovery', run: runDiscoverStep },
    { key: 'twin', name: 'Load the Risk Twin', agent: 'industry_risk_analyst', run: runEnsureTwinStep },
    { key: 'exposures', name: 'Identify exposures from the industry template', agent: 'industry_risk_analyst', run: runExposureStep },
    { key: 'coverage', name: 'Check available insurance evidence', agent: 'coverage_analyst', run: runCoverageStep },
    { key: 'assess', name: 'Prioritise findings with explanations', agent: 'industry_risk_analyst', run: runAssessStep },
    { key: 'gaps', name: 'Request missing information and create review tasks', agent: 'industry_risk_analyst', run: runAssessmentGapStep },
    { key: 'review', name: 'Wait for broker sign-off', agent: 'approval_engine', run: runAssessmentReviewStep },
    { key: 'finalise', name: 'Save the signed-off assessment', agent: 'approval_engine', run: runAssessmentFinaliseStep },
  ],
})

export const RISK_INVESTIGATION = 'risk_investigation'

registerWorkflow({
  type: RISK_INVESTIGATION,
  title: 'Risk investigation to broker review',
  restartOnChangesFrom: 'investigate',
  steps: [
    { key: 'discover', name: 'Retrieve business and asset records', agent: 'business_discovery', run: runDiscoverStep },
    { key: 'twin', name: 'Load the Risk Twin', agent: 'industry_risk_analyst', run: runEnsureTwinStep },
    { key: 'investigate', name: 'Compare evidence and prepare findings', agent: 'risk_investigator', run: runInvestigateStep },
    { key: 'actions', name: 'Create proposed actions', agent: 'risk_investigator', run: runInvestigationActionsStep },
    { key: 'review', name: 'Wait for broker review', agent: 'approval_engine', run: runInvestigationReviewStep },
    { key: 'finalise', name: 'Close the investigation', agent: 'approval_engine', run: runInvestigationFinaliseStep },
  ],
})

/** Workflows that rebuild the Twin. Only one may be active per client at a time. */
export const COMMERCIAL_WORKFLOWS = [COMMERCIAL_REVIEW, RISK_TWIN_BUILD]

/** Every workflow that works on a business, for job lists. */
export const BUSINESS_WORKFLOWS = [COMMERCIAL_REVIEW, RISK_TWIN_BUILD, RISK_ASSESSMENT, RISK_INVESTIGATION]

const activeOf = (repo: Repo, customerId: string, types: string[], match: (j: Job) => boolean = () => true) =>
  repo
    .list('jobs', (j) => types.includes(j.workflow_type) && j.customer_id === customerId && !TERMINAL_STATUSES.includes(j.status) && match(j))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

/** Starts a formal assessment. Reuses an active assessment for the client, and waits for no Twin rebuild in progress. */
export function startAssessment(
  repo: Repo,
  actor: Actor,
  profileId: string,
  assessmentType: AssessmentType,
  request?: string,
  focus?: string,
): { job: Job; reused: boolean } {
  const profile = repo.require('business_profiles', profileId)
  const active = activeOf(repo, profile.customer_id, [RISK_ASSESSMENT]) ?? activeCommercialJob(repo, profile.customer_id)
  if (active) return { job: active, reused: true }
  const inputs: AssessmentInputs = { source: 'broker_copilot', business_profile_id: profileId, assessment_type: assessmentType, request, focus }
  const count = repo.list('jobs', (j) => j.workflow_type === RISK_ASSESSMENT && j.customer_id === profile.customer_id).length
  const job = createJob(repo, {
    workflow_type: RISK_ASSESSMENT,
    inputs: inputs as unknown as Record<string, Json>,
    initiated_by: actor,
    links: { customer_id: profile.customer_id },
    idempotency_key: `assessment:${profileId}:${count}`,
  })
  return { job, reused: false }
}

/** Starts an investigation. One active investigation per client and subject. */
export function startInvestigation(
  repo: Repo,
  actor: Actor,
  profileId: string,
  kind: InvestigationInputs['kind'],
  opts: { exposure_id?: string; node_id?: string; request?: string } = {},
): { job: Job; reused: boolean } {
  const profile = repo.require('business_profiles', profileId)
  if (kind === 'exposure' && !opts.exposure_id) throw new ToolError('validation', 'Choose the exposure to investigate')
  const active =
    activeOf(repo, profile.customer_id, [RISK_INVESTIGATION], (j) => {
      const i = j.inputs as unknown as InvestigationInputs
      return i.kind === kind && (i.exposure_id ?? null) === (opts.exposure_id ?? null)
    }) ?? activeCommercialJob(repo, profile.customer_id)
  if (active) return { job: active, reused: true }
  const inputs: InvestigationInputs = { source: 'broker_copilot', business_profile_id: profileId, kind, ...opts }
  const count = repo.list('jobs', (j) => j.workflow_type === RISK_INVESTIGATION && j.customer_id === profile.customer_id).length
  const job = createJob(repo, {
    workflow_type: RISK_INVESTIGATION,
    inputs: inputs as unknown as Record<string, Json>,
    initiated_by: actor,
    links: { customer_id: profile.customer_id },
    idempotency_key: `investigation:${profileId}:${kind}:${count}`,
  })
  return { job, reused: false }
}

export const TERMINAL_STATUSES: Job['status'][] = ['completed', 'failed', 'cancelled']

export function activeCommercialJob(repo: Repo, customerId: string): Job | undefined {
  return activeOf(repo, customerId, COMMERCIAL_WORKFLOWS)
}

/** Builds a new Twin version for an existing profile, without drafting a submission. Reuses any active commercial job. */
export function startTwinBuild(repo: Repo, actor: Actor, profileId: string): { job: Job; reused: boolean } {
  const profile = repo.require('business_profiles', profileId)
  const active = activeCommercialJob(repo, profile.customer_id)
  if (active) return { job: active, reused: true }
  const version = repo.find('business_risk_profiles', (r) => r.business_profile_id === profileId && r.status === 'current')?.version ?? 0
  const attempt = repo.list('jobs', (j) => j.workflow_type === RISK_TWIN_BUILD && j.customer_id === profile.customer_id).length
  const job = createJob(repo, {
    workflow_type: RISK_TWIN_BUILD,
    inputs: { source: 'broker_copilot', business_profile_id: profileId },
    initiated_by: actor,
    links: { customer_id: profile.customer_id },
    idempotency_key: `twin-build:${profileId}:v${version}:${attempt}`,
  })
  return { job, reused: false }
}

/** The orchestrator's plan for a business review: one durable job, steps owned by the commercial specialist agents. */
export function startCommercialReview(repo: Repo, actor: Actor, inputs: CommercialReviewInputs, idempotencyKey?: string): Job {
  const profile = inputs.business_profile_id ? repo.get('business_profiles', inputs.business_profile_id) : undefined
  return createJob(repo, {
    workflow_type: COMMERCIAL_REVIEW,
    inputs: inputs as unknown as Record<string, Json>,
    initiated_by: actor,
    links: profile ? { customer_id: profile.customer_id } : undefined,
    idempotency_key: idempotencyKey,
  })
}
