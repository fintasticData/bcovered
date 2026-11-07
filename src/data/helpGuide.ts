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
  { id: 'roles', label: 'Who can do what' },
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
    can: 'The same broker workspace and approval rights, for oversight of the team’s pipeline.',
    home: { to: '/broker', label: 'Broker workspace' },
  },
]

export const CAPABILITIES: Capability[] = [
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
    area: 'Broker AI Workspace',
    audience: 'Broker, manager',
    summary: 'The Broker Copilot (left, about 40%) coordinates agents; results, the execution plan and customer context open on the right (about 60%).',
    can: [
      'Lists pending approvals, new leads and running jobs on request',
      'Starts a simulated motor comparison for a customer with a motor lead',
      'Opens an existing job instead of starting a duplicate',
      'Shows an Approval tab when a proposal is waiting for a decision',
    ],
    status: 'live',
    links: [{ to: '/broker/workspace', label: 'Open AI Workspace' }],
  },
  {
    area: 'Commercial workspace',
    audience: 'Broker, manager',
    summary: 'The Commercial Copilot runs business reviews: Risk Twin, potential exposures, outstanding questions and a draft submission pack.',
    can: [
      'Reviews a named business, for example “Review Ubuntu Foods”',
      'Shows the result, the execution plan, the Risk Twin and any pending approval side by side',
      'Lists commercial clients and draft submissions',
    ],
    status: 'live',
    links: [
      { to: '/broker/commercial', label: 'Commercial workspace' },
      { to: '/broker/commercial/clients', label: 'Business clients' },
      { to: '/broker/commercial/risk-twins', label: 'Risk Twins' },
    ],
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
      { text: 'Optional: in the Commercial workspace ask “Review Ubuntu Foods and identify outstanding insurance questions”.', link: { to: '/broker/commercial', label: 'Commercial workspace' } },
    ],
  },
]

export const COPILOT_COMMANDS = [
  { workspace: 'Both', command: 'Show pending approvals', does: 'Lists approvals waiting for a decision.' },
  { workspace: 'AI Workspace', command: 'Show new leads', does: 'New and qualifying leads. “Show leads” lists all open leads.' },
  { workspace: 'AI Workspace', command: 'Create a quote comparison for Ayanda Khumalo', does: 'Starts a simulated motor comparison for a customer with a motor lead.' },
  { workspace: 'Both', command: 'Show running jobs', does: 'Active jobs. “Show jobs” lists recent jobs.' },
  { workspace: 'Both', command: 'Review Ubuntu Foods and identify outstanding insurance questions', does: 'Runs a commercial review: Risk Twin, exposures, questions, refreshed pack, approval.' },
  { workspace: 'Commercial', command: 'Show commercial clients', does: 'Business clients with a profile.' },
  { workspace: 'Commercial', command: 'Show draft submissions', does: 'Open submission packs. None has been sent to an insurer.' },
]

export const GUARDRAILS = [
  'AI assistants are not licensed advisers. A broker approves every recommendation, proposal or pack.',
  'Agents cannot approve. The approval tool rejects any call from an agent.',
  'Approvals are pinned to a hash of the exact payload. Any later change makes the approval stale and needs a fresh request.',
  'Exposures are “potential” and priority is advisory, with its inputs listed. Nothing is confirmed as covered without analysed policy wording.',
  'Agents cannot overwrite values a person has verified. Every profile value carries its source.',
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
