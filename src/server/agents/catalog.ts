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
} as const

export type AgentName = keyof typeof AGENTS

export const agentLabel = (name: string) => (AGENTS as Record<string, { label: string }>)[name]?.label ?? name
