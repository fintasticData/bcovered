import { COVER_CLASSES, coverLabel, type CoverClass } from '@/server/domain/commercial/coverClasses'

export type CoverGroup = CoverClass['group']

export const COVER_GROUP_LABEL: Record<CoverGroup, string> = {
  property: 'Property',
  interruption: 'Business interruption',
  liability: 'Liability',
  motor_transit: 'Motor & transit',
  specialist: 'Specialist',
  special_risk: 'Special risk',
}

export const COVER_GROUP_ORDER: CoverGroup[] = [
  'property',
  'interruption',
  'liability',
  'motor_transit',
  'specialist',
  'special_risk',
]

/** Broker checklist items to capture next for each commercial cover class. */
export const COVER_RELATED: Record<string, string[]> = {
  fire_allied_perils: ['Premises address', 'Buildings / contents sum insured', 'Construction type', 'Fire protection'],
  buildings_combined: ['Property address', 'Rebuild sum insured', 'Ownership (owned / leased)', 'Occupancy'],
  office_contents: ['Contents sum insured', 'High-value items', 'Alarm / security'],
  business_interruption: ['Gross profit / indemnity period', 'Key dependencies', 'Max downtime tolerance'],
  theft: ['Stock / contents values', 'Security measures', 'Forced-entry history'],
  money: ['Cash held on premises', 'Safe / transit limits'],
  glass: ['External / internal glass schedule'],
  electronic_equipment: ['IT / POS schedule', 'Declared values'],
  machinery_breakdown: ['Plant / machinery schedule', 'Critical equipment'],
  deterioration_of_stock: ['Cold-store capacity', 'Backup power'],
  goods_in_transit: ['Typical load values', 'Routes / carriers'],
  commercial_motor: ['Vehicle schedule (make / model / year)', 'Market values', 'Drivers'],
  motor_fleet: ['Fleet size', 'Vehicle classes', 'Overnight parking'],
  public_liability: ['Limit of indemnity', 'Public access / footfall', 'Activities on premises'],
  products_liability: ['Product types', 'Export markets', 'Recall history'],
  employers_liability: ['Employee count', 'COIDA status', 'High-risk roles'],
  professional_indemnity: ['Profession / services', 'Fee income', 'Contract limits'],
  directors_officers: ['Board size', 'Turnover band', 'Prior claims'],
  cyber: ['Systems / data held', 'Backup & MFA posture'],
  fidelity_crime: ['Cash handling roles', 'Controls / dual authority'],
  contractors_all_risks: ['Contract values', 'Site locations', 'Period of works'],
  plant_equipment: ['Plant schedule', 'Hired-in vs owned'],
  marine_cargo: ['Incoterms / routes', 'Typical consignment values'],
  agricultural_specialist: ['Farm assets / livestock', 'Seasonal exposures'],
  sasria: ['Underlying class values', 'Special-risk notes'],
}

export function relatedForCover(key: string): string[] {
  return COVER_RELATED[key] ?? ['Describe the exposure', 'Approximate values']
}

export function coversByGroup(): Array<{ group: CoverGroup; label: string; items: CoverClass[] }> {
  return COVER_GROUP_ORDER.map((group) => ({
    group,
    label: COVER_GROUP_LABEL[group],
    items: COVER_CLASSES.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0)
}

export function interestSummary(keys: string[]): string {
  return keys.map((k) => coverLabel(k)).join('; ')
}

export { COVER_CLASSES, coverLabel }
