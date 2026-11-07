import type { ApprovalRequest, Json } from '../../db/schema'
import type { AssessmentType, BusinessRiskProfile, CompletenessItem, CoverageFinding, RiskAssessmentFinding, RiskAssessmentRecord, RiskExposure, Task } from '../../db/commercialSchema'
import type { ValuationFinding } from '../../domain/commercial/valuation'
import type { StepContext, StepOutcome } from '../../jobs/runner'
import { requireProfileId, reviewOutputs } from './discovery'
import { requireRiskProfileId, runTwinStep } from './riskAnalyst'

export interface AssessmentInputs {
  source: 'broker_copilot' | 'risk_twin_workspace'
  business_profile_id: string
  assessment_type: AssessmentType
  request?: string
  /** A Twin record the broker asked to assess; recorded in the scope. */
  focus?: string
}

export interface InvestigationInputs {
  source: 'broker_copilot' | 'risk_twin_workspace'
  business_profile_id: string
  kind: 'underinsurance' | 'exposure'
  exposure_id?: string
  node_id?: string
  request?: string
}

const outputs = (ctx: StepContext) => (ctx.job.outputs ?? {}) as Record<string, { [k: string]: Json } | undefined>

/** Reuses the current Risk Twin, building one only if the business has none. */
export function runEnsureTwinStep(ctx: StepContext): StepOutcome {
  const profileId = requireProfileId(ctx)
  const current = ctx.repo.find('business_risk_profiles', (r) => r.business_profile_id === profileId && r.status === 'current') as BusinessRiskProfile | undefined
  if (!current) return runTwinStep(ctx)
  return { kind: 'done', output: { risk_profile_id: current.id, reused: true, summary: `Loaded Risk Twin v${current.version}: ${current.node_count} records, ${current.edge_count} relationships` } }
}

export function runCoverageStep(ctx: StepContext): StepOutcome {
  const rpId = requireRiskProfileId(ctx)
  const exposures = ctx.repo.list('risk_exposures', (e) => e.risk_profile_id === rpId) as RiskExposure[]
  const findings = exposures.map((e) => ctx.call<CoverageFinding>('risk.coverage_compare_exposure', { exposure_id: e.id }))
  const count = (s: string) => findings.filter((f) => f.status === s).length
  const policies = ctx.repo.list('insurance_policies', (p) => p.business_profile_id === requireProfileId(ctx)).length
  return {
    kind: 'done',
    output: {
      summary: policies
        ? `Coverage evidence checked against ${policies} polic${policies === 1 ? 'y' : 'ies'}: ${count('potentially_covered')} potentially covered, ${count('awaiting_broker_review')} need wording review, ${count('unknown')} unknown. Nothing is confirmed without a broker`
        : `No policy schedule on file, so all ${findings.length} exposures stay unknown. Upload the schedule to check coverage evidence`,
    },
  }
}

export function runAssessStep(ctx: StepContext): StepOutcome {
  const inputs = ctx.job.inputs as unknown as AssessmentInputs
  const { assessment } = ctx.call<{ assessment: RiskAssessmentRecord }>('risk.assessment_create', {
    profile_id: requireProfileId(ctx),
    assessment_type: inputs.assessment_type,
    ...(inputs.focus ? { scope: [`Requested for: ${inputs.focus}`, 'Exposures linked to it are prioritised alongside the rest of the Risk Twin'] } : {}),
  })
  const run = ctx.call<{ assessment: RiskAssessmentRecord; findings: RiskAssessmentFinding[] }>('risk.assessment_run', { assessment_id: assessment.id })
  const top = run.findings.filter((f) => f.is_priority_area)
  return {
    kind: 'done',
    output: {
      assessment_id: assessment.id,
      priority_areas: top.map((f) => `${f.rank}. ${f.title} (${f.priority})`),
      summary: `${run.findings.length} findings prioritised with reasons; the ${top.length} most important areas: ${top.map((f) => f.title.toLowerCase()).join('; ')}`,
    },
  }
}

const assessmentId = (ctx: StepContext) => {
  const id = outputs(ctx).assess?.assessment_id as string | undefined
  if (!id) throw new Error('No assessment for this job')
  return id
}

export function runAssessmentGapStep(ctx: StepContext): StepOutcome {
  const { completeness, created } = ctx.call<{ completeness: CompletenessItem[]; tasks: Task[]; created: number }>('risk.assessment_identify_gaps', { assessment_id: assessmentId(ctx) })
  const open = completeness.filter((c) => c.status !== 'complete').map((c) => `${c.label.toLowerCase()} ${c.status}`)
  return { kind: 'done', output: { summary: `${created} new requests and review tasks. Completeness: ${open.length ? open.join(', ') : 'all complete'}` } }
}

export function runAssessmentReviewStep(ctx: StepContext): StepOutcome {
  const approval = ctx.call<ApprovalRequest>('risk.assessment_request_review', { assessment_id: assessmentId(ctx) })
  return { kind: 'await_approval', approval_id: approval.id, output: { approval_id: approval.id, summary: 'Broker sign-off requested for the findings' } }
}

export function runAssessmentFinaliseStep(ctx: StepContext): StepOutcome {
  ctx.call('risk.assessment_finalise', { assessment_id: assessmentId(ctx) })
  return { kind: 'done', output: { summary: 'Assessment signed off and recorded as the baseline for the next comparison' } }
}

// ---------------------------------------------------------------- investigations

interface InvestigationFinding {
  title: string
  detail: string
  status: string
  page_ref: string | null
}

interface InvestigationAction {
  title: string
  detail: string
  audience: 'broker' | 'customer'
  kind: Task['kind']
}

export function runInvestigateStep(ctx: StepContext): StepOutcome {
  const inputs = ctx.job.inputs as unknown as InvestigationInputs
  const profileId = requireProfileId(ctx)
  if (inputs.kind === 'underinsurance') {
    const r = ctx.call<{ policies: number; sections: number; findings: ValuationFinding[] }>('risk.investigate_underinsurance', { profile_id: profileId })
    const findings: InvestigationFinding[] = r.findings.map((f) => ({ title: f.label, detail: [f.finding, ...f.assumptions].join(' '), status: f.status, page_ref: f.page_ref }))
    const actions: InvestigationAction[] = r.findings.filter((f) => f.status !== 'at_or_above_declared').map((f) => f.action)
    if (!r.policies) actions.unshift({ title: 'Provide the current policy schedule', detail: 'Needed to compare sums insured with declared values.', audience: 'customer', kind: 'document_request' })
    const below = r.findings.filter((f) => f.status === 'below_declared').length
    return {
      kind: 'done',
      output: {
        findings: findings as unknown as Json,
        actions: actions as unknown as Json,
        summary: r.policies
          ? `Compared ${r.findings.length} asset groups with ${r.sections} policy sections: ${below} below the declared value, ${r.findings.filter((f) => f.status === 'no_section').length} with no matching section`
          : 'No policy schedule on file, so sums insured cannot be compared yet',
      },
    }
  }
  if (!inputs.exposure_id) throw new Error('No exposure selected for this investigation')
  ctx.call('risk.coverage_compare_exposure', { exposure_id: inputs.exposure_id })
  const r = ctx.call<{ exposure: RiskExposure; coverage: { status: string; rationale: string; page_ref: string | null }; impact: { summary: string; known_values: Array<{ label: string }> } | null; missing: string[] }>(
    'risk.investigate_exposure',
    { exposure_id: inputs.exposure_id },
  )
  const findings: InvestigationFinding[] = [
    { title: 'Coverage evidence', detail: r.coverage.rationale, status: r.coverage.status, page_ref: r.coverage.page_ref },
    ...(r.impact ? [{ title: 'Operational impact', detail: r.impact.summary, status: 'traced', page_ref: null }] : []),
  ]
  const actions: InvestigationAction[] = [
    { title: `Review the exposure: ${r.exposure.title}`, detail: r.coverage.rationale, audience: 'broker', kind: 'broker_review' },
    ...r.missing.slice(0, 3).map((m) => ({ title: m.length > 90 ? `${m.slice(0, 87)}…` : m, detail: `Raised while investigating “${r.exposure.title}”.`, audience: 'customer' as const, kind: 'information_request' as const })),
  ]
  return { kind: 'done', output: { findings: findings as unknown as Json, actions: actions as unknown as Json, summary: `Investigated “${r.exposure.title}”: ${r.coverage.status.replace(/_/g, ' ')}; ${r.missing.length} open questions` } }
}

export function runInvestigationActionsStep(ctx: StepContext): StepOutcome {
  const profile = ctx.repo.require('business_profiles', requireProfileId(ctx))
  const actions = (outputs(ctx).investigate?.actions ?? []) as unknown as InvestigationAction[]
  const created = actions.map((a) =>
    ctx.call<{ task: Task; created: boolean }>('task.create', {
      customer_id: profile.customer_id,
      subject_table: 'business_profiles',
      subject_id: profile.id,
      kind: a.kind,
      audience: a.audience,
      title: a.title,
      detail: a.detail,
      assigned_to: a.audience === 'broker' ? profile.assigned_broker_id : null,
      due_in_days: a.audience === 'broker' ? 3 : 7,
      dedupe_key: `${profile.id}:investigation:${a.title}`,
    }),
  )
  return { kind: 'done', output: { task_ids: created.map((c) => c.task.id), summary: `${created.filter((c) => c.created).length} proposed actions created as tasks (${created.length - created.filter((c) => c.created).length} already open)` } }
}

export function runInvestigationReviewStep(ctx: StepContext): StepOutcome {
  const inputs = ctx.job.inputs as unknown as InvestigationInputs
  const profile = ctx.repo.require('business_profiles', requireProfileId(ctx))
  const o = outputs(ctx)
  const approval = ctx.call<ApprovalRequest>('approval.request', {
    approval_type: 'risk_investigation_review',
    subject_table: 'jobs',
    subject_id: ctx.job.id,
    summary: `Review the ${inputs.kind === 'underinsurance' ? 'underinsurance' : 'exposure'} investigation for ${profile.trading_name ?? profile.registered_name}`,
    proposed_changes: { findings: o.investigate?.findings ?? [], actions: o.investigate?.actions ?? [] },
    risk_flags: ((o.investigate?.findings ?? []) as unknown as InvestigationFinding[]).filter((f) => f.status === 'below_declared' || f.status === 'awaiting_broker_review').map((f) => f.title),
    evidence: [
      { label: 'Job', ref: ctx.job.id },
      { label: 'Business profile', ref: profile.id },
      { label: 'Risk Twin', ref: reviewOutputs(ctx).twin?.risk_profile_id ?? '' },
    ],
  })
  return { kind: 'await_approval', approval_id: approval.id, output: { approval_id: approval.id, summary: 'Findings held for broker review' } }
}

export function runInvestigationFinaliseStep(): StepOutcome {
  return { kind: 'done', output: { summary: 'Investigation reviewed by the broker. Findings are preliminary until applied in an assessment' } }
}
