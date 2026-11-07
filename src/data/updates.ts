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
