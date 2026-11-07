import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Copy, Database, ShieldAlert } from 'lucide-react'
import type { DatabaseView, SystemsCatalogue } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DomainKey, PlannedTable } from '@/server/systems/plannedSchema'
import { AREA_LABEL, type Screen, type ScreenArea } from '@/server/systems/screens'
import { cn } from '@/lib/utils'
import { ErdDiagram } from './ErdDiagram'
import { Chip, Kpi, SectionTitle, TableStatus, focusRing, hasParams, useFocusedItem } from './shared'

const STORAGE_LABEL: Record<Screen['current'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  service_layer: { label: 'Demo tables', tone: 'success' },
  browser_storage: { label: 'Browser storage only', tone: 'warning' },
  not_stored: { label: 'Not stored', tone: 'danger' },
  static_content: { label: 'Content in code', tone: 'neutral' },
}

export function DatabaseTab({ cat }: { cat: SystemsCatalogue }) {
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as DatabaseView | null) ?? 'erd'
  const domain = (params.get('domain') as DomainKey | 'all' | null) ?? 'twin'

  const go = (next: Partial<{ view: DatabaseView; domain: string; item: string | null }>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }
  const openTable = (name: string) => go({ view: 'tables', item: name })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          <strong>Target schema, not applied.</strong> The dedicated insureflow-dev instance has not been created, so nothing here exists in a database yet.
          The app still runs on the in-browser demo tables.{' '}
          <button type="button" className="cursor-pointer font-semibold underline" onClick={() => go({ view: 'plan', item: null })}>
            See the plan
          </button>
        </p>
      </div>

      <Tabs value={view} onValueChange={(v) => go({ view: v as DatabaseView, item: null })}>
        <TabsList>
          <TabsTrigger value="erd">ERD</TabsTrigger>
          <TabsTrigger value="tables">Tables ({cat.summary.planned_tables})</TabsTrigger>
          <TabsTrigger value="screens">Screens → tables</TabsTrigger>
          <TabsTrigger value="plan">Plan & instance</TabsTrigger>
        </TabsList>
        <TabsContent value="erd" className="mt-4">
          <ErdView cat={cat} domain={domain} onDomain={(d) => go({ domain: d })} onTable={openTable} />
        </TabsContent>
        <TabsContent value="tables" className="mt-4">
          <TablesView cat={cat} onTable={openTable} />
        </TabsContent>
        <TabsContent value="screens" className="mt-4">
          <ScreensView cat={cat} onTable={openTable} />
        </TabsContent>
        <TabsContent value="plan" className="mt-4">
          <PlanView cat={cat} onTable={openTable} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------- ERD

function ErdView({ cat, domain, onDomain, onTable }: { cat: SystemsCatalogue; domain: DomainKey | 'all'; onDomain: (d: string) => void; onTable: (t: string) => void }) {
  const [copied, setCopied] = useState(false)
  const d = cat.schema.domains.find((x) => x.key === domain)
  const source = cat.schema.erd[domain]
  const names = useMemo(() => cat.schema.tables.map((t) => t.name), [cat.schema.tables])
  const count = domain === 'all' ? cat.schema.tables.length : cat.schema.tables.filter((t) => t.domain === domain).length

  const copy = async () => {
    await navigator.clipboard?.writeText(source)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-3">
      <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap">
        {cat.schema.domains.map((x) => (
          <Chip key={x.key} active={x.key === domain} onClick={() => onDomain(x.key)}>
            {x.label}
          </Chip>
        ))}
        <Chip active={domain === 'all'} onClick={() => onDomain('all')}>
          All {cat.schema.tables.length} tables
        </Chip>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-xl text-xs text-navy-600">
          <strong className="text-navy-800">{d?.label ?? 'Full schema'}</strong> · {count} tables. {d?.summary ?? 'Every area together; large, so zoom out to see it all.'} Tables from
          other areas appear without columns. Click a table to open its detail.
        </p>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy Mermaid source'}
        </Button>
      </div>
      <ErdDiagram source={source} names={names} onSelect={onTable} label={`${d?.label ?? 'Full schema'} entity relationship diagram`} />
      <p className="text-[11px] text-navy-600">
        Lines read “one parent row to many child rows”, labelled with the foreign key column; a circle at the parent end means the reference is optional. Every
        tenant table also carries tenant_id → organisations with tenant-safe composite keys; those lines are not drawn.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- tables

function TablesView({ cat, onTable }: { cat: SystemsCatalogue; onTable: (t: string) => void }) {
  const [item, setItem] = useFocusedItem()
  const [domain, setDomain] = useState<DomainKey | 'all'>('all')
  const [status, setStatus] = useState<PlannedTable['status'] | 'all'>('all')
  const [query, setQuery] = useState('')

  const focusedDomain = cat.schema.tables.find((t) => t.name === item)?.domain
  const effectiveDomain = item && focusedDomain && domain !== 'all' && domain !== focusedDomain ? focusedDomain : domain
  const rows = cat.schema.tables.filter(
    (t) =>
      (effectiveDomain === 'all' || t.domain === effectiveDomain) &&
      (status === 'all' || t.status === status) &&
      (!query || t.name.includes(query.toLowerCase()) || t.purpose.toLowerCase().includes(query.toLowerCase())),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="sys-table-search">
          Search tables
        </label>
        <input id="sys-table-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tables or purpose" className="field py-2 sm:max-w-xs" />
        <label className="sr-only" htmlFor="sys-table-status">
          Status
        </label>
        <select id="sys-table-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="field py-2 sm:w-44">
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="reshaped">Reshaped</option>
          <option value="carried">Carried over</option>
        </select>
      </div>
      <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap">
        <Chip active={effectiveDomain === 'all'} onClick={() => setDomain('all')}>
          All areas
        </Chip>
        {cat.schema.domains.map((x) => (
          <Chip key={x.key} active={effectiveDomain === x.key} onClick={() => setDomain(x.key)}>
            {x.label}
          </Chip>
        ))}
      </div>
      <p className="text-[11px] text-navy-600">{rows.length} tables</p>
      <ul className="space-y-2">
        {rows.map((t) => (
          <TableCard key={t.name} table={t} cat={cat} open={item === t.name} onToggle={() => setItem(item === t.name ? null : t.name)} onTable={onTable} />
        ))}
      </ul>
    </div>
  )
}

function TableCard({
  table,
  cat,
  open,
  onToggle,
  onTable,
}: {
  table: PlannedTable
  cat: SystemsCatalogue
  open: boolean
  onToggle: () => void
  onTable: (t: string) => void
}) {
  const incoming = [...new Set(cat.schema.relationships.filter((r) => r.to === table.name).map((r) => r.from))]
  const screens = cat.screens.filter((s) => s.tables.includes(table.name))
  const demo = cat.demo_tables.filter((d) => d.planned === table.name)
  const domain = cat.schema.domains.find((d) => d.key === table.domain)

  return (
    <li data-item={table.name} className={cn('rounded-xl border border-navy-800/10 bg-white transition', focusRing(open))}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-start justify-between gap-3 p-3 text-left">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-navy-900">
            {table.name}
            <TableStatus status={table.status} />
            <Badge tone="neutral">{table.scope === 'tenant' ? 'Per tenant' : 'Platform-wide'}</Badge>
          </p>
          <p className="mt-0.5 text-xs text-navy-600">{table.purpose}</p>
        </div>
        <span className="shrink-0 text-[11px] text-navy-500">{domain?.label}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-navy-800/10 p-3">
          <div className="scroll-x">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="text-[11px] text-navy-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Column</th>
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 pr-3 font-medium">Key</th>
                  <th className="py-1 font-medium">References / note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {table.scope === 'tenant' && (
                  <tr className="text-navy-500">
                    <td className="py-1.5 pr-3 font-mono">tenant_id</td>
                    <td className="py-1.5 pr-3">uuid</td>
                    <td className="py-1.5 pr-3">FK</td>
                    <td className="py-1.5">organisations (every tenant table)</td>
                  </tr>
                )}
                {table.columns.map((c) => (
                  <tr key={c.name}>
                    <td className="py-1.5 pr-3 font-mono text-navy-900">{c.name}</td>
                    <td className="py-1.5 pr-3 text-navy-700">{c.type}</td>
                    <td className="py-1.5 pr-3 text-navy-700">{c.key ?? ''}</td>
                    <td className="py-1.5 text-navy-700">
                      {c.ref && (
                        <button type="button" onClick={() => onTable(c.ref!)} className="cursor-pointer font-mono font-semibold text-brand-600 hover:underline">
                          {c.ref}
                        </button>
                      )}
                      {c.ref && (c.optional || c.note) && ' · '}
                      {[c.optional ? 'optional' : null, c.note].filter(Boolean).join(' · ')}
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
              <SectionTitle>Used on screens</SectionTitle>
              {screens.length ? (
                <ul className="space-y-1 text-xs">
                  {screens.map((s) => (
                    <li key={s.route} className="flex items-center gap-2">
                      {hasParams(s.route) ? <span className="font-mono text-navy-700">{s.route}</span> : <Link to={s.route} className="font-mono font-semibold text-brand-600 hover:underline">{s.route}</Link>}
                      <span className="truncate text-navy-600">{s.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-navy-600">Not read directly by a screen.</p>
              )}
            </div>
          </div>

          {(table.changes?.length || table.replaces?.length) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {table.changes?.length ? (
                <div>
                  <SectionTitle>Changes from migrations 0001–0003</SectionTitle>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-navy-700">
                    {table.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {table.replaces?.length ? (
                <div>
                  <SectionTitle>Replaces</SectionTitle>
                  <ul className="list-disc space-y-0.5 pl-4 font-mono text-xs text-navy-700">
                    {table.replaces.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <p className="text-[11px] text-navy-600">
            {demo.length
              ? `In the demo today: ${demo.map((d) => `${d.name} (${d.rows} rows)`).join(', ')}.`
              : 'No demo table yet: this table arrives with the normalised baseline.'}
          </p>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- screens

function ScreensView({ cat, onTable }: { cat: SystemsCatalogue; onTable: (t: string) => void }) {
  const [item] = useFocusedItem()
  const [gapsOnly, setGapsOnly] = useState(false)
  const areas = Object.keys(AREA_LABEL) as ScreenArea[]
  const gaps = cat.screens.filter((s) => s.gap)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Routes mapped" value={cat.screens.length} />
        <Kpi label="Using demo tables" value={cat.screens.filter((s) => s.current === 'service_layer').length} />
        <Kpi label="Content in code" value={cat.screens.filter((s) => s.current === 'static_content').length} />
        <Kpi label="Gaps to close" value={gaps.length} tone={gaps.length ? 'warning' : undefined} />
      </div>
      <label className="flex items-center gap-2 text-xs text-navy-700">
        <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} /> Show only screens with gaps
      </label>
      {areas.map((area) => {
        const rows = cat.screens.filter((s) => s.area === area && (!gapsOnly || s.gap))
        if (!rows.length) return null
        return (
          <section key={area}>
            <SectionTitle>{AREA_LABEL[area]}</SectionTitle>
            <ul className="space-y-2">
              {rows.map((s) => (
                <li key={s.route} data-item={s.route} className={cn('rounded-xl border border-navy-800/10 bg-white p-3', focusRing(item === s.route))}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900">{s.label}</p>
                      <p className="font-mono text-[11px] text-navy-600">
                        {hasParams(s.route) ? s.route : <Link to={s.route} className="text-brand-600 hover:underline">{s.route}</Link>}
                        {' · '}
                        {s.roles.length ? s.roles.join(', ') : 'anyone'}
                      </p>
                    </div>
                    <Badge tone={STORAGE_LABEL[s.current].tone}>{STORAGE_LABEL[s.current].label}</Badge>
                  </div>
                  {s.gap && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.gap}
                    </p>
                  )}
                  {s.tables.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.tables.map((t) => (
                        <Chip key={t} onClick={() => onTable(t)}>
                          {t}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-navy-600">No tables needed. Content: {s.content}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- plan

function PlanView({ cat, onTable }: { cat: SystemsCatalogue; onTable: (t: string) => void }) {
  const s = cat.summary
  const instances = cat.components.filter((c) => c.kind === 'database')
  const unmapped = cat.demo_tables.filter((d) => !d.planned)
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Database instances</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-3">
          {instances.map((c) => (
            <li key={c.key} className="rounded-xl border border-navy-800/10 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                <Database className="h-4 w-4 text-navy-500" /> {c.name}
              </p>
              <p className="mt-1 text-xs text-navy-600">{c.summary}</p>
              <p className="mt-2 text-[11px] font-semibold text-navy-700">{c.status === 'planned' ? 'Not created yet' : 'Running in this browser'}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Create the separate instance</SectionTitle>
        <ol className="space-y-1.5 text-xs text-navy-800">
          {cat.instance_steps.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-700">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionTitle>Decisions</SectionTitle>
        <ul className="space-y-2">
          {cat.decisions.map((d) => (
            <li key={d.title} className="rounded-xl border border-navy-800/10 bg-white p-3">
              <p className="text-sm font-semibold text-navy-900">{d.title}</p>
              <p className="mt-0.5 text-xs text-navy-600">{d.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Normalised target</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kpi label="Tables" value={s.planned_tables} />
          <Kpi label="New" value={s.new_tables} />
          <Kpi label="Reshaped" value={s.reshaped_tables} />
          <Kpi label="Carried over" value={s.carried_tables} />
          <Kpi label="Relationships" value={s.relationships} />
        </div>
      </section>

      <section>
        <SectionTitle>Merged or renamed</SectionTitle>
        <ul className="space-y-1.5 text-xs">
          {cat.schema.removed.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-navy-700 line-through">{r.name}</span>
              <ArrowRight className="h-3 w-3 text-navy-400" />
              <button type="button" onClick={() => onTable(r.successor)} className="cursor-pointer font-mono font-semibold text-brand-600 hover:underline">
                {r.successor}
              </button>
              <span className="text-navy-600">{r.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Current demo tables and where they go</SectionTitle>
        <div className="scroll-x">
          <table className="w-full min-w-[26rem] text-left text-xs">
            <thead className="text-[11px] text-navy-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Demo table</th>
                <th className="py-1 pr-3 font-medium">Rows</th>
                <th className="py-1 font-medium">Target table</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {cat.demo_tables.map((d) => (
                <tr key={d.name}>
                  <td className="py-1.5 pr-3 font-mono text-navy-800">{d.name}</td>
                  <td className="py-1.5 pr-3 text-navy-700 tabular-nums">{d.rows}</td>
                  <td className="py-1.5">
                    {d.planned ? (
                      <button type="button" onClick={() => onTable(d.planned!)} className="cursor-pointer font-mono font-semibold text-brand-600 hover:underline">
                        {d.planned}
                      </button>
                    ) : (
                      <span className="text-red-700">No target</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unmapped.length > 0 && <p className="mt-2 text-xs text-red-700">{unmapped.length} demo tables have no target table.</p>}
      </section>

      <section className="rounded-xl border border-navy-800/10 bg-mist p-3 text-xs text-navy-700">
        <p className="font-semibold text-navy-900">Migration files today (not applied)</p>
        <ul className="mt-1 list-disc pl-4 font-mono">
          <li>supabase/migrations/20261106_0001_insureflow_core.sql</li>
          <li>supabase/migrations/20261106_0002_commercial_core.sql</li>
          <li>supabase/migrations/20261107_0003_risk_twin_v2.sql</li>
        </ul>
        <p className="mt-1">These are archived and replaced by the normalised baseline once insureflow-dev exists.</p>
      </section>
    </div>
  )
}
