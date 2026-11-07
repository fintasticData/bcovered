import type { CoverageStatus, InsurancePolicy, PolicySection, RiskExposure } from '../../db/commercialSchema'
import { coverLabel } from './coverClasses'
import { compactRand } from './format'

/** Wording that may take an exposure outside a section. Matching only flags it for a broker; it never decides cover. */
const EXCLUSION_HINTS: Record<string, RegExp> = {
  stock_deterioration: /power|outage|load.?shed|supply|deteriorat|spoil/i,
  machinery_breakdown: /wear|gradual|deteriorat|maintenance/i,
  business_interruption: /power|utility|supply|outage|disease/i,
  utility_dependency: /power|utility|supply|outage|load.?shed/i,
  cyber_payments: /cyber|data|electronic/i,
  goods_in_transit: /unattended|hijack|theft from vehicle/i,
  delivery_motor: /unlicensed|driver/i,
  theft_money: /forcible|violent/i,
  products_liability: /recall|contamination/i,
}

export interface CoverageMatch {
  status: Exclude<CoverageStatus, 'confirmed_covered' | 'confirmed_excluded'>
  section: PolicySection | null
  policy: InsurancePolicy | null
  clause_ref: string | null
  page_ref: string | null
  rationale: string
}

/**
 * Proposes how a potential exposure relates to the policy evidence on file. A similar section name is never treated as cover:
 * the best an agent can conclude is "potentially covered", and a possible exclusion goes to the broker.
 */
export function matchCoverage(
  exposure: Pick<RiskExposure, 'rule_key' | 'title' | 'potential_classes'>,
  policies: InsurancePolicy[],
  sections: PolicySection[],
): CoverageMatch {
  const none = { section: null, policy: null, clause_ref: null, page_ref: null }
  if (!policies.length) {
    return { ...none, status: 'unknown', rationale: 'No policy schedule has been analysed for this business, so cover cannot be assessed.' }
  }
  const relevant = sections.filter((s) => exposure.potential_classes.includes(s.cover_class))
  if (!relevant.length) {
    return {
      ...none,
      status: 'unknown',
      rationale: `No section for ${exposure.potential_classes.map(coverLabel).join(', ')} appears in the ${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} analysed. It may be missing, on another policy or under a different name.`,
    }
  }
  const hint = EXCLUSION_HINTS[exposure.rule_key]
  for (const s of relevant) {
    const clause = hint ? [...s.exclusions, ...s.conditions].find((x) => hint.test(x)) : undefined
    if (clause) {
      return {
        status: 'awaiting_broker_review',
        section: s,
        policy: policies.find((p) => p.id === s.policy_id) ?? null,
        clause_ref: clause,
        page_ref: s.page_ref,
        rationale: `${s.section_name} is on the schedule, but “${clause}” may limit or exclude this exposure. A broker needs to read the wording.`,
      }
    }
  }
  const s = relevant[0]
  const amount = s.sum_insured ?? s.limit_of_indemnity
  return {
    status: 'potentially_covered',
    section: s,
    policy: policies.find((p) => p.id === s.policy_id) ?? null,
    clause_ref: null,
    page_ref: s.page_ref,
    rationale: `${s.section_name} (${coverLabel(s.cover_class)}) appears on the schedule${amount ? ` with ${s.sum_insured ? 'a sum insured' : 'a limit'} of ${compactRand(amount)}` : ''}. The full wording, conditions and limits still need broker review before this is treated as cover.`,
  }
}
