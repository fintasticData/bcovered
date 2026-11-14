// Row types mirror supabase/migrations/20261108_0006_group_risk_foundation.sql and 20261108_0007_administration.sql.
// Employers are commercial customers (customers.customer_type = 'commercial'), never organisations: organisations are brokerage tenants.
import type { ISODate, Json, UUID } from './schema'
import type { DateOnly, FactSource, ValueBasis } from './lifeSchema'

export interface SchemeRules {
  salary_definition: 'basic' | 'pensionable'
  /** Cover as a multiple of annual salary, per member category. */
  categories: Record<string, { multiple: number }>
  max_cover: number
  free_cover_limit: number
  eligibility_min_age: number
  eligibility_max_age: number
  waiting_period_months: number
  /** Monthly premium as a percentage of the covered salary roll. */
  premium_rate_pct: number
  continuation_option: boolean
}

export interface GroupScheme {
  id: UUID
  tenant_id: UUID
  employer_customer_id: UUID
  provider_id: UUID
  name: string
  benefit_type_key: string
  policy_number: string | null
  status: 'active' | 'terminated'
  effective_from: DateOnly
  renewal_date: DateOnly | null
  created_at: ISODate
  updated_at: ISODate
}

export interface SchemeRuleVersion {
  id: UUID
  tenant_id: UUID
  scheme_id: UUID
  employer_customer_id: UUID
  version: number
  effective_from: DateOnly
  effective_to: DateOnly | null
  rules: SchemeRules
  created_at: ISODate
}

export interface Employment {
  id: UUID
  tenant_id: UUID
  person_id: UUID
  employer_customer_id: UUID
  employee_number: string
  category: string
  status: 'active' | 'terminated'
  start_date: DateOnly
  end_date: DateOnly | null
  created_at: ISODate
  updated_at: ISODate
}

export interface SalaryRecord {
  id: UUID
  tenant_id: UUID
  employment_id: UUID
  employer_customer_id: UUID
  salary_type: 'basic' | 'pensionable'
  annual_amount: number
  effective_from: DateOnly
  effective_to: DateOnly | null
  source_batch_id: UUID | null
  source: FactSource
  value_basis: ValueBasis
  created_at: ISODate
}

export interface SchemeMembership {
  id: UUID
  tenant_id: UUID
  scheme_id: UUID
  employment_id: UUID
  employer_customer_id: UUID
  person_id: UUID
  status: 'active' | 'exited'
  joined_on: DateOnly
  exited_on: DateOnly | null
  cover_amount: number | null
  above_free_cover_limit: boolean
  underwriting_status: 'not_required' | 'required' | 'outstanding' | 'accepted'
  created_at: ISODate
  updated_at: ISODate
}

export type FundType = 'pension' | 'provident' | 'umbrella_pension' | 'umbrella_provident' | 'preservation' | 'retirement_annuity'

export interface RetirementFund {
  id: UUID
  tenant_id: UUID
  name: string
  fund_type: FundType
  registration_number: string | null
  administrator_id: UUID
  status: 'active' | 'closed'
  created_at: ISODate
  updated_at: ISODate
}

export interface FundParticipation {
  id: UUID
  tenant_id: UUID
  fund_id: UUID
  employer_customer_id: UUID
  participation_number: string | null
  effective_from: DateOnly
  effective_to: DateOnly | null
  status: 'active' | 'terminated'
  created_at: ISODate
}

export interface FundMembership {
  id: UUID
  tenant_id: UUID
  fund_id: UUID
  participation_id: UUID
  employment_id: UUID | null
  employer_customer_id: UUID
  person_id: UUID
  member_number: string
  category: string
  status: 'active' | 'exited' | 'preserved' | 'retired' | 'deceased'
  joined_on: DateOnly
  exited_on: DateOnly | null
  created_at: ISODate
  updated_at: ISODate
}

export interface ContributionRules {
  salary_definition: 'pensionable'
  categories: Record<string, { employer_pct: number; employee_pct: number }>
  contribution_holiday: { from: DateOnly; to: DateOnly } | null
}

export interface ContributionRuleVersion {
  id: UUID
  tenant_id: UUID
  participation_id: UUID
  employer_customer_id: UUID
  version: number
  effective_from: DateOnly
  effective_to: DateOnly | null
  rules: ContributionRules
  created_at: ISODate
}

export type MovementType = 'joiner' | 'leaver' | 'salary_change' | 'category_change'

export interface MemberMovement {
  id: UUID
  tenant_id: UUID
  employer_customer_id: UUID
  scheme_id: UUID | null
  fund_id: UUID | null
  employment_id: UUID | null
  person_id: UUID | null
  movement_type: MovementType
  effective_date: DateOnly
  processing_date: ISODate
  source_batch_id: UUID | null
  before: Json
  after: Json
  cover_before: number | null
  cover_after: number | null
  status: 'detected' | 'awaiting_approval' | 'approved' | 'applied' | 'rejected'
  approval_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export type BenefitEventType =
  | 'death'
  | 'disability'
  | 'funeral'
  | 'critical_illness'
  | 'retirement'
  | 'resignation'
  | 'retrenchment'
  | 'withdrawal'
  | 'preservation'
  | 'transfer'
  | 'savings_withdrawal'

export interface BenefitEvent {
  id: UUID
  tenant_id: UUID
  arrangement: 'group_scheme' | 'retirement_fund' | 'policy'
  scheme_id: UUID | null
  fund_id: UUID | null
  policy_id: UUID | null
  person_id: UUID
  employer_customer_id: UUID | null
  event_type: BenefitEventType
  event_date: DateOnly
  /** Where B-Covered's own work stands. */
  broker_status: 'notified' | 'documents_outstanding' | 'submitted' | 'with_provider' | 'closed'
  /** The insurer's or administrator's official decision, recorded from their communication. */
  provider_decision: 'pending' | 'admitted' | 'declined' | 'paid' | null
  provider_decision_date: DateOnly | null
  provider_reference: string | null
  amount_claimed: number | null
  amount_paid: number | null
  section_37c: boolean
  tax_directive_status: 'not_required' | 'requested' | 'issued' | null
  outstanding_requirements: string[]
  notes: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface AdministratorValuation {
  id: UUID
  tenant_id: UUID
  fund_membership_id: UUID
  fund_id: UUID
  employer_customer_id: UUID
  person_id: UUID
  valuation_date: DateOnly
  vested_component: number
  savings_component: number
  retirement_component: number
  total_value: number
  source_batch_id: UUID | null
  source_reference: string
  value_basis: 'reported'
  created_at: ISODate
}

export interface FundBalanceStatement {
  id: UUID
  tenant_id: UUID
  fund_id: UUID
  employer_customer_id: UUID | null
  period_start: DateOnly
  period_end: DateOnly
  opening_balance: number
  contributions: number
  transfers_in: number
  transfers_out: number
  withdrawals: number
  benefit_payments: number
  investment_returns: number
  fees: number
  closing_balance: number
  source_reference: string
  value_basis: 'reported'
  created_at: ISODate
}

export interface InvestmentPortfolio {
  id: UUID
  tenant_id: UUID
  fund_id: UUID
  manager_id: UUID
  name: string
  mandate: { benchmark: string; asset_ranges: Record<string, { min: number; max: number }> }
  status: 'active' | 'closed'
  created_at: ISODate
  updated_at: ISODate
}

export interface InvestmentHolding {
  id: UUID
  tenant_id: UUID
  portfolio_id: UUID
  source_kind: 'administrator' | 'investment_manager'
  instrument: string
  asset_class: string
  units: number
  unit_price: number | null
  market_value: number | null
  valuation_date: DateOnly
  source_batch_id: UUID | null
  source_reference: string
  value_basis: ValueBasis
  created_at: ISODate
}

export interface InvestmentValuation {
  id: UUID
  tenant_id: UUID
  portfolio_id: UUID
  valuation_date: DateOnly
  market_value: number
  /** Net external cash flow into the portfolio since the previous valuation (positive = inflow). */
  net_cash_flow: number
  source_reference: string
  value_basis: ValueBasis
  created_at: ISODate
}

export interface InvestmentBenchmark {
  id: UUID
  tenant_id: UUID
  portfolio_id: UUID
  period_end: DateOnly
  benchmark_return: number
  source_reference: string
  created_at: ISODate
}

export const TRANSFER_STAGES = [
  'initiate',
  'validate',
  'prepare_schedules',
  'reconcile',
  'obtain_approvals',
  'submit',
  'monitor',
  'confirm_allocations',
  'close',
] as const
export type TransferStage = (typeof TRANSFER_STAGES)[number]

export interface FundTransfer {
  id: UUID
  tenant_id: UUID
  transfer_type: 'section_14' | 'individual' | 'other'
  transferor_fund_id: UUID
  transferee_fund_id: UUID
  employer_customer_id: UUID | null
  stage: TransferStage
  effective_date: DateOnly
  milestones: Array<{ stage: TransferStage; completed_at: ISODate; by: string; note: string | null; evidence_ref: string | null }>
  status: 'open' | 'closed' | 'cancelled'
  created_at: ISODate
  updated_at: ISODate
}

export interface TransferMember {
  id: UUID
  tenant_id: UUID
  transfer_id: UUID
  person_id: UUID
  fund_membership_id: UUID | null
  transfer_value_reported: number | null
  value_received: number | null
  vested_component: number | null
  savings_component: number | null
  retirement_component: number | null
  status: 'pending' | 'reconciled' | 'difference' | 'missing'
  created_at: ISODate
  updated_at: ISODate
}

export interface BenefitsTables {
  group_schemes: GroupScheme[]
  scheme_rule_versions: SchemeRuleVersion[]
  employments: Employment[]
  salary_history: SalaryRecord[]
  scheme_memberships: SchemeMembership[]
  retirement_funds: RetirementFund[]
  fund_participations: FundParticipation[]
  fund_memberships: FundMembership[]
  contribution_rule_versions: ContributionRuleVersion[]
  member_movements: MemberMovement[]
  benefit_events: BenefitEvent[]
  administrator_valuations: AdministratorValuation[]
  fund_balance_statements: FundBalanceStatement[]
  investment_portfolios: InvestmentPortfolio[]
  investment_holdings: InvestmentHolding[]
  investment_valuations: InvestmentValuation[]
  investment_benchmarks: InvestmentBenchmark[]
  fund_transfers: FundTransfer[]
  transfer_members: TransferMember[]
}
