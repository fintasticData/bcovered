import { ToolError } from '../lib/errors'
import type { ScopeType } from './lifeSchema'
import { GLOBAL_TABLES, type Row, type TableName, type Tables } from './schema'
import { seedTables } from './seed'

/** Bumped when stored rows gain required fields, so an older browser copy is replaced by fresh seed data. */
const STORAGE_KEY = 'insureflow_demo_v6'

/** Evidence must never change once captured. */
const APPEND_ONLY: TableName[] = ['audit_evidence']

export class AppendOnlyError extends ToolError {
  constructor(table: string) {
    super('forbidden', `${table} is append-only: records cannot be changed or deleted`)
    this.name = 'AppendOnlyError'
  }
}
const hasStorage = typeof localStorage !== 'undefined'

export class NotFoundError extends Error {
  constructor(table: string, id: string) {
    super(`${table} ${id} not found`)
    this.name = 'NotFoundError'
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const nowIso = () => new Date().toISOString()

export type ChangeListener = (tables: TableName[]) => void

/** A committed row change, for adapters that mirror the store to a database. */
export interface RowChange {
  table: TableName
  op: 'upsert' | 'delete'
  row: Record<string, unknown>
}
export type RowChangeListener = (changes: RowChange[]) => void

function load(): Tables {
  if (hasStorage) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return { ...seedTables(), ...JSON.parse(raw) } as Tables
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
  return seedTables()
}

let tables: Tables = load()
let txDepth = 0
let txSnapshot: Tables | null = null
const pending = new Set<TableName>()
const listeners = new Set<ChangeListener>()
const rowListeners = new Set<RowChangeListener>()
let rowChanges: RowChange[] = []
let flushScheduled = false

function recordChange(change: RowChange) {
  if (!rowListeners.size) return
  rowChanges.push({ ...change, row: structuredClone(change.row) })
  if (txDepth === 0) emitRowChanges()
}

function emitRowChanges() {
  if (!rowChanges.length) return
  const batch = rowChanges
  rowChanges = []
  rowListeners.forEach((l) => l(batch))
}

function flush() {
  flushScheduled = false
  if (!pending.size) return
  const changed = [...pending]
  pending.clear()
  if (hasStorage) localStorage.setItem(STORAGE_KEY, JSON.stringify(tables))
  listeners.forEach((l) => l(changed))
}

function markChanged(table: TableName) {
  pending.add(table)
  if (txDepth === 0 && !flushScheduled) {
    flushScheduled = true
    queueMicrotask(flush)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    tables = load()
    listeners.forEach((l) => l(Object.keys(tables) as TableName[]))
  })
}

export const db = {
  subscribe(listener: ChangeListener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** Synchronous all-or-nothing block: any throw restores every table to its state before the block. */
  transaction<R>(fn: () => R): R {
    if (txDepth === 0) txSnapshot = structuredClone(tables)
    txDepth++
    try {
      const result = fn()
      txDepth--
      if (txDepth === 0) {
        txSnapshot = null
        emitRowChanges()
        if (pending.size && !flushScheduled) {
          flushScheduled = true
          queueMicrotask(flush)
        }
      }
      return result
    } catch (err) {
      txDepth--
      if (txDepth === 0 && txSnapshot) {
        tables = txSnapshot
        txSnapshot = null
        pending.clear()
        rowChanges = []
      }
      throw err
    }
  },

  /** Committed row changes, in the order they happened. */
  subscribeRows(listener: RowChangeListener) {
    rowListeners.add(listener)
    return () => {
      rowListeners.delete(listener)
    }
  },

  /** Replaces whole tables with rows loaded from the database, without reporting them as changes. Existing rows that
   *  `keep` accepts (rows the database never returns to this login) stay alongside the loaded ones. */
  hydrate(next: Partial<Record<TableName, Record<string, unknown>[]>>, keep?: (row: Record<string, unknown>) => boolean) {
    const all = tables as unknown as Record<string, Array<Record<string, unknown>>>
    for (const [table, rows] of Object.entries(next) as Array<[TableName, Record<string, unknown>[]]>) {
      const loaded = new Set(rows.map((r) => r.id))
      const kept = keep ? (all[table] ?? []).filter((r) => !loaded.has(r.id) && keep(r)) : []
      all[table] = [...rows, ...kept]
      markChanged(table)
    }
  },

  /** Merges database-assigned fields (numbers, references) into existing rows without reporting them as changes. */
  mergeRows(table: TableName, rows: Record<string, unknown>[]) {
    const list = tables[table] as unknown as Array<Record<string, unknown>>
    for (const r of rows) {
      const existing = list.find((x) => x.id === r.id)
      if (existing) Object.assign(existing, r)
    }
    if (rows.length) markChanged(table)
  },

  reset(): void {
    tables = seedTables()
    ;(Object.keys(tables) as TableName[]).forEach(markChanged)
  },

  snapshot(): Tables {
    return structuredClone(tables)
  },
}

export type NewRow<T extends TableName> = Omit<Row<T>, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> & {
  id?: string
}

const isTenantTable = (t: TableName) => !GLOBAL_TABLES.includes(t)

/** Audit and tool-call records are still written for read-only users, so blocked attempts stay visible. */
const ALWAYS_WRITABLE: TableName[] = ['audit_events', 'agent_tool_calls']

/**
 * Tables a brokerage can use before activation and while suspended: its own setup, review, documents, insurer access
 * and import previews. Every other tenant table is operational and needs an active brokerage, mirroring the
 * restrictive operational_tenant policies in migration 0010.
 */
const SETUP_TABLES: TableName[] = [
  'organisations',
  'app_users',
  'organisation_memberships',
  'brokerage_invitations',
  'brokerage_applications',
  'onboarding_status_events',
  'onboarding_items',
  'onboarding_feedback',
  'onboarding_internal_notes',
  'documents',
  'storage_objects',
  'document_links',
  'extracted_field_proposals',
  'organisation_product_modules',
  'organisation_commercial_terms',
  'insurer_access',
  'insurer_access_credentials',
  'vault_secrets',
  'data_sources',
  'import_batches',
  'import_rows',
  'audit_events',
  'agent_tool_calls',
  // Routes run on Sample clients only, so a brokerage can use them before activation.
  'route_runs',
  'route_action_results',
]

/** Only platform staff repositories may read these, even inside the brokerage's own tenant. */
const PLATFORM_ONLY: TableName[] = ['onboarding_internal_notes']

export interface RepoOptions {
  /** Read-only and compliance-reviewer members: every write except audit is refused. */
  readOnly?: boolean
  /** False while a brokerage is onboarding, suspended or closed: operational tables are refused. */
  operational?: boolean
  /** Platform staff acting on one brokerage's onboarding records. */
  platform?: boolean
}

/** Tenant-scoped data access. Every read and write is filtered to one brokerage. */
export class Repo {
  constructor(
    readonly tenantId: string,
    readonly options: RepoOptions = {},
  ) {}

  private rows<T extends TableName>(table: T): Row<T>[] {
    return tables[table] as unknown as Row<T>[]
  }

  private visible<T extends TableName>(table: T, row: Row<T>): boolean {
    if (table === 'organisations') return (row as { id: string }).id === this.tenantId
    if (!isTenantTable(table)) return true
    if ((row as { tenant_id?: string }).tenant_id === this.tenantId) return true
    // People who work in this brokerage but whose home brokerage is another one.
    if (table === 'app_users') {
      const userId = (row as { id: string }).id
      return tables.organisation_memberships.some((m) => m.user_id === userId && m.tenant_id === this.tenantId && m.status !== 'removed')
    }
    return false
  }

  private checkRead(table: TableName) {
    if (PLATFORM_ONLY.includes(table) && !this.options.platform) throw new ToolError('forbidden', `${table} is visible to B-Covered staff only.`)
    if (this.options.operational === false && isTenantTable(table) && !SETUP_TABLES.includes(table)) {
      throw new ToolError('forbidden', 'This brokerage is not active, so operational records are unavailable.')
    }
  }

  private checkWrite(table: TableName) {
    this.checkRead(table)
    if (this.options.readOnly && !ALWAYS_WRITABLE.includes(table)) {
      throw new ToolError('forbidden', 'Your role in this brokerage is read-only.')
    }
  }

  list<T extends TableName>(table: T, where?: (row: Row<T>) => boolean): Row<T>[] {
    this.checkRead(table)
    return this.rows(table).filter((r) => this.visible(table, r) && (!where || where(r)))
  }

  find<T extends TableName>(table: T, where: (row: Row<T>) => boolean): Row<T> | undefined {
    this.checkRead(table)
    return this.rows(table).find((r) => this.visible(table, r) && where(r))
  }

  get<T extends TableName>(table: T, id: string): Row<T> | undefined {
    return this.find(table, (r) => (r as { id: string }).id === id)
  }

  require<T extends TableName>(table: T, id: string): Row<T> {
    const row = this.get(table, id)
    if (!row) throw new NotFoundError(table, id)
    return row
  }

  insert<T extends TableName>(table: T, values: NewRow<T>): Row<T> {
    this.checkWrite(table)
    const ts = nowIso()
    const row = {
      created_at: ts,
      ...(hasUpdatedAt(table) ? { updated_at: ts } : {}),
      ...(isTenantTable(table) ? { tenant_id: this.tenantId } : {}),
      ...values,
      id: values.id ?? newId(),
    } as unknown as Row<T>
    this.rows(table).push(row)
    markChanged(table)
    recordChange({ table, op: 'upsert', row: row as unknown as Record<string, unknown> })
    return row
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Row<T> {
    if (APPEND_ONLY.includes(table)) throw new AppendOnlyError(table)
    this.checkWrite(table)
    const row = this.require(table, id)
    Object.assign(row as object, patch, hasUpdatedAt(table) ? { updated_at: nowIso() } : {})
    markChanged(table)
    recordChange({ table, op: 'upsert', row: row as unknown as Record<string, unknown> })
    return row
  }

  remove<T extends TableName>(table: T, id: string): void {
    if (APPEND_ONLY.includes(table)) throw new AppendOnlyError(table)
    this.checkWrite(table)
    const row = this.require(table, id)
    const rows = this.rows(table)
    rows.splice(rows.indexOf(row), 1)
    markChanged(table)
    recordChange({ table, op: 'delete', row: { id } })
  }
}

export type Grants = Map<ScopeType, Set<string>>

type ScopeRule = (row: Record<string, unknown>, grants: Grants, base: Repo) => boolean

const byColumn =
  (scope: ScopeType, column: string): ScopeRule =>
  (row, grants) =>
    typeof row[column] === 'string' && Boolean(grants.get(scope)?.has(row[column] as string))

const employer = byColumn('employer', 'employer_customer_id')

/** Tables that hold employer, fund or cell confidential data, and how a row is tied to a grant. */
const SCOPE_RULES: Partial<Record<TableName, ScopeRule>> = {
  group_schemes: employer,
  scheme_rule_versions: employer,
  employments: employer,
  salary_history: employer,
  scheme_memberships: employer,
  fund_participations: employer,
  fund_memberships: employer,
  contribution_rule_versions: employer,
  member_movements: employer,
  benefit_events: employer,
  administrator_valuations: employer,
  correction_schedules: byColumn('employer', 'customer_id'),
  financial_exceptions: byColumn('employer', 'customer_id'),
  reconciliation_runs: byColumn('employer', 'customer_id'),
  cell_arrangements: byColumn('cell', 'id'),
  cell_financial_periods: byColumn('cell', 'cell_id'),
  persons: (row, grants, base) =>
    base.list('employments', (e) => e.person_id === row.id).some((e) => grants.get('employer')?.has(e.employer_customer_id)),
}

/**
 * A repository for a portal user whose access is limited by access grants. Rows in scoped tables are visible only when
 * they belong to a granted employer, fund or cell; everything else behaves like the tenant repository.
 */
export class ScopedRepo extends Repo {
  private readonly base: Repo

  constructor(
    tenantId: string,
    readonly grants: Grants,
  ) {
    super(tenantId)
    this.base = new Repo(tenantId)
  }

  private allowed(table: TableName, row: unknown): boolean {
    const rule = SCOPE_RULES[table]
    return !rule || rule(row as Record<string, unknown>, this.grants, this.base)
  }

  override list<T extends TableName>(table: T, where?: (row: Row<T>) => boolean): Row<T>[] {
    return super.list(table, (r) => this.allowed(table, r) && (!where || where(r)))
  }

  override find<T extends TableName>(table: T, where: (row: Row<T>) => boolean): Row<T> | undefined {
    return super.find(table, (r) => this.allowed(table, r) && where(r))
  }
}

/** Tables platform staff may read across brokerages: onboarding review and brokerage administration only. */
const PLATFORM_READABLE: TableName[] = [
  'organisations',
  'app_users',
  'organisation_memberships',
  'brokerage_invitations',
  'brokerage_applications',
  'onboarding_status_events',
  'onboarding_items',
  'onboarding_feedback',
  'onboarding_internal_notes',
  'documents',
  'organisation_product_modules',
  'organisation_commercial_terms',
  'insurer_access',
  'audit_events',
]

/**
 * Cross-brokerage reads, standing in for platform-staff RLS policies and security-definer lookups. Callers must
 * already have checked the platform role; anything outside PLATFORM_READABLE is refused.
 */
export const crossTenant = {
  list<T extends TableName>(table: T, where?: (row: Row<T>) => boolean): Row<T>[] {
    if (!PLATFORM_READABLE.includes(table)) throw new ToolError('forbidden', `${table} is not readable across brokerages`)
    return (tables[table] as unknown as Row<T>[]).filter((r) => !where || where(r))
  },
  find<T extends TableName>(table: T, where: (row: Row<T>) => boolean): Row<T> | undefined {
    return crossTenant.list(table, where)[0]
  },
}

/** Identity lookups the auth service performs before any tenant is known (sign-in, invitation tokens, session checks). */
export const identity = {
  user: (id: string) => tables.app_users.find((u) => u.id === id),
  userByEmail: (email: string) => tables.app_users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()),
  credentials: (email: string) => tables.auth_identities.find((a) => a.email === email.trim().toLowerCase()),
  memberships: (userId: string) => tables.organisation_memberships.filter((m) => m.user_id === userId),
  organisation: (id: string) => tables.organisations.find((o) => o.id === id),
  platformStaff: (userId: string) => tables.platform_staff.find((s) => s.user_id === userId && !s.revoked_at),
  invitationByHash: (hash: string) => tables.brokerage_invitations.find((i) => i.token_hash === hash),
  documentLink: (token: string) => tables.document_links.find((l) => l.token === token),
  brokerageIds: () => tables.organisations.filter((o) => o.kind === 'brokerage').map((o) => o.id),
  /** Demo identity switcher and platform reviewer lists only. */
  allUsers: () => tables.app_users.map((u) => ({ ...u })),
  activePlatformStaff: () => tables.platform_staff.filter((s) => !s.revoked_at).map((s) => ({ ...s })),
}

const UPDATED_AT_TABLES: TableName[] = [
  'organisations',
  'organisation_memberships',
  'brokerage_applications',
  'documents',
  'onboarding_items',
  'organisation_product_modules',
  'insurer_access',
  'app_users',
  'customers',
  'conversations',
  'leads',
  'quotes',
  'jobs',
  'approval_requests',
  'communications',
  'business_profiles',
  'business_locations',
  'commercial_assets',
  'risk_exposures',
  'risk_assessments',
  'risk_assessment_findings',
  'business_dependency_links',
  'business_documents',
  'insurance_policies',
  'policy_sections',
  'coverage_findings',
  'twin_update_proposals',
  'industry_risk_templates',
  'commercial_submissions',
  'submission_sections',
  'tasks',
  'persons',
  'adviser_authorisations',
  'products',
  'needs_analyses',
  'life_quotes',
  'records_of_advice',
  'policies',
  'policy_benefits',
  'underwriting_requirements',
  'data_sources',
  'import_batches',
  'reconciliation_definitions',
  'financial_exceptions',
  'correction_schedules',
  'group_schemes',
  'employments',
  'scheme_memberships',
  'retirement_funds',
  'fund_memberships',
  'member_movements',
  'benefit_events',
  'investment_portfolios',
  'fund_transfers',
  'transfer_members',
  'cell_arrangements',
  'governance_items',
  'trustee_packs',
  'investigations',
  'route_runs',
]
const hasUpdatedAt = (t: TableName) => UPDATED_AT_TABLES.includes(t)
