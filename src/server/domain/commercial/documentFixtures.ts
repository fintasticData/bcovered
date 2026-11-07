import type { AssetClass, DocumentType, ValueBasis } from '../../db/commercialSchema'
import { SEED_IDS } from '../../db/seed'

export interface ExtractedSection {
  cover_class: string
  section_name: string
  sum_insured: number | null
  limit_of_indemnity: number | null
  excess: string | null
  basis: string | null
  conditions: string[]
  exclusions: string[]
  warranties: string[]
  page_ref: string
}

export interface ExtractedAsset {
  /** Existing record this line matches, if any. */
  asset_id: string | null
  asset_class: AssetClass
  description: string
  quantity: number
  declared_value: number | null
  value_basis: ValueBasis
  page_ref: string
}

export interface DocumentFixture {
  key: string
  profile_id: string
  file_name: string
  doc_type: DocumentType
  page_count: number
  summary: string
  policy?: { insurer: string; policy_number: string; inception_date: string; renewal_date: string; page_ref: string; sections: ExtractedSection[] }
  assets?: ExtractedAsset[]
}

const id = (n: number) => `a0000000-0000-4000-8000-000000000${String(n).padStart(3, '0')}`
const UBUNTU = SEED_IDS.business.ubuntu
const section = (s: Partial<ExtractedSection> & Pick<ExtractedSection, 'cover_class' | 'section_name' | 'page_ref'>): ExtractedSection => ({
  sum_insured: null,
  limit_of_indemnity: null,
  excess: null,
  basis: null,
  conditions: [],
  exclusions: [],
  warranties: [],
  ...s,
})

/**
 * Synthetic documents with pre-written extractions and page references. They stand in for document intelligence until the
 * server-side model is connected, and every result from them is labelled simulated.
 */
export const DOCUMENT_FIXTURES: DocumentFixture[] = [
  {
    key: 'ubuntu_policy_schedule',
    profile_id: UBUNTU,
    file_name: 'Karoo Mutual commercial schedule KM-COM-448812.pdf',
    doc_type: 'policy_schedule',
    page_count: 6,
    summary: 'Commercial package schedule: fire, business interruption, machinery breakdown, deterioration of stock, liability and Sasria.',
    policy: {
      insurer: 'Karoo Mutual',
      policy_number: 'KM-COM-448812',
      inception_date: '2026-02-01T00:00:00+02:00',
      renewal_date: '2027-01-31T00:00:00+02:00',
      page_ref: 'p. 1',
      sections: [
        section({ cover_class: 'fire_allied_perils', section_name: 'Fire – Buildings', sum_insured: 18_500_000, basis: 'Reinstatement', excess: 'R25,000', page_ref: 'p. 2' }),
        section({ cover_class: 'fire_allied_perils', section_name: 'Fire – Plant and machinery', sum_insured: 5_000_000, basis: 'Indemnity', excess: 'R25,000', page_ref: 'p. 2' }),
        section({
          cover_class: 'fire_allied_perils',
          section_name: 'Fire – Stock',
          sum_insured: 1_000_000,
          conditions: ['Monthly stock declarations required'],
          page_ref: 'p. 2',
        }),
        section({
          cover_class: 'business_interruption',
          section_name: 'Business interruption – Gross profit',
          sum_insured: 20_000_000,
          basis: '12-month indemnity period',
          conditions: ['Following insured damage at the premises'],
          exclusions: ['Failure of the public power supply unless caused by physical damage at the supply station'],
          page_ref: 'p. 3',
        }),
        section({
          cover_class: 'machinery_breakdown',
          section_name: 'Machinery breakdown',
          sum_insured: 4_000_000,
          excess: '5% of claim, minimum R15,000',
          exclusions: ['Wear and tear and gradual deterioration'],
          page_ref: 'p. 4',
        }),
        section({
          cover_class: 'deterioration_of_stock',
          section_name: 'Deterioration of stock',
          sum_insured: 500_000,
          conditions: ['Only following an insured machinery breakdown'],
          exclusions: ['Scheduled power outages, including load-shedding'],
          page_ref: 'p. 4',
        }),
        section({ cover_class: 'public_liability', section_name: 'Public liability', limit_of_indemnity: 10_000_000, page_ref: 'p. 5' }),
        section({
          cover_class: 'products_liability',
          section_name: 'Products liability',
          limit_of_indemnity: 10_000_000,
          exclusions: ['Product recall and withdrawal costs'],
          page_ref: 'p. 5',
        }),
        section({ cover_class: 'sasria', section_name: 'Sasria special risk (fire sections)', sum_insured: 24_500_000, page_ref: 'p. 6' }),
      ],
    },
  },
  {
    key: 'ubuntu_vehicle_register',
    profile_id: UBUNTU,
    file_name: 'Ubuntu Foods vehicle register June 2026.xlsx',
    doc_type: 'vehicle_schedule',
    page_count: 1,
    summary: 'Vehicle register from the client: seven refrigerated delivery trucks.',
    assets: [{ asset_id: id(625), asset_class: 'vehicle', description: 'Refrigerated delivery trucks', quantity: 7, declared_value: 5_600_000, value_basis: 'market', page_ref: 'Sheet 1, rows 2–8' }],
  },
  {
    key: 'ubuntu_asset_register',
    profile_id: UBUNTU,
    file_name: 'Ubuntu Foods asset register with replacement values 2026.pdf',
    doc_type: 'asset_register',
    page_count: 3,
    summary: 'Asset register with replacement values for production machinery and refrigeration.',
    assets: [
      { asset_id: id(622), asset_class: 'machinery', description: 'Production line machinery', quantity: 1, declared_value: 9_400_000, value_basis: 'replacement', page_ref: 'p. 2' },
      { asset_id: id(623), asset_class: 'machinery', description: 'Blast freezers and cold rooms', quantity: 1, declared_value: 2_600_000, value_basis: 'replacement', page_ref: 'p. 2' },
      { asset_id: null, asset_class: 'electronic_equipment', description: 'Production control system and servers', quantity: 1, declared_value: 850_000, value_basis: 'replacement', page_ref: 'p. 3' },
    ],
  },
]

export const fixturesFor = (profileId: string) => DOCUMENT_FIXTURES.filter((f) => f.profile_id === profileId)
export const getFixture = (key: string) => DOCUMENT_FIXTURES.find((f) => f.key === key)

/** Document type from a file name, for uploads that have no simulated extraction. */
export function guessDocumentType(fileName: string): DocumentType {
  const n = fileName.toLowerCase()
  if (/schedule/.test(n) && /vehicle|fleet/.test(n)) return 'vehicle_schedule'
  if (/schedule|policy/.test(n)) return /wording/.test(n) ? 'policy_wording' : 'policy_schedule'
  if (/wording/.test(n)) return 'policy_wording'
  if (/asset|register/.test(n)) return 'asset_register'
  if (/vehicle|fleet/.test(n)) return 'vehicle_schedule'
  if (/financ|afs|statement/.test(n)) return 'financial_summary'
  if (/survey/.test(n)) return 'risk_survey'
  if (/lease/.test(n)) return 'lease'
  if (/contract|agreement/.test(n)) return 'contract'
  return 'other'
}
