// Row types mirror supabase/migrations/20261108_0008_specialist.sql.
import type { ISODate, UUID } from './schema'
import type { DateOnly, ValueBasis } from './lifeSchema'

export interface CellTerms {
  /** Share of a positive underwriting and investment result paid to the cell owner. */
  profit_share_pct: number
  /** Whether earlier deficits must be recovered before profit is shared. */
  deficit_carry_forward: boolean
  management_fee_pct: number
  reporting_basis: 'earned' | 'written'
}

export interface CellArrangement {
  id: UUID
  tenant_id: UUID
  cell_owner_customer_id: UUID
  insurer_id: UUID
  name: string
  agreement_reference: string
  terms: CellTerms
  status: 'active' | 'terminated'
  created_at: ISODate
  updated_at: ISODate
}

export interface CellFinancialPeriod {
  id: UUID
  tenant_id: UUID
  cell_id: UUID
  cell_owner_customer_id: UUID
  period_end: DateOnly
  gross_written_premium: number
  reinsurance_premium: number
  unearned_premium_movement: number
  claims_paid: number
  outstanding_claims_movement: number
  ibnr_movement: number
  acquisition_costs: number
  management_expenses: number
  investment_income: number
  capital_requirement: number
  reserves_held: number
  source_batch_id: UUID | null
  source_reference: string
  value_basis: ValueBasis
  created_at: ISODate
}

export interface GovernanceItem {
  id: UUID
  tenant_id: UUID
  fund_id: UUID
  kind: 'meeting' | 'resolution' | 'action_item' | 'risk' | 'decision'
  title: string
  detail: string | null
  status: 'open' | 'done' | 'noted'
  owner: string | null
  due_date: DateOnly | null
  /** Trustee or committee decision as recorded; B-Covered records decisions, it does not make them. */
  decided_by_trustees: string | null
  recorded_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface PackSection {
  key: string
  title: string
  lines: string[]
  basis: 'reported' | 'calculated' | 'mixed'
}

export interface TrusteePack {
  id: UUID
  tenant_id: UUID
  fund_id: UUID
  period_end: DateOnly
  sections: PackSection[]
  status: 'draft' | 'issued'
  prepared_by_agent: string | null
  issued_by: UUID | null
  issued_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface Investigation {
  id: UUID
  tenant_id: UUID
  title: string
  scope: string
  status: 'open' | 'closed'
  opened_by: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

export interface InvestigationFinding {
  id: UUID
  tenant_id: UUID
  investigation_id: UUID
  title: string
  detail: string
  /** Supported by records already captured as evidence, or a hypothesis that still needs investigation. */
  basis: 'record_supported' | 'hypothesis'
  evidence_ids: UUID[]
  recorded_by: UUID | null
  recorded_by_agent: string | null
  created_at: ISODate
}

export interface CommissionRecord {
  id: UUID
  tenant_id: UUID
  customer_id: UUID | null
  policy_id: UUID | null
  scheme_id: UUID | null
  fund_id: UUID | null
  provider_id: UUID
  period: DateOnly
  commission_type: 'initial' | 'ongoing' | 'fee'
  amount: number
  source_reference: string
  value_basis: ValueBasis
  created_at: ISODate
}

export interface SpecialistTables {
  cell_arrangements: CellArrangement[]
  cell_financial_periods: CellFinancialPeriod[]
  governance_items: GovernanceItem[]
  trustee_packs: TrusteePack[]
  investigations: Investigation[]
  investigation_findings: InvestigationFinding[]
  commission_records: CommissionRecord[]
}
