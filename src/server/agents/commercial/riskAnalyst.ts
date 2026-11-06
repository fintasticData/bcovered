import type { BusinessRiskProfile, RiskAssessmentRecord, RiskExposure, Task } from '../../db/commercialSchema'
import type { GapReport } from '../../domain/commercial/exposureRules'
import type { StepContext, StepOutcome } from '../../jobs/runner'
import { requireProfileId, reviewOutputs } from './discovery'

const requireRiskProfileId = (ctx: StepContext) => {
  const id = reviewOutputs(ctx).twin?.risk_profile_id
  if (!id) throw new Error('No Risk Twin for this review')
  return id
}

/** Industry Risk Analyst: a new Risk Twin version with the structural relationships between the business's records. */
export function runTwinStep(ctx: StepContext): StepOutcome {
  const profileId = requireProfileId(ctx)
  const rp = ctx.call<BusinessRiskProfile>('risk.create_twin', { profile_id: profileId })
  const mapped = ctx.call<BusinessRiskProfile>('risk.map_dependencies', { risk_profile_id: rp.id })
  return {
    kind: 'done',
    output: {
      risk_profile_id: rp.id,
      summary: `Risk Twin v${rp.version} built: ${mapped.node_count} records linked by ${mapped.edge_count} relationships`,
    },
  }
}

export function runExposureStep(ctx: StepContext): StepOutcome {
  const { assessment, exposures } = ctx.call<{ assessment: RiskAssessmentRecord; exposures: RiskExposure[] }>('risk.assess_exposures', {
    risk_profile_id: requireRiskProfileId(ctx),
  })
  return {
    kind: 'done',
    output: {
      assessment_id: assessment.id,
      exposure_count: exposures.length,
      summary: `${exposures.length} potential exposures identified, ${assessment.high_priority_count} high advisory priority. Coverage awaits broker review`,
    },
  }
}

export function runGapStep(ctx: StepContext): StepOutcome {
  const { gaps, tasks } = ctx.call<{ gaps: GapReport; tasks: Task[] }>('risk.identify_gaps', { risk_profile_id: requireRiskProfileId(ctx) })
  const customerTasks = tasks.filter((t) => t.audience === 'customer').length
  return {
    kind: 'done',
    output: {
      task_count: tasks.length,
      summary: `${gaps.missing.length} missing details and ${gaps.documents.length} documents requested (${customerTasks} customer tasks, ${tasks.length - customerTasks} broker tasks)`,
    },
  }
}

export { requireRiskProfileId }
