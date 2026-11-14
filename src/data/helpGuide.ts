export type CapabilityStatus = 'live' | 'demo_only' | 'later'

export interface HelpLink {
  to: string
  label: string
}

export interface Capability {
  area: string
  audience: string
  summary: string
  can: string[]
  status: CapabilityStatus
  links: HelpLink[]
}

export const HELP_SECTIONS = [
  { id: 'start', label: 'Getting started' },
  { id: 'roles', label: 'Roles and access' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'walkthroughs', label: 'Walkthroughs' },
  { id: 'copilot', label: 'Copilot commands' },
  { id: 'agents', label: 'AI agents and tools' },
  { id: 'guardrails', label: 'Guardrails' },
  { id: 'statuses', label: 'Status reference' },
  { id: 'roadmap', label: 'Coming later' },
  { id: 'faq', label: 'Troubleshooting' },
  { id: 'more', label: 'FAQ and updates' },
] as const

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  live: 'Working in this build',
  demo_only: 'Front-end demo only',
  later: 'Later phase',
}

export const GETTING_STARTED = [
  {
    title: 'Choose Personal or Business',
    body: 'The two menus in the header and the picker on the home page split cover for people and households from cover for businesses in 14 industries.',
    link: { to: '/', label: 'Go to the home page' },
  },
  {
    title: 'Open Demo Studio',
    body: 'Two guided scenarios are ready: a new motor lead (Scenario 1) and a restaurant group risk review (Scenario A). Each one is started by hand and plays a scripted conversation.',
    link: { to: '/demo', label: 'Go to Demo Studio' },
  },
  {
    title: 'Switch identity with “Demo as …”',
    body: 'The identity button in the header switches between the public visitor, customers, the broker and the manager, and opens each one’s home screen. No passwords exist; every identity is synthetic.',
    link: null,
  },
  {
    title: 'Reset whenever you like',
    body: 'Everything is stored in this browser only. “Reset demo data” in Demo Studio restores the original fixtures and clears conversations, jobs and approvals.',
    link: { to: '/demo', label: 'Reset in Demo Studio' },
  },
]

export const ROLES = [
  {
    role: 'Public visitor',
    who: 'Anyone, not signed in',
    can: 'Browse products and business cover, chat with Ava, start a business risk review, use the quote and claims forms, run Demo Studio.',
    home: { to: '/', label: 'Public site' },
  },
  {
    role: 'Customer',
    who: 'Johan van der Merwe, Ayanda Khumalo; Sarah Jacobs after Scenario 1',
    can: 'See proposals a broker has released, compare simulated options, read messages and track work in progress.',
    home: { to: '/portal', label: 'My portal' },
  },
  {
    role: 'Business customer',
    who: 'Nomsa Dlamini (Kasi Kitchen Group) after Scenario A',
    can: 'Lands in the business portal: review status, the business risk profile with its provenance labels, and the documents or information the broker has asked for.',
    home: { to: '/portal/business', label: 'Business portal' },
  },
  {
    role: 'Broker',
    who: 'Thabo Nkosi',
    can: 'Use both Copilots, work leads and business clients, edit submission packs, approve, reject or request changes, and control jobs.',
    home: { to: '/broker', label: 'Broker workspace' },
  },
  {
    role: 'Manager',
    who: 'Naledi Mokoena',
    can: 'Everything a broker can do, for oversight of the team’s pipeline, plus the Systems area: database and ERD, agents and copilots, workflows and the audit trail.',
    home: { to: '/broker/systems', label: 'Systems overview' },
  },
  {
    role: 'Brokerage team (other brokerages)',
    who: 'Acacia Cover Brokers: Anele Mahlangu (owner), Ruan Pretorius, Fatima Essop (read-only), Sam Pillay (also Coastline). Coastline Risk Partners: Thandiwe Zulu, Marco Rossi, Grace Mokoena, Sipho Khumalo. Highveld Advisory: Kagiso Molefe (onboarding)',
    can: 'Work only in their own brokerage’s workspace, by role. Brokerages still onboarding land in guided setup with Russ; people in two brokerages switch workspace explicitly.',
    home: { to: '/onboarding', label: 'Brokerage onboarding' },
  },
  {
    role: 'B-Covered platform staff',
    who: 'Nomvula Khoza (platform administrator), Pieter Botha (onboarding reviewer)',
    can: 'Invite brokerages, review applications item by item, request corrections, approve, activate separately, and suspend or reinstate. They see onboarding records only, never a brokerage’s clients or policies.',
    home: { to: '/platform/onboarding', label: 'Onboarding queue' },
  },
]

export type AccessLevel = 'full' | 'view' | 'limited' | 'prepares' | 'none'

export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  full: 'Full use',
  view: 'Sees results',
  limited: 'Partial',
  prepares: 'Prepares only',
  none: 'No access',
}

export const ACCESS_LEVEL_HINT: Record<AccessLevel, string> = {
  full: 'Can open the area and take every action in it',
  view: 'Sees what others have approved or released, cannot change it',
  limited: 'Some of the area, as described in the note',
  prepares: 'Drafts and proposes through tools; a person decides',
  none: 'The area is not available to this role',
}

export const ACCESS_ROLES = [
  { id: 'visitor', label: 'Public visitor' },
  { id: 'customer', label: 'Customer' },
  { id: 'business', label: 'Business customer' },
  { id: 'broker', label: 'Broker' },
  { id: 'manager', label: 'Manager' },
  { id: 'agent', label: 'AI agents' },
] as const

export type AccessRoleId = (typeof ACCESS_ROLES)[number]['id']

export interface AccessCell {
  level: AccessLevel
  note?: string
}

export interface AccessRow {
  area: string
  link: HelpLink
  access: Record<AccessRoleId, AccessCell>
}

const NONE: AccessCell = { level: 'none' }
const FULL: AccessCell = { level: 'full' }

export const ACCESS_MATRIX: AccessRow[] = [
  {
    area: 'Public site, quote and claims forms, help and Demo Studio',
    link: { to: '/', label: 'Public site' },
    access: { visitor: FULL, customer: FULL, business: FULL, broker: FULL, manager: FULL, agent: NONE },
  },
  {
    area: 'Ava motor intake and business risk review',
    link: { to: '/assist', label: 'Ava' },
    access: {
      visitor: { level: 'full', note: 'Starts a conversation and gives consent' },
      customer: FULL,
      business: FULL,
      broker: FULL,
      manager: FULL,
      agent: { level: 'prepares', note: 'Lead and Discovery agents run the interview and create the lead or profile' },
    },
  },
  {
    area: 'Personal portal: proposals, options and messages',
    link: { to: '/portal', label: 'My portal' },
    access: {
      visitor: NONE,
      customer: { level: 'view', note: 'Own released proposals; can compare options and ask questions' },
      business: { level: 'limited', note: 'Only personal proposals released to them' },
      broker: NONE,
      manager: NONE,
      agent: { level: 'prepares', note: 'Answers questions about a released comparison' },
    },
  },
  {
    area: 'Business portal: review status, risk profile, document requests',
    link: { to: '/portal/business', label: 'Business portal' },
    access: {
      visitor: NONE,
      customer: { level: 'limited', note: 'Without a business, sees how to start a review' },
      business: { level: 'view', note: 'Own business profile and the broker’s requests' },
      broker: NONE,
      manager: NONE,
      agent: NONE,
    },
  },
  {
    area: 'Broker overview, leads and business clients',
    link: { to: '/broker', label: 'Broker overview' },
    access: {
      visitor: NONE,
      customer: NONE,
      business: NONE,
      broker: FULL,
      manager: FULL,
      agent: { level: 'prepares', note: 'Creates and updates leads, customers and profiles; cannot overwrite verified values' },
    },
  },
  {
    area: 'Russ workspace (all lenses)',
    link: { to: '/broker/workspace', label: 'Russ' },
    access: {
      visitor: NONE,
      customer: NONE,
      business: NONE,
      broker: FULL,
      manager: FULL,
      agent: { level: 'prepares', note: 'Plans and runs the steps a broker asks for' },
    },
  },
  {
    area: 'Risk Twins and assessments',
    link: { to: '/broker/commercial/risk-twins', label: 'Risk Twins' },
    access: {
      visitor: NONE,
      customer: NONE,
      business: { level: 'view', note: 'Profile with provenance labels, in the business portal' },
      broker: { level: 'full', note: 'Decides findings, confirms links, overrides priority, signs off' },
      manager: FULL,
      agent: { level: 'prepares', note: 'Builds Twins and runs assessments; cannot decide findings or confirm links' },
    },
  },
  {
    area: 'Submission packs',
    link: { to: '/broker/commercial/submissions', label: 'Submissions' },
    access: {
      visitor: NONE,
      customer: NONE,
      business: NONE,
      broker: { level: 'full', note: 'Edits sections, exports, requests approval' },
      manager: FULL,
      agent: { level: 'prepares', note: 'Drafts and refreshes the pack; section edits are people only' },
    },
  },
  {
    area: 'Approvals',
    link: { to: '/broker/approvals', label: 'Approvals' },
    access: {
      visitor: NONE,
      customer: { level: 'view', note: 'Sees a proposal only after it is approved and released' },
      business: { level: 'view', note: 'Sees requests once the broker releases them' },
      broker: { level: 'full', note: 'Approve, request changes or reject' },
      manager: FULL,
      agent: { level: 'prepares', note: 'Can request approval, never approve' },
    },
  },
  {
    area: 'Tasks and jobs',
    link: { to: '/broker/jobs', label: 'Tasks & Jobs' },
    access: {
      visitor: NONE,
      customer: { level: 'view', note: 'Work in progress on their own request' },
      business: { level: 'view', note: 'Review status in the business portal' },
      broker: { level: 'full', note: 'Pause, resume, cancel, retry and archive' },
      manager: FULL,
      agent: { level: 'prepares', note: 'Runs job steps and creates tasks; cannot control jobs' },
    },
  },
  {
    area: 'Systems: database, agents, workflows and audit',
    link: { to: '/broker/systems', label: 'Systems overview' },
    access: { visitor: NONE, customer: NONE, business: NONE, broker: NONE, manager: FULL, agent: NONE },
  },
]

export const ROLE_FLOW = [
  { role: 'Visitor or customer', step: 'Asks for cover through Ava, the risk review or a form' },
  { role: 'AI agents', step: 'Qualify the lead, build the profile and draft options or a pack' },
  { role: 'Broker', step: 'Reviews, edits and approves or sends back' },
  { role: 'Customer', step: 'Sees only the approved result in their portal' },
  { role: 'Manager', step: 'Oversees the pipeline and the system behind it' },
]

export const CAPABILITIES: Capability[] = [
  {
    area: 'AR, Ava and Russ: database copilots',
    audience: 'Brokers, advisers and managers',
    summary:
      'Talk to the B-Covered database. Ava works with people, Russ with businesses, and AR splits a request and routes each part. Every action is an MCP job run as you, in Sample or Live.',
    can: [
      'Type @ (or just a name or number) to pick a client, account or policy; each suggestion shows its number and a Sample or Live badge',
      'Type / for the list of jobs the MCP server offers',
      'Find clients by client number (CL-), account number (AC-), policy number, name, partial name or similar spelling',
      'Add notes and follow-ups against a client, account and policy; create clients (with a duplicate check), accounts, quote requests and life applications',
      'Show policies, history, the latest life application, group schemes and members',
      'Ask with choices when a name or policy is ambiguous, before anything is saved; retries never save twice',
      '“Ask Ava” and “Ask Russ” on Person 360, policies and business clients open the copilot with that record selected',
    ],
    status: 'live',
    links: [
      { to: '/broker/workspace', label: 'AR · Ava · Russ' },
      { to: '/broker/workspace?copilot=ava', label: 'Ava' },
      { to: '/broker/workspace?copilot=russ', label: 'Russ' },
    ],
  },
  {
    area: 'Public website: Personal and Business',
    audience: 'Visitors',
    summary: 'Two top-level categories of equal weight: cover for people and households, and cover for businesses.',
    can: [
      'Personal: car, buildings, contents, motorcycle and portable valuables, each with cover, extras and exclusions',
      'Business: 14 industries in three families, 25 cover sections in six areas, and who we cover from sole traders to multi-site groups',
      'Home page picker switches between personal products and business industries',
      'Industry and cover-area links open the exact entry on the detail page',
    ],
    status: 'live',
    links: [
      { to: '/#personal', label: 'Personal cover' },
      { to: '/business', label: 'Business insurance' },
    ],
  },
  {
    area: 'Ava: Find My Cover',
    audience: 'Visitors',
    summary: 'A guided motor intake that turns a conversation into a qualified, consented lead and starts the agent workflow.',
    can: [
      'Captures vehicle, usage, security, driver and claims history step by step',
      'Records POPIA consent before any contact details are taken',
      'Shows live progress, agent activity and the details captured so far',
      'Answers off-script requests honestly as “available in a later phase”',
    ],
    status: 'live',
    links: [{ to: '/assist', label: 'Open Ava' }],
  },
  {
    area: 'Business risk review',
    audience: 'Visitors (business owners)',
    summary: 'The Business Discovery Agent interviews a business owner and builds a structured company profile.',
    can: [
      'Detects the industry and asks questions shaped by its template',
      'Captures entities, locations, assets, stock, backup power, security, current cover and claims',
      'Hands the profile to the Industry Risk Analyst and Commercial Underwriting Agent',
    ],
    status: 'live',
    links: [
      { to: '/business/risk-review', label: 'Start a review' },
      { to: '/business/industries', label: '14 industry templates' },
      { to: '/business/cover', label: '25 cover sections' },
    ],
  },
  {
    area: 'Broker overview',
    audience: 'Broker, manager',
    summary: 'The landing screen of the broker workspace, with live counts from the demo tables.',
    can: [
      'Open leads, approvals awaiting a decision (personal and commercial), released proposals and job health',
      'Lead pipeline by status, with each bar linking to Leads',
      'Needs your decision and recent agent activity',
    ],
    status: 'live',
    links: [{ to: '/broker', label: 'Broker overview' }],
  },
  {
    area: 'Russ workspace',
    audience: 'Broker, manager',
    summary:
      'One workspace with lenses: General, Commercial, Life & benefits and Controls. Russ (left, about 40%) coordinates agents; results, the execution plan and context open on the right (about 60%). Each lens keeps its own conversation and only brings its own jobs into focus.',
    can: [
      'Switches lens from the chips above the conversation; the old Commercial, Life and Controls workspace addresses open the matching lens',
      'Lists pending approvals, new leads and running jobs on request',
      'Starts a simulated motor comparison for a customer with a motor lead',
      'Opens an existing job instead of starting a duplicate',
      'Shows an Approval tab when a proposal is waiting for a decision',
    ],
    status: 'live',
    links: [{ to: '/broker/workspace', label: 'Open Russ' }],
  },
  {
    area: 'Russ · Commercial lens',
    audience: 'Broker, manager',
    summary: 'The Commercial Copilot runs business reviews: Risk Twin, potential exposures, outstanding questions and a draft submission pack.',
    can: [
      'Reviews a named business, for example “Review Ubuntu Foods”',
      'Creates a Risk Twin conversationally: reuses an existing client and Twin, or interviews you about a new business',
      '“Which Risk Twins need attention?” lists clients with the reason for each',
      'Shows the result, the execution plan, the Risk Twin and any pending approval side by side',
      'Lists commercial clients and draft submissions',
    ],
    status: 'live',
    links: [
      { to: '/broker/workspace?lens=commercial', label: 'Russ · Commercial' },
      { to: '/broker/commercial/clients', label: 'Business clients' },
      { to: '/broker/commercial/risk-twins', label: 'Risk Twins' },
    ],
  },
  {
    area: 'Business Risk Twins',
    audience: 'Broker, manager',
    summary: 'The portfolio of Risk Twins: every commercial client, whether or not a Twin has been built yet.',
    can: [
      'Create Risk Twin opens the Commercial Copilot, which leads the conversation',
      'Build Twin for clients that have a profile but no Twin; no submission is drafted',
      'Discover existing business by name or registration number',
      'Card, table and risk overview views with search and filters',
      'Load demo businesses: three fixed synthetic businesses, removed by Demo Studio reset',
    ],
    status: 'live',
    links: [{ to: '/broker/commercial/risk-twins', label: 'Risk Twins' }],
  },
  {
    area: 'Twin workspace and assessments',
    audience: 'Broker, manager',
    summary: 'Open any Twin for the assessment-led workspace: the Copilot on the left, the assessment, graph, actions, insurance evidence and changes on the right.',
    can: [
      'Run one of seven assessment types; findings are ranked by explained factors and the five most important areas are marked',
      'Accept, reject or override findings with a recorded reason, then sign off; the report is printable as a PDF',
      'Graph: zoom, filter, focus, node actions, “What if it fails?” impact paths and dependency tracing',
      'Insurance: sample documents with simulated extraction, proposed updates to apply or reject, coverage evidence by exposure',
      'Actions: investigations, approvals, tasks, submissions, renewal and job activity',
      'Changes: compare with the last assessment, edit asset records, see Twin versions',
    ],
    status: 'live',
    links: [{ to: '/broker/commercial/risk-twins', label: 'Risk Twins' }],
  },
  {
    area: 'Submission editor',
    audience: 'Broker, manager',
    summary: 'Reviews and edits the draft insurer-ready pack. Agent suggestions appear as Current and Suggested, with “Apply to draft”.',
    can: [
      'Tabs for overview, sections, exposures, profile, missing information and pack preview',
      'Include, leave out or correct sections; validation flags blocking errors and warnings',
      '“Expand editor” hides the Copilot for focused editing',
      'Export the pack and request approval again after changes',
    ],
    status: 'live',
    links: [{ to: '/broker/commercial/submissions', label: 'Submissions' }],
  },
  {
    area: 'Approvals',
    audience: 'Broker, manager',
    summary: 'Consequential actions wait here for a person. Each request is pinned to the exact payload it was raised for.',
    can: [
      'Approve and release a motor proposal to the customer portal',
      'Approve a commercial pack (marked ready for market, nothing sent)',
      'Request changes or reject, with the decision recorded',
      'A confirmation after each decision says what happened and links to the job or submission',
      'Blocks approval when the pack changed after the request was raised',
    ],
    status: 'live',
    links: [{ to: '/broker/approvals', label: 'Open Approvals' }],
  },
  {
    area: 'Tasks and jobs',
    audience: 'Broker, manager',
    summary: 'Every workflow runs as a durable job with steps, agent runs and tool calls you can inspect.',
    can: [
      'Pause, resume, cancel, retry from the failed step, and archive',
      'Step-by-step trace of which agent called which tool, and the result',
      'Survives a page reload and continues where it stopped',
    ],
    status: 'live',
    links: [{ to: '/broker/jobs', label: 'Tasks & Jobs' }],
  },
  {
    area: 'Leads and clients',
    audience: 'Broker, manager',
    summary: 'The CRM view of personal leads and business clients, with their history and linked work.',
    can: [
      'Lead pipeline from new to won or lost, with risk review notes',
      'Business client record: Risk Twin map, exposures, profile, locations and assets, requests, submissions and jobs',
      '“Review with Copilot” from a client record',
    ],
    status: 'live',
    links: [
      { to: '/broker/leads', label: 'Leads' },
      { to: '/broker/commercial/clients', label: 'Business clients' },
    ],
  },
  {
    area: 'Customer portals',
    audience: 'Customers',
    summary: 'Customers see only what a broker has approved and released, clearly labelled as simulated.',
    can: [
      'Personal: released motor comparison with key differences, messages and work in progress',
      'Business: review status, risk profile with provenance labels, outstanding document requests',
      'Business contacts open the business portal directly; customers without a business see how to start a review',
    ],
    status: 'live',
    links: [
      { to: '/portal', label: 'Personal portal' },
      { to: '/portal/business', label: 'Business portal' },
    ],
  },
  {
    area: 'Quote form, claims and contact',
    audience: 'Visitors',
    summary: 'Classic website forms that show the brand experience. They are not connected to the agents or the broker workspace.',
    can: [
      'Quote form with indicative demo pricing, saved in this browser',
      'Log and track a claim (stored locally, no claims handler)',
      'Request a call back (nothing is sent)',
    ],
    status: 'demo_only',
    links: [
      { to: '/quote', label: 'Quote form' },
      { to: '/claims', label: 'Claims' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    area: 'Broker onboarding and brokerage workspaces',
    audience: 'Independent brokerages, B-Covered staff',
    summary: 'Brokerages join by invitation or application, set up with Russ, are reviewed and activated by B-Covered, then import their client book and enable insurers one by one.',
    can: [
      'Guided setup in nine sections with autosave and resume; requirements depend on brokerage type and product modules',
      'Russ: Chat, Suggestions (values read from documents, applied only when you confirm), Tasks and Review',
      'Review queue: item decisions, feedback the brokerage sees, internal notes it never sees, separate approval and activation',
      'Client-book import (CSV or XLSX) with mapping, validation, duplicates inside the brokerage only, confirmation, retry and an error report',
      'Insurer access per insurer and product; quoting uses enabled insurers only; credentials are masked',
    ],
    status: 'live',
    links: [
      { to: '/brokers/join', label: 'Join as a broker' },
      { to: '/platform/onboarding', label: 'Onboarding queue' },
      { to: '/broker/imports/client-book', label: 'Client-book import' },
    ],
  },
  {
    area: 'Help centre, FAQ and system updates',
    audience: 'Everyone',
    summary: 'Self-service guidance for visitors, customers and brokers.',
    can: [
      'This help centre: capabilities, walkthroughs, Copilot commands, agents and tools, guardrails and statuses',
      'FAQ with searchable answers in eight topics',
      'System updates: every release as a thread, plus a pinned overview of everything in the build',
    ],
    status: 'live',
    links: [
      { to: '/faq', label: 'FAQ' },
      { to: '/updates', label: 'System updates' },
    ],
  },
]

export const WALKTHROUGHS = [
  {
    id: 'copilots',
    title: 'AR, Ava and Russ on the database',
    outcome: 'A note saved on Priya Naidoo’s motor policy with its reference, visible on the policy after refresh, and her life application retrieved in the same request.',
    steps: [
      { text: 'Choose “Demo as” → Thabo Nkosi. The header shows “Supabase · Sample” once the database sign-in completes.', link: { to: '/broker', label: 'Broker workspace' } },
      { text: 'Open AR · Ava · Russ. Keep Sample selected. Type @Naid and pick Priya Naidoo or Priyanka Naidu from the dropdown.', link: { to: '/broker/workspace', label: 'AR' } },
      { text: 'Send: “Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application”. Give the note wording when asked.', link: { to: '/broker/workspace', label: 'AR' } },
      { text: 'Use “Open record” on the saved note. The motor policy lists the note under Notes and activity; refresh to confirm.', link: { to: '/broker/personal', label: 'Personal lines' } },
      { text: 'On Person 360 for any client, use “Ask Ava” to open Ava with that client selected above the message box.', link: { to: '/broker/people', label: 'People' } },
    ],
  },
  {
    id: 'motor',
    title: 'Scenario 1: new motor lead',
    outcome: 'A broker-approved, clearly simulated three-option proposal in Sarah Jacobs’s portal.',
    steps: [
      { text: 'In Demo Studio, press “Start scenario” on New motor insurance lead, then press Play in the Ava chat.', link: { to: '/demo', label: 'Demo Studio' } },
      { text: 'Watch “What’s happening” and “Agent activity” as the Lead, Risk and Quote agents work.', link: { to: '/assist', label: 'Ava' } },
      { text: 'Switch to Thabo Nkosi (broker). Open Approvals and choose “Approve and release”. A confirmation shows where the proposal went.', link: { to: '/broker/approvals', label: 'Approvals' } },
      { text: 'Optional: open Tasks & Jobs to see each step, agent run and tool call.', link: { to: '/broker/jobs', label: 'Tasks & Jobs' } },
      { text: 'Switch to Sarah Jacobs and open her portal to compare the three options.', link: { to: '/portal', label: 'My portal' } },
    ],
  },
  {
    id: 'commercial',
    title: 'Scenario A: restaurant group risk review',
    outcome: 'An approved draft submission pack (not sent to any insurer) plus document requests in Nomsa Dlamini’s business portal.',
    steps: [
      { text: 'In Demo Studio, start Restaurant group risk review and press Play. The fictional owner describes Kasi Kitchen Group.', link: { to: '/demo', label: 'Demo Studio' } },
      { text: 'Switch to Thabo Nkosi. Open Business clients to see the Risk Twin, exposures and requests.', link: { to: '/broker/commercial/clients', label: 'Business clients' } },
      { text: 'Open Submissions, review the pack, apply the suggested sections, then approve.', link: { to: '/broker/commercial/submissions', label: 'Submissions' } },
      { text: 'Switch to Nomsa Dlamini: you land in her business portal. Open the risk profile from there.', link: { to: '/portal/business', label: 'Business portal' } },
      { text: 'Optional: in Russ, switch to the Commercial lens and ask “Review Ubuntu Foods and identify outstanding insurance questions”.', link: { to: '/broker/workspace?lens=commercial', label: 'Russ · Commercial' } },
    ],
  },
  {
    id: 'onboarding',
    title: 'Broker onboarding: review, correct, approve and activate',
    outcome: 'Highveld Advisory goes from submitted to an active workspace, through a correction round, with every decision in the audit trail.',
    steps: [
      { text: 'Switch to Pieter Botha. Open the onboarding queue and choose Highveld Advisory, then Start review.', link: { to: '/platform/onboarding', label: 'Onboarding queue' } },
      { text: 'Request a correction on the PI schedule with feedback, add an internal note, then Request information.', link: { to: '/platform/onboarding', label: 'Onboarding queue' } },
      { text: 'Switch to Kagiso Molefe. Russ’s Review tab shows the feedback (not the internal note). Use a sample PI schedule under Documents and resubmit.', link: { to: '/onboarding', label: 'Brokerage onboarding' } },
      { text: 'Back as Pieter: start the review, accept each item, Approve, then Activate workspace as a separate step.', link: { to: '/platform/onboarding', label: 'Onboarding queue' } },
      { text: 'As Anele Mahlangu (Acacia) import a client CSV, correct a failed row and retry; as Sam Pillay switch between Acacia and Coastline.', link: { to: '/broker/imports/client-book', label: 'Client-book import' } },
    ],
  },
]

export const COPILOT_COMMANDS = [
  { workspace: 'AR', command: 'Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application', does: 'Three actions reported separately: finds the account, saves the note once you give the wording, retrieves the life application.' },
  { workspace: 'AR', command: 'Show policies for CL-S1001', does: 'Short-term and long-term policies for one client, by client number, with links to each record.' },
  { workspace: 'Ava', command: 'Add a note that Priya requested a callback on her motor renewal', does: 'Saves the note on Priya’s motor policy and returns NT-… with client and policy numbers.' },
  { workspace: 'Ava', command: 'Arrange a callback for @Priya Naidoo tomorrow', does: 'Creates a follow-up (TK-…) due tomorrow against the client.' },
  { workspace: 'Ava', command: 'Start a life application for Priyanka Naidu R650', does: 'Records a life application (PL-…) against the existing client. Nothing is sent to an insurer.' },
  { workspace: 'Ava', command: 'Create a client called Sipho Dlamini born 1990-02-03', does: 'Checks for duplicates, allocates a client number and creates a personal account.' },
  { workspace: 'Russ', command: 'Show schemes for Karoo Logistics', does: 'Group schemes for a business account with active member counts.' },
  { workspace: 'Russ', command: 'Show members for Karoo Logistics', does: 'Scheme members with client numbers, cover and status.' },
  { workspace: 'Both', command: 'Show pending approvals', does: 'Lists approvals waiting for a decision.' },
  { workspace: 'AI Workspace', command: 'Show new leads', does: 'New and qualifying leads. “Show leads” lists all open leads.' },
  { workspace: 'AI Workspace', command: 'Create a quote comparison for Ayanda Khumalo', does: 'Starts a simulated motor comparison for a customer with a motor lead.' },
  { workspace: 'Both', command: 'Show running jobs', does: 'Active jobs. “Show jobs” lists recent jobs.' },
  { workspace: 'Both', command: 'Review Ubuntu Foods and identify outstanding insurance questions', does: 'Runs a commercial review: Risk Twin, exposures, questions, refreshed pack, approval.' },
  { workspace: 'Commercial', command: 'Create a Risk Twin for Ubuntu Foods', does: 'Opens the existing Twin, builds one from existing records, or interviews you about a new business.' },
  { workspace: 'Commercial', command: 'Rebuild the Risk Twin for Ubuntu Foods', does: 'Builds a new Twin version from the current records.' },
  { workspace: 'Commercial', command: 'Which Risk Twins need attention?', does: 'Clients without a Twin, with high-priority exposures or open broker tasks, with reasons.' },
  { workspace: 'Commercial', command: 'Assess Ubuntu Foods and identify the five most important risk areas requiring review', does: 'Runs a formal assessment to broker sign-off: evidence, prioritised findings, tasks.' },
  { workspace: 'Commercial', command: 'What happens if the blast freezers fail at Ubuntu Foods?', does: 'Traces recorded dependencies to operations, stock, revenue and exposures. No loss estimate.' },
  { workspace: 'Commercial', command: 'Investigate possible underinsurance at Ubuntu Foods', does: 'Compares declared values with sums insured on file and proposes actions for review.' },
  { workspace: 'Commercial', command: 'Compare Ubuntu Foods with its last renewal assessment', does: 'Structured change report against the last signed-off assessment, with review tasks.' },
  { workspace: 'Commercial', command: 'Show commercial clients', does: 'Business clients with a profile.' },
  { workspace: 'Commercial', command: 'Show draft submissions', does: 'Open submission packs. None has been sent to an insurer.' },
]

export const GUARDRAILS = [
  'AI assistants are not licensed advisers. A broker approves every recommendation, proposal or pack.',
  'Agents cannot approve. The approval tool rejects any call from an agent.',
  'Approvals are pinned to a hash of the exact payload. Any later change makes the approval stale and needs a fresh request.',
  'Exposures are “potential” and priority is advisory, with its inputs listed. Nothing is confirmed as covered without analysed policy wording.',
  'Agents cannot overwrite values a person has verified. Every profile value carries its source.',
  'Agents never confirm cover or an exclusion. A similar section name is at most “potentially covered”; a broker confirms, citing the clause.',
  'Impact tracing uses recorded links only, and AI-inferred links are labelled until a broker confirms them. No loss estimate is produced.',
  'Assessment sign-off is pinned to the exact findings. Any change by a broker re-pins the request before it can be signed.',
  'All quotes and packs are simulated. No cover is bound and nothing is sent to an insurer; emails are preview-only drafts.',
  'Every tool call is validated, role-checked, audited and deduplicated, and side effects stop once a job is cancelled.',
  'POPIA consent is recorded before contact details are captured; marketing consent is separate and optional.',
]

export const STATUSES = [
  {
    title: 'Lead pipeline',
    items: [
      ['New', 'Enquiry received'],
      ['Qualifying', 'Ava or a broker is collecting details'],
      ['Qualified', 'Enough detail to request options'],
      ['Quoting', 'Quote Agent is fetching simulated options'],
      ['Proposal pending', 'Waiting for broker approval'],
      ['Proposal released', 'Visible in the customer portal'],
      ['Won / Lost', 'Final outcome'],
    ],
  },
  {
    title: 'Job status',
    items: [
      ['Queued / Running', 'Waiting for or executing its next step'],
      ['Awaiting information', 'Needs an answer before it can continue'],
      ['Awaiting approval', 'Held by the Approval Engine for a person'],
      ['Paused', 'Stopped by a person before the next step; resume to continue'],
      ['Completed', 'All steps finished'],
      ['Failed', 'A step failed; retry continues from that step'],
      ['Cancelled', 'No further steps, messages or record changes'],
    ],
  },
  {
    title: 'Approval status',
    items: [
      ['Pending', 'Waiting for a broker or manager'],
      ['Unapproved changes', 'The pack changed after approval was requested; request approval again'],
      ['Approved', 'Released (motor) or marked ready for market (commercial)'],
      ['Changes requested', 'Sent back with a note'],
      ['Rejected', 'Declined; nothing is released'],
    ],
  },
]

export const FAQ = [
  {
    q: 'I can’t open the broker workspace or a portal.',
    a: 'Those areas need the right identity. Use “Demo as …” in the header and choose Thabo Nkosi for the broker workspace, or the relevant customer for a portal.',
  },
  {
    q: 'Sarah Jacobs or Nomsa Dlamini is missing from “Demo as …”.',
    a: 'They are created by the scenarios. Run Scenario 1 (Sarah) or Scenario A (Nomsa) in Demo Studio first.',
  },
  {
    q: 'The portal has no proposal.',
    a: 'A proposal appears only after a broker approves and releases it in Approvals.',
  },
  {
    q: '“Approve” is disabled on a submission.',
    a: 'The pack changed after approval was requested. Review the changes and choose “Request approval again” in the submission editor.',
  },
  {
    q: 'The Copilot says something is “available in a later phase”.',
    a: 'Claims review, renewals, cross-sell and portfolio intelligence are planned modules. The Copilot answers honestly instead of guessing.',
  },
  {
    q: 'A job is stuck or failed.',
    a: 'Open Tasks & Jobs, select the job and use Resume or Retry. Retry continues from the failed step without repeating completed side effects.',
  },
  {
    q: 'Can I see the broker and customer side by side?',
    a: 'Yes. Open two tabs in the same browser; they share the same demo data.',
  },
  {
    q: 'The data looks wrong or cluttered.',
    a: 'Use “Reset demo data” in Demo Studio to restore the original fixtures.',
  },
]

export const LIMITATIONS = [
  'The service layer runs in the browser. The approval rules are real, but true server-side enforcement arrives when it moves behind the FastAPI backend.',
  'Data lives in this browser’s local storage only. It is not shared between devices or browsers.',
  'Ava and the Business Discovery Agent use deterministic, scripted intakes, not a general language model. The fal.ai adapter is a placeholder.',
  'Insurer figures come from a fixed demo adapter with three fictional insurers.',
]
