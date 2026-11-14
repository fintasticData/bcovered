// Onboarding configuration: requirement checklist, section fields, platform packages and role capabilities.
// Requirements mirror the starting rows inserted by migration 0010 and are filtered by brokerage type and product module.
// Packages and terms are placeholders until B-Covered agrees its commercial model.
import type {
  BrokerageType,
  MemberRole,
  OnboardingRequirement,
  OnboardingSection,
  PlatformRole,
  ProductModule,
} from '../db/onboardingSchema'

export const BROKERAGE_TYPES: Array<{ value: BrokerageType; label: string }> = [
  { value: 'independent', label: 'Independent brokerage (own FSP licence)' },
  { value: 'juristic_representative_network', label: 'Network with juristic representatives' },
  { value: 'sole_proprietor', label: 'Sole proprietor' },
  { value: 'corporate_broker', label: 'Corporate or employee-benefits broker' },
]

export const PRODUCT_MODULES: Array<{ value: ProductModule; label: string; description: string }> = [
  { value: 'personal_lines', label: 'Personal lines', description: 'Motor, household and personal short-term cover' },
  { value: 'commercial', label: 'Commercial', description: 'Business Risk Twin, exposures and underwriting submissions' },
  { value: 'individual_life', label: 'Individual life', description: 'Needs analysis, life quotes and Records of Advice' },
  { value: 'group_risk', label: 'Group risk', description: 'Employer schemes, movements and contribution reconciliation' },
  { value: 'retirement', label: 'Retirement', description: 'Fund oversight, valuations and transfers' },
]

export const MODULE_LABEL = Object.fromEntries(PRODUCT_MODULES.map((m) => [m.value, m.label])) as Record<ProductModule, string>

export interface SectionDef {
  key: OnboardingSection
  label: string
  summary: string
}

export const SECTIONS: SectionDef[] = [
  { key: 'organisation', label: 'Organisation', summary: 'Legal and trading names, registration, addresses and contacts' },
  { key: 'profile', label: 'Brokerage profile', summary: 'FSP details, responsible people and declared scope' },
  { key: 'team', label: 'Team', summary: 'Owner, administrators, representatives and their roles' },
  { key: 'products', label: 'Products', summary: 'The product modules you intend to use' },
  { key: 'insurer_access', label: 'Insurer access', summary: 'Insurer relationships, intermediary codes and mandates' },
  { key: 'documents', label: 'Documents', summary: 'Supporting documents and their review status' },
  { key: 'commercial', label: 'Commercial setup', summary: 'Platform package and commercial terms' },
  { key: 'migration', label: 'Migration', summary: 'Import your client book or start with an empty workspace' },
  { key: 'readiness', label: 'Readiness', summary: 'Outstanding tasks, review decisions and submission' },
]

export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'multi' | 'checkbox'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: Array<{ value: string; label: string }>
  hint?: string
  /** Validation applied server-side when a value is present. */
  format?: 'email' | 'phone' | 'company_registration' | 'fsp_number'
}

const LICENCE_CATEGORIES = [
  { value: 'st_personal', label: 'Short-term personal lines' },
  { value: 'st_commercial', label: 'Short-term commercial lines' },
  { value: 'lt_a', label: 'Long-term category A' },
  { value: 'lt_b1', label: 'Long-term category B1' },
  { value: 'lt_c', label: 'Long-term category C' },
  { value: 'retail_pension', label: 'Retail pension benefits' },
  { value: 'pension_fund_benefits', label: 'Pension fund benefits' },
]

export const SECTION_FIELDS: Partial<Record<OnboardingSection, FieldDef[]>> = {
  organisation: [
    { key: 'legal_name', label: 'Legal name', type: 'text', required: true },
    { key: 'trading_name', label: 'Trading name', type: 'text', required: true },
    { key: 'registration_number', label: 'Company registration number', type: 'text', required: true, format: 'company_registration', hint: 'As on the CIPC certificate, for example 2014/123456/07' },
    { key: 'vat_number', label: 'VAT number', type: 'text' },
    { key: 'brokerage_type', label: 'Brokerage type', type: 'select', required: true, options: BROKERAGE_TYPES },
    { key: 'registered_address', label: 'Registered address', type: 'textarea', required: true },
    { key: 'operating_address', label: 'Operating address (if different)', type: 'textarea' },
    { key: 'primary_contact_name', label: 'Primary contact name', type: 'text', required: true },
    { key: 'primary_contact_email', label: 'Primary contact email', type: 'email', required: true, format: 'email' },
    { key: 'primary_contact_phone', label: 'Primary contact phone', type: 'tel', required: true, format: 'phone' },
    { key: 'finance_contact_email', label: 'Finance contact email', type: 'email', format: 'email' },
  ],
  profile: [
    { key: 'fsp_number', label: 'FSP number', type: 'text', required: true, format: 'fsp_number', hint: 'Declared here and checked by B-Covered staff' },
    { key: 'licence_categories', label: 'Declared licence categories', type: 'multi', required: true, options: LICENCE_CATEGORIES },
    { key: 'key_individual', label: 'Key individual', type: 'text', required: true },
    { key: 'compliance_officer', label: 'Compliance officer (person or firm)', type: 'text', required: true },
    { key: 'service_scope', label: 'Products and services you provide', type: 'textarea' },
  ],
  products: [{ key: 'modules', label: 'Product modules', type: 'multi', required: true, options: PRODUCT_MODULES.map(({ value, label }) => ({ value, label })) }],
  migration: [
    { key: 'choice', label: 'How would you like to start?', type: 'select', required: true, options: [{ value: 'import', label: 'Import my existing client book' }, { value: 'empty', label: 'Start with an empty workspace' }] },
    { key: 'source_system', label: 'Current system (if importing)', type: 'text', hint: 'For example the name of your current CRM or spreadsheet' },
    { key: 'estimated_clients', label: 'Approximate number of clients', type: 'text' },
    { key: 'transfer_attestation', label: 'We are authorised to transfer our clients’ personal information to the platform (POPIA)', type: 'checkbox' },
  ],
}

/** Fields that satisfy a field requirement, as section.field. */
export const REQUIREMENT_FIELDS: Record<string, string[]> = {
  org_registration: ['organisation.legal_name', 'organisation.trading_name', 'organisation.registration_number', 'organisation.brokerage_type'],
  org_addresses: ['organisation.registered_address'],
  org_contacts: ['organisation.primary_contact_name', 'organisation.primary_contact_email', 'organisation.primary_contact_phone'],
  profile_fsp: ['profile.fsp_number', 'profile.licence_categories'],
  profile_key_individual: ['profile.key_individual', 'profile.compliance_officer'],
  products_scope: ['products.modules'],
  migration_plan: ['migration.choice'],
}

type RequirementSeed = Omit<OnboardingRequirement, 'id' | 'version' | 'is_active' | 'brokerage_types' | 'modules' | 'guidance' | 'is_required'> &
  Partial<Pick<OnboardingRequirement, 'brokerage_types' | 'modules' | 'guidance' | 'is_required'>>

const REQUIREMENT_SEEDS: RequirementSeed[] = [
  { key: 'org_registration', section: 'organisation', kind: 'field', label: 'Legal name, trading name and company registration number' },
  { key: 'org_addresses', section: 'organisation', kind: 'field', label: 'Registered and operating addresses' },
  { key: 'org_contacts', section: 'organisation', kind: 'field', label: 'Primary and finance contacts' },
  { key: 'profile_fsp', section: 'profile', kind: 'field', label: 'FSP number and declared licence categories', guidance: 'Declared details are checked by B-Covered staff; approval is not regulatory authorisation.' },
  { key: 'profile_key_individual', section: 'profile', kind: 'field', label: 'Key individual and compliance officer' },
  { key: 'team_owner', section: 'team', kind: 'task', label: 'Owner and at least one representative on the team', guidance: 'Invite a representative, or the owner can act as one in a sole-proprietor brokerage.' },
  { key: 'products_scope', section: 'products', kind: 'field', label: 'Product modules you intend to use' },
  { key: 'insurer_relationships', section: 'insurer_access', kind: 'field', label: 'Insurer relationships and intermediary codes', guidance: 'Each insurer is configured and enabled separately after activation.', is_required: false },
  { key: 'doc_cipc', section: 'documents', kind: 'document', label: 'Company registration certificate (CIPC)' },
  { key: 'doc_fsp_licence', section: 'documents', kind: 'document', label: 'FSP licence and licence conditions' },
  { key: 'doc_pi_cover', section: 'documents', kind: 'document', label: 'Professional indemnity and fidelity cover schedule' },
  { key: 'doc_fica', section: 'documents', kind: 'document', label: 'Proof of address and director identity (FICA)' },
  { key: 'doc_compliance_report', section: 'documents', kind: 'document', label: 'Latest compliance officer report', brokerage_types: ['independent', 'juristic_representative_network'] },
  { key: 'doc_life_mandate', section: 'documents', kind: 'document', label: 'Long-term insurer intermediary agreement', modules: ['individual_life', 'group_risk'] },
  { key: 'doc_retirement_mandate', section: 'documents', kind: 'document', label: 'Retirement fund administrator or fund mandate', modules: ['retirement'] },
  { key: 'doc_commercial_binder', section: 'documents', kind: 'document', label: 'Commercial binder or UMA agreements (if any)', modules: ['commercial'], is_required: false },
  { key: 'commercial_terms', section: 'commercial', kind: 'attestation', label: 'Platform package selected and terms agreed' },
  { key: 'migration_plan', section: 'migration', kind: 'field', label: 'Client-book import plan or start empty' },
  { key: 'popia_transfer', section: 'migration', kind: 'attestation', label: 'Confirmation that you may transfer your client information to the platform', guidance: 'Not needed if you start with an empty workspace.' },
]

export const REQUIREMENTS: OnboardingRequirement[] = REQUIREMENT_SEEDS.map((r) => ({
  brokerage_types: [],
  modules: [],
  guidance: null,
  is_required: true,
  ...r,
  id: r.key,
  version: 1,
  is_active: true,
}))

/** Requirements that apply to a brokerage type and its declared modules. Empty filters apply to everyone. */
export function applicableRequirements(all: OnboardingRequirement[], type: BrokerageType | null, modules: ProductModule[]) {
  return all.filter(
    (r) =>
      r.is_active &&
      (!r.brokerage_types.length || (type !== null && r.brokerage_types.includes(type))) &&
      (!r.modules.length || r.modules.some((m) => modules.includes(m))),
  )
}

export interface PlatformPackage {
  key: string
  label: string
  summary: string
  users: string
  modules: ProductModule[] | 'all'
  monthly_fee: number | null
}

export const PACKAGES: PlatformPackage[] = [
  { key: 'starter', label: 'Starter', summary: 'Personal-lines quoting and client servicing for small brokerages', users: 'Up to 5 users', modules: ['personal_lines'], monthly_fee: 2950 },
  { key: 'growth', label: 'Growth', summary: 'All product modules, Russ and assisted client-book migration', users: 'Up to 25 users', modules: 'all', monthly_fee: 7500 },
  { key: 'network', label: 'Network', summary: 'Juristic representative networks with central compliance oversight', users: 'Unlimited users', modules: 'all', monthly_fee: null },
]

export const TERMS_VERSION = 'platform-terms-draft-2026-11'

export const ROLE_LABEL: Record<MemberRole, string> = {
  brokerage_owner: 'Brokerage owner',
  brokerage_admin: 'Brokerage administrator',
  representative: 'Broker / representative',
  operations_admin: 'Operations administrator',
  compliance_reviewer: 'Compliance reviewer',
  read_only: 'Read-only user',
  sub_broker: 'Sub-broker',
  agent: 'Agent',
}

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  platform_admin: 'Platform administrator',
  onboarding_reviewer: 'Onboarding reviewer',
  platform_read_only: 'Platform read-only',
}

export type Capability =
  | 'edit_setup'
  | 'upload_documents'
  | 'submit'
  | 'manage_team'
  | 'agree_terms'
  | 'manage_insurers'
  | 'import_clients'
  | 'operate'

const CAPABILITIES: Record<Capability, MemberRole[]> = {
  edit_setup: ['brokerage_owner', 'brokerage_admin'],
  upload_documents: ['brokerage_owner', 'brokerage_admin', 'operations_admin'],
  submit: ['brokerage_owner', 'brokerage_admin'],
  manage_team: ['brokerage_owner', 'brokerage_admin'],
  agree_terms: ['brokerage_owner'],
  manage_insurers: ['brokerage_owner', 'brokerage_admin'],
  import_clients: ['brokerage_owner', 'brokerage_admin', 'operations_admin'],
  operate: ['brokerage_owner', 'brokerage_admin', 'representative', 'operations_admin', 'sub_broker', 'agent'],
}

export const can = (role: MemberRole | null | undefined, capability: Capability) => Boolean(role && CAPABILITIES[capability].includes(role))
export const capabilitiesOf = (role: MemberRole | null | undefined) => (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can(role, c))

export const READ_ONLY_ROLES: MemberRole[] = ['compliance_reviewer', 'read_only']

/** Membership roles mapped to the demo roles the existing broker modules check. */
export const LEGACY_ROLE: Record<MemberRole, 'manager' | 'broker'> = {
  brokerage_owner: 'manager',
  brokerage_admin: 'manager',
  representative: 'broker',
  operations_admin: 'broker',
  compliance_reviewer: 'broker',
  read_only: 'broker',
  sub_broker: 'broker',
  agent: 'broker',
}

/** Roles that only ever see the clients assigned to them (enforced by the book_scope policies in migration 0019). */
export const BOOK_RESTRICTED_ROLES: MemberRole[] = ['sub_broker', 'agent']

export const INVITATION_TTL_DAYS = 7
export const DOCUMENT_LINK_TTL_MINUTES = 5
/** Files larger than this keep their metadata only; browser storage is small. */
export const MAX_STORED_FILE_BYTES = 200_000
export const MAX_UPLOAD_BYTES = 5_000_000
