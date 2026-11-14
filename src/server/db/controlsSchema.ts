// Row types mirror supabase/migrations/20261108_0005_financial_controls.sql.
import type { ISODate, Json, UUID } from './schema'
import type { DateOnly } from './lifeSchema'

export type Dataset =
  | 'payroll_schedule'
  | 'contribution_schedule'
  | 'investment_holdings'
  | 'transfer_schedule'
  | 'cell_financials'
  | 'client_book_clients'
  | 'client_book_policies'

export const DATASET_LABEL: Record<Dataset, string> = {
  payroll_schedule: 'Employer payroll schedule',
  contribution_schedule: 'Administrator contribution schedule',
  investment_holdings: 'Investment holdings',
  transfer_schedule: 'Transfer member schedule',
  cell_financials: 'Cell captive financials',
  client_book_clients: 'Client book: clients',
  client_book_policies: 'Client book: policies',
}

export const CLIENT_BOOK_DATASETS: Dataset[] = ['client_book_clients', 'client_book_policies']

export type SourceKind =
  | 'insurer'
  | 'fund_administrator'
  | 'employer_payroll'
  | 'investment_manager'
  | 'bank'
  | 'cell_captive_insurer'
  | 'brokerage'
  | 'manual'

export interface DataSource {
  id: UUID
  tenant_id: UUID
  name: string
  source_kind: SourceKind
  provider_id: UUID | null
  customer_id: UUID | null
  channel: 'api' | 'csv' | 'excel' | 'sftp' | 'manual'
  dataset: Dataset
  /** Target field to source column header. */
  mapping: Record<string, string>
  mapping_version: number
  is_active: boolean
  created_at: ISODate
  updated_at: ISODate
}

export type BatchStatus =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'matched'
  | 'awaiting_approval'
  | 'committed'
  | 'rejected'
  | 'superseded'
  | 'failed'

export interface ImportBatch {
  id: UUID
  tenant_id: UUID
  data_source_id: UUID
  reporting_period: DateOnly | null
  file_name: string | null
  file_sha256: string
  storage_path: string | null
  row_count: number
  valid_count: number | null
  error_count: number | null
  status: BatchStatus
  supersedes_batch_id: UUID | null
  approval_id: UUID | null
  job_id: UUID | null
  uploaded_by: UUID | null
  uploaded_by_agent: string | null
  is_demo_fixture: boolean
  committed_at: ISODate | null
  /** Client-book imports: the brokerage's confirmation that it may transfer this information. */
  transfer_attestation?: { statement: string; version: string } | null
  attested_by?: UUID | null
  attested_at?: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export type MatchStatus = 'pending' | 'matched' | 'probable' | 'new' | 'unmatched' | 'duplicate' | 'excluded'

export interface ImportRow {
  id: UUID
  tenant_id: UUID
  batch_id: UUID
  row_number: number
  raw: Record<string, string>
  normalised: Record<string, Json> | null
  validation_errors: string[]
  match_status: MatchStatus
  matched_person_id: UUID | null
  match_confidence: number | null
  match_basis: string | null
  /** Client-book imports: original identifier, per-row commit outcome and the record it created or linked. */
  source_ref?: string | null
  commit_status?: 'pending' | 'committed' | 'failed' | 'skipped'
  commit_error?: string | null
  committed_entity_id?: UUID | null
  created_at: ISODate
}

export interface ReconciliationDefinition {
  id: UUID
  tenant_id: UUID
  key: string
  name: string
  version: number
  left_dataset: string
  right_dataset: string
  match_keys: string[]
  compare_fields: string[]
  /** Allowed difference per compare field, in cents for amounts or units for unit balances. */
  tolerances: Record<string, number>
  is_active: boolean
  created_at: ISODate
  updated_at: ISODate
}

export interface ReconciliationRun {
  id: UUID
  tenant_id: UUID
  definition_id: UUID
  reporting_period: DateOnly
  customer_id: UUID | null
  scope_ref: { fund_id?: UUID; portfolio_id?: UUID; transfer_id?: UUID }
  left_batch_id: UUID | null
  right_batch_id: UUID | null
  status: 'running' | 'completed' | 'failed' | 'superseded'
  currency: string
  left_total: number | null
  right_total: number | null
  difference_total: number | null
  matched_count: number
  difference_count: number
  left_only_count: number
  right_only_count: number
  job_id: UUID | null
  run_by: UUID | null
  run_by_agent: string | null
  created_at: ISODate
  completed_at: ISODate | null
}

export type ItemOutcome = 'matched' | 'within_tolerance' | 'difference' | 'left_only' | 'right_only' | 'duplicate'

export interface ReconciliationItem {
  id: UUID
  tenant_id: UUID
  run_id: UUID
  match_key: string
  label: string
  person_id: UUID | null
  left_row_id: UUID | null
  right_row_id: UUID | null
  outcome: ItemOutcome
  field: string | null
  measure: 'amount' | 'units' | 'price' | 'count'
  left_value: number | null
  right_value: number | null
  difference: number | null
  currency: string | null
  created_at: ISODate
}

export type ExceptionCategory =
  | 'missing_contribution'
  | 'incorrect_amount'
  | 'late_submission'
  | 'unmatched_member'
  | 'unallocated_payment'
  | 'duplicate'
  | 'valuation_difference'
  | 'missing_transaction'
  | 'unit_allocation'
  | 'fee_difference'
  | 'missing_price'
  | 'transfer_difference'
  | 'data_quality'
  | 'other'

export type ExceptionStatus = 'open' | 'investigating' | 'awaiting_third_party' | 'resolved' | 'written_off' | 'false_positive'
export const OPEN_EXCEPTION: ExceptionStatus[] = ['open', 'investigating', 'awaiting_third_party']

export interface FinancialException {
  id: UUID
  tenant_id: UUID
  run_id: UUID | null
  reconciliation_item_id: UUID | null
  customer_id: UUID | null
  fund_id: UUID | null
  portfolio_id: UUID | null
  category: ExceptionCategory
  title: string
  amount: number | null
  currency: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: ExceptionStatus
  assigned_to: UUID | null
  due_date: ISODate | null
  proposed_by_agent: string | null
  dedupe_key: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface ExceptionResolution {
  id: UUID
  tenant_id: UUID
  exception_id: UUID
  resolution: 'corrected_at_source' | 'correction_schedule' | 'payment_received' | 'write_off' | 'explained' | 'false_positive'
  note: string
  amount_resolved: number | null
  approval_id: UUID | null
  resolved_by: UUID | null
  created_at: ISODate
}

/** Append-only: the store refuses updates and deletes on this table. */
export interface AuditEvidence {
  id: UUID
  tenant_id: UUID
  entity_table: string
  entity_id: UUID
  kind: 'source_file' | 'extract' | 'correspondence' | 'calculation' | 'finding' | 'report'
  storage_path: string | null
  sha256: string
  description: string | null
  content: Json | null
  captured_by: UUID | null
  captured_by_agent: string | null
  created_at: ISODate
}

export interface CorrectionLine {
  person_id: UUID | null
  member: string
  employee_number: string | null
  expected: number
  reported: number
  difference: number
  action: string
}

export interface CorrectionSchedule {
  id: UUID
  tenant_id: UUID
  run_id: UUID
  customer_id: UUID | null
  fund_id: UUID | null
  reporting_period: DateOnly
  lines: CorrectionLine[]
  total: number
  status: 'draft' | 'awaiting_approval' | 'approved' | 'released' | 'rejected'
  approval_id: UUID | null
  job_id: UUID | null
  released_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface ControlsTables {
  data_sources: DataSource[]
  import_batches: ImportBatch[]
  import_rows: ImportRow[]
  reconciliation_definitions: ReconciliationDefinition[]
  reconciliation_runs: ReconciliationRun[]
  reconciliation_items: ReconciliationItem[]
  financial_exceptions: FinancialException[]
  exception_resolutions: ExceptionResolution[]
  audit_evidence: AuditEvidence[]
  correction_schedules: CorrectionSchedule[]
}
