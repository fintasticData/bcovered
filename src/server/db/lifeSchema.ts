// Row types mirror supabase/migrations/20261108_0004_life_foundation.sql.
import type { ISODate, UUID } from './schema'

/** Provenance of a fact. */
export type FactSource = 'verified' | 'declared' | 'extracted' | 'inferred'
/** Provenance of an amount: reported by a third party, calculated or estimated by B-Covered, or adjusted by a person. */
export type ValueBasis = 'reported' | 'calculated' | 'estimated' | 'adjusted'
/** Calendar date as YYYY-MM-DD. */
export type DateOnly = string

export type BusinessLine = 'individual_life' | 'group_risk' | 'retirement'

export interface Person {
  id: UUID
  tenant_id: UUID
  /** Assigned by the database (CL-1001 Live, CL-S1001 Sample). */
  client_number?: string
  data_category?: 'sample' | 'live'
  first_names: string
  surname: string
  preferred_name: string | null
  date_of_birth: DateOnly | null
  gender: 'female' | 'male' | 'other' | 'undisclosed' | null
  id_type: 'sa_id' | 'passport' | 'other' | null
  /** Keyed hash of the normalised ID number. The full number is never stored in this table. */
  id_lookup_hash: string | null
  id_last4: string | null
  date_of_death: DateOnly | null
  is_synthetic: boolean
  created_at: ISODate
  updated_at: ISODate
}

export type CustomerPersonRole = 'self' | 'spouse' | 'dependant' | 'contact' | 'director'

export interface CustomerPerson {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  person_id: UUID
  role: CustomerPersonRole
  is_primary: boolean
  effective_from: DateOnly
  effective_to: DateOnly | null
  created_at: ISODate
}

export interface PersonRelationship {
  id: UUID
  tenant_id: UUID
  person_id: UUID
  related_person_id: UUID
  relationship: 'spouse' | 'life_partner' | 'child' | 'parent' | 'sibling' | 'other_dependant' | 'other'
  is_financial_dependant: boolean
  effective_from: DateOnly
  effective_to: DateOnly | null
  source: FactSource
  created_at: ISODate
}

export interface FinancialProfile {
  id: UUID
  tenant_id: UUID
  person_id: UUID
  version: number
  status: 'current' | 'superseded'
  occupation: string | null
  employment_status: 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student' | 'other' | null
  gross_monthly_income: number | null
  net_monthly_income: number | null
  monthly_obligations: number | null
  outstanding_debt: number | null
  objectives: string[]
  risk_profile: string | null
  field_sources: Record<string, FactSource>
  captured_by: UUID | null
  job_id: UUID | null
  created_at: ISODate
}

export type FaisCategory =
  | 'lt_a'
  | 'lt_b1'
  | 'lt_b1a'
  | 'lt_b2'
  | 'lt_b2a'
  | 'lt_c'
  | 'retail_pension'
  | 'pension_fund_benefits'
  | 'st_personal'
  | 'st_personal_a1'
  | 'st_commercial'

export const FAIS_LABEL: Record<FaisCategory, string> = {
  lt_a: 'Long-term Insurance A',
  lt_b1: 'Long-term Insurance B1',
  lt_b1a: 'Long-term Insurance B1-A',
  lt_b2: 'Long-term Insurance B2',
  lt_b2a: 'Long-term Insurance B2-A',
  lt_c: 'Long-term Insurance C',
  retail_pension: 'Retail Pension Benefits',
  pension_fund_benefits: 'Pension Fund Benefits',
  st_personal: 'Short-term Personal Lines',
  st_personal_a1: 'Short-term Personal Lines A1',
  st_commercial: 'Short-term Commercial Lines',
}

export interface AdviserAuthorisation {
  id: UUID
  tenant_id: UUID
  user_id: UUID
  fsp_rep_number: string | null
  product_category: FaisCategory
  status: 'active' | 'under_supervision' | 'suspended' | 'debarred' | 'lapsed'
  supervisor_id: UUID | null
  effective_from: DateOnly
  effective_to: DateOnly | null
  verified_by: UUID | null
  verified_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export type ScopeType = 'customer' | 'employer' | 'fund' | 'cell'

/** Grants a portal user access to one customer, employer, fund or cell inside the brokerage. */
export interface AccessGrant {
  id: UUID
  tenant_id: UUID
  user_id: UUID
  scope_type: ScopeType
  scope_id: UUID
  granted_by: UUID | null
  revoked_at: ISODate | null
  created_at: ISODate
}

export interface BenefitType {
  id: string
  key: string
  line: BusinessLine
  label: string
}

export interface Product {
  id: UUID
  provider_id: UUID
  line: BusinessLine
  name: string
  product_code: string | null
  fais_category: FaisCategory
  is_active: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface RateBand {
  max_age: number
  /** Annual premium per R1 000 of cover. */
  rate: number
}

export interface ProductRules {
  min_entry_age: number
  max_entry_age: number
  rates_per_1000: Record<string, RateBand[]>
  smoker_loading_pct: number
  monthly_policy_fee: number
  underwriting: Array<{ above_sum_assured: number; requirement: string }>
  documents: string[]
}

export interface ProductVersion {
  id: UUID
  product_id: UUID
  version: number
  effective_from: DateOnly
  effective_to: DateOnly | null
  rules: ProductRules
  source: 'provider_document' | 'provider_api' | 'manual'
  source_reference: string | null
  created_at: ISODate
}

export interface ProductBenefit {
  id: UUID
  product_version_id: UUID
  benefit_type_key: string
  kind: 'core' | 'rider'
  min_cover: number | null
  max_cover: number | null
  min_entry_age: number | null
  max_entry_age: number | null
  cease_age: number | null
  waiting_period_months: number | null
  exclusions: string[]
}

export interface NeedLine {
  benefit_type_key: string
  label: string
  required: number
  existing: number
  shortfall: number
  basis: string
}

export interface NeedsAnalysis {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  person_id: UUID
  financial_profile_id: UUID | null
  adviser_id: UUID | null
  needs: NeedLine[]
  status: 'draft' | 'complete' | 'superseded'
  job_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface LifeQuote {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  person_id: UUID
  needs_analysis_id: UUID | null
  status: 'draft' | 'compared' | 'recommended' | 'expired'
  assumptions: { age: number; smoker: boolean; cover: Record<string, number> }
  valid_until: ISODate
  job_id: UUID | null
  is_simulated: true
  created_at: ISODate
  updated_at: ISODate
}

export interface QuotedBenefit {
  benefit_type_key: string
  sum_assured: number
  monthly_premium: number
}

export interface LifeQuoteOption {
  id: UUID
  tenant_id: UUID
  life_quote_id: UUID
  provider_id: UUID
  product_version_id: UUID
  label: string
  benefits: QuotedBenefit[]
  monthly_premium: number
  policy_fee: number
  underwriting_expected: string[]
  source: 'simulated_rate_table'
  is_simulated: true
  created_at: ISODate
}

export const ROA_SECTIONS = [
  'client_summary',
  'needs_summary',
  'products_considered',
  'recommendation',
  'reasons',
  'replacement_note',
  'fees_and_commission',
] as const
export type RoaSection = (typeof ROA_SECTIONS)[number]

export const ROA_SECTION_LABEL: Record<RoaSection, string> = {
  client_summary: 'Client and circumstances',
  needs_summary: 'Needs identified',
  products_considered: 'Products considered',
  recommendation: 'Recommendation',
  reasons: 'Reasons for the recommendation',
  replacement_note: 'Replacement of existing cover',
  fees_and_commission: 'Fees and commission disclosure',
}

export interface RoaContent extends Record<RoaSection, string> {
  disclosures: string[]
}

export interface RecordOfAdvice {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  person_id: UUID
  needs_analysis_id: UUID | null
  life_quote_id: UUID | null
  recommended_option_id: UUID | null
  adviser_id: UUID
  adviser_authorisation_id: UUID | null
  version: number
  status: 'draft' | 'awaiting_approval' | 'signed_off' | 'delivered' | 'superseded'
  content: RoaContent
  /** Russ's suggested wording per section, shown beside the current text. Never applied without the adviser. */
  suggestions: Partial<Record<RoaSection, string>>
  is_replacement: boolean
  payload_hash: string | null
  approval_id: UUID | null
  job_id: UUID | null
  delivered_at: ISODate | null
  acknowledged_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export type PolicyLine = 'short_term_personal' | 'short_term_commercial' | 'individual_life' | 'group_risk'
export type PolicyStatus =
  | 'proposed'
  | 'application_submitted'
  | 'underwriting'
  | 'accepted'
  | 'in_force'
  | 'lapsed'
  | 'reinstated'
  | 'cancelled'
  | 'matured'
  | 'declined'
  | 'not_taken_up'

export interface Policy {
  id: UUID
  tenant_id: UUID
  /** System reference assigned by the database (PL-1001 / PL-S1001), present before the insurer issues a number. */
  reference?: string
  cover_type?: string | null
  data_category?: 'sample' | 'live'
  customer_id: UUID
  line: PolicyLine
  provider_id: UUID
  product_version_id: UUID | null
  record_of_advice_id: UUID | null
  adviser_id: UUID | null
  policy_number: string | null
  origin: 'placed' | 'existing_declared' | 'existing_extracted' | 'existing_imported'
  status: PolicyStatus
  underwriting_status: 'not_started' | 'requirements_outstanding' | 'requirements_complete' | 'decided' | null
  premium_amount: number | null
  premium_frequency: 'monthly' | 'quarterly' | 'annually' | 'single' | null
  inception_date: DateOnly | null
  anniversary_month: number | null
  source: FactSource
  job_id: UUID | null
  /** Client-book import provenance: the policy's identifier in the brokerage's own system. */
  source_ref?: string | null
  import_batch_id?: UUID | null
  data_origin?: 'demo' | 'imported' | 'live'
  created_at: ISODate
  updated_at: ISODate
}

export type PolicyPartyRole = 'policyholder' | 'life_insured' | 'premium_payer' | 'beneficiary' | 'cessionary'

export interface PolicyParty {
  id: UUID
  tenant_id: UUID
  policy_id: UUID
  person_id: UUID
  role: PolicyPartyRole
  share_pct: number | null
  effective_from: DateOnly
  effective_to: DateOnly | null
  created_at: ISODate
}

export interface PolicyBenefit {
  id: UUID
  tenant_id: UUID
  policy_id: UUID
  life_insured_person_id: UUID | null
  benefit_type_key: string
  kind: 'core' | 'rider'
  sum_assured: number | null
  monthly_benefit: number | null
  premium: number | null
  loading_pct: number | null
  exclusions: string[]
  status: 'proposed' | 'active' | 'ceased' | 'claimed'
  effective_from: DateOnly
  effective_to: DateOnly | null
  source: FactSource
  created_at: ISODate
  updated_at: ISODate
}

export interface PolicyStatusEvent {
  id: UUID
  tenant_id: UUID
  policy_id: UUID
  status: string
  reported_by: 'broker' | 'insurer' | 'system'
  note: string | null
  document_ref: string | null
  actor_user_id: UUID | null
  occurred_at: ISODate
  created_at: ISODate
}

export interface UnderwritingRequirement {
  id: UUID
  tenant_id: UUID
  policy_id: UUID
  requirement: string
  status: 'outstanding' | 'received' | 'waived'
  source: 'product_rules' | 'insurer'
  requested_at: ISODate
  received_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface LifeTables {
  persons: Person[]
  customer_persons: CustomerPerson[]
  person_relationships: PersonRelationship[]
  financial_profiles: FinancialProfile[]
  adviser_authorisations: AdviserAuthorisation[]
  access_grants: AccessGrant[]
  benefit_types: BenefitType[]
  products: Product[]
  product_versions: ProductVersion[]
  product_benefits: ProductBenefit[]
  needs_analyses: NeedsAnalysis[]
  life_quotes: LifeQuote[]
  life_quote_options: LifeQuoteOption[]
  records_of_advice: RecordOfAdvice[]
  policies: Policy[]
  policy_parties: PolicyParty[]
  policy_benefits: PolicyBenefit[]
  policy_status_events: PolicyStatusEvent[]
  underwriting_requirements: UnderwritingRequirement[]
}

export const LIFE_GLOBAL_TABLES = ['benefit_types', 'products', 'product_versions', 'product_benefits'] as const
