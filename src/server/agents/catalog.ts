export const AGENTS = {
  orchestrator: { label: 'Orchestrator', role: 'Plans the work, assigns agents and tracks approvals' },
  lead_qualification: { label: 'Lead Agent', role: 'Creates the customer profile and CRM lead' },
  risk_assessment: { label: 'Risk Agent', role: 'Prepares broker review notes and referral triggers' },
  quote_comparison: { label: 'Quote Agent', role: 'Fetches and normalises simulated insurer options' },
  broker_copilot: { label: 'Broker Copilot', role: 'Writes the comparison summary for the broker' },
  approval_engine: { label: 'Approval Engine', role: 'Holds consequential actions until a person approves' },
  ava: { label: 'Ava', role: 'Customer-facing assistant' },
  business_discovery: { label: 'Business Discovery Agent', role: 'Builds the business profile from the conversation' },
  industry_risk_analyst: { label: 'Industry Risk Analyst', role: 'Builds the Risk Twin and identifies potential exposures' },
  commercial_underwriting: { label: 'Commercial Underwriting Agent', role: 'Prepares the draft insurer-ready submission pack' },
  coverage_analyst: { label: 'Coverage Analyst', role: 'Matches exposures to policy evidence; proposes, never confirms, cover' },
  risk_investigator: { label: 'Risk Investigation Agent', role: 'Investigates exposures and underinsurance against recorded values and policy evidence' },
  systems_copilot: { label: 'Systems Copilot', role: 'Explains the platform: database plan, screens, agents, jobs and integrations' },
} as const

export type AgentName = keyof typeof AGENTS

export const agentLabel = (name: string) => (AGENTS as Record<string, { label: string }>)[name]?.label ?? name
