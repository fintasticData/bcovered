import type { Job, Json } from '../db/schema'
import type { Repo } from '../db/store'
import { createJob, registerWorkflow } from '../jobs/runner'
import type { Actor } from '../tools/registry'
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
