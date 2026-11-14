// Static catalogue of what the platform is made of today and what it moves to on Supabase.
// It seeds the planned system_components and api_endpoints tables once the dedicated project exists.

export type ComponentKind = 'frontend' | 'backend' | 'database' | 'jobs' | 'storage' | 'realtime' | 'external_api'

/** live: running now · simulated: running with synthetic output · planned: not built yet · not_configured: built, missing setup. */
export type ComponentStatus = 'live' | 'simulated' | 'planned' | 'not_configured'

export interface SystemComponent {
  key: string
  name: string
  kind: ComponentKind
  status: ComponentStatus
  environment: 'demo' | 'dev' | 'prod'
  summary: string
  /** Where it lives in this repo, or the external service. */
  location: string
  dependsOn: string[]
  /** Name of the secret it needs, never the value. */
  secretRef?: string
  nextStep?: string
}

export const KIND_LABEL: Record<ComponentKind, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  jobs: 'Jobs and agents',
  storage: 'File storage',
  realtime: 'Live updates',
  external_api: 'External API',
}

export const COMPONENTS: SystemComponent[] = [
  {
    key: 'web',
    name: 'InsureFlow web app',
    kind: 'frontend',
    status: 'live',
    environment: 'demo',
    summary: 'Vite + React single-page app: public site, portals, broker workspace and Systems.',
    location: 'src/ · deployed by vercel.json',
    dependsOn: ['service_layer'],
  },
  {
    key: 'service_layer',
    name: 'In-browser service layer',
    kind: 'backend',
    status: 'live',
    environment: 'demo',
    summary: 'Request handlers, typed tools, approval rules and role checks. Runs in the browser in demo mode.',
    location: 'src/server/api.ts, commercialApi.ts, twinApi.ts, tools/',
    dependsOn: ['demo_store', 'job_runner'],
    nextStep: 'Reads move to Supabase tables under row-level security; consequential writes move to database functions and Edge Functions.',
  },
  {
    key: 'demo_store',
    name: 'Demo data store',
    kind: 'database',
    status: 'live',
    environment: 'demo',
    summary: 'Typed tables mirroring migrations 0001–0008, saved in this browser’s local storage. Synthetic data only.',
    location: 'src/server/db/',
    dependsOn: [],
    nextStep: 'Replaced by insureflow-dev once it is created and the normalised baseline is applied.',
  },
  {
    key: 'job_runner',
    name: 'Durable job runner',
    kind: 'jobs',
    status: 'live',
    environment: 'demo',
    summary: 'Runs workflows step by step with pause, resume, cancel, retry and reload recovery.',
    location: 'src/server/jobs/runner.ts',
    dependsOn: ['demo_store', 'deterministic_adapter', 'demo_insurer_adapter'],
    nextStep: 'Moves to Supabase Edge Functions driven by a queue or scheduled trigger.',
  },
  {
    key: 'browser_sync',
    name: 'Cross-tab sync',
    kind: 'realtime',
    status: 'live',
    environment: 'demo',
    summary: 'Browser storage events refresh other open tabs, standing in for server push.',
    location: 'src/server/db/store.ts',
    dependsOn: ['demo_store'],
    nextStep: 'Replaced by Supabase Realtime on jobs, job steps and approvals.',
  },
  {
    key: 'deterministic_adapter',
    name: 'Deterministic assistant adapter',
    kind: 'external_api',
    status: 'simulated',
    environment: 'demo',
    summary: 'Scripted intake for Ava and the agents. Honest about anything off-script.',
    location: 'src/server/llm/deterministic.ts',
    dependsOn: [],
  },
  {
    key: 'fal',
    name: 'fal.ai LLM',
    kind: 'external_api',
    status: 'not_configured',
    environment: 'dev',
    summary: 'Language model provider for the agents. Must run server-side so the key never reaches the browser.',
    location: 'src/server/llm/fal.ts',
    dependsOn: [],
    secretRef: 'FAL_KEY',
    nextStep: 'Set FAL_KEY as an Edge Function secret in insureflow-dev.',
  },
  {
    key: 'fal_api',
    name: 'fal.ai API (BCovered key)',
    kind: 'external_api',
    status: 'not_configured',
    environment: 'dev',
    summary:
      'fal-ai Edge Function: language model chat, intake reply wording, queued image generation and editing, and live prices. Signed-in users only; image models are allow-listed. Falls back to FAL_KEY when the BCovered key is not set.',
    location: 'supabase/functions/fal-ai, src/lib/fal/api.ts',
    dependsOn: ['fal'],
    secretRef: 'BCOVERED_FAL_API_KEY',
    nextStep: 'Set BCOVERED_FAL_API_KEY (fal API preset) as an Edge Function secret in the bcovered project, then set VITE_ASSISTANT_ADAPTER=fal to let Ava use it.',
  },
  {
    key: 'demo_insurer_adapter',
    name: 'Demo insurer adapter',
    kind: 'external_api',
    status: 'simulated',
    environment: 'demo',
    summary: 'Fixed figures from a panel of fictional insurers. Nothing is sent to a real insurer.',
    location: 'src/server/insurers/demoAdapter.ts',
    dependsOn: [],
  },
  {
    key: 'messaging',
    name: 'Email and WhatsApp',
    kind: 'external_api',
    status: 'planned',
    environment: 'dev',
    summary: 'Communications are preview-only drafts today; no provider is connected.',
    location: 'src/server/tools/communication.ts',
    dependsOn: [],
  },
  {
    key: 'controls_engine',
    name: 'Financial controls engine',
    kind: 'backend',
    status: 'live',
    environment: 'demo',
    summary: 'Import, validation, member matching, cent-exact reconciliation, exceptions, corrections and append-only evidence, shared by every module.',
    location: 'src/server/domain/controls/, src/server/tools/controls.ts',
    dependsOn: ['demo_store', 'job_runner'],
    nextStep: 'Move commits and reconciliation runs into set-based database functions for 5 000+ row files.',
  },
  {
    key: 'file_adapters',
    name: 'File adapters (CSV, Excel paste)',
    kind: 'external_api',
    status: 'live',
    environment: 'demo',
    summary: 'Payroll, administrator, holdings and cell files enter through the Imports screen with a mapping per data source.',
    location: 'src/server/integrations/adapters.ts',
    dependsOn: ['controls_engine'],
  },
  {
    key: 'provider_adapters',
    name: 'Insurer, administrator, payroll, manager and bank adapters',
    kind: 'external_api',
    status: 'planned',
    environment: 'dev',
    summary: 'Interfaces exist; no live integration. Each needs a provider specification and credentials, then testing, before it is labelled live.',
    location: 'src/server/integrations/adapters.ts',
    dependsOn: ['controls_engine', 'supabase_functions'],
    secretRef: 'INSURER_API_KEY, ADMIN_SFTP_KEY, PAYROLL_API_KEY, MANAGER_API_KEY',
    nextStep: 'Obtain specifications from each provider; implement and test one adapter at a time.',
  },
  {
    key: 'supabase_dev',
    name: 'Supabase bcovered (cgwgmzpcrvimoqaxgoop)',
    kind: 'database',
    status: 'live',
    environment: 'dev',
    summary:
      'Migrations 0001–0018 applied. Sample data loaded from the demo seed; Live is empty until real clients are imported. Sample / Live, client, account, policy, note and task numbers, tenant and staff row-level security are enforced in the database. Never use the aivoortrekker project.',
    location: 'Supabase dashboard · supabase/migrations/',
    dependsOn: [],
    secretRef: 'VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY',
    nextStep: 'Register public.custom_access_token_hook (Authentication > Hooks); create real broker logins; import Live clients.',
  },
  {
    key: 'supabase_functions',
    name: 'Supabase Edge Functions',
    kind: 'backend',
    status: 'live',
    environment: 'dev',
    summary:
      'bcovered-mcp: MCP server exposing the AR, Ava and Russ jobs (44 tools: records and lines, the sales book and the franchise channel) as the signed-in broker. copilot-agent: rule planner and MCP client for copilot turns, typeahead search, the jobs menu and health. fal-ai: fal.ai language model and image calls with the fal key held server-side.',
    location: 'supabase/functions/bcovered-mcp, supabase/functions/copilot-agent, supabase/functions/fal-ai',
    dependsOn: ['supabase_dev'],
  },
  {
    key: 'supabase_storage',
    name: 'Supabase Storage',
    kind: 'storage',
    status: 'planned',
    environment: 'dev',
    summary: 'Policy schedules, asset registers and claim files, with storage access policies per customer.',
    location: 'Supabase dashboard',
    dependsOn: ['supabase_dev'],
  },
  {
    key: 'supabase_prod',
    name: 'Supabase insureflow-prod',
    kind: 'database',
    status: 'planned',
    environment: 'prod',
    summary: 'Production project, created at cutover.',
    location: 'Supabase dashboard',
    dependsOn: [],
  },
]

/** Where a call ends up once the frontend talks to Supabase directly. */
export type EndpointTarget = 'table_read' | 'db_function' | 'edge_function' | 'demo_only'

export const TARGET_LABEL: Record<EndpointTarget, string> = {
  table_read: 'Table read (row-level security)',
  db_function: 'Database function',
  edge_function: 'Edge Function',
  demo_only: 'Demo only',
}

export interface Endpoint {
  /** Method on the api object in src/api/client.ts. */
  client: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  summary: string
  minRole: 'anyone' | 'customer' | 'staff' | 'manager'
  target: EndpointTarget
}

const e = (client: string, method: Endpoint['method'], path: string, summary: string, minRole: Endpoint['minRole'], target: EndpointTarget): Endpoint => ({
  client,
  method,
  path,
  summary,
  minRole,
  target,
})

export const ENDPOINTS: Endpoint[] = [
  e('identities', 'GET', '/demo/identities', 'Demo identities for the role switcher', 'anyone', 'demo_only'),
  e('me', 'GET', '/me', 'Signed-in person and role', 'anyone', 'table_read'),
  e('platform', 'GET', '/platform', 'Organisation, assistant adapters and tools', 'anyone', 'table_read'),
  e('resetDemo', 'POST', '/demo/reset', 'Reset demo data', 'anyone', 'demo_only'),
  e('startConversation', 'POST', '/conversations', 'Start a chat with Ava, an agent or a Copilot', 'anyone', 'edge_function'),
  e('conversation', 'GET', '/conversations/:id', 'Conversation with messages', 'anyone', 'table_read'),
  e('sendMessage', 'POST', '/conversations/:id/messages', 'Send a message and get the reply', 'anyone', 'edge_function'),
  e('conversationProgress', 'GET', '/conversations/:id/progress', 'Job progress for a conversation', 'anyone', 'table_read'),
  e('jobs', 'GET', '/jobs', 'Jobs list', 'staff', 'table_read'),
  e('job', 'GET', '/jobs/:id', 'Job with steps, agent runs and tool calls', 'staff', 'table_read'),
  e('controlJob', 'POST', '/jobs/:id/control', 'Pause, resume, cancel, retry or archive', 'staff', 'db_function'),
  e('leads', 'GET', '/leads', 'Leads list', 'staff', 'table_read'),
  e('lead', 'GET', '/leads/:id', 'Lead detail', 'staff', 'table_read'),
  e('quote', 'GET', '/quotes/:id', 'Quote comparison', 'staff', 'table_read'),
  e('askQuote', 'POST', '/quotes/:id/ask', 'Ask the Copilot about a comparison', 'staff', 'edge_function'),
  e('approvals', 'GET', '/approvals', 'Approval requests', 'staff', 'table_read'),
  e('decideApproval', 'POST', '/approvals/:id/decision', 'Approve, reject or request changes', 'staff', 'db_function'),
  e('portal', 'GET', '/portal', 'Customer portal', 'customer', 'table_read'),
  e('portalProposal', 'GET', '/portal/proposals/:id', 'Released proposal', 'customer', 'table_read'),
  e('overview', 'GET', '/overview', 'Broker overview KPIs and activity', 'staff', 'table_read'),
  e('commercial.industries', 'GET', '/commercial/industries', 'Industry templates', 'anyone', 'table_read'),
  e('shortTerm.personalLines', 'GET', '/short-term/personal', 'Personal lines by product, with short-term personal policies', 'staff', 'table_read'),
  e('shortTerm.commercialCover', 'GET', '/short-term/commercial-cover', 'Commercial exposures and cover by cover area and class', 'staff', 'table_read'),
  e('commercial.clients', 'GET', '/commercial/clients', 'Business clients', 'staff', 'table_read'),
  e('commercial.client', 'GET', '/commercial/clients/:id', 'Business client detail', 'staff', 'table_read'),
  e('commercial.updateClient', 'PATCH', '/commercial/clients/:id', 'Update profile fields (verified values protected)', 'staff', 'db_function'),
  e('commercial.riskTwins', 'GET', '/commercial/risk-twins', 'Risk Twin portfolio', 'staff', 'table_read'),
  e('commercial.buildTwin', 'POST', '/commercial/clients/:id/twin', 'Start a Twin build job', 'staff', 'edge_function'),
  e('commercial.loadDemoBusinesses', 'POST', '/demo/commercial/businesses', 'Load demo businesses', 'staff', 'demo_only'),
  e('commercial.loadCompletedSubmissions', 'POST', '/demo/commercial/submissions', 'Load completed demo submissions', 'staff', 'demo_only'),
  e('commercial.submissions', 'GET', '/commercial/submissions', 'Submissions list', 'staff', 'table_read'),
  e('commercial.submission', 'GET', '/commercial/submissions/:id', 'Submission editor', 'staff', 'table_read'),
  e('commercial.updateSection', 'PATCH', '/commercial/submissions/:id/sections/:section', 'Apply a section edit to the draft', 'staff', 'db_function'),
  e('commercial.requestApproval', 'POST', '/commercial/submissions/:id/approval', 'Request submission approval', 'staff', 'db_function'),
  e('commercial.updateTask', 'PATCH', '/tasks/:id', 'Complete or cancel a task', 'staff', 'db_function'),
  e('commercial.portal', 'GET', '/portal/business', 'Business portal', 'customer', 'table_read'),
  e('twin.workspace', 'GET', '/commercial/twins/:id', 'Twin workspace', 'staff', 'table_read'),
  e('twin.startAssessment', 'POST', '/commercial/twins/:id/assessments', 'Start an assessment job', 'staff', 'edge_function'),
  e('twin.startInvestigation', 'POST', '/commercial/twins/:id/investigations', 'Start an investigation job', 'staff', 'edge_function'),
  e('twin.node', 'GET', '/commercial/twins/:id/nodes/:node', 'Graph node detail', 'staff', 'table_read'),
  e('twin.impact', 'GET', '/commercial/twins/:id/nodes/:node/impact', 'What happens if this fails', 'staff', 'db_function'),
  e('twin.dependencies', 'GET', '/commercial/twins/:id/nodes/:node/dependencies', 'Trace dependencies', 'staff', 'db_function'),
  e('twin.overridePriority', 'POST', '/commercial/exposures/:id/priority', 'Override a priority with a reason', 'staff', 'db_function'),
  e('twin.decideFinding', 'POST', '/commercial/findings/:id/decision', 'Accept or reject a finding', 'staff', 'db_function'),
  e('twin.reviewCoverage', 'POST', '/commercial/coverage-findings/:id/review', 'Confirm or reject coverage evidence', 'staff', 'db_function'),
  e('twin.checkCoverage', 'POST', '/commercial/twins/:id/coverage-check', 'Match exposures to policy evidence', 'staff', 'edge_function'),
  e('twin.addDocument', 'POST', '/commercial/twins/:id/documents', 'Upload and extract a document', 'staff', 'edge_function'),
  e('twin.decideProposal', 'POST', '/commercial/proposals/:id/decision', 'Apply or reject a document update', 'staff', 'db_function'),
  e('twin.compare', 'POST', '/commercial/twins/:id/compare', 'Compare with the last assessment', 'staff', 'db_function'),
  e('twin.gatherMissing', 'POST', '/commercial/twins/:id/gather-missing', 'Request missing information', 'staff', 'db_function'),
  e('twin.createTask', 'POST', '/commercial/twins/:id/tasks', 'Create a review task', 'staff', 'db_function'),
  e('twin.decideDependency', 'POST', '/commercial/links/:id/decision', 'Confirm or reject an inferred link', 'staff', 'db_function'),
  e('twin.updateAsset', 'PATCH', '/commercial/assets/:id', 'Update an asset', 'staff', 'db_function'),
  e('twin.report', 'GET', '/commercial/assessments/:id/report', 'Assessment report', 'staff', 'table_read'),
  e('systems.catalogue', 'GET', '/systems', 'Systems catalogue and live demo statistics', 'manager', 'table_read'),
  e('life.people', 'GET', '/people', 'People search across roles', 'staff', 'table_read'),
  e('life.person', 'GET', '/people/:id', 'Person 360', 'staff', 'table_read'),
  e('life.captureProfile', 'POST', '/people/:id/financial-profile', 'New financial profile version', 'staff', 'db_function'),
  e('life.startAdvice', 'POST', '/people/:id/life-advice', 'Start life advice (authorised adviser only)', 'staff', 'edge_function'),
  e('life.policies', 'GET', '/life/policies', 'Individual life policies', 'staff', 'table_read'),
  e('life.policy', 'GET', '/life/policies/:id', 'Policy with parties, benefits and status history', 'staff', 'table_read'),
  e('life.recordDecision', 'POST', '/life/policies/:id/insurer-decision', 'Record the insurer’s decision with its document reference', 'staff', 'db_function'),
  e('life.updateRequirement', 'PATCH', '/life/requirements/:id', 'Mark an underwriting requirement received or waived', 'staff', 'db_function'),
  e('life.proposeBeneficiaries', 'POST', '/life/policies/:id/beneficiaries', 'Propose beneficiaries for approval', 'staff', 'db_function'),
  e('life.advice', 'GET', '/life/advice/:id', 'Record of Advice editor', 'staff', 'table_read'),
  e('life.updateAdviceSection', 'PATCH', '/life/advice/:id/sections/:section', 'Edit a section (re-raises sign-off)', 'staff', 'db_function'),
  e('life.applySuggestion', 'POST', '/life/advice/:id/sections/:section/apply', 'Apply Russ’s suggestion to the draft', 'staff', 'db_function'),
  e('life.requestSignoff', 'POST', '/life/advice/:id/signoff', 'Request the adviser’s sign-off', 'staff', 'db_function'),
  e('life.servicing', 'GET', '/life/servicing', 'Servicing queue', 'staff', 'table_read'),
  e('life.runServicing', 'POST', '/life/servicing/scan', 'Run the servicing scan', 'staff', 'edge_function'),
  e('life.portal', 'GET', '/portal/life', 'Customer life cover', 'customer', 'table_read'),
  e('controls.imports', 'GET', '/controls/imports', 'Import batches', 'staff', 'table_read'),
  e('controls.upload', 'POST', '/controls/imports', 'Register, validate and match a file', 'staff', 'edge_function'),
  e('controls.requestCommit', 'POST', '/controls/imports/:id/commit', 'Request approval to commit member changes', 'staff', 'db_function'),
  e('controls.reconciliations', 'GET', '/controls/reconciliations', 'Reconciliation runs', 'staff', 'table_read'),
  e('controls.reconciliation', 'GET', '/controls/reconciliations/:id', 'Reconciliation drill-down', 'staff', 'table_read'),
  e('controls.startContributionRecon', 'POST', '/controls/reconciliations/contributions', 'Start a contribution reconciliation job', 'staff', 'edge_function'),
  e('controls.exceptions', 'GET', '/controls/exceptions', 'Financial exceptions', 'staff', 'table_read'),
  e('controls.resolveException', 'POST', '/controls/exceptions/:id/resolve', 'Resolve (write-offs need approval)', 'staff', 'db_function'),
  e('controls.employers', 'GET', '/employers', 'Employer clients', 'staff', 'table_read'),
  e('controls.employer', 'GET', '/employers/:id', 'Employer 360', 'staff', 'table_read'),
  e('controls.portalEmployer', 'GET', '/portal/employer', 'Employer HR portal (access-grant scoped)', 'customer', 'table_read'),
  e('funds.fund', 'GET', '/funds/:id', 'Fund oversight with two-pot values', 'staff', 'table_read'),
  e('funds.reconcileBalance', 'POST', '/funds/statements/:id/reconcile', 'Roll-forward reconciliation', 'staff', 'db_function'),
  e('funds.recordProviderDecision', 'POST', '/benefit-events/:id/decision', 'Record the administrator’s or insurer’s decision', 'staff', 'db_function'),
  e('funds.portfolio', 'GET', '/investments/:id', 'Holdings, reconciliation and calculated performance', 'staff', 'table_read'),
  e('funds.reconcileHoldings', 'POST', '/investments/:id/reconcile', 'Administrator vs manager holdings', 'staff', 'db_function'),
  e('funds.transfer', 'GET', '/transfers/:id', 'Transfer workspace', 'staff', 'table_read'),
  e('funds.advanceTransfer', 'POST', '/transfers/:id/advance', 'Complete a stage with evidence', 'staff', 'db_function'),
  e('funds.startMovements', 'POST', '/employers/:id/movements', 'Process movements and recalculate cover', 'staff', 'edge_function'),
  e('specialist.cell', 'GET', '/cells/:id', 'Cell results', 'staff', 'table_read'),
  e('specialist.portalCell', 'GET', '/portal/cell', 'Cell owner portal (access-grant scoped)', 'customer', 'table_read'),
  e('specialist.buildPack', 'POST', '/governance/packs', 'Prepare a trustee pack', 'staff', 'edge_function'),
  e('specialist.issuePack', 'POST', '/governance/packs/:id/issue', 'Issue a trustee pack', 'staff', 'db_function'),
  e('specialist.investigation', 'GET', '/investigations/:id', 'Investigation workspace', 'staff', 'table_read'),
  e('specialist.snapshot', 'POST', '/investigations/:id/snapshots', 'Freeze a dataset as evidence', 'staff', 'db_function'),
  e('specialist.executive', 'GET', '/executive', 'Executive dashboard (separate measures)', 'manager', 'table_read'),
  e('specialist.compliance', 'GET', '/compliance', 'Compliance register', 'staff', 'table_read'),
]

/** Where each assistant or copilot is used in the app. Agents run inside jobs; these are the conversational surfaces. */
export const COPILOT_SURFACES: Array<{ name: string; agent: string; route: string; audience: string }> = [
  { name: 'Ava', agent: 'ava', route: '/assist', audience: 'Public visitors and customers' },
  { name: 'Business Discovery Agent', agent: 'business_discovery', route: '/business/risk-review', audience: 'Business owners' },
  { name: 'AR · database copilot', agent: 'ar', route: '/broker/workspace', audience: 'Brokers, advisers and managers: clients, accounts and policies through MCP jobs' },
  { name: 'Ava · people (records)', agent: 'ava', route: '/broker/workspace?copilot=ava', audience: 'Brokers and advisers working with personal clients; also “Ask Ava” on Person 360 and policies' },
  { name: 'Russ · business (records)', agent: 'russ', route: '/broker/workspace?copilot=russ', audience: 'Brokers working with business accounts and group schemes; also “Ask Russ” on business clients' },
  { name: 'Ava · Personal lines workflows', agent: 'broker_copilot', route: '/broker/workspace?copilot=ava&mode=workflows&lens=general', audience: 'Brokers' },
  { name: 'Ava · Life workflows', agent: 'russ', route: '/broker/workspace?copilot=ava&mode=workflows&lens=life', audience: 'Advisers' },
  { name: 'Russ · Commercial workflows', agent: 'broker_copilot', route: '/broker/workspace?copilot=russ&mode=workflows&lens=commercial', audience: 'Brokers (also in Twin workspace and submission editor)' },
  { name: 'Russ · Controls workflows', agent: 'russ', route: '/broker/workspace?copilot=russ&mode=workflows&lens=controls', audience: 'Brokers and managers' },
  { name: 'Russ · systems', agent: 'systems_copilot', route: '/broker/systems', audience: 'Managers and admins' },
]

export type AgentKind = 'assistant' | 'copilot' | 'agent' | 'engine'

export const AGENT_KIND: Record<string, AgentKind> = {
  ar: 'copilot',
  russ: 'copilot',
  ava: 'copilot',
  business_discovery: 'assistant',
  broker_copilot: 'copilot',
  systems_copilot: 'copilot',
  orchestrator: 'engine',
  approval_engine: 'engine',
}

/** Decisions recorded with the user that shape the database build. */
export const DATABASE_DECISIONS: Array<{ title: string; detail: string }> = [
  { title: 'Clean normalised baseline', detail: 'Migrations 0001–0003 are archived and replaced by one migration per area. None of them have been applied anywhere.' },
  { title: 'insureflow-dev first, insureflow-prod at cutover', detail: 'A dedicated Supabase project. The aivoortrekker project is never used for InsureFlow.' },
  {
    title: 'Frontend reads Supabase directly',
    detail:
      'Row-level security uses tenant and role claims in the login token. Consequential writes (approvals, releases, confirmations) go through database functions or Edge Functions so the guardrails hold in the database.',
  },
  {
    title: 'bcovered project is live for the copilots and synced modules',
    detail:
      'Migrations 0001–0018 are applied to bcovered. AR, Ava and Russ run MCP jobs against it; broker modules load and write through to it under row-level security. Onboarding and identity stay in the browser for now.',
  },
  {
    title: 'Sample and Live are separated by the database',
    detail:
      'Every client record carries data_category. The x-data-category request header plus restrictive policies scope each read and write, and composite foreign keys stop a Sample record linking to a Live one.',
  },
]

/** Steps to create the separate database instance. */
export const INSTANCE_STEPS: string[] = [
  'Done: bcovered project (eu-west-1) created; migrations 0001–0018 applied via the Supabase MCP; Sample data loaded with scripts/seed-sample.mjs; demo staff logins created.',
  'Done: Edge Functions bcovered-mcp (MCP server) and copilot-agent (rule planner and MCP client) deployed with JWT verification.',
  'Register public.custom_access_token_hook under Authentication > Hooks. Until then app.tenant_id() and app.role() fall back to the active membership.',
  'Record the POPIA cross-border transfer basis for the EU region before Live client data is imported.',
  'Create Supabase Auth logins for real brokers, then import Live clients through the client-book import (Live category).',
  'Wire onboarding writes to the database functions (switch_workspace, accept_invitation, activate_brokerage) and then enable the onboarding sync module.',
  'Create private storage buckets for source files and evidence; decide encryption for ID numbers and medical underwriting data before any real data is loaded.',
  'Move import commits and reconciliation runs into set-based database functions or Edge Functions, keeping the contracts in src/api/client.ts.',
  'Gate before real data or Phase 5 volume: isolation tests pass against real row-level security, a 5 000-row payroll commits idempotently, and the security and performance advisors are clean.',
]
