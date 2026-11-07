// Row types mirror supabase/migrations/20261106_0001_insureflow_core.sql one to one.
import type { CommercialTables } from './commercialSchema'

export type UUID = string
export type ISODate = string
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type Role = 'visitor' | 'customer' | 'broker' | 'claims_admin' | 'manager' | 'admin'

export interface Organisation {
  id: UUID
  name: string
  slug: string
  fsp_number: string | null
  fsp_verified: boolean
  is_demo: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface AppUser {
  id: UUID
  tenant_id: UUID
  email: string
  full_name: string
  role: Role
  customer_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Customer {
  id: UUID
  tenant_id: UUID
  customer_type: 'personal' | 'commercial'
  full_name: string
  email: string | null
  phone: string | null
  region: string | null
  status: 'prospect' | 'active' | 'lapsed' | 'archived'
  is_synthetic: boolean
  created_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export type ConsentPurpose = 'processing' | 'marketing' | 'email' | 'whatsapp'

export interface CustomerConsent {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  purpose: ConsentPurpose
  granted: boolean
  source: string
  notice_version: string
  captured_at: ISODate
  revoked_at: ISODate | null
}

export type Channel = 'public' | 'portal' | 'broker'

export interface Conversation {
  id: UUID
  tenant_id: UUID
  customer_id: UUID | null
  channel: Channel
  assistant: string
  context: Record<string, Json>
  created_at: ISODate
  updated_at: ISODate
}

export interface ConversationMessage {
  id: UUID
  tenant_id: UUID
  conversation_id: UUID
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  structured: Json | null
  created_at: ISODate
}

export type LeadStatus =
  | 'new'
  | 'qualifying'
  | 'qualified'
  | 'quoting'
  | 'proposal_pending'
  | 'proposal_released'
  | 'won'
  | 'lost'

export interface MotorDetails {
  make?: string
  model?: string
  year?: number
  value?: number
  condition?: 'new' | 'used'
  usage?: 'private' | 'business'
  parking?: 'garage' | 'carport' | 'secure_complex' | 'driveway' | 'street'
  tracker?: boolean
  driver_age?: number
  licence_years?: number
  claims_last_3_years?: number
  cover_type?: 'comprehensive' | 'third_party_fire_theft' | 'third_party'
}

export interface ContactDetails {
  full_name?: string
  email?: string
  phone?: string
}

export interface RiskAssessment {
  notes: string[]
  referral_triggers: string[]
  coverage_gaps: string[]
  clarification_questions: string[]
  assessed_at: ISODate
}

export interface LeadQualification {
  vehicle?: MotorDetails
  summary?: string
  risk?: RiskAssessment
}

export interface Lead {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  conversation_id: UUID | null
  line: 'personal' | 'commercial'
  product_category: string
  status: LeadStatus
  urgency: 'low' | 'medium' | 'high' | null
  qualification: LeadQualification
  missing_info: string[]
  source: string
  created_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Insurer {
  id: UUID
  name: string
  is_fictional: true
  created_at: ISODate
}

export type QuoteStatus = 'draft' | 'comparing' | 'awaiting_approval' | 'approved' | 'released' | 'rejected' | 'expired'

export interface ComparisonSummary {
  cheapest_option_id: UUID
  lowest_excess_option_id: UUID
  highest_premium_option_id: UUID
  premium_spread_monthly: number
  trade_offs: string[]
}

export interface ProposalPayload {
  quote_id: UUID
  options: Array<{
    id: UUID
    option_label: string
    insurer_id: UUID
    monthly_premium: number
    annual_premium: number
    excess: number
    sum_insured: number
  }>
  comparison: ComparisonSummary
  broker_summary: string
  prepared_by_agent: string
}

export interface Quote {
  id: UUID
  tenant_id: UUID
  lead_id: UUID | null
  customer_id: UUID
  product_category: string
  risk_summary: { vehicle?: MotorDetails; risk?: RiskAssessment }
  status: QuoteStatus
  proposal: ProposalPayload | null
  released_at: ISODate | null
  is_simulated: true
  created_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export type CoverageKey = 'vehicle_cover' | 'theft_hijacking' | 'windscreen' | 'roadside' | 'courtesy_vehicle'

export interface CoverageItem {
  key: CoverageKey
  label: string
  included: boolean
  detail: string
}

export interface QuoteOption {
  id: UUID
  tenant_id: UUID
  quote_id: UUID
  insurer_id: UUID
  option_label: string
  monthly_premium: number
  annual_premium: number
  sum_insured: number
  excess: number
  inclusions: CoverageItem[]
  exclusions: string[]
  conditions: string[]
  assumptions: string[]
  expires_at: ISODate
  source: string
  is_simulated: true
  created_at: ISODate
}

export type JobStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'awaiting_information'
  | 'awaiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface JobError {
  code: string
  message: string
  step?: string
}

export interface Job {
  id: UUID
  tenant_id: UUID
  workflow_type: string
  agent: string
  status: JobStatus
  initiated_by: UUID | null
  inputs: Record<string, Json>
  outputs: Record<string, Json> | null
  error: JobError | null
  customer_id: UUID | null
  lead_id: UUID | null
  quote_id: UUID | null
  idempotency_key: string | null
  attempt: number
  revision: number
  cancel_requested: boolean
  locked_by: string | null
  locked_at: ISODate | null
  started_at: ISODate | null
  completed_at: ISODate | null
  archived_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'

export interface JobStep {
  id: UUID
  tenant_id: UUID
  job_id: UUID
  seq: number
  key: string
  agent: string
  name: string
  status: StepStatus
  input: Json | null
  output: Json | null
  error: JobError | null
  started_at: ISODate | null
  completed_at: ISODate | null
}

export interface AgentRun {
  id: UUID
  tenant_id: UUID
  job_id: UUID | null
  job_step_id: UUID | null
  agent: string
  adapter: 'deterministic' | 'llm'
  model: string | null
  prompt_version: string | null
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  tokens_in: number | null
  tokens_out: number | null
  started_at: ISODate
  completed_at: ISODate | null
}

export interface AgentToolCall {
  id: UUID
  tenant_id: UUID
  agent_run_id: UUID
  tool: string
  args: Json
  result: Json | null
  status: 'ok' | 'error' | 'blocked'
  idempotency_key: string | null
  duration_ms: number | null
  created_at: ISODate
}

export type ApprovalType =
  | 'quote_proposal_release'
  | 'policy_change'
  | 'claim_submission'
  | 'external_communication'
  | 'sensitive_record_update'
  | 'bulk_campaign'
  | 'renewal_recommendation'
  | 'underwriting_submission'
  | 'risk_assessment_signoff'
  | 'risk_investigation_review'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'cancelled'

export interface ApprovalRequest {
  id: UUID
  tenant_id: UUID
  job_id: UUID | null
  approval_type: ApprovalType
  subject_table: string
  subject_id: UUID
  requested_by_agent: string
  summary: string
  proposed_changes: Json
  payload_hash: string
  risk_flags: string[]
  evidence: Array<{ label: string; ref: string }>
  status: ApprovalStatus
  decided_by: UUID | null
  decided_at: ISODate | null
  decision_note: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Communication {
  id: UUID
  tenant_id: UUID
  customer_id: UUID
  channel: 'email' | 'whatsapp' | 'in_app'
  template: string
  subject: string | null
  body: string
  status: 'draft' | 'awaiting_approval' | 'approved' | 'sent' | 'cancelled'
  preview_only: boolean
  related_quote_id: UUID | null
  job_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface AuditEvent {
  id: UUID
  tenant_id: UUID
  actor_type: 'user' | 'agent' | 'system'
  actor_id: string
  action: string
  entity_table: string | null
  entity_id: UUID | null
  before: Json | null
  after: Json | null
  job_id: UUID | null
  created_at: ISODate
}

export interface Tables extends CommercialTables {
  organisations: Organisation[]
  app_users: AppUser[]
  customers: Customer[]
  customer_consents: CustomerConsent[]
  conversations: Conversation[]
  conversation_messages: ConversationMessage[]
  leads: Lead[]
  insurers: Insurer[]
  quotes: Quote[]
  quote_options: QuoteOption[]
  jobs: Job[]
  job_steps: JobStep[]
  agent_runs: AgentRun[]
  agent_tool_calls: AgentToolCall[]
  approval_requests: ApprovalRequest[]
  communications: Communication[]
  audit_events: AuditEvent[]
}

export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T][number]

export const GLOBAL_TABLES: TableName[] = ['organisations', 'insurers']
