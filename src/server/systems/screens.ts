// Every route in src/App.tsx mapped to the target tables it reads or writes. systems.test.ts fails when a route is added
// without an entry here, or when an entry names a table that is not in the planned schema.

export type ScreenArea = 'public' | 'portal' | 'onboarding' | 'platform' | 'broker' | 'commercial' | 'life' | 'controls' | 'funds' | 'specialist' | 'systems'

/** How the screen stores its data today, in demo mode. */
export type CurrentStorage = 'service_layer' | 'browser_storage' | 'not_stored' | 'static_content'

export interface Screen {
  route: string
  label: string
  area: ScreenArea
  /** Roles that can open it; empty means anyone, including public visitors. */
  roles: string[]
  tables: string[]
  current: CurrentStorage
  /** Where static content lives, for screens that need no table. */
  content?: string
  gap?: string
}

export const AREA_LABEL: Record<ScreenArea, string> = {
  public: 'Public site',
  portal: 'Customer portals',
  onboarding: 'Brokerage onboarding',
  platform: 'B-Covered platform administration',
  broker: 'Broker: personal lines',
  commercial: 'Broker: commercial',
  life: 'Broker: life & benefits',
  controls: 'Broker: financial controls',
  funds: 'Broker: funds & investments',
  specialist: 'Broker: specialist and management',
  systems: 'Systems',
}

const STAFF = ['broker', 'manager', 'admin']
const SYSTEMS = ['manager', 'admin']
const JOB_TRACE = ['jobs', 'job_steps', 'agent_runs', 'agent_tool_calls', 'workflows', 'workflow_steps', 'agents']
const MEMBERS = ['brokerage_owner', 'brokerage_admin', 'representative', 'operations_admin', 'compliance_reviewer', 'read_only']
const PLATFORM = ['platform_admin', 'onboarding_reviewer', 'platform_read_only']
const APPLICATION = ['brokerage_applications', 'onboarding_items', 'onboarding_requirements', 'onboarding_feedback', 'onboarding_status_events', 'documents', 'organisations']

export const SCREENS: Screen[] = [
  // ------------------------------------------------------------------ public
  { route: '/', label: 'Home', area: 'public', roles: [], tables: ['product_categories'], current: 'static_content', content: 'src/data/products.ts' },
  { route: '/insurance/:slug', label: 'Product page', area: 'public', roles: [], tables: ['product_categories'], current: 'static_content', content: 'src/data/products.ts' },
  { route: '/about', label: 'About', area: 'public', roles: [], tables: [], current: 'static_content', content: 'src/pages/AboutPage.tsx' },
  { route: '/legal', label: 'Legal and disclosures', area: 'public', roles: [], tables: [], current: 'static_content', content: 'src/data/legal.ts' },
  { route: '/faq', label: 'FAQ', area: 'public', roles: [], tables: [], current: 'static_content', content: 'src/data/faq.ts' },
  { route: '/updates', label: 'System updates', area: 'public', roles: [], tables: [], current: 'static_content', content: 'src/data/updates.ts' },
  { route: '/help', label: 'Help and capabilities', area: 'public', roles: [], tables: ['organisations', 'agents', 'tools', 'system_components'], current: 'service_layer', content: 'src/data/helpGuide.ts' },
  {
    route: '/assist',
    label: 'Ava (motor intake)',
    area: 'public',
    roles: [],
    tables: ['conversations', 'conversation_messages', 'customers', 'persons', 'customer_persons', 'customer_consents', 'leads', 'product_categories', ...JOB_TRACE, 'audit_events'],
    current: 'service_layer',
  },
  {
    route: '/quote',
    label: 'Quick quote form',
    area: 'public',
    roles: [],
    tables: ['customers', 'persons', 'customer_persons', 'customer_consents', 'leads', 'product_categories', 'quotes', 'quote_options', 'quote_option_terms', 'insurers'],
    current: 'browser_storage',
    gap: 'Saves to browser storage (bcovered_quotes), apart from the leads and quotes brokers see. Should create a lead and a simulated quote the way Ava does.',
  },
  {
    route: '/claims',
    label: 'Log and track a claim',
    area: 'public',
    roles: [],
    tables: ['claims', 'claim_status_events', 'claim_types', 'policies', 'persons', 'customer_persons', 'documents'],
    current: 'browser_storage',
    gap: 'Saves to browser storage (bcovered_claims) and tracking stages are simulated by elapsed time. Needs the new claims tables and a reference-plus-phone lookup function for tracking.',
  },
  {
    route: '/contact',
    label: 'Request a callback',
    area: 'public',
    roles: [],
    tables: ['enquiries'],
    current: 'not_stored',
    gap: 'The form shows a thank-you message but stores nothing. Needs the new enquiries table.',
  },
  { route: '/demo', label: 'Demo Studio', area: 'public', roles: [], tables: ['app_users', 'organisation_memberships', 'organisations'], current: 'service_layer', content: 'src/server/demo/scenarios.ts' },
  { route: '/sign-in', label: 'Sign in or create an account', area: 'public', roles: [], tables: ['app_users', 'organisation_memberships', 'platform_staff'], current: 'service_layer' },
  { route: '/brokers/join', label: 'Join as a broker', area: 'onboarding', roles: [], tables: ['organisations', 'app_users', 'organisation_memberships', 'brokerage_applications', 'onboarding_status_events', 'onboarding_items', 'audit_events'], current: 'service_layer' },
  { route: '/brokers/invite/:token', label: 'Accept an invitation', area: 'onboarding', roles: [], tables: ['brokerage_invitations', 'organisation_memberships', 'app_users', 'organisations', 'audit_events'], current: 'service_layer' },
  { route: '/brokers/signup', label: 'Broker signup: login, brokerage workspace and referral code (Supabase)', area: 'onboarding', roles: [], tables: ['app_users', 'organisations', 'organisation_memberships', 'brokerage_applications', 'sales_team_members'], current: 'service_layer' },
  { route: '/team/join/:token', label: 'Sub-broker or agent: accept a private team invitation (Supabase)', area: 'onboarding', roles: [], tables: ['brokerage_invitations', 'organisation_memberships', 'sales_team_members', 'app_users'], current: 'service_layer' },
  { route: '/r/:code', label: 'Customer enquiry from a referral link (Supabase)', area: 'public', roles: [], tables: ['sales_team_members', 'sales_enquiries', 'persons', 'customers', 'customer_persons', 'tasks'], current: 'service_layer' },
  { route: '/enquire', label: 'Customer enquiry with a typed referral code (Supabase)', area: 'public', roles: [], tables: ['sales_team_members', 'sales_enquiries', 'persons', 'customers', 'customer_persons', 'tasks'], current: 'service_layer' },
  { route: '/outlet', label: 'Outlet portal: share the outlet link and QR, capture requests, follow referral progress (Supabase)', area: 'public', roles: [], tables: ['franchise_outlet_staff', 'franchise_outlets', 'sales_enquiries'], current: 'service_layer' },
  { route: '/outlet/join/:token', label: 'Outlet manager or staff: accept an outlet invitation (Supabase)', area: 'onboarding', roles: [], tables: ['brokerage_invitations', 'franchise_outlet_staff', 'organisation_memberships', 'app_users'], current: 'service_layer' },

  // ------------------------------------------------------------------ onboarding and platform administration
  { route: '/onboarding', label: 'Brokerage onboarding (resumes at the last section)', area: 'onboarding', roles: MEMBERS, tables: APPLICATION, current: 'service_layer' },
  {
    route: '/onboarding/:section',
    label: 'Onboarding section with Russ (Chat, Suggestions, Tasks, Review)',
    area: 'onboarding',
    roles: MEMBERS,
    tables: [...APPLICATION, 'extracted_field_proposals', 'organisation_memberships', 'brokerage_invitations', 'organisation_product_modules', 'organisation_commercial_terms', 'insurer_access', 'insurers', 'audit_events'],
    current: 'service_layer',
  },
  { route: '/platform', label: 'Platform administration', area: 'platform', roles: PLATFORM, tables: ['platform_staff'], current: 'service_layer' },
  { route: '/platform/onboarding', label: 'Onboarding queue', area: 'platform', roles: PLATFORM, tables: [...APPLICATION, 'organisation_memberships', 'app_users'], current: 'service_layer' },
  {
    route: '/platform/onboarding/:applicationId',
    label: 'Onboarding review workspace',
    area: 'platform',
    roles: PLATFORM,
    tables: [...APPLICATION, 'onboarding_internal_notes', 'organisation_memberships', 'organisation_product_modules', 'organisation_commercial_terms', 'insurer_access', 'platform_staff', 'audit_events'],
    current: 'service_layer',
  },
  { route: '/platform/brokerages', label: 'Brokerages', area: 'platform', roles: PLATFORM, tables: ['organisations', 'brokerage_applications', 'organisation_memberships', 'insurer_access', 'organisation_product_modules'], current: 'service_layer' },
  {
    route: '/platform/brokerages/:organisationId',
    label: 'Brokerage administration (suspend, reinstate, insurer access)',
    area: 'platform',
    roles: PLATFORM,
    tables: ['organisations', 'brokerage_applications', 'organisation_memberships', 'brokerage_invitations', 'insurer_access', 'insurer_access_credentials', 'organisation_product_modules', 'organisation_commercial_terms', 'audit_events'],
    current: 'service_layer',
  },
  { route: '/platform/invitations', label: 'Invite a brokerage owner', area: 'platform', roles: ['platform_admin'], tables: ['organisations', 'brokerage_invitations', 'brokerage_applications', 'onboarding_status_events', 'audit_events'], current: 'service_layer' },
  { route: '/business', label: 'Business insurance', area: 'public', roles: [], tables: ['industries', 'cover_classes'], current: 'static_content', content: 'src/data/business.ts' },
  { route: '/business/industries', label: 'Industries', area: 'public', roles: [], tables: ['industries', 'industry_risk_templates'], current: 'static_content', content: 'src/server/domain/commercial/industryTemplates.ts' },
  { route: '/business/cover', label: 'Cover areas', area: 'public', roles: [], tables: ['cover_classes'], current: 'static_content', content: 'src/server/domain/commercial/coverClasses.ts' },
  {
    route: '/business/risk-review',
    label: 'Business risk review (Business Discovery Agent)',
    area: 'public',
    roles: [],
    tables: ['conversations', 'conversation_messages', 'customers', 'persons', 'customer_persons', 'customer_consents', 'business_profiles', 'twin_entities', 'business_legal_entities', 'business_locations', 'business_activities', 'commercial_assets', ...JOB_TRACE],
    current: 'service_layer',
  },

  // ------------------------------------------------------------------ portals
  { route: '/portal', label: 'My portal', area: 'portal', roles: ['customer'], tables: ['customer_user_access', 'quotes', 'communications', 'tasks', 'jobs'], current: 'service_layer' },
  { route: '/portal/proposals/:quoteId', label: 'Released proposal', area: 'portal', roles: ['customer'], tables: ['quotes', 'quote_options', 'quote_option_terms', 'insurers'], current: 'service_layer' },
  { route: '/portal/business', label: 'Business portal', area: 'portal', roles: ['customer'], tables: ['customer_user_access', 'business_profiles', 'tasks', 'commercial_submissions', 'documents'], current: 'service_layer' },
  {
    route: '/portal/business/risk-profile',
    label: 'Business risk profile',
    area: 'portal',
    roles: ['customer'],
    tables: ['business_profiles', 'twin_entities', 'business_legal_entities', 'business_locations', 'business_activities', 'commercial_assets', 'loss_events'],
    current: 'service_layer',
  },

  // ------------------------------------------------------------------ broker: personal
  { route: '/broker', label: 'Overview', area: 'broker', roles: STAFF, tables: ['leads', 'approval_requests', 'quotes', 'jobs', 'customers', 'audit_events', 'app_users', 'agents'], current: 'service_layer' },
  { route: '/broker/workspace', label: 'AR, Ava and Russ: database copilots (Records) and workflow lenses (Workflows)', area: 'broker', roles: STAFF, tables: ['conversations', 'conversation_messages', ...JOB_TRACE, 'leads', 'quotes', 'approval_requests', 'customers', 'persons', 'policies', 'client_interactions', 'copilot_actions'], current: 'service_layer' },
  { route: '/broker/book', label: 'My workspace: client grid, team, referrals and Russ (Supabase)', area: 'broker', roles: STAFF, tables: ['persons', 'customers', 'sales_team_members', 'sales_enquiries', 'sales_offers', 'sales_records', 'client_interactions', 'tasks', 'quotes', 'quote_options', 'copilot_actions'], current: 'service_layer' },
  { route: '/broker/routes', label: 'Routes: guided processes (Prepare motor quotes) and runs in progress', area: 'broker', roles: STAFF, tables: ['route_runs', 'route_action_results', 'persons'], current: 'service_layer' },
  { route: '/broker/routes/runs/:runId', label: 'Route guide: phases and actions with Russ, motor request, Demo · Sample quotes and the outcome on the client record', area: 'broker', roles: STAFF, tables: ['route_runs', 'route_action_results', 'persons', 'customers', 'client_interactions', 'tasks', 'copilot_actions'], current: 'service_layer' },
  { route: '/broker/franchise', label: 'Franchise: outlet performance (Live by default), franchise enquiries, franchisees, outlet QR codes and Russ (Supabase)', area: 'broker', roles: STAFF, tables: ['franchise_partners', 'franchise_outlets', 'franchise_outlet_staff', 'sales_enquiries', 'sales_records', 'sales_offers', 'copilot_actions'], current: 'service_layer' },
  { route: '/broker/book/clients/:personId', label: 'Client sales record: offers, sale and communications timeline (Supabase)', area: 'broker', roles: STAFF, tables: ['persons', 'customers', 'sales_enquiries', 'sales_offers', 'sales_records', 'client_interactions', 'tasks', 'contact_assignment_events'], current: 'service_layer' },
  { route: '/broker/personal', label: 'Personal lines by product', area: 'broker', roles: STAFF, tables: ['leads', 'quotes', 'policies', 'customers', 'insurers'], current: 'service_layer' },
  { route: '/broker/personal/policies/:policyId', label: 'Short-term policy with notes and activity (Supabase)', area: 'broker', roles: STAFF, tables: ['policies', 'customers', 'persons', 'insurers', 'client_interactions'], current: 'service_layer' },
  { route: '/broker/accounts/:accountId', label: 'Client account overview and history (Supabase)', area: 'broker', roles: STAFF, tables: ['customers', 'persons', 'policies', 'business_profiles', 'group_schemes', 'client_interactions', 'tasks'], current: 'service_layer' },
  { route: '/broker/leads', label: 'Leads', area: 'broker', roles: STAFF, tables: ['leads', 'customers', 'product_categories'], current: 'service_layer' },
  { route: '/broker/leads/:leadId', label: 'Lead detail', area: 'broker', roles: STAFF, tables: ['leads', 'customers', 'persons', 'customer_persons', 'customer_consents', 'conversations', 'quotes', 'jobs', 'tasks'], current: 'service_layer' },
  { route: '/broker/quotes/sample-motor', label: 'Private motor sample quotes (demo, browser-only)', area: 'broker', roles: STAFF, tables: [], current: 'static_content', content: 'src/data/qe/sampleMotorResult.ts' },
  { route: '/broker/quotes/:quoteId', label: 'Quote comparison', area: 'broker', roles: STAFF, tables: ['quotes', 'quote_options', 'quote_option_terms', 'insurers', 'approval_requests', 'communications'], current: 'service_layer' },
  { route: '/broker/approvals', label: 'Approvals', area: 'broker', roles: STAFF, tables: ['approval_requests', 'approval_types', 'app_users', 'agents', 'audit_events'], current: 'service_layer' },
  { route: '/broker/jobs', label: 'Tasks & Jobs', area: 'broker', roles: STAFF, tables: [...JOB_TRACE, 'customers'], current: 'service_layer' },
  { route: '/broker/jobs/:jobId', label: 'Job detail', area: 'broker', roles: STAFF, tables: [...JOB_TRACE, 'tools', 'approval_requests', 'audit_events'], current: 'service_layer' },
  { route: '/broker/settings/team', label: 'Brokerage settings · Team and invitations tab', area: 'broker', roles: MEMBERS, tables: ['organisation_memberships', 'brokerage_invitations', 'app_users', 'roles', 'audit_events'], current: 'service_layer' },
  { route: '/broker/settings/insurers', label: 'Insurer access', area: 'broker', roles: MEMBERS, tables: ['insurer_access', 'insurer_access_credentials', 'insurers', 'organisation_product_modules', 'audit_events'], current: 'service_layer' },
  { route: '/broker/imports/client-book', label: 'Client-book imports', area: 'broker', roles: MEMBERS, tables: ['data_sources', 'import_batches', 'import_rows'], current: 'service_layer' },
  {
    route: '/broker/imports/client-book/:batchId',
    label: 'Client-book import: map, validate, duplicates, confirm, import',
    area: 'broker',
    roles: MEMBERS,
    tables: ['import_batches', 'import_rows', 'data_sources', 'customers', 'policies', 'insurers', 'audit_events'],
    current: 'service_layer',
  },

  // ------------------------------------------------------------------ broker: commercial
  { route: '/broker/commercial', label: 'Russ · Commercial lens (redirects to /broker/workspace?lens=commercial)', area: 'commercial', roles: STAFF, tables: ['conversations', 'conversation_messages', ...JOB_TRACE, 'business_profiles', 'approval_requests'], current: 'service_layer' },
  { route: '/broker/commercial/cover', label: 'Commercial cover by cover area and class', area: 'commercial', roles: STAFF, tables: ['business_profiles', 'business_risk_profiles', 'risk_exposures', 'policy_sections', 'policies', 'customers', 'insurers'], current: 'service_layer' },
  { route: '/broker/commercial/clients', label: 'Business clients', area: 'commercial', roles: STAFF, tables: ['business_profiles', 'customers', 'industries', 'app_users'], current: 'service_layer' },
  {
    route: '/broker/commercial/clients/:profileId',
    label: 'Business client detail',
    area: 'commercial',
    roles: STAFF,
    tables: ['business_profiles', 'persons', 'customer_persons', 'twin_entities', 'business_legal_entities', 'business_locations', 'location_protections', 'business_activities', 'commercial_assets', 'loss_events', 'policies', 'risk_exposures', 'tasks'],
    current: 'service_layer',
  },
  { route: '/broker/commercial/risk-twins', label: 'Risk Twins portfolio', area: 'commercial', roles: STAFF, tables: ['business_profiles', 'business_risk_profiles', 'risk_exposures', 'risk_assessments', 'coverage_findings', 'tasks', 'policies', 'industries', 'app_users'], current: 'service_layer' },
  {
    route: '/broker/commercial/risk-twins/:profileId',
    label: 'Twin workspace (Graph, Assessment, Insurance, Changes, Actions)',
    area: 'commercial',
    roles: STAFF,
    tables: [
      'twin_entities',
      'business_legal_entities',
      'business_locations',
      'business_activities',
      'commercial_assets',
      'entity_links',
      'business_risk_profiles',
      'risk_exposures',
      'exposure_locations',
      'exposure_cover_classes',
      'risk_assessments',
      'risk_assessment_findings',
      'documents',
      'policies',
      'policy_sections',
      'policy_section_terms',
      'coverage_findings',
      'twin_update_proposals',
      'risk_twin_change_events',
      'tasks',
      'conversations',
      'jobs',
    ],
    current: 'service_layer',
  },
  { route: '/broker/commercial/assessments/:assessmentId/report', label: 'Assessment report', area: 'commercial', roles: STAFF, tables: ['risk_assessments', 'risk_assessment_findings', 'risk_exposures', 'coverage_findings', 'approval_requests', 'business_profiles'], current: 'service_layer' },
  { route: '/broker/commercial/submissions', label: 'Submissions', area: 'commercial', roles: STAFF, tables: ['commercial_submissions', 'business_profiles', 'approval_requests'], current: 'service_layer' },
  {
    route: '/broker/commercial/submissions/:submissionId',
    label: 'Submission editor',
    area: 'commercial',
    roles: STAFF,
    tables: ['commercial_submissions', 'submission_sections', 'submission_section_items', 'cover_classes', 'commercial_assets', 'risk_exposures', 'approval_requests', 'conversations'],
    current: 'service_layer',
  },

  // ------------------------------------------------------------------ life and benefits
  { route: '/portal/life', label: 'My life cover', area: 'portal', roles: ['customer'], tables: ['customer_persons', 'persons', 'policies', 'policy_benefits', 'policy_parties', 'policy_status_events', 'insurers'], current: 'service_layer' },
  { route: '/broker/life', label: 'Russ · Life & benefits lens (redirects to /broker/workspace?lens=life)', area: 'life', roles: STAFF, tables: ['conversations', 'conversation_messages', ...JOB_TRACE, 'needs_analyses', 'life_quotes', 'life_quote_options', 'records_of_advice', 'policies', 'approval_requests'], current: 'service_layer' },
  { route: '/broker/people', label: 'People', area: 'life', roles: STAFF, tables: ['persons', 'customer_persons', 'customers', 'employments', 'policy_parties', 'scheme_memberships', 'fund_memberships'], current: 'service_layer' },
  {
    route: '/broker/people/:personId',
    label: 'Person 360',
    area: 'life',
    roles: STAFF,
    tables: ['persons', 'customer_persons', 'person_relationships', 'financial_profiles', 'policies', 'policy_parties', 'policy_benefits', 'policy_status_events', 'employments', 'salary_history', 'scheme_memberships', 'group_schemes', 'fund_memberships', 'retirement_funds', 'administrator_valuations', 'benefit_events', 'member_movements', 'tasks', 'audit_events', 'adviser_authorisations'],
    current: 'service_layer',
  },
  { route: '/broker/life/policies', label: 'Individual life policies', area: 'life', roles: STAFF, tables: ['policies', 'policy_parties', 'policy_benefits', 'persons', 'customers', 'insurers'], current: 'service_layer' },
  {
    route: '/broker/life/policies/:policyId',
    label: 'Policy detail',
    area: 'life',
    roles: STAFF,
    tables: ['policies', 'policy_parties', 'policy_benefits', 'policy_status_events', 'underwriting_requirements', 'records_of_advice', 'products', 'product_versions', 'approval_requests', 'tasks', 'customer_persons', 'persons'],
    current: 'service_layer',
  },
  {
    route: '/broker/life/advice/:roaId',
    label: 'Record of Advice editor',
    area: 'life',
    roles: STAFF,
    tables: ['records_of_advice', 'needs_analyses', 'life_quotes', 'life_quote_options', 'adviser_authorisations', 'approval_requests', 'persons', 'customers', 'insurers'],
    current: 'service_layer',
  },
  { route: '/broker/life/servicing', label: 'Life policies · Servicing tab', area: 'life', roles: STAFF, tables: ['tasks', 'policies', 'policy_parties', 'underwriting_requirements', 'needs_analyses', 'records_of_advice', 'customers'], current: 'service_layer' },
  { route: '/portal/employer', label: 'Employer HR portal', area: 'portal', roles: ['customer'], tables: ['access_grants', 'customers', 'employments', 'persons', 'scheme_memberships', 'group_schemes', 'fund_participations', 'fund_memberships', 'member_movements', 'benefit_events', 'financial_exceptions'], current: 'service_layer' },
  { route: '/broker/benefits/employers', label: 'Employers & schemes', area: 'life', roles: STAFF, tables: ['customers', 'employments', 'group_schemes', 'fund_participations', 'salary_history', 'reconciliation_runs', 'financial_exceptions'], current: 'service_layer' },
  {
    route: '/broker/benefits/employers/:customerId',
    label: 'Employer 360',
    area: 'life',
    roles: STAFF,
    tables: ['customers', 'employments', 'salary_history', 'group_schemes', 'scheme_rule_versions', 'scheme_memberships', 'retirement_funds', 'fund_participations', 'fund_memberships', 'contribution_rule_versions', 'administrator_valuations', 'import_batches', 'data_sources', 'reconciliation_runs', 'financial_exceptions', 'member_movements', 'benefit_events', 'insurers'],
    current: 'service_layer',
  },
  { route: '/broker/controls/imports', label: 'Controls · Imports tab', area: 'controls', roles: STAFF, tables: ['data_sources', 'import_batches', 'import_rows', 'audit_evidence'], current: 'service_layer' },
  { route: '/broker/controls/imports/:batchId', label: 'Import batch review', area: 'controls', roles: STAFF, tables: ['import_batches', 'import_rows', 'data_sources', 'employments', 'salary_history', 'persons', 'approval_requests', 'audit_evidence'], current: 'service_layer' },
  { route: '/broker/controls/reconciliations', label: 'Controls · Reconciliations tab', area: 'controls', roles: STAFF, tables: ['reconciliation_runs', 'reconciliation_definitions', 'financial_exceptions', 'customers'], current: 'service_layer' },
  {
    route: '/broker/controls/reconciliations/:runId',
    label: 'Reconciliation drill-down',
    area: 'controls',
    roles: STAFF,
    tables: ['reconciliation_runs', 'reconciliation_definitions', 'reconciliation_items', 'financial_exceptions', 'correction_schedules', 'approval_requests', 'audit_evidence', 'persons'],
    current: 'service_layer',
  },
  { route: '/broker/controls/exceptions', label: 'Controls · Financial exceptions tab', area: 'controls', roles: STAFF, tables: ['financial_exceptions', 'exception_resolutions', 'customers', 'retirement_funds', 'investment_portfolios', 'app_users', 'approval_requests'], current: 'service_layer' },
  { route: '/portal/cell', label: 'Cell owner portal', area: 'portal', roles: ['customer'], tables: ['access_grants', 'cell_arrangements', 'cell_financial_periods', 'customers', 'insurers', 'audit_evidence'], current: 'service_layer' },
  { route: '/broker/funds', label: 'Retirement funds', area: 'funds', roles: STAFF, tables: ['retirement_funds', 'fund_participations', 'fund_memberships', 'administrator_valuations', 'benefit_events', 'insurers'], current: 'service_layer' },
  {
    route: '/broker/funds/:fundId',
    label: 'Fund oversight (two-pot, benefit events, roll-forward)',
    area: 'funds',
    roles: STAFF,
    tables: ['retirement_funds', 'fund_participations', 'fund_memberships', 'administrator_valuations', 'benefit_events', 'fund_balance_statements', 'reconciliation_runs', 'investment_portfolios', 'fund_transfers', 'financial_exceptions', 'governance_items', 'trustee_packs', 'persons', 'customers'],
    current: 'service_layer',
  },
  { route: '/broker/investments', label: 'Investment oversight', area: 'funds', roles: STAFF, tables: ['investment_portfolios', 'investment_valuations', 'retirement_funds', 'insurers', 'financial_exceptions'], current: 'service_layer' },
  {
    route: '/broker/investments/:portfolioId',
    label: 'Portfolio: holdings, reconciliation and performance',
    area: 'funds',
    roles: STAFF,
    tables: ['investment_portfolios', 'investment_holdings', 'investment_valuations', 'investment_benchmarks', 'reconciliation_runs', 'financial_exceptions'],
    current: 'service_layer',
  },
  { route: '/broker/transfers', label: 'Transfers & conversions', area: 'funds', roles: STAFF, tables: ['fund_transfers', 'transfer_members', 'retirement_funds', 'customers'], current: 'service_layer' },
  { route: '/broker/transfers/:transferId', label: 'Transfer workspace', area: 'funds', roles: STAFF, tables: ['fund_transfers', 'transfer_members', 'persons', 'reconciliation_runs', 'financial_exceptions'], current: 'service_layer' },
  { route: '/broker/cells', label: 'Cell captives', area: 'specialist', roles: STAFF, tables: ['cell_arrangements', 'cell_financial_periods', 'customers', 'insurers'], current: 'service_layer' },
  { route: '/broker/cells/:cellId', label: 'Cell results and report', area: 'specialist', roles: STAFF, tables: ['cell_arrangements', 'cell_financial_periods', 'audit_evidence'], current: 'service_layer' },
  { route: '/broker/governance', label: 'Governance & trustee reporting', area: 'specialist', roles: STAFF, tables: ['retirement_funds', 'governance_items', 'trustee_packs'], current: 'service_layer' },
  {
    route: '/broker/governance/packs/:packId',
    label: 'Trustee pack',
    area: 'specialist',
    roles: STAFF,
    tables: ['trustee_packs', 'retirement_funds', 'administrator_valuations', 'fund_balance_statements', 'reconciliation_runs', 'investment_valuations', 'benefit_events', 'fund_transfers', 'governance_items', 'audit_evidence'],
    current: 'service_layer',
  },
  { route: '/broker/investigations', label: 'Forensic investigations', area: 'specialist', roles: STAFF, tables: ['investigations', 'investigation_findings', 'audit_evidence'], current: 'service_layer' },
  { route: '/broker/investigations/:investigationId', label: 'Investigation workspace', area: 'specialist', roles: STAFF, tables: ['investigations', 'investigation_findings', 'audit_evidence', 'reconciliation_runs', 'reconciliation_items', 'import_batches', 'import_rows', 'financial_exceptions', 'member_movements'], current: 'service_layer' },
  {
    route: '/broker/executive',
    label: 'Executive dashboard',
    area: 'specialist',
    roles: SYSTEMS,
    tables: ['policies', 'group_schemes', 'scheme_rule_versions', 'salary_history', 'reconciliation_runs', 'administrator_valuations', 'investment_valuations', 'commission_records', 'import_batches', 'financial_exceptions', 'approval_requests', 'jobs', 'tasks', 'adviser_authorisations', 'persons'],
    current: 'service_layer',
  },
  { route: '/broker/compliance', label: 'Compliance register', area: 'specialist', roles: STAFF, tables: ['adviser_authorisations', 'app_users', 'tasks'], current: 'static_content', content: 'src/data/complianceQuestions.ts' },
  { route: '/broker/controls', label: 'Russ · Controls lens (redirects to /broker/workspace?lens=controls)', area: 'controls', roles: STAFF, tables: ['conversations', 'conversation_messages', ...JOB_TRACE, 'import_batches', 'reconciliation_runs', 'financial_exceptions', 'correction_schedules', 'approval_requests'], current: 'service_layer' },

  // ------------------------------------------------------------------ systems
  { route: '/broker/systems', label: 'Systems overview', area: 'systems', roles: SYSTEMS, tables: ['system_components', 'component_dependencies', 'health_checks'], current: 'static_content', content: 'src/server/systems/components.ts' },
  { route: '/broker/systems/database', label: 'Database and ERD', area: 'systems', roles: SYSTEMS, tables: [], current: 'static_content', content: 'src/server/systems/plannedSchema.ts' },
  { route: '/broker/systems/frontend', label: 'Frontend routes', area: 'systems', roles: SYSTEMS, tables: ['system_components'], current: 'static_content', content: 'src/server/systems/screens.ts' },
  { route: '/broker/systems/backend', label: 'Backend and API endpoints', area: 'systems', roles: SYSTEMS, tables: ['api_endpoints', 'system_components', 'roles'], current: 'static_content', content: 'src/server/systems/components.ts' },
  { route: '/broker/systems/integrations', label: 'Integrations', area: 'systems', roles: SYSTEMS, tables: ['system_components', 'health_checks'], current: 'static_content', content: 'src/server/systems/components.ts' },
  { route: '/broker/systems/agents', label: 'Agents and copilots', area: 'systems', roles: SYSTEMS, tables: ['agents', 'agent_versions', 'tools', 'agent_tool_grants', 'tool_role_grants', 'agent_runs', 'agent_tool_calls'], current: 'service_layer' },
  { route: '/broker/systems/workflows', label: 'Workflows and jobs', area: 'systems', roles: SYSTEMS, tables: ['workflows', 'workflow_steps', 'jobs', 'job_steps'], current: 'service_layer' },
  { route: '/broker/systems/audit', label: 'Audit trail', area: 'systems', roles: SYSTEMS, tables: ['audit_events', 'app_users', 'agents'], current: 'service_layer' },
]

/** Screens that use a table, for the table detail view. */
export const screensUsing = (table: string) => SCREENS.filter((s) => s.tables.includes(table))
