import { GLOBAL_TABLES, type Row, type TableName, type Tables } from './schema'
import { seedTables } from './seed'

const STORAGE_KEY = 'insureflow_demo_v2'
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
let flushScheduled = false

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
      }
      throw err
    }
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

/** Tenant-scoped data access. Every read and write is filtered to one brokerage. */
export class Repo {
  constructor(readonly tenantId: string) {}

  private rows<T extends TableName>(table: T): Row<T>[] {
    return tables[table] as unknown as Row<T>[]
  }

  private visible<T extends TableName>(table: T, row: Row<T>): boolean {
    if (!isTenantTable(table)) return true
    return (row as { tenant_id?: string }).tenant_id === this.tenantId
  }

  list<T extends TableName>(table: T, where?: (row: Row<T>) => boolean): Row<T>[] {
    return this.rows(table).filter((r) => this.visible(table, r) && (!where || where(r)))
  }

  find<T extends TableName>(table: T, where: (row: Row<T>) => boolean): Row<T> | undefined {
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
    return row
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Row<T> {
    const row = this.require(table, id)
    Object.assign(row as object, patch, hasUpdatedAt(table) ? { updated_at: nowIso() } : {})
    markChanged(table)
    return row
  }
}

const UPDATED_AT_TABLES: TableName[] = [
  'organisations',
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
  'industry_risk_templates',
  'commercial_submissions',
  'submission_sections',
  'tasks',
]
const hasUpdatedAt = (t: TableName) => UPDATED_AT_TABLES.includes(t)
