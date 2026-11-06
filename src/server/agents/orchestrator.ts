import type { Job, Json } from '../db/schema'
import type { Repo } from '../db/store'
import { createJob, registerWorkflow } from '../jobs/runner'
import type { Actor } from '../tools/registry'
import { runApprovalStep, runReleaseStep, runSummaryStep } from './brokerCopilot'
import { runQualifyStep, type MotorLeadInputs } from './leadQualification'
import { runQuoteStep } from './quoteComparison'
import { runRiskStep } from './riskAssessment'

export const MOTOR_NEW_LEAD = 'motor_new_lead'

registerWorkflow({
  type: MOTOR_NEW_LEAD,
  title: 'New motor enquiry to broker-approved proposal',
  restartOnChangesFrom: 'summary',
  steps: [
    { key: 'qualify', name: 'Create customer profile and lead', agent: 'lead_qualification', run: runQualifyStep },
    { key: 'risk', name: 'Assess disclosed risks', agent: 'risk_assessment', run: runRiskStep },
    { key: 'quote', name: 'Prepare 3 simulated options', agent: 'quote_comparison', run: runQuoteStep },
    { key: 'summary', name: 'Write comparison summary', agent: 'broker_copilot', run: runSummaryStep },
    { key: 'approval', name: 'Wait for broker approval', agent: 'approval_engine', run: runApprovalStep },
    { key: 'release', name: 'Release proposal to customer portal', agent: 'approval_engine', run: runReleaseStep },
  ],
})

/** The orchestrator's plan for a motor enquiry: one durable job whose steps are owned by specialist agents. */
export function startMotorLeadWorkflow(repo: Repo, actor: Actor, inputs: MotorLeadInputs, idempotencyKey?: string): Job {
  return createJob(repo, {
    workflow_type: MOTOR_NEW_LEAD,
    inputs: inputs as unknown as Record<string, Json>,
    initiated_by: actor,
    links: inputs.lead_id ? { lead_id: inputs.lead_id } : undefined,
    idempotency_key: idempotencyKey,
  })
}
