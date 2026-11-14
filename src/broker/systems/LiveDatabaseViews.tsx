import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, KeyRound, Lock, Zap } from 'lucide-react'
import type { SystemsCatalogue } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EdgeFunctionInfo } from '@/server/systems/edgeFunctions'
import { liveErdSource, type LiveTable } from '@/server/systems/liveSchema'
import type { DomainKey } from '@/server/systems/plannedSchema'
import { ErdDiagram } from './ErdDiagram'
import { Chip, Kpi, SectionTitle, focusRing, hasParams, useFocusedItem } from './shared'

const snapshotDate = (iso: string) =>
  new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    await navigator.clipboard?.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return [copied, copy] as const
}

// ---------------------------------------------------------------- live ERD

export function LiveErdView({
  cat,
  domain,
  onDomain,
  onTable,
  onPlanned,
}: {
  cat: SystemsCatalogue
  domain: DomainKey | 'all'
  onDomain: (d: string) => void
  onTable: (t: string) => void
  onPlanned: (t: string) => void
}) {
  const [userLinks, setUserLinks] = useState(false)
  const [copied, copy] = useCopy()
  const l = cat.live
  const source = useMemo(() => liveErdSource(domain, { userLinks }), [domain, userLinks])
  const names = useMemo(() => l.tables.map((t) => t.name), [l.tables])
  const d = cat.schema.domains.find((x) => x.key === domain)
  const own = domain === 'all' ? l.tables : l.tables.filter((t) => t.domain === domain)
  const missing = l.planned_not_live.filter((t) => domain === 'all' || t.domain === domain)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label="Tables" value={l.summary.tables} />
        <Kpi label="Foreign keys" value={l.summary.relationships} />
        <Kpi label="Security policies" value={l.summary.policies} hint="Row-level security on every table" />
        <Kpi label="Rows" value={l.summary.rows.toLocaleString('en-ZA')} hint={`${l.summary.empty_tables} tables empty`} />
        <Kpi
          label="Target tables not created"
          value={l.summary.planned_not_live}
          tone={l.summary.planned_not_live ? 'warning' : undefined}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap">
        {cat.schema.domains
          .filter((x) => l.tables.some((t) => t.domain === x.key))
          .map((x) => (
            <Chip key={x.key} active={x.key === domain} onClick={() => onDomain(x.key)}>
              {x.label} · {l.tables.filter((t) => t.domain === x.key).length}
            </Chip>
          ))}
        <Chip active={domain === 'all'} onClick={() => onDomain('all')}>
          All {l.tables.length} tables
        </Chip>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-xl text-xs text-navy-600">
          <strong className="text-navy-800">{d?.label ?? 'Whole database'}</strong> · {own.length} tables in bcovered.{' '}
          {domain === 'all' ? 'Keys only, so the whole database fits; pick an area for columns.' : 'Tables from other areas appear by name only.'} Click a table to open it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-navy-700">
            <input type="checkbox" checked={userLinks || domain === 'platform'} disabled={domain === 'platform'} onChange={(e) => setUserLinks(e.target.checked)} />
            Show links to app_users
          </label>
          <Button size="sm" variant="outline" onClick={() => void copy(source)}>
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy Mermaid source'}
          </Button>
        </div>
      </div>

      <ErdDiagram source={source} names={names} onSelect={onTable} label={`${d?.label ?? 'Whole database'} · live entity relationship diagram`} />

      <p className="text-[11px] text-navy-600">
        Snapshot of {l.snapshot.project} ({l.snapshot.ref}) taken {snapshotDate(l.snapshot.taken_at)}. Lines read “one parent row to many child rows”, labelled with the
        foreign key column; a circle at the parent end means the column is optional. tenant_id → organisations and the Sample / Live data_category key parts are on
        every tenant table and are not drawn. Refresh with <code className="font-mono">npm run db:schema</code>.
      </p>

      {missing.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <SectionTitle>In the target schema, not in the database yet ({missing.length})</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((t) => (
              <Chip key={t.name} onClick={() => onPlanned(t.name)}>
                {t.name}
              </Chip>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- live tables

export function LiveTablesView({ cat, onTable, onPlanned, onFunction }: { cat: SystemsCatalogue; onTable: (t: string) => void; onPlanned: (t: string) => void; onFunction: (slug: string) => void }) {
  const [item, setItem] = useFocusedItem()
  const [domain, setDomain] = useState<DomainKey | 'all'>('all')
  const [fill, setFill] = useState<'all' | 'rows' | 'empty'>('all')
  const [query, setQuery] = useState('')
  const l = cat.live

  const focusedDomain = l.tables.find((t) => t.name === item)?.domain
  const effectiveDomain = item && focusedDomain && domain !== 'all' && domain !== focusedDomain ? focusedDomain : domain
  const q = query.toLowerCase()
  const rows = l.tables.filter(
    (t) =>
      (effectiveDomain === 'all' || t.domain === effectiveDomain) &&
      (fill === 'all' || (fill === 'rows' ? t.rows > 0 : t.rows === 0)) &&
      (!q || t.name.includes(q) || t.columns.some((c) => c.name.includes(q))),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="sys-live-search">
          Search live tables
        </label>
        <input id="sys-live-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tables or columns" className="field py-2 sm:max-w-xs" />
        <label className="sr-only" htmlFor="sys-live-fill">
          Rows
        </label>
        <select id="sys-live-fill" value={fill} onChange={(e) => setFill(e.target.value as typeof fill)} className="field py-2 sm:w-44">
          <option value="all">All tables</option>
          <option value="rows">With rows</option>
          <option value="empty">Empty</option>
        </select>
      </div>
      <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap">
        <Chip active={effectiveDomain === 'all'} onClick={() => setDomain('all')}>
          All areas
        </Chip>
        {cat.schema.domains
          .filter((x) => l.tables.some((t) => t.domain === x.key))
          .map((x) => (
            <Chip key={x.key} active={effectiveDomain === x.key} onClick={() => setDomain(x.key)}>
              {x.label}
            </Chip>
          ))}
      </div>
      <p className="text-[11px] text-navy-600">{rows.length} tables</p>
      <ul className="space-y-2">
        {rows.map((t) => (
          <LiveTableCard
            key={t.name}
            table={t}
            cat={cat}
            open={item === t.name}
            onToggle={() => setItem(item === t.name ? null : t.name)}
            onTable={onTable}
            onPlanned={onPlanned}
            onFunction={onFunction}
          />
        ))}
      </ul>
    </div>
  )
}

function LiveTableCard({
  table,
  cat,
  open,
  onToggle,
  onTable,
  onPlanned,
  onFunction,
}: {
  table: LiveTable
  cat: SystemsCatalogue
  open: boolean
  onToggle: () => void
  onTable: (t: string) => void
  onPlanned: (t: string) => void
  onFunction: (slug: string) => void
}) {
  const incoming = [...new Set(cat.live.relationships.filter((r) => r.to === table.name).map((r) => r.from))]
  const functions = cat.live.edge_functions.filter((f) => f.tables.includes(table.name))
  const domain = cat.schema.domains.find((d) => d.key === table.domain)
  const inTarget = cat.schema.tables.some((t) => t.name === table.name)

  return (
    <li data-item={table.name} className={cn('rounded-xl border border-navy-800/10 bg-white transition', focusRing(open))}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-start justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-navy-900">
            <span className="min-w-0 break-all">{table.name}</span>
            <Badge tone={table.rows ? 'success' : 'neutral'}>{table.rows ? `${table.rows.toLocaleString('en-ZA')} rows` : 'Empty'}</Badge>
            <Badge tone="neutral">{table.scope === 'tenant' ? 'Per tenant' : 'Platform-wide'}</Badge>
            {table.target === 'legacy' && <Badge tone="warning">Legacy → {table.successor}</Badge>}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-navy-600">
            <Lock className="h-3 w-3 shrink-0" /> {table.policies} row-level security {table.policies === 1 ? 'policy' : 'policies'} · {table.columns.length} columns
          </p>
          <p className="mt-0.5 text-[11px] text-navy-500 sm:hidden">{domain?.label}</p>
        </div>
        <span className="hidden shrink-0 text-[11px] text-navy-500 sm:block">{domain?.label}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-navy-800/10 p-3">
          <ul className="divide-y divide-navy-800/5 text-xs sm:hidden">
            {table.columns.map((c) => (
              <li key={c.name} className="py-1.5">
                <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 font-mono break-all text-navy-900">{c.name}</span>
                  <span className="text-navy-600">
                    {c.type}
                    {c.pk && ' · PK'}
                    {c.ref && ' · FK'}
                  </span>
                </p>
                {(c.ref || c.name === 'tenant_id') && (
                  <p className="mt-0.5 text-navy-700">
                    →{' '}
                    {c.ref ? (
                      <button type="button" onClick={() => onTable(c.ref!)} className="cursor-pointer font-mono font-semibold break-all text-brand-600 hover:underline">
                        {c.ref}
                      </button>
                    ) : (
                      <span className="text-navy-500">organisations (tenant key)</span>
                    )}
                    {c.optional && <span className="text-navy-500"> · optional</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="scroll-x hidden sm:block">
            <table className="w-full min-w-[26rem] text-left text-xs">
              <thead className="text-[11px] text-navy-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Column</th>
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 pr-3 font-medium">Key</th>
                  <th className="py-1 font-medium">References</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {table.columns.map((c) => (
                  <tr key={c.name}>
                    <td className="py-1.5 pr-3 font-mono text-navy-900">{c.name}</td>
                    <td className="py-1.5 pr-3 text-navy-700">{c.type}</td>
                    <td className="py-1.5 pr-3 text-navy-700">{[c.pk ? 'PK' : null, c.ref ? 'FK' : null].filter(Boolean).join(', ')}</td>
                    <td className="py-1.5 text-navy-700">
                      {c.ref ? (
                        <button type="button" onClick={() => onTable(c.ref!)} className="cursor-pointer font-mono font-semibold text-brand-600 hover:underline">
                          {c.ref}
                        </button>
                      ) : c.name === 'tenant_id' ? (
                        <span className="text-navy-500">organisations (tenant key)</span>
                      ) : null}
                      {c.optional && <span className="text-navy-500"> · optional</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SectionTitle>Referenced by</SectionTitle>
              {incoming.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {incoming.map((n) => (
                    <Chip key={n} onClick={() => onTable(n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-navy-600">No other table references it.</p>
              )}
            </div>
            <div>
              <SectionTitle>Reached by Edge Functions</SectionTitle>
              {functions.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {functions.map((f) => (
                    <Chip key={f.slug} onClick={() => onFunction(f.slug)}>
                      {f.slug}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-navy-600">Read and written by the app under row-level security only.</p>
              )}
            </div>
          </div>

          <p className="text-[11px] text-navy-600">
            {inTarget ? (
              <>
                Also in the target schema.{' '}
                <button type="button" className="cursor-pointer font-semibold text-brand-600 hover:underline" onClick={() => onPlanned(table.name)}>
                  Compare with the target table
                </button>
              </>
            ) : (
              `Not in the target schema: it becomes ${table.successor}.`
            )}
          </p>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- Edge Functions

const METHOD_TONE = { GET: 'info', POST: 'accent', ALL: 'neutral' } as const

export function FunctionsView({ cat, onTable }: { cat: SystemsCatalogue; onTable: (t: string) => void }) {
  const [item] = useFocusedItem()
  const [copied, copy] = useCopy()
  const fns = cat.live.edge_functions
  const active = fns.filter((f) => f.status === 'active')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Deployed" value={fns.length} hint={`${active.length} active`} />
        <Kpi label="Routes" value={active.reduce((n, f) => n + f.routes.length, 0)} />
        <Kpi label="Database functions called" value={new Set(fns.flatMap((f) => f.db_functions)).size} />
        <Kpi label="Tables reached" value={new Set(fns.flatMap((f) => f.tables)).size} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-xl text-xs text-navy-600">How screens reach the database through Edge Functions. Every function runs as the caller, so row-level security applies.</p>
        <Button size="sm" variant="outline" onClick={() => void copy(cat.live.edge_flow)}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy Mermaid source'}
        </Button>
      </div>
      <ErdDiagram source={cat.live.edge_flow} names={[]} label="Edge Functions in the bcovered project" />

      <ul className="space-y-3">
        {fns.map((f) => (
          <FunctionCard key={f.slug} fn={f} focused={item === f.slug} onTable={onTable} />
        ))}
      </ul>
    </div>
  )
}

function FunctionCard({ fn, focused, onTable }: { fn: EdgeFunctionInfo; focused: boolean; onTable: (t: string) => void }) {
  const [showFns, setShowFns] = useState(false)
  return (
    <li data-item={fn.slug} className={cn('rounded-xl border border-navy-800/10 bg-white p-3', fn.status === 'disabled' && 'bg-navy-50/60', focusRing(focused))}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-navy-900">
            <Zap className="h-4 w-4 text-navy-500" /> {fn.slug}
            <Badge tone={fn.status === 'active' ? 'success' : 'warning'}>{fn.status === 'active' ? 'Active' : 'Disabled'}</Badge>
            <Badge tone="neutral">v{fn.version}</Badge>
            <Badge tone={fn.verify_jwt ? 'info' : 'neutral'}>{fn.verify_jwt ? 'JWT checked by Supabase' : 'Checks the user itself'}</Badge>
          </p>
          <p className="mt-0.5 font-mono text-[11px] break-all text-navy-600">{fn.source ?? 'Deployed only · no source in this repo'}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-navy-700">{fn.summary}</p>

      <ul className="mt-3 divide-y divide-navy-800/5 text-xs sm:hidden">
        {fn.routes.map((r) => (
          <li key={`${r.method} ${r.path}`} className="py-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone={METHOD_TONE[r.method]}>{r.method}</Badge>
              <span className="min-w-0 font-mono break-all text-navy-900">
                /{fn.slug}
                {r.path === '/' ? '' : r.path}
              </span>
              <span className="text-[11px] text-navy-500">{r.access === 'public' ? 'Public' : 'Signed in'}</span>
            </p>
            <p className="mt-1 text-navy-700">{r.summary}</p>
          </li>
        ))}
      </ul>

      <div className="scroll-x mt-3 hidden sm:block">
        <table className="w-full min-w-[26rem] text-left text-xs">
          <thead className="text-[11px] text-navy-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Route</th>
              <th className="py-1 pr-3 font-medium">Access</th>
              <th className="py-1 font-medium">Does</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/5">
            {fn.routes.map((r) => (
              <tr key={`${r.method} ${r.path}`}>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <Badge tone={METHOD_TONE[r.method]}>{r.method}</Badge> <span className="font-mono text-navy-900">/{fn.slug}{r.path === '/' ? '' : r.path}</span>
                </td>
                <td className="py-1.5 pr-3 text-navy-700">{r.access === 'public' ? 'Public' : 'Signed in'}</td>
                <td className="py-1.5 text-navy-700">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <SectionTitle>Tables reached</SectionTitle>
          {fn.tables.length ? (
            <div className="flex flex-wrap gap-1.5">
              {fn.tables.map((t) => (
                <Chip key={t} onClick={() => onTable(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-xs text-navy-600">None.</p>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <SectionTitle>Called from</SectionTitle>
            {fn.callers.length ? (
              <ul className="space-y-1 text-xs">
                {fn.callers.map((c) => (
                  <li key={c.label} className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                    {hasParams(c.route) ? (
                      <span className="font-mono break-all text-navy-700">{c.route}</span>
                    ) : (
                      <Link to={c.route} className="font-mono font-semibold break-all text-brand-600 hover:underline">
                        {c.route}
                      </Link>
                    )}
                    <span className="min-w-0 text-navy-600 sm:truncate">{c.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-navy-600">Nothing in the app calls it.</p>
            )}
          </div>
          {(fn.calls.length > 0 || fn.external.length > 0) && (
            <div>
              <SectionTitle>Calls</SectionTitle>
              <p className="text-xs text-navy-700">{[...fn.calls, ...fn.external].join(' · ')}</p>
            </div>
          )}
          {fn.secrets.length > 0 && (
            <div>
              <SectionTitle>Secrets (names only)</SectionTitle>
              <ul className="space-y-0.5 text-xs text-navy-700">
                {fn.secrets.map((s) => (
                  <li key={s} className="flex items-center gap-1.5 font-mono break-all">
                    <KeyRound className="h-3 w-3 shrink-0 text-navy-400" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {fn.db_functions.length > 0 && (
        <div className="mt-3">
          <button type="button" className="cursor-pointer text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowFns((s) => !s)} aria-expanded={showFns}>
            {showFns ? 'Hide' : 'Show'} {fn.db_functions.length} database functions
          </button>
          {showFns && <p className="mt-1 font-mono text-[11px] leading-relaxed break-words text-navy-700">{fn.db_functions.join(' · ')}</p>}
        </div>
      )}

      {fn.note && <p className="mt-3 rounded-lg bg-mist p-2 text-xs text-navy-700">{fn.note}</p>}
    </li>
  )
}
