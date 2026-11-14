// Supabase Edge Functions deployed to the bcovered project. Versions and JWT settings are as deployed on the snapshot
// date in liveSchema.generated.ts; routes, database functions and tables come from the function source.
import { LIVE_TABLE_ROWS } from './liveSchema.generated'

export interface EdgeRoute {
  method: 'GET' | 'POST' | 'ALL'
  path: string
  access: 'signed_in' | 'public'
  summary: string
}

export interface EdgeFunctionInfo {
  slug: string
  status: 'active' | 'disabled'
  version: number
  /** Supabase checks the caller's JWT before the function runs. */
  verify_jwt: boolean
  /** Folder in this repo, or null when the code exists only in Supabase. */
  source: string | null
  summary: string
  routes: EdgeRoute[]
  /** Secrets it reads, by name only. SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase. */
  secrets: string[]
  /** Other Edge Functions it calls. */
  calls: string[]
  db_functions: string[]
  tables: string[]
  external: string[]
  callers: Array<{ label: string; route: string }>
  note?: string
}

const COPILOT_RPCS = [
  'copilot_create_account',
  'copilot_create_client',
  'copilot_create_life_application',
  'copilot_create_quote_request',
  'copilot_create_task',
  'copilot_get_life_application',
  'copilot_get_policy',
  'copilot_list_history',
  'copilot_list_policies',
  'copilot_record_interaction',
  'copilot_record_overview',
  'copilot_scheme_members',
  'copilot_search_records',
]

const SALES_RPCS = [
  'sales_book_grid',
  'sales_capture_enquiry',
  'sales_client_record',
  'sales_create_follow_up',
  'sales_create_offer',
  'sales_find_member',
  'sales_invite_link',
  'sales_invite_member',
  'sales_list_team',
  'sales_log_communication',
  'sales_mark_offer_sent',
  'sales_my_profile',
  'sales_offer_message',
  'sales_reassign_client',
  'sales_record_acceptance',
  'sales_record_sale',
  'sales_referral_funnel',
  'sales_setup_workspace',
]

const FRANCHISE_RPCS = [
  'franchise_client_attribution',
  'franchise_enquiry_grid',
  'franchise_invite_staff',
  'franchise_link_seller',
  'franchise_list',
  'franchise_outlet_detail',
  'franchise_performance',
  'franchise_sales',
  'franchise_setup',
  'franchise_update_outlet',
]

export const EDGE_FUNCTIONS: EdgeFunctionInfo[] = [
  {
    slug: 'copilot-agent',
    status: 'active',
    version: 5,
    verify_jwt: true,
    source: 'supabase/functions/copilot-agent',
    summary:
      'Runs each AR, Ava and Russ turn: discovers the jobs on bcovered-mcp, plans with fixed rules (no language model), resolves records, calls the jobs as the signed-in broker and logs every outcome.',
    routes: [
      { method: 'POST', path: '/turn', access: 'signed_in', summary: 'One copilot turn; returns a result per step with references' },
      { method: 'GET', path: '/search', access: 'signed_in', summary: 'Typeahead for @ mentions: clients, accounts and policies' },
      { method: 'GET', path: '/jobs', access: 'signed_in', summary: 'The / jobs menu, from the MCP tools list' },
      { method: 'GET', path: '/health', access: 'signed_in', summary: 'Who am I, Sample and Live access, and MCP reachability' },
    ],
    secrets: [],
    calls: ['bcovered-mcp'],
    db_functions: ['copilot_log_action', 'copilot_whoami'],
    tables: ['copilot_actions', 'app_users', 'organisations'],
    external: [],
    callers: [
      { label: 'AR · Ava · Russ workspace', route: '/broker/workspace' },
      { label: 'Ask Ava on Person 360', route: '/broker/people/:personId' },
      { label: 'Personal policy', route: '/broker/personal/policies/:policyId' },
      { label: 'Client account', route: '/broker/accounts/:accountId' },
    ],
  },
  {
    slug: 'bcovered-mcp',
    status: 'active',
    version: 4,
    verify_jwt: true,
    source: 'supabase/functions/bcovered-mcp',
    summary:
      'MCP server (Streamable HTTP) with 44 jobs for records, policy lines, the sales book and the franchise channel. Every job runs a Postgres function as the signed-in broker in the category from x-data-category, so tenant, staff and Sample / Live row-level security apply. No service-role key.',
    routes: [
      { method: 'ALL', path: '/mcp', access: 'signed_in', summary: 'MCP endpoint: initialize, tools/list and tools/call' },
      { method: 'GET', path: '/health', access: 'signed_in', summary: 'Server name, version and job count' },
      { method: 'GET', path: '/', access: 'signed_in', summary: 'Endpoint index' },
    ],
    secrets: [],
    calls: [],
    db_functions: [...COPILOT_RPCS, ...SALES_RPCS, ...FRANCHISE_RPCS],
    tables: [
      'app_users',
      'audit_events',
      'brokerage_applications',
      'brokerage_invitations',
      'business_profiles',
      'client_interactions',
      'communications',
      'contact_assignment_events',
      'copilot_actions',
      'customer_persons',
      'customers',
      'franchise_outlet_staff',
      'franchise_outlets',
      'franchise_partners',
      'group_schemes',
      'insurers',
      'leads',
      'organisation_memberships',
      'organisations',
      'persons',
      'policies',
      'policy_parties',
      'quote_options',
      'quotes',
      'sales_enquiries',
      'sales_offers',
      'sales_records',
      'sales_team_members',
      'scheme_memberships',
      'tasks',
    ],
    external: [],
    callers: [{ label: 'copilot-agent (MCP client)', route: '/broker/workspace' }],
    note: 'The Sales book and Franchise screens call the same sales_* and franchise_* database functions directly, so a button and a copilot job write the same way.',
  },
  {
    slug: 'fal-ai',
    status: 'active',
    version: 3,
    verify_jwt: false,
    source: 'supabase/functions/fal-ai',
    summary:
      'fal.ai language model and image calls with the key held server-side. Checks the signed-in user itself; /health and /answer are public for website visitors (length-capped and rate-limited per IP). Image models are allow-listed.',
    routes: [
      { method: 'GET', path: '/health', access: 'public', summary: 'Whether a key is set, which one, the model and allowed image models' },
      { method: 'POST', path: '/answer', access: 'public', summary: 'Ava’s general insurance answers for visitors' },
      { method: 'POST', path: '/chat', access: 'signed_in', summary: 'Language model chat' },
      { method: 'POST', path: '/intake', access: 'signed_in', summary: 'Wording for intake replies' },
      { method: 'POST', path: '/image', access: 'signed_in', summary: 'Queue image generation or editing' },
      { method: 'GET', path: '/image/:request_id', access: 'signed_in', summary: 'Image job status and result' },
      { method: 'GET', path: '/pricing', access: 'signed_in', summary: 'Live model prices' },
    ],
    secrets: ['BCOVERED_FAL_API_KEY (set)', 'FAL_KEY (fallback)', 'BCOVERED_FAL_LLM_MODEL (optional, default google/gemini-2.5-flash)'],
    calls: [],
    db_functions: [],
    tables: [],
    external: ['fal.ai (OpenRouter router for chat, image model queue, pricing API)'],
    callers: [{ label: 'Ava · Find My Cover', route: '/assist' }],
  },
  {
    slug: 'seed-loader',
    status: 'disabled',
    version: 3,
    verify_jwt: true,
    source: null,
    summary: 'Loaded the Sample seed on 14 Nov 2026. It now answers every request with 410 “This loader is disabled.”',
    routes: [{ method: 'ALL', path: '/', access: 'signed_in', summary: 'Returns 410 Gone' }],
    secrets: [],
    calls: [],
    db_functions: [],
    tables: [],
    external: [],
    callers: [],
    note: 'Deployed only; there is no source in this repo. scripts/gen-supabase-columns.mjs falls back to it, so that script now needs SUPABASE_DB_URL. Delete the function once it is no longer needed.',
  },
]

/** Mermaid flowchart: screens → Edge Functions → database functions and tables, and the external fal.ai API. */
export const EDGE_FLOW_SOURCE = `flowchart LR
  subgraph app["Browser (signed-in broker or visitor)"]
    ws["AR · Ava · Russ workspace<br/>Person 360, policies, accounts"]
    book["Sales book and Franchise screens"]
    ava["Ava · Find My Cover"]
  end
  subgraph edge["Supabase Edge Functions"]
    ca["copilot-agent<br/>/turn /search /jobs /health"]
    mcp["bcovered-mcp<br/>MCP /mcp · 44 jobs"]
    fal["fal-ai<br/>/chat /answer /intake /image /pricing"]
    seed["seed-loader<br/>disabled · 410"]
  end
  subgraph db["Postgres · bcovered · row-level security"]
    rpcCopilot["copilot_* functions (13)"]
    rpcSales["sales_* functions (18)"]
    rpcFranchise["franchise_* functions (10)"]
    log["copilot_log_action · copilot_whoami"]
    tables[("${LIVE_TABLE_ROWS.length} tables")]
  end
  falai(["fal.ai API"])
  ws -->|JWT + x-data-category| ca
  ca -->|tools/list, tools/call| mcp
  ca --> log
  mcp --> rpcCopilot
  mcp --> rpcSales
  mcp --> rpcFranchise
  book -->|direct RPC| rpcSales
  book -->|direct RPC| rpcFranchise
  rpcCopilot --> tables
  rpcSales --> tables
  rpcFranchise --> tables
  log --> tables
  ava --> fal
  fal --> falai
  classDef off fill:#f5f7fa,stroke:#94a3b8,color:#64748b,stroke-dasharray: 4 3
  class seed off`
