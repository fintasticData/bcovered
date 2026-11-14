// Row types mirror supabase/migrations/20261110_0010_brokerage_onboarding.sql. Four tables are local stand-ins for
// Supabase services and disappear when the backend exists: auth_identities (Supabase Auth), storage_objects (Storage),
// document_links (signed URLs) and vault_secrets (Vault).
import type { ISODate, Json, UUID } from './schema'

export type DataOrigin = 'demo' | 'imported' | 'live'
export type OrganisationKind = 'platform' | 'brokerage'
export type LifecycleStatus = 'onboarding' | 'active' | 'suspended' | 'closed'

export type BrokerageType = 'independent' | 'juristic_representative_network' | 'sole_proprietor' | 'corporate_broker'
export type ProductModule = 'personal_lines' | 'commercial' | 'individual_life' | 'group_risk' | 'retirement'

export type MemberRole =
  | 'brokerage_owner'
  | 'brokerage_admin'
  | 'representative'
  | 'operations_admin'
  | 'compliance_reviewer'
  | 'read_only'
  | 'sub_broker'
  | 'agent'
export type PlatformRole = 'platform_admin' | 'onboarding_reviewer' | 'platform_read_only'

export interface OrganisationMembership {
  id: UUID
  tenant_id: UUID
  user_id: UUID
  role: MemberRole
  status: 'active' | 'suspended' | 'removed'
  invited_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface PlatformStaff {
  id: UUID
  user_id: UUID
  role: PlatformRole
  granted_by: UUID | null
  revoked_at: ISODate | null
  created_at: ISODate
}

/** Local stand-in for Supabase Auth (auth.users). Never returned by any handler. */
export interface AuthIdentity {
  id: UUID
  user_id: UUID
  email: string
  password_salt: string
  password_hash: string
  created_at: ISODate
}

export interface BrokerageInvitation {
  id: UUID
  tenant_id: UUID
  email: string
  role: MemberRole
  kind: 'owner' | 'team'
  token_hash: string
  expires_at: ISODate
  accepted_at: ISODate | null
  accepted_by: UUID | null
  revoked_at: ISODate | null
  invited_by: UUID
  created_at: ISODate
}

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'information_required'
  | 'approved'
  | 'active'
  | 'declined'
  | 'withdrawn'
  | 'suspended'

export type OnboardingSection = 'organisation' | 'profile' | 'team' | 'products' | 'insurer_access' | 'documents' | 'commercial' | 'migration' | 'readiness'

export type SectionValues = Record<string, string | string[] | boolean | null>

export interface BrokerageApplication {
  id: UUID
  tenant_id: UUID
  route: 'invitation' | 'application'
  invitation_id: UUID | null
  status: ApplicationStatus
  status_reason: string | null
  brokerage_type: BrokerageType | null
  sections: Partial<Record<OnboardingSection, SectionValues>>
  current_section: OnboardingSection | null
  declared_modules: ProductModule[]
  migration_choice: 'import' | 'empty' | null
  assigned_reviewer: UUID | null
  revision: number
  submitted_at: ISODate | null
  approved_at: ISODate | null
  approved_by: UUID | null
  activated_at: ISODate | null
  activated_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface OnboardingStatusEvent {
  id: UUID
  tenant_id: UUID
  application_id: UUID
  from_status: ApplicationStatus | null
  to_status: ApplicationStatus
  reason: string | null
  actor_id: UUID | null
  actor_type: 'user' | 'platform' | 'agent' | 'system'
  created_at: ISODate
}

export type RequirementKind = 'document' | 'field' | 'task' | 'attestation'

/** Global configuration. id equals key locally; key is the primary key in the target schema. */
export interface OnboardingRequirement {
  id: string
  key: string
  section: OnboardingSection
  kind: RequirementKind
  label: string
  guidance: string | null
  brokerage_types: BrokerageType[]
  modules: ProductModule[]
  is_required: boolean
  version: number
  is_active: boolean
}

export type DocumentReviewStatus = 'uploaded' | 'in_review' | 'accepted' | 'rejected' | 'superseded'

export interface Document {
  id: UUID
  tenant_id: UUID
  owner_table: string
  owner_id: UUID
  doc_type: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  sha256: string
  storage_path: string
  review_status: DocumentReviewStatus
  data_origin: DataOrigin
  uploaded_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

/** Local stand-in for a Supabase Storage object in the private tenant-documents bucket. */
export interface StorageObject {
  id: UUID
  tenant_id: UUID
  path: string
  mime_type: string | null
  size: number
  /** Base64 content; omitted for files too large to keep in browser storage. */
  content_base64: string | null
  created_at: ISODate
}

/** Local stand-in for a signed, expiring storage URL. */
export interface DocumentLink {
  id: UUID
  tenant_id: UUID
  document_id: UUID
  token: string
  issued_to: UUID
  expires_at: ISODate
  created_at: ISODate
}

export type ItemStatus = 'outstanding' | 'submitted' | 'accepted' | 'correction_requested' | 'rejected' | 'waived'

export interface OnboardingItem {
  id: UUID
  tenant_id: UUID
  application_id: UUID
  requirement_key: string
  status: ItemStatus
  document_id: UUID | null
  reviewed_by: UUID | null
  reviewed_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface OnboardingFeedback {
  id: UUID
  tenant_id: UUID
  application_id: UUID
  item_id: UUID | null
  body: string
  author_id: UUID
  resolved_at: ISODate | null
  created_at: ISODate
}

export interface OnboardingInternalNote {
  id: UUID
  tenant_id: UUID
  application_id: UUID
  item_id: UUID | null
  body: string
  author_id: UUID
  created_at: ISODate
}

export interface ExtractedFieldProposal {
  id: UUID
  tenant_id: UUID
  document_id: UUID
  target_table: 'brokerage_applications'
  /** Section and field, for example "organisation.registration_number". */
  target_field: string
  current_value: Json
  suggested_value: Json
  source_page: string | null
  source_excerpt: string | null
  confidence: number | null
  method: 'simulated' | 'parsed' | 'model'
  status: 'suggested' | 'applied' | 'dismissed'
  decided_by: UUID | null
  decided_at: ISODate | null
  created_at: ISODate
}

export interface OrganisationProductModule {
  id: UUID
  tenant_id: UUID
  module: ProductModule
  status: 'declared' | 'approved' | 'enabled' | 'disabled'
  decided_by: UUID | null
  decided_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface OrganisationCommercialTerms {
  id: UUID
  tenant_id: UUID
  package_key: string
  terms: Record<string, Json>
  status: 'proposed' | 'agreed' | 'superseded'
  agreed_by: UUID | null
  agreed_at: ISODate | null
  created_at: ISODate
}

export type InsurerAccessStatus = 'not_configured' | 'awaiting_credentials' | 'testing' | 'enabled' | 'disabled'

export interface InsurerAccess {
  id: UUID
  tenant_id: UUID
  insurer_id: UUID
  product_module: ProductModule
  intermediary_code: string | null
  mandate: Record<string, Json>
  integration_key: string | null
  status: InsurerAccessStatus
  status_reason: string | null
  last_test_at: ISODate | null
  last_test_result: 'passed' | 'failed' | 'unsupported' | null
  enabled_by: UUID | null
  enabled_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface InsurerAccessCredential {
  id: UUID
  tenant_id: UUID
  insurer_access_id: UUID
  vault_secret_id: UUID
  masked_hint: string
  rotated_at: ISODate
  created_at: ISODate
}

/** Local stand-in for Supabase Vault. Only the insurer-access server module reads it, and no handler returns it. */
export interface VaultSecret {
  id: UUID
  tenant_id: UUID
  secret: string
  created_at: ISODate
}

export interface OnboardingTables {
  organisation_memberships: OrganisationMembership[]
  platform_staff: PlatformStaff[]
  auth_identities: AuthIdentity[]
  brokerage_invitations: BrokerageInvitation[]
  brokerage_applications: BrokerageApplication[]
  onboarding_status_events: OnboardingStatusEvent[]
  onboarding_requirements: OnboardingRequirement[]
  documents: Document[]
  storage_objects: StorageObject[]
  document_links: DocumentLink[]
  onboarding_items: OnboardingItem[]
  onboarding_feedback: OnboardingFeedback[]
  onboarding_internal_notes: OnboardingInternalNote[]
  extracted_field_proposals: ExtractedFieldProposal[]
  organisation_product_modules: OrganisationProductModule[]
  organisation_commercial_terms: OrganisationCommercialTerms[]
  insurer_access: InsurerAccess[]
  insurer_access_credentials: InsurerAccessCredential[]
  vault_secrets: VaultSecret[]
}
