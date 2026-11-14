// Provider adapters per source kind. Every source enters through the same import pipeline (register, validate, match,
// reconcile), so an adapter only has to deliver a file or rows. Only file-based adapters are live; API and SFTP adapters
// stay "awaiting specification" until a provider supplies a specification and credentials and the adapter is tested.
import type { Dataset, SourceKind } from '../db/controlsSchema'

export type AdapterStatus = 'live' | 'awaiting_specification' | 'not_configured'

export interface SourceAdapter {
  key: string
  label: string
  source_kinds: SourceKind[]
  channel: 'csv' | 'excel' | 'api' | 'sftp'
  datasets: Dataset[]
  status: AdapterStatus
  /** Specifications and secrets (names only) required before the adapter can go live. */
  requires: string[]
  note: string
}

const ALL_DATASETS: Dataset[] = ['payroll_schedule', 'contribution_schedule', 'investment_holdings', 'transfer_schedule', 'cell_financials']

export const ADAPTERS: SourceAdapter[] = [
  {
    key: 'csv_upload',
    label: 'CSV upload',
    source_kinds: ['insurer', 'fund_administrator', 'employer_payroll', 'investment_manager', 'bank', 'cell_captive_insurer', 'brokerage', 'manual'],
    channel: 'csv',
    datasets: ALL_DATASETS,
    status: 'live',
    requires: [],
    note: 'A person uploads the file on the Imports screen; the data source mapping renames columns.',
  },
  {
    key: 'excel_paste',
    label: 'Excel (save as CSV or paste rows)',
    source_kinds: ['insurer', 'fund_administrator', 'employer_payroll', 'investment_manager', 'bank', 'cell_captive_insurer', 'brokerage', 'manual'],
    channel: 'excel',
    datasets: ALL_DATASETS,
    status: 'live',
    requires: [],
    note: 'Rows copied from Excel arrive tab-separated. Native .xlsx parsing needs a backend parser library.',
  },
  {
    key: 'insurer_api',
    label: 'Insurer API (quotes, policy status, claims)',
    source_kinds: ['insurer'],
    channel: 'api',
    datasets: [],
    status: 'awaiting_specification',
    requires: ['Insurer API specification', 'INSURER_API_BASE_URL', 'INSURER_API_KEY (Edge Function secret)'],
    note: 'No insurer integration exists. Applications are recorded as ready to submit through the insurer portal.',
  },
  {
    key: 'administrator_sftp',
    label: 'Fund administrator SFTP (contribution schedules, member values)',
    source_kinds: ['fund_administrator'],
    channel: 'sftp',
    datasets: ['contribution_schedule', 'transfer_schedule'],
    status: 'awaiting_specification',
    requires: ['Administrator file specification', 'ADMIN_SFTP_HOST', 'ADMIN_SFTP_KEY (secret)'],
    note: 'Until agreed, administrator files are uploaded as CSV.',
  },
  {
    key: 'payroll_api',
    label: 'Payroll system API or SFTP',
    source_kinds: ['employer_payroll'],
    channel: 'api',
    datasets: ['payroll_schedule'],
    status: 'awaiting_specification',
    requires: ['Payroll export specification per employer', 'PAYROLL_API_KEY or SFTP credentials (secret)'],
    note: 'Employers upload payroll CSVs until a payroll integration is agreed.',
  },
  {
    key: 'manager_api',
    label: 'Investment manager holdings feed',
    source_kinds: ['investment_manager'],
    channel: 'api',
    datasets: ['investment_holdings'],
    status: 'awaiting_specification',
    requires: ['Manager holdings feed specification', 'MANAGER_API_KEY (secret)'],
    note: 'Holdings reports are uploaded as CSV until a feed is available.',
  },
  {
    key: 'bank_statements',
    label: 'Bank statement feed (payment confirmations)',
    source_kinds: ['bank'],
    channel: 'api',
    datasets: [],
    status: 'awaiting_specification',
    requires: ['Bank statement format (for example MT940 or CSV)', 'Bank feed credentials (secret)'],
    note: 'Payment confirmations would add a third leg to contribution reconciliation.',
  },
  {
    key: 'cell_accounts',
    label: 'Cell captive insurer management accounts',
    source_kinds: ['cell_captive_insurer'],
    channel: 'sftp',
    datasets: ['cell_financials'],
    status: 'awaiting_specification',
    requires: ['Cell accounts template per insurer'],
    note: 'Cell periods are currently seeded synthetic data; the CSV mapping is defined per data source.',
  },
]

export const adapterFor = (key: string) => ADAPTERS.find((a) => a.key === key)

/** The adapters that can serve a data source today. */
export const liveAdaptersFor = (kind: SourceKind, dataset: Dataset) => ADAPTERS.filter((a) => a.status === 'live' && a.source_kinds.includes(kind) && a.datasets.includes(dataset))
