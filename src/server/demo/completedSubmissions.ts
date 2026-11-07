import type { SubmissionSection } from '../db/commercialSchema'
import { DEMO_BUSINESSES } from './demoBusinesses'

/** The broker decisions applied to each demo pack before it is approved. Limits are illustrative, not advice. */
export interface DemoBrokerDecisions {
  limits: Record<string, number>
  notes: Record<string, string>
  leave_out: Record<string, string>
}

const DEFAULT_LIMITS: Record<string, number> = {
  public_liability: 10_000_000,
  products_liability: 5_000_000,
  employers_liability: 5_000_000,
  professional_indemnity: 10_000_000,
  directors_officers: 5_000_000,
  cyber: 2_500_000,
  fidelity_crime: 1_000_000,
  goods_in_transit: 1_000_000,
  money: 50_000,
}

const DEFAULT_NOTES: Record<string, string> = {
  business_interruption: 'Gross profit basis with a 12-month indemnity period, confirmed with the client',
  sasria: 'Follows the material damage, business interruption and motor sections',
}

const [thali, swift, mokoena] = DEMO_BUSINESSES.map((b) => b.profile_id)

const OVERRIDES: Record<string, Partial<DemoBrokerDecisions>> = {
  [thali]: {
    notes: { deterioration_of_stock: 'Cold room at Woodstock only; Claremont stock held in reach-in fridges' },
    leave_out: { directors_officers: 'Client declined directors and officers cover at this renewal' },
  },
  [swift]: {
    limits: { public_liability: 20_000_000, goods_in_transit: 1_500_000 },
    notes: { goods_in_transit: 'Limit per load; hijacking history disclosed in the pack', motor_fleet: 'Market values per vehicle schedule' },
  },
  [mokoena]: {
    limits: { professional_indemnity: 20_000_000, cyber: 5_000_000, fidelity_crime: 2_500_000 },
    notes: { fidelity_crime: 'Includes trust account fraud extension request', cyber: 'Social engineering and funds transfer fraud cover requested' },
  },
}

export const DEMO_SUBMISSION_PROFILE_IDS = [thali, swift, mokoena]

export function demoDecisions(profileId: string): DemoBrokerDecisions {
  const o = OVERRIDES[profileId] ?? {}
  return {
    limits: { ...DEFAULT_LIMITS, ...o.limits },
    notes: { ...DEFAULT_NOTES, ...o.notes },
    leave_out: { ...o.leave_out },
  }
}

/** The change a broker makes to a proposed section, or null when the agent's proposal stands as it is. */
export function sectionDecision(section: Pick<SubmissionSection, 'cover_class' | 'limit_of_indemnity' | 'notes'>, d: DemoBrokerDecisions) {
  const reason = d.leave_out[section.cover_class]
  if (reason) return { status: 'excluded' as const, notes: reason }
  const limit = d.limits[section.cover_class]
  return {
    status: 'included' as const,
    limit_of_indemnity: section.limit_of_indemnity ?? limit ?? null,
    notes: d.notes[section.cover_class] ?? section.notes,
  }
}
