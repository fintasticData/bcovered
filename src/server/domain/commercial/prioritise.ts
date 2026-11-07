import type {
  AssessmentPriority,
  BusinessLocation,
  CommercialAsset,
  CoverageFinding,
  ExposureEvidence,
  FactBasis,
  RiskExposure,
} from '../../db/commercialSchema'
import { compactRand } from './format'

export const PRIORITY_AREA_COUNT = 5

export interface ExposureContext {
  exposure: RiskExposure
  /** Assets linked to the exposure in the Twin. */
  assets: CommercialAsset[]
  locations: BusinessLocation[]
  /** Share of declared revenue reached through recorded operational links from the exposure's records, 0 to 1. */
  revenue_share: number | null
  single_site: boolean
  coverage: CoverageFinding | null
}

export interface FindingDraft {
  exposure_id: string
  title: string
  category: RiskExposure['category']
  priority: AssessmentPriority
  score: number
  rationale: string[]
  evidence: ExposureEvidence[]
  fact_basis: FactBasis
  outstanding: string[]
  overridden: boolean
}

const BASIS_ORDER: FactBasis[] = ['verified', 'extracted', 'declared', 'inferred', 'unknown']

/** The weakest source among the evidence. A finding is only as reliable as its weakest input. */
export function factBasis(evidence: ExposureEvidence[]): FactBasis {
  if (!evidence.length) return 'unknown'
  return evidence
    .map((e): FactBasis => (e.source === 'missing' ? 'unknown' : e.source))
    .reduce((w, b) => (BASIS_ORDER.indexOf(b) > BASIS_ORDER.indexOf(w) ? b : w), 'verified' as FactBasis)
}

function band(score: number): AssessmentPriority {
  if (score >= 7) return 'critical'
  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

/**
 * Explainable qualitative prioritisation from listed factors: severity, business dependency, controls, financial impact,
 * evidence quality and coverage uncertainty. Each factor is written into the rationale. It is a review order, not a probability.
 */
export function prioritise(ctx: ExposureContext): FindingDraft {
  const e = ctx.exposure
  const rationale: string[] = []
  let score = 0

  const severity = { high: 3, medium: 2, low: 1 }[e.priority]
  score += severity
  rationale.push(`Potential severity: ${e.priority} in the industry template rules (${e.priority_inputs.slice(0, 2).join('; ') || 'no inputs listed'}).`)

  if (ctx.revenue_share !== null && ctx.revenue_share >= 0.5) {
    score += 2
    rationale.push(`Business dependency: about ${Math.round(ctx.revenue_share * 100)}% of declared revenue depends on the linked records through recorded links.`)
  } else if (ctx.single_site && ['property', 'interruption', 'dependency'].includes(e.category)) {
    score += 1
    rationale.push('Business dependency: all operations are on a single site.')
  } else {
    rationale.push('Business dependency: no concentration found in the recorded links.')
  }

  const controls: string[] = []
  if (e.category === 'property' && ctx.locations.some((l) => l.fire_protection.some((f) => /sprinkler|suppression/i.test(f)))) controls.push('fire protection declared')
  if (['dependency', 'property'].includes(e.category) && /stock|power|utility|machinery/i.test(e.rule_key) && ctx.locations.some((l) => l.backup_power)) {
    controls.push('backup power declared')
  }
  if (controls.length) {
    score -= 0.5
    rationale.push(`Existing controls: ${controls.join(', ')} (not yet verified).`)
  } else {
    rationale.push('Existing controls: none recorded that reduce this exposure.')
  }

  const value = ctx.assets.reduce((s, a) => s + (a.declared_value ?? 0), 0)
  if (value >= 5_000_000) {
    score += 1
    rationale.push(`Financial impact: linked declared values of ${compactRand(value)} (declared figures, not a loss estimate).`)
  } else if (value > 0) {
    rationale.push(`Financial impact: linked declared values of ${compactRand(value)}.`)
  } else {
    rationale.push('Financial impact: no values recorded on the linked records.')
  }

  const basis = factBasis(e.evidence)
  if (basis === 'unknown' || e.evidence.some((x) => x.source === 'missing')) {
    score += 0.5
    rationale.push('Evidence quality: some evidence is missing.')
  } else if (basis === 'declared' || basis === 'inferred') {
    score += 0.5
    rationale.push(`Evidence quality: the weakest evidence is ${basis === 'inferred' ? 'AI inferred' : 'customer declared'}, not verified.`)
  } else {
    rationale.push(`Evidence quality: supported by ${basis} evidence.`)
  }

  const status = ctx.coverage?.status ?? e.coverage_status
  const coverageText: Record<typeof status, [number, string]> = {
    unknown: [1, 'Coverage uncertainty: no policy evidence for this exposure.'],
    awaiting_broker_review: [1, 'Coverage uncertainty: policy evidence needs broker review.'],
    potentially_covered: [0.5, 'Coverage uncertainty: a matching section exists but the wording is not confirmed.'],
    confirmed_excluded: [2, 'Coverage uncertainty: a broker confirmed an exclusion.'],
    confirmed_covered: [-1, 'Coverage uncertainty: a broker confirmed cover.'],
  }
  score += coverageText[status][0]
  rationale.push(coverageText[status][1])

  let priority: AssessmentPriority = !e.evidence.length && !ctx.assets.length && !ctx.locations.length ? 'unassessed' : band(score)
  let overridden = false
  if (e.priority_override) {
    rationale.push(`Broker override from ${priority} to ${e.priority_override}: ${e.override_reason ?? 'no reason recorded'}.`)
    priority = e.priority_override
    overridden = true
  }

  return {
    exposure_id: e.id,
    title: e.title,
    category: e.category,
    priority,
    score,
    rationale,
    evidence: e.evidence,
    fact_basis: basis,
    outstanding: e.outstanding_questions,
    overridden,
  }
}

const ORDER: Record<AssessmentPriority, number> = { critical: 0, high: 1, medium: 2, low: 3, unassessed: 4 }

export function rankFindings(drafts: FindingDraft[]): Array<FindingDraft & { rank: number; is_priority_area: boolean }> {
  return [...drafts]
    .sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.score - a.score || a.title.localeCompare(b.title))
    .map((d, i) => ({ ...d, rank: i + 1, is_priority_area: i < PRIORITY_AREA_COUNT && d.priority !== 'unassessed' }))
}
