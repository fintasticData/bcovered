export const AGENTS = {
  ar: { label: 'AR', role: 'Ava and Russ together: splits a broker’s request, routes people work to Ava and business work to Russ, and runs MCP jobs on the B-Covered database' },
  russ: { label: 'Russ', role: 'B-Covered’s business copilot (Russell): business accounts, commercial cover, group schemes and controls, through typed tools, MCP jobs and approvals' },
  orchestrator: { label: 'Orchestrator', role: 'Plans the work, assigns agents and tracks approvals' },
  lead_qualification: { label: 'Lead Agent', role: 'Creates the customer profile and CRM lead' },
  risk_assessment: { label: 'Risk Agent', role: 'Prepares broker review notes and referral triggers' },
  quote_comparison: { label: 'Quote Agent', role: 'Fetches and normalises simulated insurer options' },
  broker_copilot: { label: 'Russ · personal lines', role: 'Russ’s personal-lines specialist: writes the comparison summary for the broker' },
  approval_engine: { label: 'Approval Engine', role: 'Holds consequential actions until a person approves' },
  ava: { label: 'Ava', role: 'People copilot for brokers (personal clients, motor, home, contents and individual life, via MCP jobs) and the customer-facing assistant at /assist' },
  business_discovery: { label: 'Business Discovery Agent', role: 'Builds the business profile from the conversation' },
  industry_risk_analyst: { label: 'Industry Risk Analyst', role: 'Builds the Risk Twin and identifies potential exposures' },
  commercial_underwriting: { label: 'Commercial Underwriting Agent', role: 'Prepares the draft insurer-ready submission pack' },
  coverage_analyst: { label: 'Coverage Analyst', role: 'Matches exposures to policy evidence; proposes, never confirms, cover' },
  risk_investigator: { label: 'Risk Investigation Agent', role: 'Investigates exposures and underinsurance against recorded values and policy evidence' },
  systems_copilot: { label: 'Russ · systems', role: 'Russ’s systems specialist: explains the database plan, screens, agents, jobs and integrations' },
  life_sales: { label: 'Life Sales Agent', role: 'Prepares needs analyses, simulated life quotes and draft Records of Advice for an authorised adviser' },
  life_underwriting: { label: 'Underwriting Agent', role: 'Tracks insurer underwriting requirements and prepares follow-ups; never makes an underwriting decision' },
  life_servicing: { label: 'Life Servicing Agent', role: 'Finds missing beneficiaries, anniversaries, outstanding requirements and cover shortfalls' },
  group_membership: { label: 'Group Membership Agent', role: 'Validates and matches payroll and member files, and detects member movements' },
  contribution_reconciler: { label: 'Contribution Agent', role: 'Calculates expected contributions and reconciles them with administrator schedules' },
  investment_analyst: { label: 'Investment Analyst', role: 'Reconciles holdings and calculates labelled performance figures from dated sources' },
  transfer_monitor: { label: 'Transfer Agent', role: 'Tracks Section 14 and other transfers, schedules and unreconciled values' },
  cell_reporting: { label: 'Cell Reporting Agent', role: 'Prepares cell captive results from imported insurer data and the cell agreement terms' },
  compliance_monitor: { label: 'Compliance Agent', role: 'Finds missing advice records, disclosures and review obligations' },
  growth_agent: { label: 'Growth Agent', role: 'Identifies cross-selling opportunities and clients due for a financial review' },
} as const

export type AgentName = keyof typeof AGENTS

export const agentLabel = (name: string) => (AGENTS as Record<string, { label: string }>)[name]?.label ?? name
