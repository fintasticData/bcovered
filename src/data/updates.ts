export type UpdateArea = 'personal' | 'business' | 'broker' | 'portals' | 'agents' | 'platform' | 'help'
export type UpdateKind = 'new' | 'improved' | 'fixed' | 'overview'

export interface UpdateLink {
  to: string
  label: string
}

export interface UpdatePost {
  kind: UpdateKind
  area: UpdateArea
  title: string
  body: string
  points?: string[]
  links?: UpdateLink[]
}

export interface UpdateThread {
  id: string
  /** ISO timestamp, South African time. */
  date: string
  version: string
  title: string
  summary: string
  pinned?: boolean
  posts: UpdatePost[]
}

export const AREA_LABEL: Record<UpdateArea, string> = {
  personal: 'Personal insurance',
  business: 'Business insurance',
  broker: 'Broker workspace',
  portals: 'Customer portals',
  agents: 'AI agents',
  platform: 'Platform',
  help: 'Help and guides',
}

export const KIND_LABEL: Record<UpdateKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
  overview: 'Overview',
}

/** Newest first. The pinned thread is the standing overview of everything in the current build. */
export const UPDATE_THREADS: UpdateThread[] = [
  {
    id: 'systems-live-erd',
    date: '2026-11-14T17:45:00+02:00',
    version: 'v1.4',
    title: 'Systems: live database ERD and Edge Functions',
    summary:
      'Systems > Database now opens on what is really in the bcovered Supabase project: an ERD of all 121 tables by area, every table’s columns and security, and the four deployed Edge Functions with how screens reach the database through them.',
    posts: [
      {
        kind: 'new',
        area: 'platform',
        title: 'Live ERD and live tables',
        body: 'The ERD is drawn from a snapshot of the bcovered database: 121 tables, 337 foreign keys and 520 row-level security policies. Pick an area, click a table to open its columns, keys, policies and row count, and see which target tables are not created yet.',
        points: [
          'Links to app_users (created by, decided by and similar) are hidden by default and can be shown',
          'Live tables can be searched by table or column and filtered to empty tables',
          'Target tables show whether they exist in bcovered and link to the live table',
          'Refresh the snapshot after a migration with npm run db:schema',
        ],
        links: [
          { to: '/broker/systems/database', label: 'Live ERD' },
          { to: '/broker/systems/database?view=live_tables', label: 'Live tables' },
        ],
      },
      {
        kind: 'new',
        area: 'platform',
        title: 'Edge Functions in place',
        body: 'copilot-agent, bcovered-mcp and fal-ai are active; seed-loader is deployed but disabled. Each has its routes, access, secret names, database functions, the tables it reaches and the screens that call it, with a flow diagram from screen to table.',
        links: [{ to: '/broker/systems/database?view=functions', label: 'Edge Functions' }],
      },
      {
        kind: 'improved',
        area: 'platform',
        title: 'Systems catalogue brought up to date',
        body: 'The catalogue now reflects migrations up to 0024, the fal.ai key being set, and the disabled seed-loader. The Systems Copilot answers “Show the live database ERD” and “What does copilot-agent do?”.',
        links: [{ to: '/broker/systems', label: 'Systems overview' }],
      },
    ],
  },
  {
    id: 'database-copilots',
    date: '2026-11-14T03:30:00+02:00',
    version: 'v1.3',
    title: 'AR, Ava and Russ now work on the B-Covered database',
    summary:
      'The broker area runs on the bcovered Supabase project. Ava (people) and Russ (business) run MCP jobs against real tables, AR routes mixed requests, and Sample and Live records are kept apart by the database.',
    posts: [
      {
        kind: 'new',
        area: 'agents',
        title: 'Database copilots with MCP jobs',
        body: 'Every copilot action is a named job on the bcovered-mcp server, run as the signed-in broker. There is no language model: fixed rules plan the work and ask with choices when a name or policy is ambiguous.',
        points: [
          '@ suggestions by name, partial name, similar spelling or client, account and policy number, each with a Sample or Live badge',
          '/ opens the jobs the MCP server offers',
          'Multi-part requests report each action separately; writes return a reference, client, account and policy numbers and Open record',
          'Retried messages replay the saved receipt instead of writing again',
        ],
        links: [{ to: '/broker/workspace', label: 'AR · Ava · Russ' }],
      },
      {
        kind: 'new',
        area: 'platform',
        title: 'Client and account numbers, Sample and Live',
        body: 'Clients get CL- numbers, accounts AC-, policies PL-, notes NT- and follow-ups TK-, allocated by the database (Sample numbers carry an S). The Sample / Live switch scopes every read and write; a Sample record can never link to a Live one.',
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Policy and account screens, Ask Ava and Ask Russ',
        body: 'Personal policies and client accounts have their own screens with notes and history. Person 360, policies and business clients open Ava or Russ with the record already selected.',
        links: [
          { to: '/broker/personal', label: 'Personal lines' },
          { to: '/broker/people', label: 'People' },
        ],
      },
    ],
  },
  {
    id: 'platform-overview',
    date: '2026-11-07T16:00:00+02:00',
    version: 'v0.6',
    pinned: true,
    title: 'Everything InsureFlow AI does today',
    summary:
      'A standing thread covering every service, product, feature and capability in the current demo build. BCovered is the first fictional brokerage running on the platform; all people, insurers and figures are synthetic.',
    posts: [
      {
        kind: 'overview',
        area: 'personal',
        title: 'Personal insurance for people and households',
        body: 'Five personal products, each with what is covered, optional extras and typical exclusions.',
        points: [
          'Car, buildings, home contents, motorcycle and portable valuables',
          'Ava runs an AI-assisted motor intake; the other products use the quote form',
          'Indicative demo pricing compared across a panel of fictional insurers',
        ],
        links: [
          { to: '/#personal', label: 'Personal cover' },
          { to: '/assist', label: 'Find my cover with Ava' },
        ],
      },
      {
        kind: 'overview',
        area: 'business',
        title: 'Business insurance for 14 industries',
        body: 'A dedicated commercial module for South African businesses, from sole traders to multi-site groups.',
        points: [
          '14 industry risk templates, from hospitality and retail to construction, technology and healthcare',
          '25 cover sections in 6 areas: property, interruption, liability, fleet and transit, specialist and Sasria',
          'Business risk review: the Business Discovery Agent asks only what your industry needs',
        ],
        links: [
          { to: '/business', label: 'Business insurance' },
          { to: '/business/industries', label: 'Industries' },
          { to: '/business/cover', label: 'Cover areas' },
        ],
      },
      {
        kind: 'overview',
        area: 'agents',
        title: 'Ten AI agents with one orchestrator',
        body: 'Specialist agents do the administration; licensed brokers make the decisions.',
        points: [
          'Ava and the Business Discovery Agent talk to customers',
          'Lead, Risk and Quote agents qualify motor leads and prepare simulated options',
          'Industry Risk Analyst builds the Risk Twin; Commercial Underwriting Agent drafts the submission pack',
          'Broker Copilot summarises; the Approval Engine holds every consequential action for a person',
        ],
        links: [{ to: '/help#agents', label: 'Agents and tools' }],
      },
      {
        kind: 'overview',
        area: 'broker',
        title: 'Broker workspace',
        body: 'Copilot on the left, results and editors on the right, so the broker discusses the task and then reviews the outcome.',
        points: [
          'AI Workspace and Commercial workspace, each with its own Copilot',
          'Leads, business clients, Risk Twins and submission packs',
          'Approvals with Current and Suggested views, pinned to the exact payload',
          'Tasks & Jobs: pause, resume, cancel, retry and a full agent and tool trace',
        ],
        links: [
          { to: '/broker', label: 'Broker overview' },
          { to: '/broker/approvals', label: 'Approvals' },
        ],
      },
      {
        kind: 'overview',
        area: 'portals',
        title: 'Customer and business portals',
        body: 'Customers see only what a broker has approved and released, clearly labelled as simulated.',
        points: [
          'Personal portal: released comparisons, messages and work in progress',
          'Business portal: review status, risk profile with provenance labels and document requests',
        ],
        links: [
          { to: '/portal', label: 'My portal' },
          { to: '/portal/business', label: 'Business portal' },
        ],
      },
      {
        kind: 'overview',
        area: 'platform',
        title: 'Platform foundations and guardrails',
        body: 'The rules that hold across every service.',
        points: [
          '45 typed tools: validated, role-checked, audited and deduplicated',
          'Durable jobs that survive a reload and stop all side effects when cancelled',
          'POPIA consent before contact details; marketing consent separate and optional',
          'Nothing is bound or sent to an insurer; emails are preview-only drafts',
          'Mobile-first layouts with dedicated scroll areas and a phone pane switch in the broker workspace',
        ],
        links: [
          { to: '/help#guardrails', label: 'Guardrails' },
          { to: '/legal', label: 'Demo disclosures' },
        ],
      },
      {
        kind: 'overview',
        area: 'help',
        title: 'Demo Studio, help centre, FAQ and updates',
        body: 'Everything needed to explore the platform on your own.',
        points: [
          'Two guided scenarios: a new motor lead and a restaurant group risk review',
          'Switch identity with “Demo as …”; reset the demo data at any time',
          'Help centre, FAQ and this updates thread',
        ],
        links: [
          { to: '/demo', label: 'Demo Studio' },
          { to: '/help', label: 'Help centre' },
          { to: '/faq', label: 'FAQ' },
        ],
      },
    ],
  },
  {
    id: 'broker-navigation',
    date: '2026-11-11T23:00:00+02:00',
    version: 'v1.2',
    title: 'Broker area by line of business, one Russ workspace with lenses',
    summary:
      'The broker navigation now follows how a brokerage’s book is organised: short-term and long-term, each split into personal and business lines, with a consistent colour key. The four Russ workspaces are one screen with lenses, and related list screens share tabs.',
    posts: [
      {
        kind: 'improved',
        area: 'broker',
        title: 'Navigation by term and market',
        body: 'The sidebar starts collapsed and remembers your choice. Short-term lines carry a gold rail and long-term lines a violet rail; personal lines are marked coral and business or group lines cobalt. Every colour is backed by a text label or tooltip.',
        points: [
          'Leads stay in the top group because they cover every line',
          'Short-term · Personal: personal lines and motor quotes',
          'Short-term · Business: commercial cover, business clients, Risk Twins, submissions and cell captives',
          'Long-term · Personal: people, life policies and investments',
          'Long-term · Business: employers and schemes, retirement funds, transfers, governance and trustees',
          'Each screen shows its line as a chip next to the title',
          'Demo Studio, Help, System updates and the public site sit in one Help & demo menu',
        ],
        links: [{ to: '/broker', label: 'Broker overview' }],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Personal lines and commercial cover views',
        body: 'Personal lines shows the five personal products from the public site (car, buildings, home contents, motorcycle and portable valuables) with open leads, quotes and short-term personal policies for each. Commercial cover groups every client’s potential exposures into the six public-site cover areas and their cover classes, with coverage status, the clients involved and policy sections on record.',
        links: [
          { to: '/broker/personal', label: 'Personal lines' },
          { to: '/broker/commercial/cover', label: 'Commercial cover' },
        ],
      },
      {
        kind: 'improved',
        area: 'agents',
        title: 'One Russ workspace with General, Commercial, Life & benefits and Controls lenses',
        body: 'Switch lens from the chips above the conversation. Each lens keeps its own conversation and only brings its own jobs into focus, so the Controls lens no longer shows an unrelated commercial approval. The old workspace addresses open the matching lens.',
        links: [
          { to: '/broker/workspace', label: 'Russ' },
          { to: '/broker/workspace?lens=commercial', label: 'Russ · Commercial' },
        ],
      },
      {
        kind: 'improved',
        area: 'broker',
        title: 'Tabbed Controls, Brokerage settings and Life policies',
        body: 'Imports, reconciliations and financial exceptions are tabs under Controls. Team, insurer access and client-book import are tabs under Brokerage settings. Life servicing is a tab under Life policies. The invitation form and invitation list on the Team tab are one section.',
        links: [
          { to: '/broker/controls/imports', label: 'Controls' },
          { to: '/broker/settings/team', label: 'Brokerage settings' },
          { to: '/broker/life/policies', label: 'Life policies' },
        ],
      },
    ],
  },
  {
    id: 'broker-onboarding',
    date: '2026-11-10T14:00:00+02:00',
    version: 'v1.1',
    title: 'External broker onboarding, multi-brokerage workspaces and client-book import',
    summary:
      'Independent brokerages can now join B-Covered by invitation or application, set up with Russ, be reviewed and activated by B-Covered staff, invite their team, import their client book and enable insurers one by one. Each brokerage has its own isolated workspace. Everything runs on local, in-browser tables; the matching Supabase migrations are written but not applied.',
    posts: [
      {
        kind: 'new',
        area: 'platform',
        title: 'Brokerage workspaces with server-side isolation',
        body: 'Every brokerage’s records, documents, search results and Russ context are scoped to that brokerage in the service layer. People in more than one brokerage switch workspace explicitly.',
        points: [
          'Roles: owner, administrator, broker/representative, operations administrator, compliance reviewer and read-only',
          'Read-only and compliance roles cannot write; suspended or onboarding brokerages cannot reach operational records',
          'Two fictional brokerages (Acacia Cover Brokers and Coastline Risk Partners) demonstrate isolation',
        ],
        links: [
          { to: '/brokers/join', label: 'Join as a broker' },
          { to: '/broker/settings/team', label: 'Team' },
        ],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Guided setup with Russ, and a separate review and activation',
        body: 'Nine sections save as you go and resume where you left off. Russ explains requirements, reads labelled details from documents and suggests values you confirm. B-Covered reviewers decide each item, ask for corrections, approve, and activate in a separate step.',
        points: [
          'Requirements depend on brokerage type and product modules, not one fixed checklist',
          'Internal reviewer notes are stored apart from feedback the brokerage sees',
          'Platform approval is not regulatory authorisation',
        ],
        links: [
          { to: '/onboarding', label: 'Brokerage onboarding' },
          { to: '/platform/onboarding', label: 'Onboarding queue' },
        ],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Client-book import and insurer access',
        body: 'CSV or XLSX imports with templates, column mapping, validation, duplicates found only inside the brokerage, a transfer confirmation, row-level retry and an error report. Insurer access is configured, tested and enabled per insurer; quoting only uses enabled insurers.',
        points: ['Original references and the import batch are kept on every record', 'Credentials are stored server-side and shown only as a masked hint', 'Insurers without an integration are labelled unsupported'],
        links: [
          { to: '/broker/imports/client-book', label: 'Client-book import' },
          { to: '/broker/settings/insurers', label: 'Insurer access' },
        ],
      },
    ],
  },
  {
    id: 'life-benefits-controls',
    date: '2026-11-08T17:30:00+02:00',
    version: 'v1.0',
    title: 'Russ, Life & Benefits, financial controls, funds, investments and specialist reporting',
    summary:
      'B-Covered’s assistant is now Russ (Russell). This release adds individual life advice, group risk and retirement fund oversight, a shared financial controls engine, investment oversight, Section 14 transfers, cell captive reporting, trustee packs, forensic investigations and an executive dashboard. Everything runs on synthetic data in this browser; nothing is applied to a database and no insurer, administrator or bank is connected.',
    posts: [
      {
        kind: 'new',
        area: 'agents',
        title: 'Russ coordinates every specialist agent',
        body: 'Russ is the single staff assistant. The commercial and systems copilots, and the new Life Sales, Underwriting, Servicing, Group Membership, Contribution, Investment, Transfer, Cell Reporting, Compliance and Growth agents, work under Russ through typed tools and approvals.',
        points: ['Russ prepares; a licensed person approves', 'Russ never gives advice, authorises payments or sends anything to a provider', 'Ava stays the customer-facing assistant'],
        links: [
          { to: '/broker/workspace', label: 'Russ' },
          { to: '/broker/life', label: 'Russ · Life & Benefits' },
          { to: '/broker/controls', label: 'Russ · Controls' },
        ],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Individual life: needs analysis to issued policy',
        body: 'One person record across every role. An authorised adviser runs a needs analysis, simulated quotes, a draft Record of Advice with Russ’s suggested wording, sign-off, application approval and underwriting follow-up. The insurer’s decision is recorded by a person and labelled as insurer-reported.',
        points: ['FAIS categories gate advice, sign-off and application approval', 'Editing advice re-raises the sign-off for the new wording', 'Servicing finds missing beneficiaries, anniversaries, outstanding underwriting, shortfalls and missing advice records'],
        links: [
          { to: '/broker/people', label: 'People' },
          { to: '/broker/life/policies', label: 'Policies' },
          { to: '/broker/life/servicing', label: 'Servicing' },
        ],
      },
      {
        kind: 'new',
        area: 'platform',
        title: 'Shared financial controls engine',
        body: 'Imports keep each file as received, validate it, match members by ID, member or employee number, and reconcile to the cent. Exceptions are classified, deduplicated and tracked; correction schedules and write-offs wait for approval; evidence is append-only.',
        points: ['The same file is never imported twice; corrections supersede', 'Payroll vs administrator contributions, holdings, roll-forward and transfer reconciliations', 'Member changes are committed with effective dates only after approval'],
        links: [
          { to: '/broker/controls/imports', label: 'Imports' },
          { to: '/broker/controls/reconciliations', label: 'Reconciliations' },
          { to: '/broker/controls/exceptions', label: 'Financial exceptions' },
        ],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Group risk, retirement funds, investments and transfers',
        body: 'Employer 360 with schemes and participations, cover recalculated from dated scheme rules, administrator-reported two-pot balances, benefit events with broker and provider status kept apart, investment reconciliation and calculated performance, and a Section 14 transfer workspace.',
        links: [
          { to: '/broker/benefits/employers', label: 'Employers & schemes' },
          { to: '/broker/funds', label: 'Retirement funds' },
          { to: '/broker/investments', label: 'Investments' },
          { to: '/broker/transfers', label: 'Transfers' },
        ],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Cell captives, governance, investigations and the executive view',
        body: 'Cell results from the agreement’s own terms, trustee packs labelled reported or calculated, forensic investigations that separate record-supported findings from hypotheses, and an executive dashboard that never adds premiums, contributions, assets and revenue together.',
        links: [
          { to: '/broker/cells', label: 'Cell captives' },
          { to: '/broker/governance', label: 'Governance' },
          { to: '/broker/investigations', label: 'Investigations' },
          { to: '/broker/compliance', label: 'Compliance register' },
        ],
      },
      {
        kind: 'new',
        area: 'portals',
        title: 'Life, employer and cell owner portals',
        body: 'Customers see their life cover and beneficiaries; an employer’s HR contact sees only their own employees; a cell owner sees only their own cell. Access grants enforce the separation.',
        links: [{ to: '/demo', label: 'Demo Studio' }],
      },
    ],
  },
  {
    id: 'systems-section',
    date: '2026-11-07T20:40:00+02:00',
    version: 'v0.9',
    title: 'Systems: database plan, ERD and the platform catalogue',
    summary:
      'A new Systems section for managers and admins covers the database, frontend, backend and APIs, integrations, agents and copilots, workflows and jobs, and the audit trail. The normalised target schema is shown as an ERD and mapped to every screen; nothing is applied to a database yet.',
    posts: [
      {
        kind: 'new',
        area: 'platform',
        title: 'Database and ERD',
        body: 'The target schema for the dedicated insureflow-dev Supabase project: tables in nine areas, each with columns, relationships, the screens that use it and what changed from the current migrations. The ERD is drawn per area and you can click a table to open it.',
        points: [
          'Screens → tables shows every route and the tables it needs',
          'Three screens are flagged because they store nothing in the service layer yet: claims, quick quote and contact',
          'Plan & instance lists the steps to create the separate database instance and the decisions behind the design',
        ],
        links: [{ to: '/broker/systems/database', label: 'Database & ERD' }],
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Systems Copilot',
        body: 'Ask which tables a screen needs, what an agent does, which tools it has used, whether jobs are failing or how to create the database instance. Each answer opens the matching item on the right. It answers from the catalogue only and cannot change anything.',
        links: [{ to: '/broker/systems', label: 'Systems overview' }],
      },
      {
        kind: 'new',
        area: 'platform',
        title: 'Platform catalogue',
        body: 'Components and their status, every endpoint the UI calls and where it moves to on Supabase, assistant adapters and secret names (never values), agents and tools with usage in this browser, and workflows with job counts.',
        links: [{ to: '/broker/systems/agents', label: 'Agents & copilots' }],
      },
    ],
  },
  {
    id: 'risk-twin-assessments',
    date: '2026-11-07T19:30:00+02:00',
    version: 'v0.8',
    title: 'Business Risk Twin V2: assessments, impact tracing and coverage evidence',
    summary:
      'Each Risk Twin now has an assessment-led workspace: evidence-backed findings with broker sign-off, impact tracing through recorded dependencies, policy evidence from documents, investigations and change detection.',
    posts: [
      {
        kind: 'new',
        area: 'broker',
        title: 'Assessment-led Twin workspace',
        body: 'The Copilot sits on the left; the assessment, relationship graph, actions, insurance evidence and change history sit on the right. The header shows exposures, information requests, verified facts and the five workflow stages.',
        points: [
          'Seven assessment types, from initial to incident-triggered',
          'Findings ranked by explained factors; the five most important areas are marked',
          'Accept, reject or override a priority with a recorded reason; a pending sign-off is re-pinned automatically',
          'Assessment completeness shows exactly what is missing, and the agents can request it',
        ],
        links: [{ to: '/broker/commercial/risk-twins', label: 'Risk Twins' }],
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Impact tracing and node actions',
        body: '“What happens if the blast freezers fail?” follows recorded operational links only and lists affected operations, stock, revenue, exposures and policy evidence, with known values and stated assumptions. It never produces a loss estimate.',
        points: ['Every graph record opens a panel with Assess risk, What if it fails, Trace dependencies, Check insurance, Request information, Create task and Review with Copilot', 'AI-inferred links are shown separately until a broker confirms or rejects them'],
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Coverage evidence and document intelligence',
        body: 'Sample policy schedules, asset registers and vehicle registers are extracted with page references (simulated in this demo). Updates are proposed as Current and Suggested; nothing is applied or overwritten without a broker. Agents can only propose “potentially covered” or flag wording; confirming cover or an exclusion needs a broker citing the clause.',
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Investigations and change detection',
        body: '“Investigate possible underinsurance” compares declared values with sums insured group by group and creates proposed actions for review. “Compare with the last assessment” lists changes such as additional vehicles and creates review tasks.',
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Business Risk Review report',
        body: 'Twelve sections for discussion with the client, separating verified facts, declarations, document extractions, assumptions, preliminary findings and broker-approved conclusions. Print or save it as a PDF.',
      },
    ],
  },
  {
    id: 'risk-twins-portfolio',
    date: '2026-11-07T18:30:00+02:00',
    version: 'v0.7',
    title: 'Business Risk Twins portfolio',
    summary: 'The Risk Twins page is now a working portfolio: every commercial client appears, with or without a Twin, and Twins can be built or created conversationally.',
    posts: [
      {
        kind: 'new',
        area: 'broker',
        title: 'Risk Twin portfolio with card, table and risk overview views',
        body: 'Search and filter by industry, broker, assessment status, unconfirmed coverage, open actions and renewal month. Values that are not recorded say so; nothing is estimated.',
        points: [
          'Clients without a Risk Twin are listed with a Build Twin button',
          'Discover existing business searches by name or registration number',
          'Load demo businesses adds three fixed synthetic businesses; loading again adds nothing',
        ],
        links: [{ to: '/broker/commercial/risk-twins', label: 'Risk Twins' }],
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Build a Twin without drafting a submission',
        body: 'A new four-step job retrieves the profile, builds the Twin, identifies potential exposures and requests missing information. Only one commercial job runs per client at a time.',
        links: [{ to: '/broker/jobs', label: 'Tasks & Jobs' }],
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Create a Risk Twin by talking to the Copilot',
        body: '“Create a Risk Twin for Ubuntu Foods” reuses the existing client and Twin. For a business with no profile, the Business Discovery Agent interviews you in the same chat. “Which Risk Twins need attention?” lists clients with the reason for each.',
        links: [{ to: '/broker/commercial', label: 'Commercial workspace' }],
      },
    ],
  },
  {
    id: 'help-faq-updates',
    date: '2026-11-07T16:00:00+02:00',
    version: 'v0.6',
    title: 'FAQ, system updates and a refreshed help centre',
    summary: 'Answers for customers, business owners and brokers in one place, plus this thread so you can see what changed and when.',
    posts: [
      {
        kind: 'new',
        area: 'help',
        title: 'Frequently asked questions',
        body: 'Searchable answers grouped by topic: personal and business cover, Ava and the agents, brokers and approvals, portals, privacy, claims and the demo itself.',
        links: [{ to: '/faq', label: 'Open the FAQ' }],
      },
      {
        kind: 'new',
        area: 'help',
        title: 'System updates thread',
        body: 'Every release as a thread you can filter by area: personal, business, broker workspace, portals, agents, platform and help.',
        links: [{ to: '/updates', label: 'System updates' }],
      },
      {
        kind: 'improved',
        area: 'help',
        title: 'Help centre refreshed',
        body: 'The guide now covers the Personal and Business navigation, approval confirmations, business portal routing and the new pages. Wide tables become cards on phones.',
        links: [{ to: '/help', label: 'Help centre' }],
      },
    ],
  },
  {
    id: 'personal-and-business',
    date: '2026-11-07T15:44:00+02:00',
    version: 'v0.5',
    title: 'Personal and Business become the two main categories',
    summary: 'Business insurance is broad and diverse, so it now stands alongside personal insurance everywhere on the site.',
    posts: [
      {
        kind: 'new',
        area: 'business',
        title: 'Personal and Business menus',
        body: 'Two menus replace the single Insurance menu. Business groups the 14 industries into three families and lists the six cover areas, with a direct start to a risk review.',
        links: [{ to: '/business', label: 'Business insurance' }],
      },
      {
        kind: 'new',
        area: 'personal',
        title: 'Choose Personal or Business on the home page',
        body: 'The “What would you like to insure?” picker now switches between personal products and business industries.',
        links: [{ to: '/', label: 'Home page' }],
      },
      {
        kind: 'improved',
        area: 'business',
        title: 'Business landing page shows the full breadth',
        body: 'All 14 industries with icons, who we cover (sole traders to multi-site groups) and the six cover areas, each linking straight to the detail.',
        links: [
          { to: '/business/industries', label: 'Industries' },
          { to: '/business/cover', label: 'Cover areas' },
        ],
      },
      {
        kind: 'fixed',
        area: 'platform',
        title: 'Header no longer wraps on laptops',
        body: 'Navigation labels stay on one line from 1024 pixels up, and links to a section scroll straight to it.',
      },
    ],
  },
  {
    id: 'mvp-review',
    date: '2026-11-07T15:14:00+02:00',
    version: 'v0.4',
    title: 'Smoother approvals and business portal',
    summary: 'A review of the whole MVP: every page and both guided scenarios checked end to end.',
    posts: [
      {
        kind: 'improved',
        area: 'broker',
        title: 'Confirmation after every approval decision',
        body: 'Approvals now say what happened and where to look next, for example that a proposal is in the customer’s portal.',
        links: [{ to: '/broker/approvals', label: 'Approvals' }],
      },
      {
        kind: 'improved',
        area: 'broker',
        title: 'One clear status on submission packs',
        body: 'The submission header shows a single status, plus “Not sent to any insurer”, instead of overlapping badges.',
        links: [{ to: '/broker/commercial/submissions', label: 'Submissions' }],
      },
      {
        kind: 'improved',
        area: 'portals',
        title: 'Business contacts land in the business portal',
        body: 'Switching to a business contact opens the business portal and greets the person by name. Customers without a business see a clear next step.',
        links: [{ to: '/portal/business', label: 'Business portal' }],
      },
      {
        kind: 'improved',
        area: 'broker',
        title: 'Faster broker overview',
        body: 'The overview loads about 380 kB less and counts every pending approval, personal and commercial.',
        links: [{ to: '/broker', label: 'Broker overview' }],
      },
      {
        kind: 'fixed',
        area: 'agents',
        title: 'Ava echoes amounts correctly',
        body: 'Vehicle values read “R 245 000” instead of a lower-case “r”.',
      },
    ],
  },
  {
    id: 'help-centre',
    date: '2026-11-07T15:10:00+02:00',
    version: 'v0.3.1',
    title: 'System capabilities and help guide',
    summary: 'A searchable guide to what the platform can do, who can do it and where to find it.',
    posts: [
      {
        kind: 'new',
        area: 'help',
        title: 'Help centre',
        body: 'Getting started, roles, capabilities, walkthroughs, Copilot commands, agents and tools, guardrails, statuses, roadmap and troubleshooting.',
        links: [{ to: '/help', label: 'Help centre' }],
      },
    ],
  },
  {
    id: 'slow-mobile',
    date: '2026-11-07T13:46:00+02:00',
    version: 'v0.3',
    title: 'Pages show immediately on slow mobile connections',
    summary: 'No more blank screen on first load.',
    posts: [
      {
        kind: 'fixed',
        area: 'platform',
        title: 'Instant first paint',
        body: 'A loading screen appears from the first byte, web fonts no longer block rendering, and the header and footer stay visible while a page loads.',
      },
      {
        kind: 'improved',
        area: 'platform',
        title: 'Safe updates while a tab is open',
        body: 'If a newer version is published while you browse, the page reloads itself once instead of showing a broken screen.',
      },
    ],
  },
  {
    id: 'navigation-fixes',
    date: '2026-11-06T16:06:00+02:00',
    version: 'v0.2.1',
    title: 'Dead links fixed on the published site',
    summary: 'Deep links and refreshes work everywhere on the hosted demo.',
    posts: [
      {
        kind: 'fixed',
        area: 'platform',
        title: 'Every page opens from a direct link',
        body: 'Refreshing or sharing any page no longer returns “not found”. Stale demo identities are cleared instead of breaking requests.',
      },
      {
        kind: 'new',
        area: 'help',
        title: 'Demo disclosures',
        body: 'Privacy (POPIA), complaints, conflict of interest and FAIS placeholders behind the footer links.',
        links: [{ to: '/legal', label: 'Demo disclosures' }],
      },
    ],
  },
  {
    id: 'commercial-module',
    date: '2026-11-06T15:40:00+02:00',
    version: 'v0.2',
    title: 'Commercial insurance module: the Business Risk Twin',
    summary: 'Business conversation to structured profile, Risk Twin, potential exposures and a draft underwriting submission for broker review.',
    posts: [
      {
        kind: 'new',
        area: 'business',
        title: 'Business risk review',
        body: 'The Business Discovery Agent interviews the owner and builds the company profile: entities, locations, assets, stock, backup power, security, current cover and claims.',
        links: [{ to: '/business/risk-review', label: 'Start a review' }],
      },
      {
        kind: 'new',
        area: 'agents',
        title: 'Risk Twin and potential exposures',
        body: 'The Industry Risk Analyst links premises, equipment, stock and revenue into one picture and flags potential exposures with an explained advisory priority.',
        links: [{ to: '/broker/commercial/risk-twins', label: 'Risk Twins' }],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Commercial workspace and submission editor',
        body: 'The Commercial Copilot reviews a named business. The editor shows Current and Suggested side by side with “Apply to draft”, validation and pack preview.',
        links: [{ to: '/broker/commercial', label: 'Commercial workspace' }],
      },
      {
        kind: 'new',
        area: 'portals',
        title: 'Business portal',
        body: 'Business customers see their review status, risk profile with provenance labels and outstanding document requests.',
      },
    ],
  },
  {
    id: 'launch',
    date: '2026-11-06T15:30:00+02:00',
    version: 'v0.1',
    title: 'InsureFlow AI launches with BCovered',
    summary: 'The first vertical slice: visitor enquiry, Ava qualification, a persisted lead, simulated comparison, broker approval and a customer proposal.',
    posts: [
      {
        kind: 'new',
        area: 'agents',
        title: 'Ava: Find My Cover',
        body: 'A guided motor intake with live progress, agent activity and POPIA consent before any contact details.',
        links: [{ to: '/assist', label: 'Open Ava' }],
      },
      {
        kind: 'new',
        area: 'broker',
        title: 'Broker AI Workspace, Approvals and Tasks & Jobs',
        body: 'The Broker Copilot coordinates agents; approvals are pinned to the proposal hash; every workflow is a durable job you can pause, resume, cancel or retry.',
        links: [{ to: '/broker/workspace', label: 'AI Workspace' }],
      },
      {
        kind: 'new',
        area: 'portals',
        title: 'Customer portal',
        body: 'Released, clearly simulated three-option comparisons with excesses and key differences explained.',
      },
      {
        kind: 'new',
        area: 'help',
        title: 'Demo Studio',
        body: 'Start guided scenarios by hand and reset the demo data whenever you like.',
        links: [{ to: '/demo', label: 'Demo Studio' }],
      },
      {
        kind: 'new',
        area: 'platform',
        title: 'Mobile-optimised from day one',
        body: 'Public site, portals and broker workspace adapt to phones, with a Copilot and editor switch on small screens.',
      },
    ],
  },
]

export const LATEST_UPDATE = UPDATE_THREADS.filter((t) => !t.pinned)[0]
