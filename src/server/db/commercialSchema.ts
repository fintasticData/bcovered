// Row types mirror supabase/migrations/20261106_0002_commercial_core.sql one to one.
import type { ISODate, Json, UUID } from './schema'

/**
 * Where a value came from. Only a person checking a document makes a value verified; values read from a document by an
 * agent are extracted until a broker confirms them.
 */
export type FieldSource = 'verified' | 'declared' | 'extracted' | 'inferred' | 'missing'

/** The basis of an assessment finding: the weakest source among its evidence. AI inference is never treated as fact. */
export type FactBasis = 'verified' | 'declared' | 'extracted' | 'inferred' | 'unknown'

export type CoverageStatus = 'confirmed_covered' | 'confirmed_excluded' | 'potentially_covered' | 'unknown' | 'awaiting_broker_review'

/** Replacement, market and book values are never treated as interchangeable. */
export type ValueBasis = 'replacement' | 'market' | 'book' | 'unknown'

export type RiskPriority = 'high' | 'medium' | 'low'

/** Qualitative assessment priority. Explained by its rationale; never presented as actuarially validated. */
export type AssessmentPriority = 'critical' | 'high' | 'medium' | 'low' | 'unassessed'

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
  /** The business records as they were when this version was built, for change comparison. */
  snapshot: TwinSnapshot | null
  created_at: ISODate
}

export interface TwinSnapshot {
  profile: Pick<BusinessProfile, 'registered_name' | 'trading_name' | 'annual_turnover' | 'employee_count' | 'operating_regions' | 'existing_cover' | 'loss_history'>
  locations: Array<Pick<BusinessLocation, 'id' | 'name' | 'occupancy' | 'ownership' | 'fire_protection' | 'security' | 'backup_power'>>
  activities: Array<Pick<BusinessActivity, 'id' | 'kind' | 'name' | 'share_of_revenue'>>
  assets: Array<Pick<CommercialAsset, 'id' | 'asset_class' | 'description' | 'quantity' | 'declared_value' | 'value_basis' | 'location_id'>>
  policy_sections: Array<{ id: UUID; cover_class: string; sum_insured: number | null; limit_of_indemnity: number | null }>
  exposure_count: number
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
  relation: StructuralRelation | OperationalRelation
  note: string | null
  /** Structural edges follow the records' own links (declared); operational edges carry the link's provenance. */
  source: Exclude<FieldSource, 'missing'>
  created_at: ISODate
}

export type StructuralRelation = 'owns' | 'operates_at' | 'located_at' | 'generates_revenue_at' | 'depends_on' | 'exposes'

/** Explicit operational dependencies, used for impact tracing. Direction is from the thing depended on to the thing that depends on it. */
export type OperationalRelation = 'supports' | 'stores' | 'feeds' | 'supplies' | 'serves'

/** A persistent operational dependency between business records, copied into every Twin version. */
export interface BusinessDependencyLink {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  from_table: TwinTable
  from_id: UUID
  to_table: TwinTable
  to_id: UUID
  relation: OperationalRelation
  note: string | null
  source: Exclude<FieldSource, 'missing'>
  status: 'active' | 'rejected'
  confirmed_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
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
  /** A broker's recorded override of the assessment priority. */
  priority_override: AssessmentPriority | null
  override_reason: string | null
  overridden_by: UUID | null
  overridden_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export type AssessmentType =
  | 'initial'
  | 'annual_renewal'
  | 'new_location'
  | 'new_asset'
  | 'business_change'
  | 'incident_triggered'
  | 'targeted_specialist'

/** draft: exposure screening from a Twin build. approved: signed off by a broker. */
export type AssessmentRecordStatus = 'draft' | 'in_progress' | 'awaiting_review' | 'approved' | 'superseded'

export type CompletenessStatus = 'complete' | 'partial' | 'missing' | 'pending'

export interface CompletenessItem {
  key: 'business' | 'locations' | 'assets' | 'dependencies' | 'insurance' | 'broker_review'
  label: string
  status: CompletenessStatus
  missing: string[]
}

export interface RiskAssessmentRecord {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  risk_profile_id: UUID
  job_id: UUID | null
  assessment_type: AssessmentType
  status: AssessmentRecordStatus
  scope: string[]
  assessor_id: UUID | null
  approval_id: UUID | null
  template_key: string
  template_version: number
  exposure_count: number
  high_priority_count: number
  findings: string[]
  gaps: string[]
  completeness: CompletenessItem[]
  summary: string | null
  next_review_date: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface FindingCoverage {
  status: CoverageStatus
  sections: string[]
  note: string
}

export interface RiskAssessmentFinding {
  id: UUID
  tenant_id: UUID
  assessment_id: UUID
  business_profile_id: UUID
  exposure_id: UUID | null
  rank: number
  /** One of the most important areas requiring broker review. */
  is_priority_area: boolean
  title: string
  category: RiskExposure['category']
  priority: AssessmentPriority
  rationale: string[]
  evidence: ExposureEvidence[]
  fact_basis: FactBasis
  coverage: FindingCoverage
  outstanding: string[]
  status: 'proposed' | 'accepted' | 'rejected' | 'overridden'
  broker_note: string | null
  created_at: ISODate
  updated_at: ISODate
}

export type DocumentType =
  | 'policy_schedule'
  | 'policy_wording'
  | 'asset_register'
  | 'financial_summary'
  | 'business_description'
  | 'risk_survey'
  | 'vehicle_schedule'
  | 'lease'
  | 'contract'
  | 'other'

export interface BusinessDocument {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  file_name: string
  doc_type: DocumentType
  page_count: number | null
  file_size: number | null
  status: 'uploaded' | 'extracted' | 'reviewed' | 'rejected'
  /** Extraction came from a synthetic fixture, not from reading the file. */
  is_simulated: boolean
  fixture_key: string | null
  extraction_note: string | null
  uploaded_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface InsurancePolicy {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  insurer: string
  policy_number: string | null
  inception_date: ISODate | null
  renewal_date: ISODate | null
  source: Exclude<FieldSource, 'missing'>
  document_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface PolicySection {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  policy_id: UUID
  cover_class: string
  section_name: string
  sum_insured: number | null
  limit_of_indemnity: number | null
  excess: string | null
  basis: string | null
  conditions: string[]
  exclusions: string[]
  warranties: string[]
  source: Exclude<FieldSource, 'missing'>
  document_id: UUID | null
  page_ref: string | null
  created_at: ISODate
  updated_at: ISODate
}

/** Evidence linking an exposure to policy wording. Agents may propose; only a broker confirms covered or excluded. */
export interface CoverageFinding {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  exposure_id: UUID
  policy_section_id: UUID | null
  status: CoverageStatus
  insurer: string | null
  section_name: string | null
  clause_ref: string | null
  page_ref: string | null
  document_id: UUID | null
  rationale: string
  proposed_by_agent: string | null
  reviewed_by: UUID | null
  reviewed_at: ISODate | null
  review_note: string | null
  created_at: ISODate
  updated_at: ISODate
}

export type ProposalKind = 'add_asset' | 'update_asset' | 'add_policy' | 'add_policy_section'

/** A change proposed from a document. Never applied without a broker; conflicts with confirmed values are flagged. */
export interface TwinUpdateProposal {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  document_id: UUID
  kind: ProposalKind
  target_id: UUID | null
  label: string
  current: Json
  suggested: Json
  page_ref: string | null
  conflict: string | null
  status: 'pending' | 'applied' | 'rejected'
  decided_by: UUID | null
  decided_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface RiskTwinChangeEvent {
  id: UUID
  tenant_id: UUID
  business_profile_id: UUID
  from_risk_profile_id: UUID | null
  /** Null when compared with the live records rather than another version. */
  to_risk_profile_id: UUID | null
  entity_table: string
  entity_id: UUID | null
  change_type: 'added' | 'removed' | 'changed'
  field: string | null
  label: string
  before: Json
  after: Json
  finding: string
  task_id: UUID | null
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
  risk_assessment_findings: RiskAssessmentFinding[]
  business_dependency_links: BusinessDependencyLink[]
  business_documents: BusinessDocument[]
  insurance_policies: InsurancePolicy[]
  policy_sections: PolicySection[]
  coverage_findings: CoverageFinding[]
  twin_update_proposals: TwinUpdateProposal[]
  risk_twin_change_events: RiskTwinChangeEvent[]
  industry_risk_templates: IndustryRiskTemplate[]
  commercial_submissions: CommercialSubmission[]
  submission_sections: SubmissionSection[]
  tasks: Task[]
}
