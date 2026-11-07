import type { AssetClass, CommercialAsset, InsurancePolicy, PolicySection } from '../../db/commercialSchema'
import { compactRand } from './format'

export interface ValuationFinding {
  key: string
  label: string
  asset_ids: string[]
  declared_total: number | null
  value_bases: string[]
  section_id: string | null
  section_name: string | null
  insurer: string | null
  page_ref: string | null
  sum_insured: number | null
  /** Declared minus insured, only when both are known. Not a loss estimate. */
  difference: number | null
  status: 'below_declared' | 'at_or_above_declared' | 'no_section' | 'no_value'
  finding: string
  assumptions: string[]
  action: { title: string; detail: string; audience: 'broker' | 'customer'; kind: 'broker_review' | 'document_request' }
}

interface Group {
  key: string
  label: string
  classes: AssetClass[]
  matches: (s: PolicySection) => boolean
}

const GROUPS: Group[] = [
  { key: 'buildings', label: 'Buildings', classes: ['buildings'], matches: (s) => s.cover_class === 'buildings_combined' || (s.cover_class === 'fire_allied_perils' && /building/i.test(s.section_name)) },
  {
    key: 'plant',
    label: 'Plant and machinery (fire)',
    classes: ['machinery', 'contents'],
    matches: (s) => s.cover_class === 'fire_allied_perils' && /plant|machinery|contents/i.test(s.section_name),
  },
  { key: 'machinery_breakdown', label: 'Machinery breakdown', classes: ['machinery'], matches: (s) => s.cover_class === 'machinery_breakdown' },
  { key: 'stock', label: 'Stock', classes: ['stock'], matches: (s) => s.cover_class === 'fire_allied_perils' && /stock/i.test(s.section_name) },
  { key: 'electronic', label: 'Electronic equipment', classes: ['electronic_equipment'], matches: (s) => s.cover_class === 'electronic_equipment' },
  { key: 'vehicles', label: 'Vehicles', classes: ['vehicle', 'mobile_plant'], matches: (s) => s.cover_class === 'motor_fleet' || s.cover_class === 'commercial_motor' },
]

/**
 * Compares declared asset values with sums insured on file, group by group. Uses only recorded values and states the
 * value basis, because book and market values are not replacement costs. No loss or premium is estimated.
 */
export function compareValuations(assets: CommercialAsset[], policies: InsurancePolicy[], sections: PolicySection[]): ValuationFinding[] {
  return GROUPS.flatMap((g): ValuationFinding[] => {
    const group = assets.filter((a) => g.classes.includes(a.asset_class))
    if (!group.length) return []
    const known = group.filter((a) => a.declared_value !== null)
    const declared = known.length ? known.reduce((s, a) => s + (a.declared_value ?? 0), 0) : null
    const bases = [...new Set(group.map((a) => a.value_basis))]
    const section = sections.find(g.matches) ?? null
    const insurer = section ? (policies.find((p) => p.id === section.policy_id)?.insurer ?? null) : null
    const assumptions: string[] = []
    if (bases.some((b) => b !== 'replacement')) assumptions.push(`Declared on a ${bases.join(' and ')} basis; replacement cost may be higher.`)
    if (known.length < group.length) assumptions.push(`${group.length - known.length} item${group.length - known.length === 1 ? ' has' : 's have'} no recorded value.`)
    const base = {
      key: g.key,
      label: g.label,
      asset_ids: group.map((a) => a.id),
      declared_total: declared,
      value_bases: bases,
      section_id: section?.id ?? null,
      section_name: section?.section_name ?? null,
      insurer,
      page_ref: section?.page_ref ?? null,
      sum_insured: section?.sum_insured ?? null,
      assumptions,
    }
    if (declared === null) {
      return [
        {
          ...base,
          difference: null,
          status: 'no_value' as const,
          finding: `${g.label}: no declared values recorded, so the sum insured cannot be compared.`,
          action: { title: `Request values for ${g.label.toLowerCase()}`, detail: 'Needed to compare with the sum insured.', audience: 'customer' as const, kind: 'document_request' as const },
        },
      ]
    }
    if (!section || section.sum_insured === null) {
      return [
        {
          ...base,
          difference: null,
          status: 'no_section' as const,
          finding: `${g.label}: declared ${compactRand(declared)}, but no matching section with a sum insured was found in the documents analysed.`,
          action: { title: `Find the policy section for ${g.label.toLowerCase()}`, detail: `Declared ${compactRand(declared)}; no section on file.`, audience: 'broker' as const, kind: 'broker_review' as const },
        },
      ]
    }
    const difference = declared - section.sum_insured
    const where = `“${section.section_name}”${section.page_ref ? ` (${section.page_ref})` : ''}`
    if (difference > 0) {
      return [
        {
          ...base,
          difference,
          status: 'below_declared' as const,
          finding: `${g.label}: declared ${compactRand(declared)} (${bases.join(', ')}) against a sum insured of ${compactRand(section.sum_insured)} in ${where}, ${compactRand(difference)} below the declared figure.${
            bases.some((b) => b !== 'replacement') ? ' The replacement shortfall may be larger; a valuation is needed.' : ''
          }`,
          action: {
            title: `Review possible underinsurance: ${g.label.toLowerCase()}`,
            detail: `Declared ${compactRand(declared)} vs sum insured ${compactRand(section.sum_insured)} (${where}). Confirm the replacement value before any change is proposed.`,
            audience: 'broker' as const,
            kind: 'broker_review' as const,
          },
        },
      ]
    }
    return [
      {
        ...base,
        difference,
        status: 'at_or_above_declared' as const,
        finding: `${g.label}: sum insured ${compactRand(section.sum_insured)} in ${where} is at or above the declared ${compactRand(declared)}.${
          bases.some((b) => b !== 'replacement') ? ' The declared figure is not a replacement value, so adequacy is not confirmed.' : ''
        }`,
        action: {
          title: `Confirm the replacement basis for ${g.label.toLowerCase()}`,
          detail: 'Sum insured appears adequate against the declared figure only.',
          audience: 'broker' as const,
          kind: 'broker_review' as const,
        },
      },
    ]
  })
}
