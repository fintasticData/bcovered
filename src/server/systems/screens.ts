// Every route in src/App.tsx mapped to the target tables it reads or writes. systems.test.ts fails when a route is added
// without an entry here, or when an entry names a table that is not in the planned schema.

export type ScreenArea = 'public' | 'portal' | 'broker' | 'commercial' | 'systems'

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
  broker: 'Broker: personal lines',
  commercial: 'Broker: commercial',
  systems: 'Systems',
}

const STAFF = ['broker', 'manager', 'admin']
const SYSTEMS = ['manager', 'admin']
const JOB_TRACE = ['jobs', 'job_steps', 'agent_runs', 'agent_tool_calls', 'workflows', 'workflow_steps', 'agents']

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
    tables: ['conversations', 'conversation_messages', 'customers', 'contacts', 'customer_consents', 'leads', 'product_categories', ...JOB_TRACE, 'audit_events'],
    current: 'service_layer',
  },
  {
    route: '/quote',
    label: 'Quick quote form',
    area: 'public',
    roles: [],
    tables: ['customers', 'contacts', 'customer_consents', 'leads', 'product_categories', 'quotes', 'quote_options', 'quote_option_terms', 'insurers'],
    current: 'browser_storage',
    gap: 'Saves to browser storage (bcovered_quotes), apart from the leads and quotes brokers see. Should create a lead and a simulated quote the way Ava does.',
  },
  {
    route: '/claims',
    label: 'Log and track a claim',
    area: 'public',
    roles: [],
    tables: ['claims', 'claim_status_events', 'claim_types', 'policies', 'contacts', 'documents'],
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
  { route: '/demo', label: 'Demo Studio', area: 'public', roles: [], tables: ['app_users', 'tenant_memberships', 'organisations'], current: 'service_layer', content: 'src/server/demo/scenarios.ts' },
  { route: '/business', label: 'Business insurance', area: 'public', roles: [], tables: ['industries', 'cover_classes'], current: 'static_content', content: 'src/data/business.ts' },
  { route: '/business/industries', label: 'Industries', area: 'public', roles: [], tables: ['industries', 'industry_risk_templates'], current: 'static_content', content: 'src/server/domain/commercial/industryTemplates.ts' },
  { route: '/business/cover', label: 'Cover areas', area: 'public', roles: [], tables: ['cover_classes'], current: 'static_content', content: 'src/server/domain/commercial/coverClasses.ts' },
  {
    route: '/business/risk-review',
    label: 'Business risk review (Business Discovery Agent)',
    area: 'public',
    roles: [],
    tables: ['conversations', 'conversation_messages', 'customers', 'contacts', 'customer_consents', 'business_profiles', 'twin_entities', 'business_legal_entities', 'business_locations', 'business_activities', 'commercial_assets', ...JOB_TRACE],
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
  { route: '/broker/workspace', label: 'AI Workspace (Broker Copilot)', area: 'broker', roles: STAFF, tables: ['conversations', 'conversation_messages', ...JOB_TRACE, 'leads', 'quotes', 'approval_requests', 'customers'], current: 'service_layer' },
  { route: '/broker/leads', label: 'Leads', area: 'broker', roles: STAFF, tables: ['leads', 'customers', 'product_categories'], current: 'service_layer' },
  { route: '/broker/leads/:leadId', label: 'Lead detail', area: 'broker', roles: STAFF, tables: ['leads', 'customers', 'contacts', 'customer_consents', 'conversations', 'quotes', 'jobs', 'tasks'], current: 'service_layer' },
  { route: '/broker/quotes/:quoteId', label: 'Quote comparison', area: 'broker', roles: STAFF, tables: ['quotes', 'quote_options', 'quote_option_terms', 'insurers', 'approval_requests', 'communications'], current: 'service_layer' },
  { route: '/broker/approvals', label: 'Approvals', area: 'broker', roles: STAFF, tables: ['approval_requests', 'approval_types', 'app_users', 'agents', 'audit_events'], current: 'service_layer' },
  { route: '/broker/jobs', label: 'Tasks & Jobs', area: 'broker', roles: STAFF, tables: [...JOB_TRACE, 'customers'], current: 'service_layer' },
  { route: '/broker/jobs/:jobId', label: 'Job detail', area: 'broker', roles: STAFF, tables: [...JOB_TRACE, 'tools', 'approval_requests', 'audit_events'], current: 'service_layer' },

  // ------------------------------------------------------------------ broker: commercial
  { route: '/broker/commercial', label: 'Commercial workspace', area: 'commercial', roles: STAFF, tables: ['conversations', 'conversation_messages', ...JOB_TRACE, 'business_profiles', 'approval_requests'], current: 'service_layer' },
  { route: '/broker/commercial/clients', label: 'Business clients', area: 'commercial', roles: STAFF, tables: ['business_profiles', 'customers', 'industries', 'app_users'], current: 'service_layer' },
  {
    route: '/broker/commercial/clients/:profileId',
    label: 'Business client detail',
    area: 'commercial',
    roles: STAFF,
    tables: ['business_profiles', 'contacts', 'twin_entities', 'business_legal_entities', 'business_locations', 'location_protections', 'business_activities', 'commercial_assets', 'loss_events', 'policies', 'risk_exposures', 'tasks'],
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
