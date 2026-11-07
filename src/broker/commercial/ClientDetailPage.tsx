import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, FileStack, Loader2, Network, Pencil, Sparkles, X } from 'lucide-react'
import type { BusinessDetail } from '@/api/client'
import { useCommercialClient, useUpdateCommercialClient, useUpdateTask } from '@/api/hooks'
import { AdviceNotice, ProvenanceBadge } from '@/components/commercial/badges'
import { BuildTwinButton } from '@/components/commercial/BuildTwinButton'
import { ExposureCard } from '@/components/commercial/ExposureCard'
import { RiskTwinMap } from '@/components/commercial/RiskTwinMap'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { FieldSource } from '@/server/db/commercialSchema'
import { compactRand } from '@/server/domain/commercial/format'
import { rand } from '@/lib/quote'
import { formatDate, formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState } from '../PageHeader'

export default function ClientDetailPage() {
  const { profileId } = useParams()
  const { data, isLoading, error } = useCommercialClient(profileId)
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Client not found'} /></div>
  const p = data.profile
  const name = p.trading_name ?? p.registered_name
  const sub = data.submissions[0]
  const sources = Object.values(p.field_sources).reduce<Record<string, number>>((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {})

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="panel flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{data.industry.name}</p>
          <h1 className="text-2xl font-semibold text-navy-900">{name}</h1>
          <p className="text-sm text-navy-600">
            {p.trading_name && p.trading_name !== p.registered_name ? `${p.registered_name} · ` : ''}
            {data.locations.length} location{data.locations.length === 1 ? '' : 's'} · {p.annual_turnover ? `${compactRand(p.annual_turnover)} declared turnover` : 'turnover missing'} ·
            broker {data.assigned_broker ?? 'unassigned'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            {(['verified', 'declared', 'extracted', 'inferred', 'missing'] as FieldSource[]).map((s) =>
              sources[s] ? (
                <span key={s} className="flex items-center gap-1 text-[11px] text-navy-600">
                  <ProvenanceBadge source={s} /> {sources[s]}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" size="sm" asChild>
            <Link to={`/broker/commercial/risk-twins/${p.id}`}>
              <Network /> Open Twin workspace
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/broker/commercial?prompt=${encodeURIComponent(`Review ${name} and identify outstanding insurance questions`)}`}>
              <Sparkles /> Review with Copilot
            </Link>
          </Button>
          {sub && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/broker/commercial/submissions/${sub.id}`}>
                <FileStack /> Submission pack
              </Link>
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue={data.risk_profile ? 'twin' : 'profile'}>
        <TabsList className="lg:flex-wrap">
          <TabsTrigger value="twin">Risk Twin</TabsTrigger>
          <TabsTrigger value="exposures">Exposures ({data.exposures.length})</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="sites">Locations and assets</TabsTrigger>
          <TabsTrigger value="tasks">Requests ({data.tasks.filter((t) => t.status === 'open').length})</TabsTrigger>
          <TabsTrigger value="history">Submissions and jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="twin" className="mt-4">
          {data.risk_profile ? (
            <section className="panel p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy-900">
                  Risk Twin v{data.risk_profile.version} · {data.risk_profile.node_count} records · {data.risk_profile.edge_count} relationships
                </p>
                <p className="text-xs text-navy-500">
                  {data.risk_profile.template_key.replace(/_/g, ' ')} template v{data.risk_profile.template_version} · built {formatDateTime(data.risk_profile.created_at)}
                </p>
              </div>
              <RiskTwinMap data={data} brokerName={data.assigned_broker} />
            </section>
          ) : (
            <EmptyState title="No Risk Twin yet">
              <p>Build one from the records already held for this client. No submission is drafted and nothing is sent to an insurer.</p>
              <div className="mt-3 flex justify-center">
                <BuildTwinButton
                  profileId={p.id}
                  activeJobId={data.jobs.find((j) => !['completed', 'failed', 'cancelled'].includes(j.status))?.id ?? null}
                  label="Build Risk Twin"
                />
              </div>
            </EmptyState>
          )}
        </TabsContent>

        <TabsContent value="exposures" className="mt-4 space-y-3">
          <AdviceNotice />
          {data.exposures.length ? (
            data.exposures.map((e) => (
              <ExposureCard
                key={e.id}
                exposure={e}
                brokerName={data.assigned_broker}
                locationNames={Object.fromEntries(data.locations.map((l) => [l.id, l.suburb ?? l.name]))}
              />
            ))
          ) : (
            <EmptyState title="No exposures assessed yet" />
          )}
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <ProfileEditor data={data} />
        </TabsContent>

        <TabsContent value="sites" className="mt-4 space-y-4">
          {data.locations.map((l) => (
            <section key={l.id} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-navy-900">{l.name}</p>
                <ProvenanceBadge source={l.source} />
              </div>
              <p className="text-xs text-navy-600">
                {[l.suburb, l.city, l.province].filter(Boolean).join(', ')} · {l.occupancy} · {l.ownership}
                {l.seating_capacity ? ` · ${l.seating_capacity} seats` : ''}
              </p>
              <p className="mt-1 text-xs text-navy-600">
                Fire: {l.fire_protection.join(', ') || 'none recorded'} · Security: {l.security.join(', ') || 'none recorded'} · Backup power:{' '}
                {l.backup_power === null ? 'not stated' : l.backup_power ? 'yes' : 'no'}
              </p>
              <AssetTable assets={data.assets.filter((a) => a.location_id === l.id)} />
            </section>
          ))}
          {data.assets.some((a) => !a.location_id) && (
            <section className="panel p-5">
              <p className="font-semibold text-navy-900">Business-wide assets</p>
              <AssetTable assets={data.assets.filter((a) => !a.location_id)} />
            </section>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <TaskList data={data} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Submission packs</h2>
            {data.submissions.length ? (
              <ul className="mt-2 divide-y divide-navy-800/5">
                {data.submissions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <Link to={`/broker/commercial/submissions/${s.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                      {s.pack?.sections.length ?? 0} sections · {s.completeness}% complete
                    </Link>
                    <span className="flex items-center gap-2">
                      <SimulatedBadge label="Not sent" />
                      <StatusBadge status={s.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-navy-600">None yet.</p>
            )}
          </section>
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Review jobs</h2>
            {data.jobs.length ? (
              <ul className="mt-2 divide-y divide-navy-800/5">
                {data.jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 py-2">
                    <Link to={`/broker/jobs/${j.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                      {formatDateTime(j.created_at)} · {j.steps_done}/{j.steps_total} steps
                    </Link>
                    <StatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-navy-600">None yet.</p>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AssetTable({ assets }: { assets: BusinessDetail['assets'] }) {
  if (!assets.length) return <p className="mt-3 text-xs text-navy-500">No assets recorded at this location.</p>
  return (
    <div className="scroll-x -mx-5 mt-3 px-5">
    <table className="w-full min-w-[560px] text-sm">
      <thead className="text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
        <tr>
          <th className="py-1.5">Asset</th>
          <th className="py-1.5">Class</th>
          <th className="py-1.5">Qty</th>
          <th className="py-1.5">Declared value</th>
          <th className="py-1.5">Basis</th>
          <th className="py-1.5">Source</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-navy-800/5">
        {assets.map((a) => (
          <tr key={a.id}>
            <td className="py-1.5 text-navy-900">{a.description}</td>
            <td className="py-1.5 text-navy-700">{humanise(a.asset_class)}</td>
            <td className="py-1.5 text-navy-700">{a.quantity}</td>
            <td className="py-1.5 text-navy-700">{a.declared_value !== null ? rand(a.declared_value) : '–'}</td>
            <td className={a.value_basis === 'replacement' ? 'py-1.5 text-navy-700' : 'py-1.5 font-medium text-amber-700'}>{a.value_basis}</td>
            <td className="py-1.5">
              <ProvenanceBadge source={a.source} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

export function TaskList({ data }: { data: BusinessDetail }) {
  const update = useUpdateTask()
  const groups = [
    { title: 'Requested from the customer', items: data.tasks.filter((t) => t.audience === 'customer') },
    { title: 'Broker tasks', items: data.tasks.filter((t) => t.audience === 'broker') },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <section key={g.title} className="panel p-5">
          <h2 className="text-sm font-semibold text-navy-900">{g.title}</h2>
          {g.items.length ? (
            <ul className="mt-2 divide-y divide-navy-800/5">
              {g.items.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className={t.status === 'open' ? 'text-sm font-medium text-navy-900' : 'text-sm text-navy-500 line-through'}>{t.title}</p>
                    {t.detail && <p className="text-xs text-navy-600">{t.detail}</p>}
                    <p className="text-[11px] text-navy-500">
                      {humanise(t.kind)} · due {formatDate(t.due_date)}
                    </p>
                  </div>
                  {t.status === 'open' ? (
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ task_id: t.id, status: 'done' })} disabled={update.isPending}>
                      <Check /> {t.audience === 'customer' ? 'Received' : 'Done'}
                    </Button>
                  ) : (
                    <StatusBadge status={t.status === 'done' ? 'completed' : t.status} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-navy-600">Nothing yet.</p>
          )}
        </section>
      ))}
    </div>
  )
}

const FIELDS: Array<{ key: 'registration_number' | 'vat_number' | 'years_trading' | 'annual_turnover' | 'employee_count'; label: string; numeric: boolean; hint?: string }> = [
  { key: 'registration_number', label: 'Company registration number', numeric: false, hint: '2015/123456/07' },
  { key: 'vat_number', label: 'VAT number', numeric: false, hint: '4123456789' },
  { key: 'years_trading', label: 'Years trading', numeric: true },
  { key: 'annual_turnover', label: 'Annual turnover (R)', numeric: true },
  { key: 'employee_count', label: 'Employees', numeric: true },
]

export function ProfileEditor({ data }: { data: BusinessDetail }) {
  const update = useUpdateCommercialClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [verified, setVerified] = useState(false)
  const p = data.profile
  const fixed: Array<[string, string, FieldSource]> = [
    ['Registered name', p.registered_name, p.field_sources.registered_name ?? 'declared'],
    ['Trading name', p.trading_name ?? 'Not given', p.field_sources.trading_name ?? 'missing'],
    ['Industry', data.industry.name, p.field_sources.industry_key ?? 'inferred'],
    ['Operating regions', p.operating_regions.join(', ') || 'Not given', p.field_sources.operating_regions ?? 'missing'],
    [
      'Current insurance',
      p.existing_cover ? `${p.existing_cover.insurer ?? 'None'}${p.existing_cover.renewal_month ? `, renews ${p.existing_cover.renewal_month}` : ''}${p.existing_cover.notes ? ` · ${p.existing_cover.notes}` : ''}` : 'Not given',
      p.field_sources.existing_cover ?? 'missing',
    ],
    [
      'Claims history',
      p.loss_history ? `${p.loss_history.claims_last_5_years ?? '?'} claims in 5 years${p.loss_history.notes ? ` · ${p.loss_history.notes}` : ''}` : 'Not given',
      p.field_sources.loss_history ?? 'missing',
    ],
    ['Primary contact', p.primary_contact ? `${p.primary_contact.name} · ${p.primary_contact.email ?? ''} · ${p.primary_contact.phone ?? ''}` : 'Not given', 'declared'],
  ]

  const save = (key: (typeof FIELDS)[number]['key'], numeric: boolean) => {
    const raw = value.trim()
    const v = raw === '' ? null : numeric ? Number(raw.replace(/[\s,R]/g, '')) : raw
    update.mutate({ profile_id: p.id, changes: { [key]: v }, verified }, { onSuccess: () => setEditing(null) })
  }

  return (
    <section className="panel p-5">
      <p className="mb-3 text-xs text-navy-600">
        Every value shows where it came from. Corrections are recorded as customer declarations unless you tick that you verified them against a
        document. Changes refresh any open submission pack, so a pending approval must be re-requested.
      </p>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {fixed.map(([k, v, s]) => (
          <div key={k}>
            <dt className="text-[11px] text-navy-500">{k}</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
              {v} <ProvenanceBadge source={s} />
            </dd>
          </div>
        ))}
        {FIELDS.map((f) => {
          const current = p[f.key]
          const source = p.field_sources[f.key] ?? (current === null ? 'missing' : 'declared')
          return (
            <div key={f.key}>
              <dt className="text-[11px] text-navy-500">{f.label}</dt>
              {editing === f.key ? (
                <dd className="mt-1 space-y-2">
                  <input
                    className="field py-2"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={f.hint}
                    inputMode={f.numeric ? 'numeric' : undefined}
                    aria-label={f.label}
                    autoFocus
                  />
                  <label className="flex items-center gap-2 text-xs text-navy-700">
                    <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> I verified this against a document
                  </label>
                  {update.error && <p className="text-xs font-medium text-red-600">{update.error.message}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="accent" onClick={() => save(f.key, f.numeric)} disabled={update.isPending}>
                      {update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X /> Cancel
                    </Button>
                  </div>
                </dd>
              ) : (
                <dd className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
                  {current === null ? <span className="text-navy-500">Not given</span> : f.key === 'annual_turnover' ? rand(current as number) : String(current)}
                  <ProvenanceBadge source={source} />
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(f.key)
                      setValue(current === null ? '' : String(current))
                      setVerified(false)
                      update.reset()
                    }}
                    className="cursor-pointer text-navy-500 hover:text-brand-600"
                    aria-label={`Edit ${f.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </dd>
              )}
            </div>
          )
        })}
      </dl>
    </section>
  )
}
