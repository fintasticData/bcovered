// What is actually in the bcovered Supabase project, from the generated snapshot. Tables are grouped by the same areas
// as the target schema so the live and target ERDs can be compared side by side.
import { LIVE_FOREIGN_KEYS, LIVE_MIGRATIONS, LIVE_SNAPSHOT, LIVE_TABLE_ROWS } from './liveSchema.generated'
import { PLANNED_TABLES, REMOVED_TABLES, type DomainKey } from './plannedSchema'

export interface LiveColumn {
  name: string
  type: string
  pk: boolean
  /** Referenced table when the column is a foreign key. */
  ref?: string
  optional?: boolean
}

export interface LiveTable {
  name: string
  domain: DomainKey
  scope: 'tenant' | 'global'
  policies: number
  rows: number
  columns: LiveColumn[]
  /** matches: same name in the target schema · legacy: merged or renamed in the target schema. */
  target: 'matches' | 'legacy'
  successor?: string
}

export interface LiveRelationship {
  from: string
  column: string
  to: string
  optional: boolean
}

export { LIVE_MIGRATIONS, LIVE_SNAPSHOT }

/** Legacy Risk Twin tables still in the database; the target schema merges or renames them. */
const LEGACY_DOMAIN: Record<string, DomainKey> = {
  risk_dependencies: 'twin',
  business_dependency_links: 'twin',
  insurance_policies: 'twin',
  business_documents: 'twin',
}

export const LIVE_RELATIONSHIPS: LiveRelationship[] = LIVE_FOREIGN_KEYS.map((fk) => {
  const [left, right] = fk.split('>')
  const dot = left.indexOf('.')
  const optional = right.endsWith('?')
  return { from: left.slice(0, dot), column: left.slice(dot + 1), to: optional ? right.slice(0, -1) : right, optional }
})

const plannedDomain = new Map(PLANNED_TABLES.map((t) => [t.name, t.domain]))

export const LIVE_TABLES: LiveTable[] = LIVE_TABLE_ROWS.map(([name, policies, rows, spec]) => {
  const refs = new Map(LIVE_RELATIONSHIPS.filter((r) => r.from === name).map((r) => [r.column, r]))
  const columns = spec.split(',').map((c) => {
    const [col, type, key] = c.split(' ')
    const ref = refs.get(col)
    return { name: col, type, pk: key === 'PK', ...(ref ? { ref: ref.to, optional: ref.optional } : {}) }
  })
  const removed = REMOVED_TABLES.find((r) => r.name === name)
  return {
    name,
    domain: plannedDomain.get(name) ?? LEGACY_DOMAIN[name] ?? 'platform',
    scope: columns.some((c) => c.name === 'tenant_id') ? 'tenant' : 'global',
    policies,
    rows,
    columns,
    target: removed ? 'legacy' : 'matches',
    ...(removed ? { successor: removed.successor } : {}),
  }
})

const liveNames = new Set(LIVE_TABLES.map((t) => t.name))

/** Target tables that have not been created in the database yet. */
export const PLANNED_NOT_LIVE = PLANNED_TABLES.filter((t) => !liveNames.has(t.name)).map((t) => ({ name: t.name, domain: t.domain }))

export const liveTableByName = (name: string) => LIVE_TABLES.find((t) => t.name === name)

export function liveSummary() {
  return {
    tables: LIVE_TABLES.length,
    columns: LIVE_TABLES.reduce((n, t) => n + t.columns.length, 0),
    relationships: LIVE_RELATIONSHIPS.length,
    policies: LIVE_TABLES.reduce((n, t) => n + t.policies, 0),
    rows: LIVE_TABLES.reduce((n, t) => n + t.rows, 0),
    empty_tables: LIVE_TABLES.filter((t) => t.rows === 0).length,
    legacy_tables: LIVE_TABLES.filter((t) => t.target === 'legacy').length,
    planned_not_live: PLANNED_NOT_LIVE.length,
    migrations: LIVE_MIGRATIONS.length,
  }
}

/**
 * Mermaid ER source for one area of the live database (or all of it). Tables from other areas appear with their key only.
 * tenant_id is left out because every tenant table has it. Links to app_users (created_by, decided_by and similar) are
 * hidden unless asked for, or when drawing the platform area itself.
 */
export function liveErdSource(domain: DomainKey | 'all', opts: { userLinks?: boolean } = {}): string {
  const own = LIVE_TABLES.filter((t) => domain === 'all' || t.domain === domain)
  const names = new Set(own.map((t) => t.name))
  const showUsers = opts.userLinks || domain === 'platform'
  const rels = LIVE_RELATIONSHIPS.filter((r) => names.has(r.from) && (showUsers || r.to !== 'app_users'))
  const lines = ['erDiagram']
  for (const r of rels) lines.push(`  ${r.to} ${r.optional ? '|o' : '||'}--o{ ${r.from} : "${r.column}"`)
  for (const t of own) {
    lines.push(`  ${t.name} {`)
    const cols = domain === 'all' ? t.columns.filter((c) => c.pk) : t.columns.filter((c) => c.name !== 'tenant_id')
    for (const c of cols) {
      const key = c.pk && c.ref ? ' PK, FK' : c.pk ? ' PK' : c.ref ? ' FK' : ''
      lines.push(`    ${c.type} ${c.name}${key}`)
    }
    lines.push('  }')
  }
  return lines.join('\n')
}
