export interface DemoScenario {
  id: string
  number: number
  /** Letter for commercial scenarios (A to F). */
  code?: string
  title: string
  summary: string
  initial_conditions: string[]
  agents: string[]
  database_effects: string[]
  deliverable: string
  script: string[]
  available: boolean
}

export const NEW_MOTOR_LEAD: DemoScenario = {
  id: 'new-motor-lead',
  number: 1,
  title: 'New motor insurance lead',
  summary: 'A visitor describes a newly purchased Toyota Corolla. Agents qualify the lead and prepare a simulated comparison for broker approval.',
  initial_conditions: [
    'Synthetic BCovered brokerage with three fictional insurers',
    'Sarah Jacobs is not yet a customer',
    'No live insurer or LLM connection: deterministic demo adapter',
  ],
  agents: ['Ava', 'Orchestrator', 'Lead Agent', 'Risk Agent', 'Quote Agent', 'Broker Copilot', 'Approval Engine'],
  database_effects: [
    'customers, customer_consents and app_users rows for Sarah',
    'leads row linked to the Ava conversation',
    'quotes plus 3 simulated quote_options',
    'jobs, job_steps, agent_runs and agent_tool_calls for every step',
    'approval_requests row pinned to the proposal hash',
    'communications: in-app notification and a preview-only email draft',
  ],
  deliverable: 'A broker-approved, clearly simulated three-option proposal in Sarah’s customer portal.',
  script: [
    'I’ve just bought a Toyota Corolla. I’m paying too much for insurance. Can you help?',
    'It’s a 2022 model',
    'About R245,000',
    'Used, mainly for private use',
    'Locked garage at night, and it has a tracker',
    'I’m the regular driver, 34 years old, licensed for 12 years',
    'No claims in the last 3 years',
    'Comprehensive please',
    'I agree',
    'Sarah Jacobs',
    'sarah.jacobs@example.demo',
    '082 555 0142',
    'No thanks',
    'Yes, please send it to a broker',
  ],
  available: true,
}

export const PLANNED_SCENARIOS: Array<Pick<DemoScenario, 'number' | 'title' | 'summary'>> = [
  { number: 2, title: 'Policy document upload', summary: 'Document Intelligence extracts structured policy fields for confirmation.' },
  { number: 3, title: 'Motor accident claim', summary: 'Agents prepare the claim intake and a missing-information checklist.' },
  { number: 4, title: 'Renewal review', summary: 'Agents find upcoming renewals and prepare review tasks.' },
  { number: 5, title: 'Cross-sell opportunity', summary: 'Customers with motor cover but no household cover become an outreach segment.' },
  { number: 6, title: 'Portfolio intelligence', summary: 'Grounded charts on commission by product and delayed claims.' },
]

export const RESTAURANT_GROUP: DemoScenario = {
  id: 'restaurant-group',
  number: 1,
  code: 'A',
  title: 'Restaurant group risk review',
  summary:
    'A fictional operator of three Johannesburg restaurants describes the business. Agents build its profile and Risk Twin, identify potential exposures and draft a submission pack for broker review.',
  initial_conditions: [
    'Kasi Kitchen Group (Pty) Ltd is fictional and not yet a BCovered client',
    'Industry templates seeded for 14 industries; restaurants template fully detailed',
    'No insurer integration: nothing is sent to an insurer',
  ],
  agents: ['Business Discovery Agent', 'Orchestrator', 'Industry Risk Analyst', 'Commercial Underwriting Agent', 'Broker Copilot', 'Approval Engine'],
  database_effects: [
    'customers, consents, app_users and a commercial lead for Kasi Kitchen',
    'business_profiles with legal entity, 3 locations, activities and assets',
    'business_risk_profiles, risk_dependencies and risk_exposures (the Risk Twin)',
    'tasks: document and information requests plus broker review tasks',
    'commercial_submissions and submission_sections, approval pinned to the pack hash',
  ],
  deliverable: 'A broker-approved draft submission pack, clearly marked as not sent to any insurer, plus outstanding document requests in the customer portal.',
  script: [
    'We operate three restaurants around Johannesburg and want better insurance.',
    'Yes, all three are owned by Kasi Kitchen Group (Pty) Ltd and we have one policy for everything.',
    'Maboneng, Rosebank and Soweto',
    'We lease all three premises',
    'Turnover is about R18 million a year and we employ 64 people',
    'About R450,000 per branch to replace the kitchen and refrigeration equipment',
    'Around R60,000 of perishable stock per branch, mostly in cold rooms',
    'Only Rosebank has a generator. The other two have no backup power.',
    'Yes, suppression systems in all kitchens, serviced last year',
    'Alarm with armed response at all branches and CCTV',
    'Two delivery scooters at Maboneng',
    'About 90 seats each, and we take card payments and online orders',
    "We're with Protea Insure on one policy that renews in March",
    'One claim in 2024 when a cold room compressor failed, about R40,000',
    'I agree',
    'Nomsa Dlamini',
    'nomsa@kasikitchen.example.demo',
    '082 555 0190',
    'No thanks',
    'Yes, please send it to a broker',
  ],
  available: true,
}

export const PLANNED_COMMERCIAL_SCENARIOS: Array<Pick<DemoScenario, 'code' | 'title' | 'summary'>> = [
  { code: 'B', title: 'Manufacturing business', summary: 'Machinery schedule import, production dependencies and machinery breakdown and BI review.' },
  { code: 'C', title: 'Logistics company', summary: 'Fleet import, operating regions, cargo exposure and a simulated fleet comparison.' },
  { code: 'D', title: 'Commercial renewal', summary: 'Prior and current schedules compared, business changes and sums insured needing attention.' },
  { code: 'E', title: 'Contract insurance review', summary: 'Insurance obligations extracted from a customer contract and compared with documented cover.' },
  { code: 'F', title: 'Complex claim', summary: 'Warehouse fire: affected assets, evidence requests, BI exposure and a draft claims pack.' },
]

export const SCENARIOS = [NEW_MOTOR_LEAD, RESTAURANT_GROUP]
export const getScenario = (id: string | null) => SCENARIOS.find((s) => s.id === id)
