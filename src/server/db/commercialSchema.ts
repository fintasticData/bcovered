// Row types mirror supabase/migrations/20261106_0002_commercial_core.sql one to one.
import type { ISODate, UUID } from './schema'

/** Where a value came from. Only a document check makes a value verified. */
export type FieldSource = 'verified' | 'declared' | 'inferred' | 'missing'

export type CoverageStatus = 'confirmed_covered' | 'confirmed_excluded' | 'potentially_covered' | 'unknown' | 'awaiting_broker_review'

/** Replacement, market and book values are never treated as interchangeable. */
export type ValueBasis = 'replacement' | 'market' | 'book' | 'unknown'

export type RiskPriority = 'high' | 'medium' | 'low'

export type AssetClass = 'buildings' | 'contents' | 'stock' | 'machinery' | 'electronic_equipment' | 'vehicle' | 'mobile_plant' | 'other'

export type ActivityKind = 'operation' | 'revenue_stream' | 'supplier_dependency' | 'customer_dependency'

export interface ContactPerson {
  name: string
  email: string | null
  phone: string | null
  role: string | null
}

export interface ExistingCover {
  insurer: string | null
  policy_count: number | null
  renewal_month: string | null
  notes: string | null
}

export interface LossHistory {
  claims_last_5_years: number | null
  notes: string | null
}

export interface BusinessProfile {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  registered_name: string
  trading_name: string | null
  registration_number: string | null
  vat_number: string | null
  industry_key: string
  activities_summary: string | null
  years_trading: number | null
  annual_turnover: number | null
  employee_count: number | null
  operating_regions: string[]
  primary_contact: ContactPerson | null
  existing_cover: ExistingCover | null
  loss_history: LossHistory | null
  field_sources: Record<string, FieldSource>
  missing_info: string[]
  status: 'discovery' | 'in_review' | 'active' | 'archived'
  assigned_broker_id: UUID | null
  is_synthetic: true
  created_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface BusinessLegalEntity {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  legal_name: string
  registration_number: string | null
  role: 'primary' | 'subsidiary' | 'property_owner' | 'other'
  source: FieldSource
  created_at: ISODate
}

export interface BusinessLocation {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  legal_entity_id: UUID | null
  name: string
  suburb: string | null
  city: string | null
  province: string | null
  occupancy: string
  ownership: 'owned' | 'leased' | 'unknown'
  construction: string | null
  fire_protection: string[]
  security: string[]
  backup_power: boolean | null
  public_access: boolean
  seating_capacity: number | null
  source: FieldSource
  created_at: ISODate
  updated_at: ISODate
}

export interface BusinessActivity {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  location_id: UUID | null
  kind: ActivityKind
  name: string
  description: string | null
  share_of_revenue: number | null
  source: FieldSource
  created_at: ISODate
}

export interface CommercialAsset {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  location_id: UUID | null
  asset_class: AssetClass
  description: string
  quantity: number
  declared_value: number | null
  value_basis: ValueBasis
  valuation_date: ISODate | null
  source: FieldSource
  created_at: ISODate
  updated_at: ISODate
}

export interface BusinessRiskProfile {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  version: number
  status: 'current' | 'superseded'
  template_key: string
  template_version: number
  node_count: number
  edge_count: number
  summary: string | null
  job_id: UUID | null
  created_at: ISODate
}

export type TwinTable =
  | 'business_profiles'
  | 'business_legal_entities'
  | 'business_locations'
  | 'business_activities'
  | 'commercial_assets'
  | 'risk_exposures'

export interface RiskDependency {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  risk_profile_id: UUID
  from_table: TwinTable
  from_id: UUID
  to_table: TwinTable
  to_id: UUID
  relation: 'owns' | 'operates_at' | 'located_at' | 'generates_revenue_at' | 'depends_on' | 'exposes'
  note: string | null
  created_at: ISODate
}

export interface ExposureEvidence {
  label: string
  source: FieldSource
  ref_table: TwinTable | null
  ref_id: UUID | null
}

export interface RiskExposure {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  risk_profile_id: UUID
  rule_key: string
  title: string
  description: string
  category: 'property' | 'interruption' | 'liability' | 'motor' | 'cyber' | 'crime' | 'valuation' | 'dependency' | 'special_risk' | 'people'
  business_impact: string
  evidence: ExposureEvidence[]
  /** Advisory only. Explained by priority_inputs, never a probability. */
  priority: RiskPriority
  priority_inputs: string[]
  coverage_status: CoverageStatus
  potential_classes: string[]
  location_ids: UUID[]
  assigned_broker_id: UUID | null
  outstanding_questions: string[]
  review_date: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface RiskAssessmentRecord {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  risk_profile_id: UUID
  job_id: UUID | null
  template_key: string
  template_version: number
  exposure_count: number
  high_priority_count: number
  findings: string[]
  gaps: string[]
  created_at: ISODate
}

export interface IndustryRiskTemplate {
  id: UUID
  tenant_id: UUID
  key: string
  name: string
  version: number
  summary: string
  keywords: string[]
  activities: string[]
  typical_assets: string[]
  exposure_rules: string[]
  potential_classes: string[]
  underwriting_questions: string[]
  documents: string[]
  survey_requirements: string[]
  coverage_considerations: string[]
  referral_triggers: string[]
  discovery_topics: string[]
  is_active: boolean
  created_at: ISODate
  updated_at: ISODate
}

export type SubmissionStatus = 'draft' | 'awaiting_approval' | 'approved' | 'ready_for_market' | 'rejected'

export interface SubmissionValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  checked_at: ISODate
}

export interface SubmissionPack {
  submission_id: UUID
  business: {
    registered_name: string
    trading_name: string | null
    registration_number: string | null
    industry: string
    years_trading: number | null
    annual_turnover: number | null
    employee_count: number | null
    operating_regions: string[]
  }
  legal_entities: string[]
  locations: Array<{
    name: string
    address: string
    occupancy: string
    ownership: string
    construction: string | null
    fire_protection: string[]
    security: string[]
    backup_power: boolean | null
  }>
  assets: Array<{ location: string; asset_class: AssetClass; description: string; declared_value: number | null; value_basis: ValueBasis }>
  sections: Array<{
    cover_class: string
    label: string
    status: SubmissionSection['status']
    sum_insured: number | null
    limit_of_indemnity: number | null
    basis: string | null
    notes: string | null
  }>
  exposures: Array<{ title: string; priority: RiskPriority; coverage_status: CoverageStatus }>
  existing_cover: ExistingCover | null
  loss_history: LossHistory | null
  outstanding_items: string[]
  information_sources: Record<FieldSource, number>
  broker_summary: string | null
  prepared_by_agent: string
  disclaimer: string
}

export interface CommercialSubmission {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  customer_id: UUID
  lead_id: UUID | null
  risk_profile_id: UUID | null
  job_id: UUID | null
  status: SubmissionStatus
  pack: SubmissionPack | null
  completeness: number
  outstanding_items: string[]
  validation: SubmissionValidation | null
  is_simulated: true
  approved_at: ISODate | null
  created_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface SubmissionSection {
  id: UUID
  tenant_id: UUID
  submission_id: UUID
  cover_class: string
  status: 'proposed' | 'included' | 'excluded'
  sum_insured: number | null
  limit_of_indemnity: number | null
  basis: string | null
  asset_ids: UUID[]
  exposure_ids: UUID[]
  notes: string | null
  broker_edited: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface Task {
  id: UUID
  tenant_id: UUID
  customer_id: UUID | null
  subject_table: string | null
  subject_id: UUID | null
  kind: 'document_request' | 'information_request' | 'broker_review' | 'follow_up'
  audience: 'customer' | 'broker'
  title: string
  detail: string | null
  status: 'open' | 'done' | 'cancelled'
  assigned_to: UUID | null
  due_date: ISODate | null
  created_by_agent: string | null
  job_id: UUID | null
  dedupe_key: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface CommercialTables {
  business_profiles: BusinessProfile[]
  business_legal_entities: BusinessLegalEntity[]
  business_locations: BusinessLocation[]
  business_activities: BusinessActivity[]
  commercial_assets: CommercialAsset[]
  business_risk_profiles: BusinessRiskProfile[]
  risk_dependencies: RiskDependency[]
  risk_exposures: RiskExposure[]
  risk_assessments: RiskAssessmentRecord[]
  industry_risk_templates: IndustryRiskTemplate[]
  commercial_submissions: CommercialSubmission[]
  submission_sections: SubmissionSection[]
  tasks: Task[]
}
