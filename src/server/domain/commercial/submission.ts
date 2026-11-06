import { compactRand as rand } from './format'
import type {
  CommercialAsset,
  CommercialSubmission,
  FieldSource,
  RiskExposure,
  SubmissionPack,
  SubmissionSection,
  SubmissionValidation,
} from '../../db/commercialSchema'
import { coverLabel, coverOrder } from './coverClasses'
import type { ProfileSnapshot } from './exposureRules'

export const SUBMISSION_DISCLAIMER =
  'Draft submission prepared with AI assistance on synthetic data. It has not been sent to any insurer, is not an insurer quotation and is not financial advice. A licensed broker must review it before any market approach.'

export interface SectionProposal {
  cover_class: string
  sum_insured: number | null
  limit_of_indemnity: number | null
  basis: string
  asset_ids: string[]
  exposure_ids: string[]
}

const PROPERTY_CLASSES: Record<string, CommercialAsset['asset_class'][]> = {
  fire_allied_perils: ['buildings', 'contents', 'machinery', 'stock'],
  buildings_combined: ['buildings'],
  office_contents: ['contents'],
  machinery_breakdown: ['machinery'],
  deterioration_of_stock: ['stock'],
  electronic_equipment: ['electronic_equipment'],
  commercial_motor: ['vehicle'],
  motor_fleet: ['vehicle'],
  plant_equipment: ['mobile_plant'],
}
const LIABILITY = ['public_liability', 'products_liability', 'employers_liability', 'professional_indemnity', 'directors_officers']

const valueOf = (assets: CommercialAsset[]) => {
  const known = assets.filter((a) => a.declared_value !== null)
  return known.length ? known.reduce((t, a) => t + (a.declared_value ?? 0), 0) : null
}

/** One proposed section per potential class raised by the exposures, with sums built only from declared values. */
export function proposeSections(s: ProfileSnapshot, exposures: RiskExposure[]): SectionProposal[] {
  const classes = [...new Set(exposures.flatMap((e) => e.potential_classes))].sort((a, b) => coverOrder(a) - coverOrder(b))
  return classes.map((key) => {
    const exposure_ids = exposures.filter((e) => e.potential_classes.includes(key)).map((e) => e.id)
    const assetClasses = PROPERTY_CLASSES[key]
    if (assetClasses) {
      const assets = s.assets.filter((a) => assetClasses.includes(a.asset_class))
      const value = valueOf(assets)
      const replacement = assets.filter((a) => a.value_basis === 'replacement').length
      const missing = assets.filter((a) => a.declared_value === null).length
      const basis = !assets.length
        ? 'No assets of this class in the schedule yet'
        : `Declared values; replacement basis confirmed for ${replacement} of ${assets.length} items${missing ? `, ${missing} without a value` : ''}`
      return { cover_class: key, sum_insured: value, limit_of_indemnity: null, basis, asset_ids: assets.map((a) => a.id), exposure_ids }
    }
    if (key === 'business_interruption') {
      const t = s.profile.annual_turnover
      return {
        cover_class: key,
        sum_insured: null,
        limit_of_indemnity: null,
        basis: `Gross profit basis and indemnity period to be agreed${t ? `. Declared turnover ${rand(t)} is not insured gross profit` : ''}`,
        asset_ids: [],
        exposure_ids,
      }
    }
    if (LIABILITY.includes(key)) {
      return { cover_class: key, sum_insured: null, limit_of_indemnity: null, basis: 'Limit of indemnity to be agreed with the broker; check lease and contract requirements', asset_ids: [], exposure_ids }
    }
    if (key === 'sasria') {
      return { cover_class: key, sum_insured: null, limit_of_indemnity: null, basis: 'Must follow the underlying material damage, business interruption and motor sections', asset_ids: [], exposure_ids }
    }
    return { cover_class: key, sum_insured: null, limit_of_indemnity: null, basis: 'Value to be confirmed with the customer', asset_ids: [], exposure_ids }
  })
}

export function countSources(s: ProfileSnapshot): Record<FieldSource, number> {
  const out: Record<FieldSource, number> = { verified: 0, declared: 0, inferred: 0, missing: 0 }
  Object.values(s.profile.field_sources).forEach((v) => out[v]++)
  ;[...s.locations, ...s.activities, ...s.assets, ...s.legal_entities].forEach((r) => out[r.source]++)
  return out
}

export function buildPack(
  s: ProfileSnapshot,
  submission: Pick<CommercialSubmission, 'id' | 'outstanding_items'>,
  sections: SubmissionSection[],
  exposures: RiskExposure[],
  industryName: string,
  brokerSummary: string | null,
  preparedBy: string,
): SubmissionPack {
  const loc = (id: string | null) => s.locations.find((l) => l.id === id)
  return {
    submission_id: submission.id,
    business: {
      registered_name: s.profile.registered_name,
      trading_name: s.profile.trading_name,
      registration_number: s.profile.registration_number,
      industry: industryName,
      years_trading: s.profile.years_trading,
      annual_turnover: s.profile.annual_turnover,
      employee_count: s.profile.employee_count,
      operating_regions: s.profile.operating_regions,
    },
    legal_entities: s.legal_entities.map((e) => e.legal_name),
    locations: s.locations.map((l) => ({
      name: l.name,
      address: [l.suburb, l.city, l.province].filter(Boolean).join(', '),
      occupancy: l.occupancy,
      ownership: l.ownership,
      construction: l.construction,
      fire_protection: l.fire_protection,
      security: l.security,
      backup_power: l.backup_power,
    })),
    assets: s.assets.map((a) => ({
      location: loc(a.location_id)?.name ?? 'All sites',
      asset_class: a.asset_class,
      description: a.description,
      declared_value: a.declared_value,
      value_basis: a.value_basis,
    })),
    sections: [...sections]
      .sort((a, b) => coverOrder(a.cover_class) - coverOrder(b.cover_class))
      .map((x) => ({
        cover_class: x.cover_class,
        label: coverLabel(x.cover_class),
        status: x.status,
        sum_insured: x.sum_insured,
        limit_of_indemnity: x.limit_of_indemnity,
        basis: x.basis,
        notes: x.notes,
      })),
    exposures: exposures.map((e) => ({ title: e.title, priority: e.priority, coverage_status: e.coverage_status })),
    existing_cover: s.profile.existing_cover,
    loss_history: s.profile.loss_history,
    outstanding_items: submission.outstanding_items,
    information_sources: countSources(s),
    broker_summary: brokerSummary,
    prepared_by_agent: preparedBy,
    disclaimer: SUBMISSION_DISCLAIMER,
  }
}

/** Blocking errors stop the workflow; warnings travel with the pack for the broker. */
export function validateSubmission(s: ProfileSnapshot, sections: SubmissionSection[], openDocuments: string[]) {
  const errors: string[] = []
  const warnings: string[] = []
  if (!s.profile.registered_name.trim()) errors.push('The business has no registered name')
  if (!s.locations.length) errors.push('No premises are recorded')
  if (!sections.length) errors.push('No insurance sections are proposed')
  sections
    .filter((x) => x.status !== 'excluded' && PROPERTY_CLASSES[x.cover_class] && x.sum_insured === null)
    .forEach((x) => warnings.push(`${coverLabel(x.cover_class)}: no sum insured yet`))
  sections
    .filter((x) => x.status !== 'excluded' && LIABILITY.includes(x.cover_class) && x.limit_of_indemnity === null)
    .forEach((x) => warnings.push(`${coverLabel(x.cover_class)}: limit of indemnity not set`))
  if (s.assets.some((a) => a.value_basis !== 'replacement')) warnings.push('Some assets are not on a confirmed replacement basis')
  if (sections.some((x) => x.status === 'proposed')) warnings.push(`${sections.filter((x) => x.status === 'proposed').length} sections still need a broker decision`)
  if (openDocuments.length) warnings.push(`${openDocuments.length} documents outstanding from the customer`)

  const checks = [
    Boolean(s.profile.registered_name),
    Boolean(s.profile.registration_number),
    Boolean(s.profile.industry_key),
    s.profile.annual_turnover !== null,
    s.profile.employee_count !== null,
    s.profile.years_trading !== null,
    s.locations.length > 0,
    s.locations.every((l) => l.ownership !== 'unknown'),
    s.locations.every((l) => l.construction !== null),
    s.assets.length > 0 && s.assets.every((a) => a.declared_value !== null),
    s.assets.length > 0 && s.assets.every((a) => a.value_basis === 'replacement'),
    Boolean(s.profile.existing_cover?.insurer),
    s.profile.loss_history !== null,
    openDocuments.length === 0,
  ]
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100)
  const validation: SubmissionValidation = { valid: errors.length === 0, errors, warnings, checked_at: new Date().toISOString() }
  return { validation, completeness }
}

export function composeCommercialSummary(
  s: ProfileSnapshot,
  industryName: string,
  exposures: RiskExposure[],
  sections: SubmissionSection[],
  completeness: number,
  openDocuments: number,
  brokerNote?: string | null,
): string {
  const name = s.profile.trading_name && s.profile.trading_name !== s.profile.registered_name ? `${s.profile.trading_name} (${s.profile.registered_name})` : s.profile.registered_name
  const owned = s.locations.filter((l) => l.ownership === 'owned').length
  const leased = s.locations.filter((l) => l.ownership === 'leased').length
  const tenure = owned && leased ? `${owned} owned and ${leased} leased` : owned ? 'owned' : leased ? 'leased' : 'tenure not confirmed'
  const high = exposures.filter((e) => e.priority === 'high')
  const awaiting = exposures.filter((e) => e.coverage_status === 'awaiting_broker_review').length
  const lines = [
    `${name}: ${industryName.toLowerCase()}, ${s.locations.length} premises (${tenure})${s.profile.operating_regions.length ? ` in ${s.profile.operating_regions.join(', ')}` : ''}.`,
    [
      s.profile.annual_turnover ? `Declared turnover ${rand(s.profile.annual_turnover)}` : 'Turnover not declared',
      s.profile.employee_count ? `${s.profile.employee_count} employees` : null,
      s.profile.existing_cover?.insurer ? `currently with ${s.profile.existing_cover.insurer}${s.profile.existing_cover.renewal_month ? `, renewing in ${s.profile.existing_cover.renewal_month}` : ''}` : 'current insurer unknown',
    ]
      .filter(Boolean)
      .join(', ') + '.',
    `${exposures.length} potential exposures identified; ${high.length} marked high advisory priority${high.length ? `: ${high.map((e) => e.title.toLowerCase()).join('; ')}` : ''}.`,
    awaiting
      ? `All ${awaiting} exposures are awaiting broker review: no policy wording has been analysed, so nothing is confirmed as covered or excluded.`
      : 'Coverage is unknown for every exposure because no current policy is on file.',
    `${sections.length} sections proposed for the draft pack. Submission completeness ${completeness}% with ${openDocuments} documents requested from the customer.`,
    'Broker to confirm suitability, sums insured and limits before any insurer is approached. Nothing has been sent to an insurer.',
  ]
  if (brokerNote) lines.unshift(`Revised after broker note: “${brokerNote}”.`)
  return lines.join(' ')
}
