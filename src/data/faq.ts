import { FAQ as TROUBLESHOOTING } from './helpGuide'

export interface FaqItem {
  q: string
  a: string
  link?: { to: string; label: string }
}

export interface FaqCategory {
  id: string
  title: string
  items: FaqItem[]
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'general',
    title: 'About BCovered and brokers',
    items: [
      {
        q: 'What is BCovered?',
        a: 'BCovered is a fictional independent short-term insurance brokerage running on the InsureFlow AI demo platform. It shows how AI agents and licensed brokers could work together for people and businesses.',
        link: { to: '/about', label: 'About us' },
      },
      {
        q: 'Does using a broker cost more?',
        a: 'No. Brokers are paid a regulated commission by the insurer, which is already built into the premium. You pay the same, often less, with advice included.',
      },
      {
        q: 'What is short-term insurance?',
        a: 'Short-term (non-life) insurance covers possessions and liabilities: cars, homes, contents, businesses and valuables, usually monthly or annually.',
      },
      {
        q: 'Is any of this real cover?',
        a: 'No. All people, insurers, premiums and quotes are synthetic. Nothing on this site binds cover or is sent to an insurer.',
        link: { to: '/legal', label: 'Demo disclosures' },
      },
    ],
  },
  {
    id: 'personal',
    title: 'Personal insurance',
    items: [
      {
        q: 'Which personal cover can I compare?',
        a: 'Car, buildings, home contents, motorcycle and portable valuables. Each product page explains what is covered, optional extras and typical exclusions.',
        link: { to: '/#personal', label: 'Personal cover' },
      },
      {
        q: 'Should I use Ava or the quote form?',
        a: 'Ava handles car insurance as a conversation and asks only for what is missing; a broker then reviews three simulated options. The quote form gives indicative prices for the other products.',
        link: { to: '/assist', label: 'Find my cover with Ava' },
      },
      {
        q: 'When will I see my comparison?',
        a: 'Only after a licensed broker reviews and approves it. It then appears in your portal with an in-app notice.',
        link: { to: '/portal', label: 'My portal' },
      },
    ],
  },
  {
    id: 'business',
    title: 'Business insurance',
    items: [
      {
        q: 'Which businesses can you help?',
        a: 'Fourteen industries, from restaurants, retail and tourism to manufacturing, construction, transport, technology, healthcare, education, security and property owners. Sole traders, SMEs and multi-site groups are all welcome.',
        link: { to: '/business/industries', label: 'Industries we cover' },
      },
      {
        q: 'How is business insurance different from personal cover?',
        a: 'A business is usually a portfolio of sections with their own sums insured, limits and conditions: property, business interruption, liability, fleet and transit, specialist cover and Sasria. A broker coordinates them across insurers.',
        link: { to: '/business/cover', label: 'Cover areas' },
      },
      {
        q: 'What happens in a business risk review?',
        a: 'You describe how the business operates. The Business Discovery Agent builds a profile, the Industry Risk Analyst maps a Risk Twin and potential exposures, and a draft submission pack goes to a broker for review.',
        link: { to: '/business/risk-review', label: 'Start a business risk review' },
      },
      {
        q: 'Does a listed exposure mean I am covered?',
        a: 'No. Exposures are potential areas for a broker to investigate. Nothing is confirmed as covered or excluded until the policy wording has been analysed.',
      },
      {
        q: 'What documents might a broker ask for?',
        a: 'Typically the current policy schedule and wording, a claims history, an asset register with replacement values, financial statements and industry-specific certificates. They appear as requests in your business portal.',
        link: { to: '/portal/business', label: 'Business portal' },
      },
    ],
  },
  {
    id: 'ai',
    title: 'Ava and the AI agents',
    items: [
      {
        q: 'Is Ava a financial adviser?',
        a: 'No. Ava and the other assistants are AI tools, not licensed advisers. A licensed broker reviews and approves every recommendation, proposal or submission.',
      },
      {
        q: 'What do the AI agents actually do?',
        a: 'They handle the administration: creating profiles, checking risk details, fetching simulated options, building Risk Twins and drafting submission packs. Every step is recorded and visible to the broker.',
        link: { to: '/help#agents', label: 'Agents and tools' },
      },
      {
        q: 'Can an agent approve or send something on its own?',
        a: 'No. The approval tool rejects any call from an agent, and approvals are pinned to the exact content that was reviewed.',
        link: { to: '/help#guardrails', label: 'Guardrails' },
      },
      {
        q: 'Why does an assistant say something is “available in a later phase”?',
        a: 'Claims review, renewals, cross-sell and portfolio intelligence are planned modules. The assistants answer honestly rather than guess.',
        link: { to: '/help#roadmap', label: 'Coming later' },
      },
    ],
  },
  {
    id: 'brokers',
    title: 'For brokers',
    items: [
      {
        q: 'How do I approve a proposal or a submission pack?',
        a: 'Open Approvals in the broker workspace. Approve and release a motor proposal, or approve a commercial pack to mark it ready for market. A confirmation tells you what happened next.',
        link: { to: '/broker/approvals', label: 'Approvals' },
      },
      {
        q: 'What can I ask the Copilot?',
        a: 'For example “Show pending approvals”, “Create a quote comparison for Ayanda Khumalo” or “Review Ubuntu Foods and identify outstanding insurance questions”.',
        link: { to: '/help#copilot', label: 'Copilot commands' },
      },
      {
        q: 'Why do I need to request approval again?',
        a: 'The pack changed after approval was requested, so the earlier request no longer matches. Review the changes and request approval again.',
      },
      {
        q: 'Can I focus on the editor without the Copilot?',
        a: 'Yes. “Expand editor” hides the Copilot on larger screens. On a phone, switch between Copilot and Editor at the top of the screen.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy and security',
    items: [
      {
        q: 'How is my personal information used?',
        a: 'Only to arrange the comparison or review you asked for, with POPIA consent recorded before any contact details are taken. Marketing consent is separate and optional.',
        link: { to: '/legal#privacy', label: 'Privacy notice' },
      },
      {
        q: 'Where is my data stored in this demo?',
        a: 'In this browser’s local storage only. It is not shared between devices, and “Reset demo data” in Demo Studio clears it.',
      },
      {
        q: 'Are there passwords?',
        a: 'No. Every identity is synthetic and selected with “Demo as …”. No real credentials exist.',
      },
    ],
  },
  {
    id: 'claims',
    title: 'Claims',
    items: [
      {
        q: 'Can I log a claim?',
        a: 'Yes, the claims form records a claim and lets you track it in this browser. No claims handler receives it in this demo.',
        link: { to: '/claims', label: 'Log a claim' },
      },
      {
        q: 'Will a broker help when I claim?',
        a: 'That is the BCovered promise: a claims team that handles the process and negotiates with the insurer on your behalf. AI-assisted claims are a later phase.',
      },
    ],
  },
  {
    id: 'demo',
    title: 'Using the demo',
    items: [
      {
        q: 'Where do I start?',
        a: 'Open Demo Studio and start a guided scenario: a new motor lead or a restaurant group risk review. Each plays a scripted conversation.',
        link: { to: '/demo', label: 'Demo Studio' },
      },
      {
        q: 'What has changed recently?',
        a: 'System updates lists every release as a thread, with a pinned overview of everything the platform does today.',
        link: { to: '/updates', label: 'System updates' },
      },
      ...TROUBLESHOOTING,
    ],
  },
]

export const FAQ_COUNT = FAQ_CATEGORIES.reduce((n, c) => n + c.items.length, 0)
