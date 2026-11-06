import { rand } from '@/lib/quote'
import type { Lead, MotorDetails } from '../db/schema'
import type { StepContext, StepOutcome } from '../jobs/runner'

export interface MotorRiskFindings {
  notes: string[]
  referral_triggers: string[]
  coverage_gaps: string[]
  clarification_questions: string[]
}

/** Rule-based pre-assessment for broker review. It never accepts, declines or rates a risk. */
export function assessMotorRisk(d: MotorDetails): MotorRiskFindings {
  const notes: string[] = []
  const referral: string[] = []
  const gaps: string[] = []
  const questions: string[] = []

  if ((d.value ?? 0) > 500_000) referral.push(`Sum insured ${rand(d.value ?? 0)} is above the R500,000 referral limit`)
  if ((d.claims_last_3_years ?? 0) >= 2) referral.push(`${d.claims_last_3_years} claims in the last 3 years`)
  if (d.driver_age !== undefined && d.driver_age < 25) referral.push('Regular driver is under 25')
  if (d.licence_years !== undefined && d.licence_years < 2) referral.push('Regular driver licensed for under 2 years')

  if (d.usage === 'business') {
    notes.push('Business use declared')
    questions.push('Is the vehicle used for deliveries, client visits or carrying goods for reward?')
  } else if (d.usage === 'private') {
    notes.push('Private use declared')
  }
  if (d.parking === 'street') notes.push('Parked on the street overnight; insurers may load the premium or add conditions')
  if (d.parking === 'garage' || d.parking === 'secure_complex') notes.push('Secure overnight parking declared')
  if (d.tracker) notes.push('Tracking device fitted')
  if (!d.tracker && (d.value ?? 0) > 300_000) questions.push('Most insurers require a tracker above R300,000. Can one be fitted?')
  if ((d.claims_last_3_years ?? 0) === 0) notes.push('No claims declared in the last 3 years')
  if (d.cover_type && d.cover_type !== 'comprehensive') {
    gaps.push('Cover requested excludes damage to the client’s own vehicle in an at-fault accident')
  }
  gaps.push('Confirm whether the vehicle is financed; credit shortfall cover may be relevant')

  return { notes, referral_triggers: referral, coverage_gaps: gaps, clarification_questions: questions }
}

export function runRiskStep(ctx: StepContext): StepOutcome {
  const leadId = ctx.job.lead_id
  if (!leadId) throw new Error('Risk assessment needs a lead')
  const { lead } = ctx.call<{ lead: Lead }>('lead.get', { lead_id: leadId })
  const findings = assessMotorRisk(lead.qualification.vehicle ?? {})
  ctx.call('lead.record_risk_assessment', { lead_id: leadId, ...findings })
  return {
    kind: 'done',
    output: {
      referral_triggers: findings.referral_triggers.length,
      notes: findings.notes.length,
      summary: findings.referral_triggers.length
        ? `${findings.referral_triggers.length} referral trigger(s) for broker attention`
        : 'No referral triggers found',
    },
  }
}
