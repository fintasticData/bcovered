// Moves the broker area's data to Supabase, module by module. While a broker is signed in, enabled modules load their
// tables from Supabase (tenant, staff and Sample / Live row-level security decide what comes back) and every committed
// change in the in-browser service layer is written through to Supabase in order. Tables of disabled modules, identity
// tables and anything the database lacks stay in browser storage.
import { useSyncExternalStore } from 'react'
import type { TableName } from '@/server/db/schema'
import { db, type RowChange } from '@/server/db/store'
import { dataCategory, type DataCategory } from './category'
import { supabase, supabaseAuth } from './client'
import { CATEGORY_TABLES, SUPABASE_COLUMNS } from './columns.generated'

export type ModuleKey = 'copilot' | 'personal' | 'commercial' | 'benefits' | 'controls' | 'funds' | 'specialist' | 'onboarding'

export const MODULES: Record<ModuleKey, { label: string; tables: string[] }> = {
  copilot: {
    label: 'Clients, accounts and policies',
    tables: ['customers', 'customer_consents', 'persons', 'customer_persons', 'person_relationships', 'policies', 'policy_parties', 'tasks'],
  },
  personal: {
    label: 'Personal lines, leads, quotes, approvals and jobs',
    tables: ['leads', 'quotes', 'quote_options', 'conversations', 'conversation_messages', 'communications', 'approval_requests', 'jobs', 'job_steps', 'agent_runs', 'agent_tool_calls', 'audit_events'],
  },
  commercial: {
    label: 'Commercial, Risk Twin and submissions',
    tables: ['industry_risk_templates', 'business_profiles', 'business_legal_entities', 'business_locations', 'business_activities', 'commercial_assets', 'business_risk_profiles', 'risk_exposures', 'risk_dependencies', 'risk_assessments', 'risk_assessment_findings', 'business_dependency_links', 'business_documents', 'insurance_policies', 'policy_sections', 'coverage_findings', 'twin_update_proposals', 'risk_twin_change_events', 'commercial_submissions', 'submission_sections'],
  },
  benefits: {
    label: 'Life and group benefits',
    tables: ['financial_profiles', 'adviser_authorisations', 'access_grants', 'products', 'product_versions', 'product_benefits', 'needs_analyses', 'life_quotes', 'life_quote_options', 'records_of_advice', 'policy_benefits', 'policy_status_events', 'underwriting_requirements', 'group_schemes', 'scheme_rule_versions', 'employments', 'salary_history', 'scheme_memberships', 'member_movements', 'benefit_events', 'contribution_rule_versions'],
  },
  controls: {
    label: 'Financial controls',
    tables: ['data_sources', 'import_batches', 'import_rows', 'reconciliation_definitions', 'reconciliation_runs', 'reconciliation_items', 'financial_exceptions', 'exception_resolutions', 'audit_evidence', 'correction_schedules'],
  },
  funds: {
    label: 'Retirement funds, investments and transfers',
    tables: ['retirement_funds', 'fund_participations', 'fund_memberships', 'administrator_valuations', 'fund_balance_statements', 'investment_portfolios', 'investment_holdings', 'investment_valuations', 'investment_benchmarks', 'fund_transfers', 'transfer_members'],
  },
  specialist: {
    label: 'Cells, governance and investigations',
    tables: ['cell_arrangements', 'cell_financial_periods', 'governance_items', 'trustee_packs', 'investigations', 'investigation_findings', 'commission_records'],
  },
  onboarding: {
    label: 'Brokerage onboarding (opt-in: its writes need the database functions)',
    tables: ['brokerage_invitations', 'brokerage_applications', 'onboarding_status_events', 'documents', 'onboarding_items', 'onboarding_feedback', 'onboarding_internal_notes', 'extracted_field_proposals', 'organisation_product_modules', 'organisation_commercial_terms', 'insurer_access'],
  },
}

/** Platform-managed catalogue rows: loaded for display, never written back (row-level security makes them read-only). */
export const READ_ONLY_TABLES = new Set(['products', 'product_versions', 'product_benefits'])

const DEFAULT_MODULES: ModuleKey[] = ['copilot', 'personal', 'commercial', 'benefits', 'controls', 'funds', 'specialist']

function enabledModules(): ModuleKey[] {
  const raw = ((import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_MODULES ?? 'all').trim().toLowerCase()
  if (raw === 'none' || raw === '') return []
  if (raw === 'all') return DEFAULT_MODULES
  return raw.split(',').map((s) => s.trim()).filter((s): s is ModuleKey => s in MODULES)
}

export interface SyncState {
  status: 'local' | 'hydrating' | 'synced' | 'error'
  category: DataCategory
  modules: ModuleKey[]
  tables: number
  rows: number
  pending: number
  lastError: string | null
  syncedAt: string | null
}

const modules = enabledModules()
const localTables = new Set(Object.keys(db.snapshot()))
const syncedTables = new Set(modules.flatMap((m) => MODULES[m].tables).filter((t) => t in SUPABASE_COLUMNS && localTables.has(t)))

let state: SyncState = { status: 'local', category: dataCategory.get(), modules, tables: syncedTables.size, rows: 0, pending: 0, lastError: null, syncedAt: null }
const listeners = new Set<() => void>()
const set = (next: Partial<SyncState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

const active = () => Boolean(supabase) && supabaseAuth.get().status === 'signed_in' && syncedTables.size > 0

async function loadTable(table: string, category: DataCategory) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select('*').range(from, from + 999).setHeader('x-data-category', category)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as Record<string, unknown>[]))
    if (!data || data.length < 1000) return rows
  }
}

let hydrateRun = 0
async function hydrate() {
  if (!active()) return set({ status: 'local', category: dataCategory.get() })
  const run = ++hydrateRun
  const category = dataCategory.get()
  set({ status: 'hydrating', category, lastError: null })
  const loaded: Record<string, Record<string, unknown>[]> = {}
  const errors: string[] = []
  await Promise.all(
    [...syncedTables].map(async (t) => {
      try {
        loaded[t] = await loadTable(t, category)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }),
  )
  if (run !== hydrateRun) return
  db.hydrate(loaded as Partial<Record<TableName, Record<string, unknown>[]>>)
  set({
    status: errors.length ? 'error' : 'synced',
    rows: Object.values(loaded).reduce((n, r) => n + r.length, 0),
    lastError: errors[0] ?? null,
    syncedAt: new Date().toISOString(),
  })
}

const queue: RowChange[] = []
let draining = false

function payloadFor(change: RowChange, category: DataCategory) {
  const cols = SUPABASE_COLUMNS[change.table] ?? []
  const out: Record<string, unknown> = {}
  for (const c of cols) if (c in change.row) out[c] = change.row[c]
  if (CATEGORY_TABLES.includes(change.table)) out.data_category = (change.row.data_category as string) ?? category
  return out
}

async function drain() {
  if (draining) return
  draining = true
  try {
    while (queue.length) {
      const change = queue.shift()!
      set({ pending: queue.length })
      const category = dataCategory.get()
      const t = change.table as string
      const req =
        change.op === 'delete'
          ? supabase!.from(t).delete().eq('id', change.row.id as string).setHeader('x-data-category', category)
          : supabase!.from(t).upsert(payloadFor(change, category), { onConflict: 'id' }).select().setHeader('x-data-category', category)
      const { data, error } = await req
      if (error) {
        set({ status: 'error', lastError: `${t}: ${error.message}` })
        continue
      }
      if (change.op === 'upsert' && Array.isArray(data)) db.mergeRows(change.table, data as Record<string, unknown>[])
    }
  } finally {
    draining = false
    set({ pending: 0 })
  }
}

let started = false
export function startSupabaseSync() {
  if (started || !supabase) return
  started = true
  db.subscribeRows((changes) => {
    if (!active()) return
    const mine = changes.filter((c) => syncedTables.has(c.table) && !READ_ONLY_TABLES.has(c.table))
    if (!mine.length) return
    queue.push(...mine)
    set({ pending: queue.length })
    void drain()
  })
  let lastKey = ''
  const maybeHydrate = () => {
    const auth = supabaseAuth.get()
    const key = `${auth.status}:${auth.userId}:${dataCategory.get()}`
    if (key === lastKey) return
    lastKey = key
    void hydrate()
  }
  supabaseAuth.subscribe(maybeHydrate)
  dataCategory.subscribe(maybeHydrate)
  maybeHydrate()
}

export const supabaseSync = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  refresh: () => hydrate(),
  isSynced: (table: string) => active() && syncedTables.has(table),
}

export function useSupabaseSync(): SyncState {
  return useSyncExternalStore(supabaseSync.subscribe, supabaseSync.get, supabaseSync.get)
}
