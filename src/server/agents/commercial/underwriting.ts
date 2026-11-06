import type { CommercialSubmission, RiskExposure, SubmissionSection, SubmissionValidation } from '../../db/commercialSchema'
import type { ApprovalRequest } from '../../db/schema'
import type { ProfileSnapshot } from '../../domain/commercial/exposureRules'
import { composeCommercialSummary } from '../../domain/commercial/submission'
import type { StepContext, StepOutcome } from '../../jobs/runner'
import { ToolError } from '../../lib/errors'
import { templateFor } from '../../tools/risk'
import { openCustomerDocuments } from '../../tools/underwriting'
import { requireProfileId, reviewOutputs } from './discovery'
import { requireRiskProfileId } from './riskAnalyst'

const requireSubmissionId = (ctx: StepContext) => {
  const id = reviewOutputs(ctx).submission?.submission_id
  if (!id) throw new Error('No submission for this review')
  return id
}

/** Commercial Underwriting Agent: drafts the pack and checks it. Blocking problems fail the step for a person to fix. */
export function runSubmissionStep(ctx: StepContext): StepOutcome {
  const { submission, sections } = ctx.call<{ submission: CommercialSubmission; sections: SubmissionSection[] }>('underwriting.prepare_submission', {
    profile_id: requireProfileId(ctx),
    risk_profile_id: requireRiskProfileId(ctx),
    lead_id: reviewOutputs(ctx).discover?.lead_id ?? ctx.job.lead_id,
  })
  const { validation, completeness } = ctx.call<{ validation: SubmissionValidation; completeness: number }>('underwriting.validate_submission', {
    submission_id: submission.id,
  })
  if (!validation.valid) throw new ToolError('validation', `Submission is incomplete: ${validation.errors.join('; ')}`)
  return {
    kind: 'done',
    output: {
      submission_id: submission.id,
      summary: `Draft pack with ${sections.length} proposed sections, ${completeness}% complete, ${validation.warnings.length} warnings for the broker`,
    },
  }
}

export function runCommercialSummaryStep(ctx: StepContext): StepOutcome {
  const submissionId = requireSubmissionId(ctx)
  const s = ctx.call<ProfileSnapshot>('business.get_profile', { profile_id: requireProfileId(ctx) })
  const submission = ctx.repo.require('commercial_submissions', submissionId)
  const exposures: RiskExposure[] = ctx.repo.list('risk_exposures', (e) => e.risk_profile_id === submission.risk_profile_id)
  const sections = ctx.repo.list('submission_sections', (x) => x.submission_id === submissionId)
  const lastNote = ctx
    .call<ApprovalRequest[]>('approval.search', { status: ['changes_requested'] })
    .filter((a) => a.job_id === ctx.job.id)
    .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))[0]?.decision_note
  const docs = openCustomerDocuments(ctx.repo, s.profile.id).filter((t) => t.kind === 'document_request').length
  const summary = composeCommercialSummary(s, templateFor(ctx.repo, s.profile.industry_key).name, exposures, sections, submission.completeness, docs, lastNote)
  ctx.call('underwriting.set_broker_summary', { submission_id: submissionId, broker_summary: summary })
  const leadId = reviewOutputs(ctx).discover?.lead_id
  if (leadId) ctx.call('lead.update_status', { lead_id: leadId, status: 'qualified' })
  return { kind: 'done', output: { summary: 'Broker review summary written', broker_summary: summary } }
}

export function runSubmissionApprovalStep(ctx: StepContext): StepOutcome {
  const submissionId = requireSubmissionId(ctx)
  const submission = ctx.repo.require('commercial_submissions', submissionId)
  if (!submission.pack) throw new Error('No pack to approve')
  const exposures = ctx.repo.list('risk_exposures', (e) => e.risk_profile_id === submission.risk_profile_id)
  const name = submission.pack.business.trading_name ?? submission.pack.business.registered_name
  const approval = ctx.call<ApprovalRequest>('approval.request', {
    approval_type: 'underwriting_submission',
    subject_table: 'commercial_submissions',
    subject_id: submissionId,
    summary: `Approve the ${name} submission pack as ready for market (${submission.pack.sections.length} sections, simulated)`,
    proposed_changes: submission.pack,
    risk_flags: exposures.filter((e) => e.priority === 'high').map((e) => `High advisory priority: ${e.title}`),
    evidence: [
      { label: 'Job', ref: ctx.job.id },
      { label: 'Business profile', ref: submission.business_profile_id },
      { label: 'Submission', ref: submissionId },
    ],
  })
  return { kind: 'await_approval', approval_id: approval.id, output: { approval_id: approval.id, summary: 'Broker approval requested for the draft pack' } }
}

export function runFinaliseStep(ctx: StepContext): StepOutcome {
  ctx.call('underwriting.finalise_submission', { submission_id: requireSubmissionId(ctx) })
  return { kind: 'done', output: { summary: 'Pack marked ready for market. No insurer has been contacted' } }
}
