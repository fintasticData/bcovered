import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, KeyRound } from 'lucide-react'
import type { SystemsCatalogue } from '@/api/client'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { KIND_LABEL, TARGET_LABEL, type ComponentKind, type EndpointTarget, type SystemComponent } from '@/server/systems/components'
import { AREA_LABEL, type ScreenArea } from '@/server/systems/screens'
import { cn, formatDateTime } from '@/lib/utils'
import { Chip, ComponentStatus, Kpi, SectionTitle, focusHref, focusRing, hasParams, useFocusedItem } from './shared'

// ---------------------------------------------------------------- overview

export function OverviewTab({ cat }: { cat: SystemsCatalogue }) {
  const s = cat.summary
  const kinds = [...new Set(cat.components.map((c) => c.kind))] as ComponentKind[]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Planned tables" value={s.planned_tables} hint={`${s.new_tables} new · ${s.reshaped_tables} reshaped`} />
        <Kpi label="Screens without tables" value={s.screen_gaps} hint={`of ${s.screens} routes`} tone={s.screen_gaps ? 'warning' : undefined} />
        <Kpi label="Endpoints" value={s.endpoints} hint="in src/api/client.ts" />
        <Kpi label="Agents and copilots" value={s.agents} hint={`${s.tools} tools · ${s.workflows} workflows`} />
        <Kpi label="Active jobs" value={s.active_jobs} />
        <Kpi label="Failed jobs" value={s.failed_jobs} tone={s.failed_jobs ? 'danger' : undefined} />
        <Kpi label="Database instance" value="Not created" hint="insureflow-dev" tone="warning" />
        <Kpi label="Mode" value="Demo" hint="in-browser service layer" />
      </div>

      <section className="rounded-xl border border-navy-800/10 bg-mist p-3">
        <SectionTitle>Next steps</SectionTitle>
        <ol className="space-y-1.5 text-xs text-navy-800">
          <li>
            1. Create insureflow-dev and connect it in Cursor.{' '}
            <Link to={focusHref({ tab: 'database', view: 'plan' })} className="font-semibold text-brand-600">
              Instance steps
            </Link>
          </li>
          <li>
            2. Close the {s.screen_gaps} screen gaps (claims, quick quote, contact).{' '}
            <Link to={focusHref({ tab: 'database', view: 'screens' })} className="font-semibold text-brand-600">
              Screens → tables
            </Link>
          </li>
          <li>
            3. Apply the normalised baseline and seed reference data from the code registries.{' '}
            <Link to={focusHref({ tab: 'database', view: 'erd', domain: 'all' })} className="font-semibold text-brand-600">
              Full ERD
            </Link>
          </li>
          <li>4. Move reads to Supabase, consequential writes to database functions, agents and LLM calls to Edge Functions.</li>
        </ol>
      </section>

      {kinds.map((k) => (
        <section key={k}>
          <SectionTitle>{KIND_LABEL[k]}</SectionTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {cat.components
              .filter((c) => c.kind === k)
              .map((c) => (
                <ComponentCard key={c.key} c={c} all={cat.components} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ComponentCard({ c, all, active }: { c: SystemComponent; all: SystemComponent[]; active?: boolean }) {
  const deps = c.dependsOn.map((d) => all.find((x) => x.key === d)?.name ?? d)
  return (
    <li data-item={c.key} className={cn('rounded-xl border border-navy-800/10 bg-white p-3', focusRing(Boolean(active)))}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-navy-900">{c.name}</p>
        <ComponentStatus status={c.status} />
      </div>
      <p className="mt-0.5 text-xs text-navy-600">{c.summary}</p>
      <p className="mt-2 font-mono text-[11px] text-navy-500">{c.location}</p>
      {deps.length > 0 && <p className="mt-1 text-[11px] text-navy-600">Depends on: {deps.join(', ')}</p>}
      {c.secretRef && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-navy-600">
          <KeyRound className="h-3 w-3" /> Secret name: <span className="font-mono">{c.secretRef}</span>
        </p>
      )}
      {c.nextStep && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-navy-700">
          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" /> {c.nextStep}
        </p>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- frontend

const STORAGE_TEXT = {
  service_layer: 'Demo tables',
  browser_storage: 'Browser storage only',
  not_stored: 'Not stored',
  static_content: 'Content in code',
} as const

export function FrontendTab({ cat }: { cat: SystemsCatalogue }) {
  const [item] = useFocusedItem()
  const web = cat.components.find((c) => c.key === 'web')!
  const areas = Object.keys(AREA_LABEL) as ScreenArea[]
  return (
    <div className="space-y-5">
      <ul>
        <ComponentCard c={web} all={cat.components} />
      </ul>
      {areas.map((area) => (
        <section key={area}>
          <SectionTitle>{AREA_LABEL[area]}</SectionTitle>
          <div className="scroll-x rounded-xl border border-navy-800/10 bg-white">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-mist text-[11px] text-navy-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Route</th>
                  <th className="px-3 py-2 font-medium">Screen</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">Data today</th>
                  <th className="px-3 py-2 font-medium">Tables</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {cat.screens
                  .filter((s) => s.area === area)
                  .map((s) => (
                    <tr key={s.route} data-item={s.route} className={cn(item === s.route && 'bg-brand-50')}>
                      <td className="px-3 py-2 font-mono">
                        {hasParams(s.route) ? <span className="text-navy-700">{s.route}</span> : <Link to={s.route} className="font-semibold text-brand-600 hover:underline">{s.route}</Link>}
                      </td>
                      <td className="px-3 py-2 text-navy-800">{s.label}</td>
                      <td className="px-3 py-2 text-navy-600">{s.roles.length ? s.roles.join(', ') : 'anyone'}</td>
                      <td className={cn('px-3 py-2', s.gap ? 'font-semibold text-amber-800' : 'text-navy-600')}>{STORAGE_TEXT[s.current]}</td>
                      <td className="px-3 py-2">
                        <Link to={focusHref({ tab: 'database', view: 'screens', item: s.route })} className="font-semibold text-brand-600 hover:underline">
                          {s.tables.length}
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- backend

export function BackendTab({ cat }: { cat: SystemsCatalogue }) {
  const [target, setTarget] = useState<EndpointTarget | 'all'>('all')
  const backends = cat.components.filter((c) => c.kind === 'backend' || c.kind === 'jobs' || c.kind === 'realtime')
  const rows = cat.endpoints.filter((e) => target === 'all' || e.target === target)
  const targets = Object.keys(TARGET_LABEL) as EndpointTarget[]
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Services</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {backends.map((c) => (
            <ComponentCard key={c.key} c={c} all={cat.components} />
          ))}
        </ul>
      </section>
      <section>
        <SectionTitle>Endpoints ({cat.endpoints.length})</SectionTitle>
        <p className="mb-2 text-xs text-navy-600">
          Every call the UI makes goes through <span className="font-mono">src/api/client.ts</span>. “Moves to” shows where each lands once the frontend reads
          Supabase directly.
        </p>
        <div className="scroll-x -mx-1 mb-2 flex gap-1.5 px-1 pb-1 sm:flex-wrap">
          <Chip active={target === 'all'} onClick={() => setTarget('all')}>
            All
          </Chip>
          {targets.map((t) => (
            <Chip key={t} active={target === t} onClick={() => setTarget(t)}>
              {TARGET_LABEL[t]} ({cat.endpoints.filter((e) => e.target === t).length})
            </Chip>
          ))}
        </div>
        <div className="scroll-x rounded-xl border border-navy-800/10 bg-white">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="bg-mist text-[11px] text-navy-500">
              <tr>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Path (/api/v1)</th>
                <th className="px-3 py-2 font-medium">What it does</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Moves to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {rows.map((e) => (
                <tr key={e.client}>
                  <td className="px-3 py-2 font-mono font-semibold text-navy-700">{e.method}</td>
                  <td className="px-3 py-2 font-mono text-navy-800">
                    {e.path}
                    <span className="block text-[10px] text-navy-500">api.{e.client}</span>
                  </td>
                  <td className="px-3 py-2 text-navy-700">{e.summary}</td>
                  <td className="px-3 py-2 text-navy-600">{e.minRole}</td>
                  <td className="px-3 py-2 text-navy-600">{TARGET_LABEL[e.target]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- integrations

export function IntegrationsTab({ cat }: { cat: SystemsCatalogue }) {
  const [item] = useFocusedItem()
  const items = cat.components.filter((c) => c.kind === 'external_api' || c.kind === 'storage' || c.kind === 'database')
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Services and connections</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((c) => (
            <ComponentCard key={c.key} c={c} all={cat.components} active={item === c.key} />
          ))}
        </ul>
      </section>
      <section>
        <SectionTitle>Assistant adapters</SectionTitle>
        <ul className="space-y-2">
          {cat.adapters.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-navy-800/10 bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-navy-900">{a.label}</p>
                {a.reason && <p className="mt-0.5 text-xs text-navy-600">{a.reason}</p>}
              </div>
              <Badge tone={a.available ? 'success' : 'warning'}>{a.available ? 'In use' : 'Unavailable'}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-[11px] text-navy-600">Only secret names are shown here. Keys live in the environment or Supabase secrets and never reach the browser.</p>
    </div>
  )
}

// ---------------------------------------------------------------- agents

const KIND_TONE = { assistant: 'info', copilot: 'accent', agent: 'neutral', engine: 'warning' } as const

export function AgentsTab({ cat }: { cat: SystemsCatalogue }) {
  const [item, setItem] = useFocusedItem()
  const [toolQuery, setToolQuery] = useState('')
  const tools = cat.tools.filter((t) => !toolQuery || t.name.includes(toolQuery.toLowerCase()) || t.description.toLowerCase().includes(toolQuery.toLowerCase()))
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Where you talk to them</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {cat.surfaces.map((s) => (
            <li key={s.name} className="rounded-xl border border-navy-800/10 bg-white p-3">
              <p className="text-sm font-semibold text-navy-900">{s.name}</p>
              <p className="mt-0.5 text-xs text-navy-600">{s.audience}</p>
              <Link to={s.route} className="mt-1 inline-block font-mono text-[11px] font-semibold text-brand-600 hover:underline">
                {s.route}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Agents, copilots and engines ({cat.agents.length})</SectionTitle>
        <ul className="space-y-2">
          {cat.agents.map((a) => (
            <li key={a.key} data-item={a.key} className={cn('rounded-xl border border-navy-800/10 bg-white p-3', focusRing(item === a.key))}>
              <button type="button" onClick={() => setItem(item === a.key ? null : a.key)} aria-expanded={item === a.key} className="flex w-full cursor-pointer items-start justify-between gap-3 text-left">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
                    {a.label} <Badge tone={KIND_TONE[a.kind]}>{humanise(a.kind)}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-navy-600">{a.role}</p>
                </div>
                <span className="shrink-0 text-right text-[11px] text-navy-600">
                  {a.runs} runs
                  {a.failed_runs > 0 && <span className="block font-semibold text-red-700">{a.failed_runs} failed</span>}
                </span>
              </button>
              {item === a.key && (
                <div className="mt-3 grid gap-4 border-t border-navy-800/10 pt-3 sm:grid-cols-2">
                  <div>
                    <SectionTitle>Workflow steps it owns</SectionTitle>
                    {a.steps.length ? (
                      <ul className="space-y-1 text-xs text-navy-700">
                        {a.steps.map((s) => (
                          <li key={`${s.workflow}-${s.step}`}>
                            {s.name} <span className="text-navy-500">· {s.workflow_title}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-navy-600">None. It works in conversations.</p>
                    )}
                  </div>
                  <div>
                    <SectionTitle>Tools it has called here</SectionTitle>
                    {a.tools_used.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {a.tools_used.map((t) => (
                          <Chip key={t} onClick={() => setItem(`tool:${t}`)}>
                            {t}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-navy-600">No tool calls recorded in this browser yet.</p>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle
          action={
            <>
              <label className="sr-only" htmlFor="sys-tool-search">
                Search tools
              </label>
              <input id="sys-tool-search" value={toolQuery} onChange={(e) => setToolQuery(e.target.value)} placeholder="Search tools" className="field w-44 py-1.5 text-xs" />
            </>
          }
        >
          Tools ({cat.tools.length})
        </SectionTitle>
        <div className="scroll-x rounded-xl border border-navy-800/10 bg-white">
          <table className="w-full min-w-[38rem] text-left text-xs">
            <thead className="bg-mist text-[11px] text-navy-500">
              <tr>
                <th className="px-3 py-2 font-medium">Tool</th>
                <th className="px-3 py-2 font-medium">Changes data</th>
                <th className="px-3 py-2 font-medium">Allowed for</th>
                <th className="px-3 py-2 font-medium">Calls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {tools.map((t) => (
                <tr key={t.name} data-item={`tool:${t.name}`} className={cn(item === `tool:${t.name}` && 'bg-brand-50')}>
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold text-navy-900">{t.name}</span>
                    <span className="block text-navy-600">{t.description}</span>
                  </td>
                  <td className="px-3 py-2 text-navy-700">{t.side_effect ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-navy-600">{t.allow.join(', ')}</td>
                  <td className="px-3 py-2 text-navy-700 tabular-nums">
                    {t.calls}
                    {(t.errors > 0 || t.blocked > 0) && (
                      <span className="block text-[10px] text-amber-800">
                        {t.errors} errors · {t.blocked} blocked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- workflows

export function WorkflowsTab({ cat }: { cat: SystemsCatalogue }) {
  const [item] = useFocusedItem()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-navy-600">
          {cat.summary.workflows} registered workflows · {cat.summary.active_jobs} active jobs · {cat.summary.failed_jobs} failed
        </p>
        <Link to="/broker/jobs" className="text-xs font-semibold text-brand-600">
          Open Tasks & Jobs to control jobs
        </Link>
      </div>
      <ul className="space-y-3">
        {cat.workflows.map((w) => (
          <li key={w.type} data-item={w.type} className={cn('rounded-xl border border-navy-800/10 bg-white p-3', focusRing(item === w.type))}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900">{w.title}</p>
                <p className="font-mono text-[11px] text-navy-500">{w.type}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(w.jobs_by_status).map(([status, n]) => (
                  <span key={status} className="flex items-center gap-1">
                    <StatusBadge status={status} />
                    <span className="text-[11px] text-navy-600 tabular-nums">{n}</span>
                  </span>
                ))}
                {!w.total_jobs && <span className="text-[11px] text-navy-500">No jobs yet</span>}
              </div>
            </div>
            <ol className="mt-3 space-y-1">
              {w.steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-700">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-navy-800">{s.name}</span>
                  <Link to={focusHref({ tab: 'agents', item: s.agent })} className="shrink-0 text-[11px] font-semibold text-brand-600 hover:underline">
                    {s.agent_label}
                  </Link>
                </li>
              ))}
            </ol>
            {w.restart_from && <p className="mt-2 text-[11px] text-navy-600">When a broker requests changes, the job restarts from “{w.steps.find((s) => s.key === w.restart_from)?.name ?? w.restart_from}”.</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- audit

export function AuditTab({ cat }: { cat: SystemsCatalogue }) {
  if (!cat.audit.length) return <p className="text-sm text-navy-600">No activity recorded in this browser yet. Run a scenario from Demo Studio.</p>
  return (
    <div className="space-y-2">
      <p className="text-xs text-navy-600">Latest {cat.audit.length} events in this browser, newest first.</p>
      <div className="scroll-x rounded-xl border border-navy-800/10 bg-white">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-mist text-[11px] text-navy-500">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Record</th>
              <th className="px-3 py-2 font-medium">Job</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/5">
            {cat.audit.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 whitespace-nowrap text-navy-600">{formatDateTime(e.created_at)}</td>
                <td className="px-3 py-2 text-navy-800">
                  {e.actor_label}
                  <span className="block text-[10px] text-navy-500">{e.actor_type}</span>
                </td>
                <td className="px-3 py-2 font-mono text-navy-800">{e.action}</td>
                <td className="px-3 py-2 font-mono text-navy-600">{e.entity_table ?? '–'}</td>
                <td className="px-3 py-2">
                  {e.job_id ? (
                    <Link to={`/broker/jobs/${e.job_id}`} className="font-semibold text-brand-600 hover:underline">
                      Open
                    </Link>
                  ) : (
                    '–'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
