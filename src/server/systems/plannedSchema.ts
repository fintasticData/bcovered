// Target normalised schema for the dedicated InsureFlow Supabase project (insureflow-dev, then insureflow-prod).
// Planning registry only: nothing here is applied. The Systems section renders the ERD and screen alignment from it,
// and src/server/__tests__/systems.test.ts keeps it consistent with the routes and the in-browser demo tables.

export type DomainKey =
  | 'platform'
  | 'crm'
  | 'reference'
  | 'personal'
  | 'policies_claims'
  | 'twin'
  | 'submissions'
  | 'agent_ops'
  | 'systems'

export type TableStatus = 'carried' | 'reshaped' | 'new'

export type KeyKind = 'PK' | 'FK' | 'UK' | 'PK, FK'

export interface PlannedColumn {
  name: string
  type: string
  key?: KeyKind
  /** Referenced table for FK columns. */
  ref?: string
  optional?: boolean
  note?: string
}

export interface PlannedTable {
  name: string
  domain: DomainKey
  status: TableStatus
  /** Tenant tables also carry tenant_id with tenant-safe composite foreign keys; global tables are platform-wide. */
  scope: 'tenant' | 'global'
  purpose: string
  columns: PlannedColumn[]
  /** Current demo or migration tables this one replaces or absorbs. */
  replaces?: string[]
  /** What changed against migrations 0001–0003, for reshaped tables. */
  changes?: string[]
}

export interface Domain {
  key: DomainKey
  label: string
  summary: string
}

export const DOMAINS: Domain[] = [
  { key: 'platform', label: 'Platform and identity', summary: 'Tenants, people linked to Supabase Auth, roles and portal access.' },
  { key: 'crm', label: 'Customers and contact', summary: 'Customers, contacts, consent, conversations, leads, enquiries, messages and tasks.' },
  { key: 'reference', label: 'Reference data', summary: 'Lookups shared across screens: products, insurers, industries, cover classes and claim types.' },
  { key: 'personal', label: 'Personal-lines quoting', summary: 'Simulated comparisons and their options and terms.' },
  { key: 'policies_claims', label: 'Policies and claims', summary: 'Policies (placed or existing evidence), sections, claims and documents.' },
  { key: 'twin', label: 'Commercial Risk Twin', summary: 'Business profile, graph entities and links, exposures, assessments and coverage evidence.' },
  { key: 'submissions', label: 'Submissions', summary: 'Draft underwriting submission packs and their sections.' },
  { key: 'agent_ops', label: 'Agents, copilots and jobs', summary: 'Agent and tool catalogue, workflows, durable jobs, approvals and audit.' },
  { key: 'systems', label: 'Systems', summary: 'Components, dependencies, API endpoints and health checks.' },
]

const id = (): PlannedColumn => ({ name: 'id', type: 'uuid', key: 'PK' })
const key = (type = 'text'): PlannedColumn => ({ name: 'key', type, key: 'PK' })
const fk = (name: string, ref: string, optional = false, note?: string): PlannedColumn => ({ name, type: keyType(ref), key: 'FK', ref, optional, note })
const pkfk = (name: string, ref: string): PlannedColumn => ({ name, type: keyType(ref), key: 'PK, FK', ref })
const col = (name: string, type: string, note?: string): PlannedColumn => ({ name, type, note })
const uk = (name: string, type = 'text', note?: string): PlannedColumn => ({ name, type, key: 'UK', note })

/** Lookup tables keyed by a text code rather than a uuid. */
const TEXT_KEYED = new Set(['roles', 'product_categories', 'industries', 'cover_classes', 'claim_types', 'approval_types'])
function keyType(ref: string) {
  return TEXT_KEYED.has(ref) ? 'text' : 'uuid'
}

export const PLANNED_TABLES: PlannedTable[] = [
  // ------------------------------------------------------------------ platform
  {
    name: 'organisations',
    domain: 'platform',
    status: 'carried',
    scope: 'global',
    purpose: 'Each brokerage tenant (BCovered is the first). Every tenant table references it.',
    columns: [id(), col('name', 'text'), uk('slug'), col('fsp_number', 'text'), col('fsp_verified', 'bool'), col('is_demo', 'bool')],
  },
  {
    name: 'app_users',
    domain: 'platform',
    status: 'reshaped',
    scope: 'global',
    purpose: 'A signed-in person. The id is the Supabase Auth user id.',
    columns: [{ ...id(), note: '= auth.users.id' }, uk('email'), col('full_name', 'text')],
    changes: ['id references auth.users(id)', 'role and tenant move to tenant_memberships', 'customer link moves to customer_user_access'],
  },
  {
    name: 'roles',
    domain: 'platform',
    status: 'new',
    scope: 'global',
    purpose: 'Visitor, customer, broker, claims admin, manager and admin.',
    columns: [key(), col('label', 'text'), col('is_staff', 'bool')],
  },
  {
    name: 'tenant_memberships',
    domain: 'platform',
    status: 'new',
    scope: 'global',
    purpose: 'Which tenants a person works in and with which role. Feeds the tenant and role claims in the login token.',
    columns: [pkfk('tenant_id', 'organisations'), pkfk('user_id', 'app_users'), fk('role_key', 'roles'), col('status', 'text')],
  },
  {
    name: 'customer_user_access',
    domain: 'platform',
    status: 'new',
    scope: 'tenant',
    purpose: 'Portal access: which customer records a signed-in person may see.',
    columns: [pkfk('user_id', 'app_users'), pkfk('customer_id', 'customers'), col('granted_at', 'timestamptz')],
  },

  // ------------------------------------------------------------------ crm
  {
    name: 'customers',
    domain: 'crm',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A personal or commercial customer of the brokerage.',
    columns: [id(), col('customer_type', 'text'), col('display_name', 'text'), col('status', 'text'), col('is_synthetic', 'bool'), fk('created_by', 'app_users', true)],
    changes: ['email and phone move to contacts', 'full_name becomes display_name'],
  },
  {
    name: 'contacts',
    domain: 'crm',
    status: 'new',
    scope: 'tenant',
    purpose: 'People at a customer: the personal customer themself or a business contact.',
    columns: [id(), fk('customer_id', 'customers'), col('full_name', 'text'), col('email', 'text'), col('phone', 'text'), col('role', 'text'), col('is_primary', 'bool')],
    replaces: ['customers.email', 'customers.phone', 'business_profiles.primary_contact'],
  },
  {
    name: 'customer_consents',
    domain: 'crm',
    status: 'carried',
    scope: 'tenant',
    purpose: 'POPIA processing and marketing consent with the notice version.',
    columns: [id(), fk('customer_id', 'customers'), col('purpose', 'text'), col('granted', 'bool'), col('notice_version', 'text'), col('captured_at', 'timestamptz'), col('revoked_at', 'timestamptz')],
  },
  {
    name: 'conversations',
    domain: 'crm',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A chat with Ava, the Business Discovery Agent or a Copilot.',
    columns: [id(), fk('customer_id', 'customers', true), fk('agent_id', 'agents', false, 'assistant or copilot'), col('channel', 'text'), col('context', 'jsonb')],
    changes: ['assistant text becomes agent_id → agents'],
  },
  {
    name: 'conversation_messages',
    domain: 'crm',
    status: 'carried',
    scope: 'tenant',
    purpose: 'Each message in a conversation.',
    columns: [id(), fk('conversation_id', 'conversations'), col('role', 'text'), col('content', 'text'), col('structured', 'jsonb')],
  },
  {
    name: 'leads',
    domain: 'crm',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A qualified sales opportunity from Ava, the quote form or an enquiry.',
    columns: [
      id(),
      fk('customer_id', 'customers'),
      fk('conversation_id', 'conversations', true),
      fk('product_category_key', 'product_categories'),
      col('line', 'text'),
      col('status', 'text'),
      col('urgency', 'text'),
      col('source', 'text', 'ava | quote_form | enquiry | broker'),
      col('qualification', 'jsonb'),
    ],
    changes: ['product_category becomes a reference to product_categories'],
  },
  {
    name: 'enquiries',
    domain: 'crm',
    status: 'new',
    scope: 'tenant',
    purpose: 'Callback requests from the contact page, before they become a customer or lead.',
    columns: [
      id(),
      col('full_name', 'text'),
      col('phone', 'text'),
      col('email', 'text'),
      col('topic', 'text'),
      col('preferred_time', 'text'),
      col('message', 'text'),
      col('status', 'text'),
      fk('customer_id', 'customers', true),
      fk('lead_id', 'leads', true),
    ],
    replaces: ['/contact form (not stored today)'],
  },
  {
    name: 'communications',
    domain: 'crm',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Preview-only email, WhatsApp and in-app drafts.',
    columns: [
      id(),
      fk('customer_id', 'customers'),
      fk('contact_id', 'contacts', true),
      fk('quote_id', 'quotes', true),
      fk('job_id', 'jobs', true),
      col('channel', 'text'),
      col('template', 'text'),
      col('status', 'text'),
      col('preview_only', 'bool'),
    ],
    changes: ['adds contact_id so the recipient is a real contact record'],
  },
  {
    name: 'tasks',
    domain: 'crm',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Document and information requests, broker reviews and follow-ups.',
    columns: [
      id(),
      fk('customer_id', 'customers', true),
      fk('business_profile_id', 'business_profiles', true),
      fk('exposure_id', 'risk_exposures', true),
      fk('submission_id', 'commercial_submissions', true),
      fk('claim_id', 'claims', true),
      fk('assigned_to', 'app_users', true),
      fk('job_id', 'jobs', true),
      col('kind', 'text'),
      col('audience', 'text'),
      col('title', 'text'),
      col('status', 'text'),
      col('dedupe_key', 'text'),
    ],
    changes: ['subject_table/subject_id become typed optional references, at most one set'],
  },

  // ------------------------------------------------------------------ reference
  {
    name: 'product_categories',
    domain: 'reference',
    status: 'new',
    scope: 'global',
    purpose: 'Car, buildings, contents, motorcycle, valuables and business. Seeded from src/data/products.ts.',
    columns: [key(), col('line', 'text'), col('label', 'text')],
  },
  {
    name: 'insurers',
    domain: 'reference',
    status: 'reshaped',
    scope: 'global',
    purpose: 'Insurer panel used by quotes and policies.',
    columns: [id(), uk('name'), col('is_fictional', 'bool')],
    changes: ['drops check (is_fictional) so real insurers can be added later'],
  },
  {
    name: 'industries',
    domain: 'reference',
    status: 'new',
    scope: 'global',
    purpose: 'The 14 commercial industries. Seeded from industryTemplates.ts.',
    columns: [key(), col('name', 'text'), col('summary', 'text')],
  },
  {
    name: 'industry_risk_templates',
    domain: 'reference',
    status: 'reshaped',
    scope: 'global',
    purpose: 'Versioned template content per industry. Content stays jsonb because it is versioned configuration.',
    columns: [id(), fk('industry_key', 'industries'), fk('tenant_id', 'organisations', true, 'null = platform default'), col('version', 'int'), col('content', 'jsonb'), col('is_active', 'bool')],
    changes: ['ten jsonb columns fold into one versioned content document', 'tenant override is optional'],
  },
  {
    name: 'cover_classes',
    domain: 'reference',
    status: 'new',
    scope: 'global',
    purpose: 'The 25 cover sections in 6 areas. Seeded from coverClasses.ts.',
    columns: [key(), col('area', 'text'), col('label', 'text')],
  },
  {
    name: 'claim_types',
    domain: 'reference',
    status: 'new',
    scope: 'global',
    purpose: 'Claim types offered on the claims page.',
    columns: [key(), col('label', 'text'), col('line', 'text')],
  },

  // ------------------------------------------------------------------ personal
  {
    name: 'quotes',
    domain: 'personal',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A simulated comparison for a lead, released only after broker approval.',
    columns: [
      id(),
      fk('customer_id', 'customers'),
      fk('lead_id', 'leads', true),
      fk('product_category_key', 'product_categories'),
      col('status', 'text'),
      col('risk_summary', 'jsonb'),
      col('proposal', 'jsonb'),
      col('released_at', 'timestamptz'),
      col('is_simulated', 'bool'),
    ],
  },
  {
    name: 'quote_options',
    domain: 'personal',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'One insurer option within a comparison.',
    columns: [
      id(),
      fk('quote_id', 'quotes'),
      fk('insurer_id', 'insurers'),
      col('option_label', 'text'),
      col('monthly_premium', 'numeric'),
      col('annual_premium', 'numeric'),
      col('sum_insured', 'numeric'),
      col('excess', 'numeric'),
      col('expires_at', 'timestamptz'),
      col('is_simulated', 'bool'),
    ],
    changes: ['inclusions, exclusions, conditions and assumptions move to quote_option_terms'],
  },
  {
    name: 'quote_option_terms',
    domain: 'personal',
    status: 'new',
    scope: 'tenant',
    purpose: 'Each inclusion, exclusion, condition or assumption of an option, in order.',
    columns: [id(), fk('quote_option_id', 'quote_options'), col('term_type', 'text'), col('seq', 'int'), col('text', 'text')],
    replaces: ['quote_options.inclusions', 'quote_options.exclusions', 'quote_options.conditions', 'quote_options.assumptions'],
  },

  // ------------------------------------------------------------------ policies and claims
  {
    name: 'policies',
    domain: 'policies_claims',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A policy a customer holds: placed by the brokerage, declared or extracted from a document.',
    columns: [
      id(),
      fk('customer_id', 'customers'),
      fk('business_profile_id', 'business_profiles', true),
      fk('insurer_id', 'insurers'),
      fk('document_id', 'documents', true),
      col('policy_number', 'text'),
      col('origin', 'text', 'placed | existing_declared | existing_extracted'),
      col('inception_date', 'date'),
      col('renewal_date', 'date'),
      col('source', 'provenance'),
    ],
    replaces: ['insurance_policies', 'business_profiles.existing_cover'],
    changes: ['insurer text becomes insurer_id → insurers'],
  },
  {
    name: 'policy_sections',
    domain: 'policies_claims',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A section of a policy with its sum insured or limit.',
    columns: [
      id(),
      fk('policy_id', 'policies'),
      fk('cover_class_key', 'cover_classes'),
      fk('document_id', 'documents', true),
      col('section_name', 'text'),
      col('sum_insured', 'numeric'),
      col('limit_of_indemnity', 'numeric'),
      col('excess', 'text'),
      col('basis', 'text'),
      col('page_ref', 'text'),
      col('source', 'provenance'),
    ],
    changes: ['conditions, exclusions and warranties move to policy_section_terms', 'business_profile_id removed (reached through the policy)'],
  },
  {
    name: 'policy_section_terms',
    domain: 'policies_claims',
    status: 'new',
    scope: 'tenant',
    purpose: 'Each condition, exclusion or warranty in a policy section, with its page reference.',
    columns: [id(), fk('policy_section_id', 'policy_sections'), col('term_type', 'text'), col('text', 'text'), col('page_ref', 'text')],
    replaces: ['policy_sections.conditions', 'policy_sections.exclusions', 'policy_sections.warranties'],
  },
  {
    name: 'claims',
    domain: 'policies_claims',
    status: 'new',
    scope: 'tenant',
    purpose: 'A claim logged on the claims page, tracked by its reference.',
    columns: [
      id(),
      uk('reference'),
      fk('customer_id', 'customers', true),
      fk('policy_id', 'policies', true),
      fk('claim_type_key', 'claim_types'),
      fk('reported_by_contact_id', 'contacts', true),
      col('policy_number_given', 'text', 'as typed, until matched to a policy'),
      col('incident_date', 'date'),
      col('description', 'text'),
      col('status', 'text'),
    ],
    replaces: ['bcovered_claims (browser storage)'],
  },
  {
    name: 'claim_status_events',
    domain: 'policies_claims',
    status: 'new',
    scope: 'tenant',
    purpose: 'Each stage a claim passes through, shown on the tracking view.',
    columns: [id(), fk('claim_id', 'claims'), col('status', 'text'), col('note', 'text'), fk('actor_user_id', 'app_users', true), col('created_at', 'timestamptz')],
  },
  {
    name: 'documents',
    domain: 'policies_claims',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'An uploaded file in Supabase Storage, owned by a customer and optionally tied to a business or claim.',
    columns: [
      id(),
      fk('customer_id', 'customers'),
      fk('business_profile_id', 'business_profiles', true),
      fk('claim_id', 'claims', true),
      fk('uploaded_by', 'app_users', true),
      col('doc_type', 'text'),
      col('storage_path', 'text'),
      col('file_name', 'text'),
      col('status', 'text'),
      col('is_simulated', 'bool'),
    ],
    replaces: ['business_documents', 'claim file names (browser storage)'],
  },

  // ------------------------------------------------------------------ twin
  {
    name: 'business_profiles',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'The commercial view of a customer: one per business.',
    columns: [
      id(),
      { ...fk('customer_id', 'customers'), key: 'FK', note: 'unique' },
      fk('industry_key', 'industries'),
      fk('primary_legal_entity_id', 'business_legal_entities', true),
      fk('assigned_broker_id', 'app_users', true),
      col('trading_name', 'text'),
      col('years_trading', 'int'),
      col('annual_turnover', 'numeric'),
      col('employee_count', 'int'),
      col('field_sources', 'jsonb', 'provenance per profile field'),
      col('status', 'text'),
    ],
    changes: [
      'registered name and registration number come from the primary legal entity',
      'primary_contact → contacts, existing_cover → policies, loss_history → loss_events',
      'industry_key references industries',
    ],
  },
  {
    name: 'twin_entities',
    domain: 'twin',
    status: 'new',
    scope: 'tenant',
    purpose: 'Every node of the Risk Twin graph. Legal entities, locations, activities and assets share its id.',
    columns: [id(), fk('business_profile_id', 'business_profiles'), col('entity_type', 'text', 'legal_entity | location | activity | asset'), col('source', 'provenance')],
  },
  {
    name: 'business_legal_entities',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Registered companies within the business.',
    columns: [pkfk('id', 'twin_entities'), col('legal_name', 'text'), col('registration_number', 'text'), col('vat_number', 'text'), col('role', 'text')],
    changes: ['id is the twin_entities id', 'source moves to twin_entities'],
  },
  {
    name: 'business_locations',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Premises the business operates from.',
    columns: [
      pkfk('id', 'twin_entities'),
      fk('legal_entity_id', 'business_legal_entities', true),
      col('name', 'text'),
      col('city', 'text'),
      col('province', 'text'),
      col('occupancy', 'text'),
      col('ownership', 'text'),
      col('construction', 'text'),
      col('backup_power', 'bool'),
      col('public_access', 'bool'),
    ],
    changes: ['fire_protection and security move to location_protections'],
  },
  {
    name: 'location_protections',
    domain: 'twin',
    status: 'new',
    scope: 'tenant',
    purpose: 'Fire and security measures at a location.',
    columns: [id(), fk('location_id', 'business_locations'), col('kind', 'text', 'fire | security'), col('measure', 'text')],
    replaces: ['business_locations.fire_protection', 'business_locations.security'],
  },
  {
    name: 'business_activities',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Operations, revenue streams and dependencies.',
    columns: [pkfk('id', 'twin_entities'), fk('location_id', 'business_locations', true), col('kind', 'text'), col('name', 'text'), col('share_of_revenue', 'numeric')],
  },
  {
    name: 'commercial_assets',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Buildings, contents, stock, machinery, vehicles and other assets.',
    columns: [
      pkfk('id', 'twin_entities'),
      fk('location_id', 'business_locations', true),
      col('asset_class', 'text'),
      col('description', 'text'),
      col('quantity', 'int'),
      col('declared_value', 'numeric'),
      col('value_basis', 'text'),
      col('valuation_date', 'date'),
    ],
  },
  {
    name: 'entity_links',
    domain: 'twin',
    status: 'new',
    scope: 'tenant',
    purpose: 'Operational dependencies between Twin nodes (supports, stores, feeds, supplies, serves, depends on).',
    columns: [
      id(),
      fk('business_profile_id', 'business_profiles'),
      fk('from_entity_id', 'twin_entities'),
      fk('to_entity_id', 'twin_entities'),
      fk('confirmed_by', 'app_users', true),
      col('relation', 'text'),
      col('source', 'provenance'),
      col('status', 'text'),
    ],
    replaces: ['risk_dependencies', 'business_dependency_links'],
    changes: ['structural links (owns, located at, operates at) are derived from foreign keys instead of stored'],
  },
  {
    name: 'loss_events',
    domain: 'twin',
    status: 'new',
    scope: 'tenant',
    purpose: 'Past losses and claims history declared by the business.',
    columns: [id(), fk('business_profile_id', 'business_profiles'), fk('location_id', 'business_locations', true), col('occurred_on', 'date'), col('cause', 'text'), col('amount', 'numeric'), col('source', 'provenance')],
    replaces: ['business_profiles.loss_history'],
  },
  {
    name: 'business_risk_profiles',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Each version of the Risk Twin, with a frozen snapshot for change comparison.',
    columns: [id(), fk('business_profile_id', 'business_profiles'), fk('template_id', 'industry_risk_templates'), fk('job_id', 'jobs', true), col('version', 'int'), col('status', 'text'), col('snapshot', 'jsonb')],
    changes: ['template_key/template_version become template_id', 'node and edge counts are derived'],
  },
  {
    name: 'risk_exposures',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A potential exposure identified on a Twin version.',
    columns: [
      id(),
      fk('risk_profile_id', 'business_risk_profiles'),
      fk('assigned_broker_id', 'app_users', true),
      fk('overridden_by', 'app_users', true),
      col('rule_key', 'text'),
      col('title', 'text'),
      col('category', 'text'),
      col('priority', 'text'),
      col('priority_override', 'text'),
      col('override_reason', 'text'),
      col('coverage_status', 'text'),
      col('evidence', 'jsonb', 'snapshot of facts used'),
    ],
    changes: ['location_ids → exposure_locations', 'potential_classes → exposure_cover_classes', 'business_profile_id removed (reached through the Twin version)'],
  },
  {
    name: 'exposure_locations',
    domain: 'twin',
    status: 'new',
    scope: 'tenant',
    purpose: 'Which locations an exposure affects.',
    columns: [pkfk('exposure_id', 'risk_exposures'), pkfk('location_id', 'business_locations')],
    replaces: ['risk_exposures.location_ids'],
  },
  {
    name: 'exposure_cover_classes',
    domain: 'twin',
    status: 'new',
    scope: 'tenant',
    purpose: 'Cover classes that may respond to an exposure.',
    columns: [pkfk('exposure_id', 'risk_exposures'), pkfk('cover_class_key', 'cover_classes')],
    replaces: ['risk_exposures.potential_classes'],
  },
  {
    name: 'risk_assessments',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'An assessment of a Twin version, from initial to incident-triggered.',
    columns: [
      id(),
      fk('risk_profile_id', 'business_risk_profiles'),
      fk('assessor_id', 'app_users', true),
      fk('job_id', 'jobs', true),
      col('assessment_type', 'text'),
      col('status', 'text'),
      col('scope', 'jsonb'),
      col('summary', 'text'),
      col('next_review_date', 'date'),
    ],
    changes: ['template and counts derived from the Twin version and findings', 'approval link lives on approval_requests.assessment_id'],
  },
  {
    name: 'risk_assessment_findings',
    domain: 'twin',
    status: 'carried',
    scope: 'tenant',
    purpose: 'Ranked, explained findings with broker accept, reject or override.',
    columns: [id(), fk('assessment_id', 'risk_assessments'), fk('exposure_id', 'risk_exposures', true), col('rank', 'int'), col('title', 'text'), col('priority', 'text'), col('fact_basis', 'provenance'), col('status', 'text'), col('broker_note', 'text')],
    changes: ['business_profile_id removed (reached through the assessment)'],
  },
  {
    name: 'coverage_findings',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Evidence that an exposure is or may be covered. Only a person can confirm cover or an exclusion.',
    columns: [
      id(),
      fk('exposure_id', 'risk_exposures'),
      fk('policy_section_id', 'policy_sections', true),
      fk('document_id', 'documents', true),
      fk('proposed_by_agent_id', 'agents', true),
      fk('reviewed_by', 'app_users', true),
      col('status', 'text'),
      col('clause_ref', 'text'),
      col('page_ref', 'text'),
      col('rationale', 'text'),
    ],
    changes: ['insurer and section_name come from the policy section'],
  },
  {
    name: 'twin_update_proposals',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Current and Suggested values extracted from a document, applied only by a broker.',
    columns: [id(), fk('document_id', 'documents'), fk('target_entity_id', 'twin_entities', true), fk('decided_by', 'app_users', true), col('kind', 'text'), col('label', 'text'), col('current', 'jsonb'), col('suggested', 'jsonb'), col('status', 'text')],
  },
  {
    name: 'risk_twin_change_events',
    domain: 'twin',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Differences between two Twin versions, with any review task created.',
    columns: [
      id(),
      fk('from_risk_profile_id', 'business_risk_profiles', true),
      fk('to_risk_profile_id', 'business_risk_profiles'),
      fk('entity_id', 'twin_entities', true),
      fk('task_id', 'tasks', true),
      col('change_type', 'text'),
      col('field', 'text'),
      col('before', 'jsonb'),
      col('after', 'jsonb'),
      col('finding', 'text'),
    ],
  },

  // ------------------------------------------------------------------ submissions
  {
    name: 'commercial_submissions',
    domain: 'submissions',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A draft underwriting submission pack awaiting broker approval.',
    columns: [
      id(),
      fk('business_profile_id', 'business_profiles'),
      fk('lead_id', 'leads', true),
      fk('risk_profile_id', 'business_risk_profiles', true),
      fk('job_id', 'jobs', true),
      fk('created_by', 'app_users', true),
      col('status', 'text'),
      col('pack', 'jsonb'),
      col('completeness', 'int'),
      col('approved_at', 'timestamptz'),
    ],
    changes: ['customer_id removed (reached through the business profile)'],
  },
  {
    name: 'submission_sections',
    domain: 'submissions',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'One cover section of a submission.',
    columns: [id(), fk('submission_id', 'commercial_submissions'), fk('cover_class_key', 'cover_classes'), col('status', 'text'), col('sum_insured', 'numeric'), col('limit_of_indemnity', 'numeric'), col('basis', 'text'), col('notes', 'text'), col('broker_edited', 'bool')],
    changes: ['asset_ids and exposure_ids move to submission_section_items'],
  },
  {
    name: 'submission_section_items',
    domain: 'submissions',
    status: 'new',
    scope: 'tenant',
    purpose: 'Assets and exposures included in a submission section.',
    columns: [id(), fk('section_id', 'submission_sections'), fk('asset_id', 'commercial_assets', true), fk('exposure_id', 'risk_exposures', true)],
    replaces: ['submission_sections.asset_ids', 'submission_sections.exposure_ids'],
  },

  // ------------------------------------------------------------------ agent operations
  {
    name: 'agents',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Every assistant, copilot, agent and engine. Seeded from src/server/agents/catalog.ts.',
    columns: [id(), uk('key'), col('label', 'text'), col('role', 'text'), col('kind', 'text', 'assistant | copilot | agent | engine'), col('is_active', 'bool')],
  },
  {
    name: 'agent_versions',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Released versions of an agent: adapter, model and prompt hash.',
    columns: [id(), fk('agent_id', 'agents'), fk('provider_component_id', 'system_components', true), col('version', 'int'), col('adapter', 'text'), col('model', 'text'), col('prompt_hash', 'text')],
  },
  {
    name: 'tools',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Typed tools agents and the API use to change data. Seeded from the tool registry.',
    columns: [id(), uk('name'), col('description', 'text'), col('side_effect', 'bool')],
  },
  {
    name: 'agent_tool_grants',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Which tools each agent may call.',
    columns: [pkfk('agent_id', 'agents'), pkfk('tool_id', 'tools')],
  },
  {
    name: 'tool_role_grants',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Which roles may call each tool.',
    columns: [pkfk('tool_id', 'tools'), pkfk('role_key', 'roles')],
  },
  {
    name: 'workflows',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Durable workflow definitions. Seeded from the registered workflows.',
    columns: [id(), uk('type'), col('title', 'text'), col('version', 'int'), col('restart_on_changes_from', 'text')],
  },
  {
    name: 'workflow_steps',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Ordered steps of a workflow and the agent that owns each one.',
    columns: [id(), fk('workflow_id', 'workflows'), fk('agent_id', 'agents'), col('seq', 'int'), col('key', 'text'), col('name', 'text')],
  },
  {
    name: 'jobs',
    domain: 'agent_ops',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A durable run of a workflow, with pause, resume, cancel and retry.',
    columns: [
      id(),
      fk('workflow_id', 'workflows'),
      fk('initiated_by', 'app_users', true),
      fk('customer_id', 'customers', true),
      fk('lead_id', 'leads', true),
      fk('quote_id', 'quotes', true),
      fk('business_profile_id', 'business_profiles', true),
      col('status', 'text'),
      col('idempotency_key', 'text'),
      col('attempt', 'int'),
      col('revision', 'int'),
      col('inputs', 'jsonb'),
      col('outputs', 'jsonb'),
    ],
    changes: ['workflow_type and agent text become workflow_id', 'adds business_profile_id'],
  },
  {
    name: 'job_steps',
    domain: 'agent_ops',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Each step of a job as it runs.',
    columns: [id(), fk('job_id', 'jobs'), fk('workflow_step_id', 'workflow_steps'), col('seq', 'int'), col('status', 'text'), col('output', 'jsonb'), col('error', 'jsonb')],
    changes: ['key, name and agent come from workflow_steps'],
  },
  {
    name: 'agent_runs',
    domain: 'agent_ops',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'One agent execution within a job step.',
    columns: [id(), fk('job_step_id', 'job_steps', true), fk('agent_version_id', 'agent_versions'), col('status', 'text'), col('tokens_in', 'int'), col('tokens_out', 'int')],
    changes: ['agent, adapter, model and prompt version come from agent_versions'],
  },
  {
    name: 'agent_tool_calls',
    domain: 'agent_ops',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Each tool call an agent made, including blocked calls.',
    columns: [id(), fk('agent_run_id', 'agent_runs'), fk('tool_id', 'tools'), col('status', 'text'), col('args', 'jsonb'), col('result', 'jsonb'), col('idempotency_key', 'text'), col('duration_ms', 'int')],
    changes: ['tool text becomes tool_id → tools'],
  },
  {
    name: 'approval_types',
    domain: 'agent_ops',
    status: 'new',
    scope: 'global',
    purpose: 'Kinds of action that need a person: proposal release, submission, assessment sign-off and others.',
    columns: [key(), col('label', 'text')],
  },
  {
    name: 'approval_requests',
    domain: 'agent_ops',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'A consequential action held for a person, pinned to the exact payload hash.',
    columns: [
      id(),
      fk('approval_type_key', 'approval_types'),
      fk('job_id', 'jobs', true),
      fk('quote_id', 'quotes', true),
      fk('submission_id', 'commercial_submissions', true),
      fk('assessment_id', 'risk_assessments', true),
      fk('communication_id', 'communications', true),
      fk('requested_by_agent_id', 'agents'),
      fk('decided_by', 'app_users', true),
      col('summary', 'text'),
      col('proposed_changes', 'jsonb'),
      col('payload_hash', 'text'),
      col('status', 'text'),
    ],
    changes: ['subject_table/subject_id become typed optional references, exactly one set', 'approval_type check list becomes approval_types'],
  },
  {
    name: 'audit_events',
    domain: 'agent_ops',
    status: 'reshaped',
    scope: 'tenant',
    purpose: 'Append-only record of every change by a person, agent or the system.',
    columns: [
      id(),
      fk('actor_user_id', 'app_users', true),
      fk('actor_agent_id', 'agents', true),
      fk('job_id', 'jobs', true),
      col('actor_type', 'text'),
      col('action', 'text'),
      col('entity_table', 'text', 'kept generic: append-only log'),
      col('entity_id', 'uuid'),
      col('before', 'jsonb'),
      col('after', 'jsonb'),
    ],
    changes: ['actor_id text becomes actor_user_id or actor_agent_id'],
  },

  // ------------------------------------------------------------------ systems
  {
    name: 'system_components',
    domain: 'systems',
    status: 'new',
    scope: 'global',
    purpose: 'Frontend, backend, database, functions, storage and external APIs per environment.',
    columns: [id(), col('key', 'text'), col('name', 'text'), col('kind', 'text'), col('environment', 'text'), col('base_url', 'text'), col('health_url', 'text'), col('secret_ref', 'text', 'env var name only, never the value')],
  },
  {
    name: 'component_dependencies',
    domain: 'systems',
    status: 'new',
    scope: 'global',
    purpose: 'Which components depend on which.',
    columns: [pkfk('component_id', 'system_components'), pkfk('depends_on_id', 'system_components')],
  },
  {
    name: 'api_endpoints',
    domain: 'systems',
    status: 'new',
    scope: 'global',
    purpose: 'Every read, database function and Edge Function the frontend calls.',
    columns: [id(), fk('component_id', 'system_components'), col('method', 'text'), col('path', 'text'), col('summary', 'text'), fk('min_role_key', 'roles', true)],
  },
  {
    name: 'health_checks',
    domain: 'systems',
    status: 'new',
    scope: 'global',
    purpose: 'Results of health checks per component.',
    columns: [{ name: 'id', type: 'bigint', key: 'PK' }, fk('component_id', 'system_components'), col('status', 'text'), col('latency_ms', 'int'), col('checked_at', 'timestamptz')],
  },
]

/** Demo or migration tables that have no direct successor. */
export const REMOVED_TABLES: Array<{ name: string; reason: string; successor: string }> = [
  { name: 'risk_dependencies', reason: 'Structural links are already captured by foreign keys; operational links are stored once.', successor: 'entity_links' },
  { name: 'business_dependency_links', reason: 'Merged with the per-version dependencies into one table.', successor: 'entity_links' },
  { name: 'insurance_policies', reason: 'Renamed and widened to hold brokerage-placed and existing policies.', successor: 'policies' },
  { name: 'business_documents', reason: 'Renamed and widened to hold claim and customer documents.', successor: 'documents' },
]

/** Where each current in-browser demo table goes in the target schema. */
export function plannedFor(currentTable: string): string | null {
  const removed = REMOVED_TABLES.find((r) => r.name === currentTable)
  if (removed) return removed.successor
  return PLANNED_TABLES.some((t) => t.name === currentTable) ? currentTable : null
}

export interface Relationship {
  from: string
  column: string
  to: string
  optional: boolean
}

export function relationships(): Relationship[] {
  return PLANNED_TABLES.flatMap((t) =>
    t.columns.filter((c) => c.ref).map((c) => ({ from: t.name, column: c.name, to: c.ref!, optional: Boolean(c.optional) })),
  )
}

export const tableByName = (name: string) => PLANNED_TABLES.find((t) => t.name === name)

/** Mermaid ER source for one domain (or all), including referenced tables from other domains as bare entities. */
export function erdSource(domain: DomainKey | 'all'): string {
  const own = PLANNED_TABLES.filter((t) => domain === 'all' || t.domain === domain)
  const names = new Set(own.map((t) => t.name))
  const lines = ['erDiagram']
  for (const r of relationships().filter((rel) => names.has(rel.from))) {
    lines.push(`  ${r.to} ${r.optional ? '|o' : '||'}--o{ ${r.from} : "${r.column}"`)
  }
  for (const t of own) {
    lines.push(`  ${t.name} {`)
    for (const c of t.columns) {
      const keyPart = c.key ? ` ${c.key}` : ''
      const note = c.note ? ` "${c.note.replace(/"/g, "'")}"` : c.optional ? ' "optional"' : ''
      lines.push(`    ${c.type} ${c.name}${keyPart}${note}`)
    }
    lines.push('  }')
  }
  return lines.join('\n')
}
