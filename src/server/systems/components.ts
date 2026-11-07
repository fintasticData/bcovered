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
    summary: 'Typed tables mirroring migrations 0001–0003, saved in this browser’s local storage.',
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
    key: 'supabase_dev',
    name: 'Supabase insureflow-dev',
    kind: 'database',
    status: 'planned',
    environment: 'dev',
    summary: 'Dedicated InsureFlow project. Not created yet. Never use the aivoortrekker project.',
    location: 'Supabase dashboard',
    dependsOn: [],
    secretRef: 'VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY',
    nextStep: 'Create the project, then add a Supabase MCP connection scoped to its project ref.',
  },
  {
    key: 'supabase_functions',
    name: 'Supabase Edge Functions',
    kind: 'backend',
    status: 'planned',
    environment: 'dev',
    summary: 'Agents, LLM calls, job steps and anonymous submissions (claims, quick quote, contact).',
    location: 'supabase/functions/ (to be created)',
    dependsOn: ['supabase_dev', 'fal'],
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
]

/** Where each assistant or copilot is used in the app. Agents run inside jobs; these are the conversational surfaces. */
export const COPILOT_SURFACES: Array<{ name: string; agent: string; route: string; audience: string }> = [
  { name: 'Ava', agent: 'ava', route: '/assist', audience: 'Public visitors and customers' },
  { name: 'Business Discovery Agent', agent: 'business_discovery', route: '/business/risk-review', audience: 'Business owners' },
  { name: 'Broker Copilot', agent: 'broker_copilot', route: '/broker/workspace', audience: 'Brokers' },
  { name: 'Commercial Copilot', agent: 'broker_copilot', route: '/broker/commercial', audience: 'Brokers (also in Twin workspace and submission editor)' },
  { name: 'Systems Copilot', agent: 'systems_copilot', route: '/broker/systems', audience: 'Managers and admins' },
]

export type AgentKind = 'assistant' | 'copilot' | 'agent' | 'engine'

export const AGENT_KIND: Record<string, AgentKind> = {
  ava: 'assistant',
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
  { title: 'No database work until the instance exists', detail: 'This section shows the target schema; nothing is applied until insureflow-dev is created and connected.' },
]

/** Steps to create the separate database instance. */
export const INSTANCE_STEPS: string[] = [
  'In the Supabase dashboard, create a new project named insureflow-dev in a dedicated organisation or alongside existing ones.',
  'Choose the region: check for an African region; otherwise use the closest EU region and record the POPIA cross-border transfer basis.',
  'Copy the project ref, URL and publishable key. Keep the service-role key out of the browser and out of the repo.',
  'In Cursor MCP settings, add a Supabase server scoped to the new project ref so migrations can be applied safely.',
  'Then apply the normalised baseline: platform, customers, reference, quoting, policies and claims, Twin, submissions, agents and systems, then policies and seed data.',
]
