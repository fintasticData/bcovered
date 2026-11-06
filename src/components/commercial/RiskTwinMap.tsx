import { useMemo, useState } from 'react'
import { Boxes, Building2, Factory, MapPin, Receipt, ShieldAlert, Truck } from 'lucide-react'
import type { BusinessDetail } from '@/api/client'
import type { TwinTable } from '@/server/db/commercialSchema'
import { rand } from '@/lib/quote'
import { cn } from '@/lib/utils'
import { COVERAGE_BORDER, COVERAGE_LABEL, ProvenanceBadge } from './badges'
import { ExposureCard } from './ExposureCard'

type TwinData = Pick<BusinessDetail, 'profile' | 'legal_entities' | 'locations' | 'activities' | 'assets' | 'exposures' | 'dependencies'>

interface TwinNode {
  key: string
  table: TwinTable
  id: string
  col: number
  label: string
  sub: string
}

const COLUMNS = ['Business', 'Locations', 'Activities and assets', 'Revenue and dependencies', 'Potential exposures']
const COL_W = 196
const GAP = 44
const NODE_H = 50
const V_GAP = 10
const TOP = 30

const ICON: Record<TwinTable, typeof Building2> = {
  business_profiles: Building2,
  business_legal_entities: Building2,
  business_locations: MapPin,
  business_activities: Factory,
  commercial_assets: Boxes,
  risk_exposures: ShieldAlert,
}

const keyOf = (table: string, id: string) => `${table}:${id}`

function buildNodes(d: TwinData): TwinNode[] {
  const nodes: TwinNode[] = [
    { key: keyOf('business_profiles', d.profile.id), table: 'business_profiles', id: d.profile.id, col: 0, label: d.profile.trading_name ?? d.profile.registered_name, sub: 'Business' },
    ...d.legal_entities.map((e) => ({ key: keyOf('business_legal_entities', e.id), table: 'business_legal_entities' as const, id: e.id, col: 0, label: e.legal_name, sub: `Legal entity · ${e.role}` })),
    ...d.locations.map((l) => ({ key: keyOf('business_locations', l.id), table: 'business_locations' as const, id: l.id, col: 1, label: l.name, sub: `${l.ownership} · ${l.occupancy}` })),
    ...d.activities
      .filter((a) => a.kind === 'operation')
      .map((a) => ({ key: keyOf('business_activities', a.id), table: 'business_activities' as const, id: a.id, col: 2, label: a.name, sub: 'Operation' })),
    ...d.assets.map((a) => ({
      key: keyOf('commercial_assets', a.id),
      table: 'commercial_assets' as const,
      id: a.id,
      col: 2,
      label: a.description,
      sub: `${a.quantity > 1 ? `${a.quantity} × ` : ''}${a.declared_value !== null ? rand(a.declared_value) : 'no value'} · ${a.value_basis}`,
    })),
    ...d.activities
      .filter((a) => a.kind !== 'operation')
      .map((a) => ({
        key: keyOf('business_activities', a.id),
        table: 'business_activities' as const,
        id: a.id,
        col: 3,
        label: a.name,
        sub: a.kind === 'revenue_stream' ? `Revenue${a.share_of_revenue ? ` · ~${Math.round(a.share_of_revenue * 100)}%` : ''}` : a.kind === 'supplier_dependency' ? 'Supplier dependency' : 'Customer dependency',
      })),
    ...d.exposures.map((e) => ({ key: keyOf('risk_exposures', e.id), table: 'risk_exposures' as const, id: e.id, col: 4, label: e.title, sub: `${e.priority} priority · ${COVERAGE_LABEL[e.coverage_status].toLowerCase()}` })),
  ]
  return nodes
}

export function RiskTwinMap({ data, brokerName }: { data: TwinData; brokerName?: string | null }) {
  const nodes = useMemo(() => buildNodes(data), [data])
  const [selected, setSelected] = useState<string | null>(null)

  const pos = useMemo(() => {
    const counters = [0, 0, 0, 0, 0]
    const out = new Map<string, { x: number; y: number }>()
    nodes.forEach((n) => {
      out.set(n.key, { x: n.col * (COL_W + GAP), y: TOP + counters[n.col]++ * (NODE_H + V_GAP) })
    })
    return { out, rows: Math.max(...counters, 1) }
  }, [nodes])

  const edges = useMemo(
    () =>
      data.dependencies
        .map((d) => ({ id: d.id, from: keyOf(d.from_table, d.from_id), to: keyOf(d.to_table, d.to_id), relation: d.relation }))
        .filter((e) => pos.out.has(e.from) && pos.out.has(e.to) && nodes.find((n) => n.key === e.from)!.col !== nodes.find((n) => n.key === e.to)!.col),
    [data.dependencies, pos, nodes],
  )

  const connected = useMemo(() => {
    if (!selected) return null
    const set = new Set([selected])
    edges.forEach((e) => {
      if (e.from === selected) set.add(e.to)
      if (e.to === selected) set.add(e.from)
    })
    return set
  }, [selected, edges])

  const width = COLUMNS.length * COL_W + (COLUMNS.length - 1) * GAP
  const height = TOP + pos.rows * (NODE_H + V_GAP)
  const sel = nodes.find((n) => n.key === selected)
  const locationNames = Object.fromEntries(data.locations.map((l) => [l.id, l.suburb ?? l.name]))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-navy-600">
        <span className="font-semibold text-navy-800">Coverage evidence:</span>
        {(['awaiting_broker_review', 'unknown', 'potentially_covered', 'confirmed_covered', 'confirmed_excluded'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-sm border-2 bg-white', COVERAGE_BORDER[s])} /> {COVERAGE_LABEL[s]}
          </span>
        ))}
      </div>
      <p className="text-[11px] font-medium text-brand-700 lg:hidden">Swipe sideways to see all five columns.</p>
      <div className="scroll-area overflow-x-auto overscroll-x-contain rounded-xl border border-navy-800/10 bg-mist/60 p-3">
        <div className="relative" style={{ width, height }}>
          {COLUMNS.map((c, i) => (
            <p key={c} className="absolute top-0 text-[11px] font-semibold tracking-wide text-navy-500 uppercase" style={{ left: i * (COL_W + GAP), width: COL_W }}>
              {c}
            </p>
          ))}
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {edges.map((e) => {
              let a = pos.out.get(e.from)!
              let b = pos.out.get(e.to)!
              if (a.x > b.x) [a, b] = [b, a]
              const x1 = a.x + COL_W
              const y1 = a.y + NODE_H / 2
              const x2 = b.x
              const y2 = b.y + NODE_H / 2
              const dx = (x2 - x1) / 2
              const on = connected?.has(e.from) && connected?.has(e.to) && (e.from === selected || e.to === selected)
              return (
                <path
                  key={e.id}
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  className={cn('transition', on ? 'stroke-brand-500' : connected ? 'stroke-navy-100' : 'stroke-navy-200')}
                  strokeWidth={on ? 2 : 1}
                  strokeDasharray={e.relation === 'exposes' ? '4 3' : undefined}
                />
              )
            })}
          </svg>
          {nodes.map((n) => {
            const p = pos.out.get(n.key)!
            const Icon = n.table === 'commercial_assets' && /vehicle|scooter|truck/i.test(n.label) ? Truck : n.table === 'business_activities' && n.col === 3 ? Receipt : ICON[n.table]
            const exposure = n.table === 'risk_exposures' ? data.exposures.find((e) => e.id === n.id) : undefined
            const dim = connected && !connected.has(n.key)
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setSelected((s) => (s === n.key ? null : n.key))}
                aria-pressed={selected === n.key}
                title={`${n.label} · ${n.sub}`}
                className={cn(
                  'absolute flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border bg-white px-2.5 text-left shadow-sm transition hover:border-brand-500',
                  exposure ? cn('border-l-4', COVERAGE_BORDER[exposure.coverage_status]) : 'border-navy-800/10',
                  selected === n.key && 'ring-2 ring-brand-500',
                  dim && 'opacity-35',
                )}
                style={{ left: p.x, top: p.y, width: COL_W, height: NODE_H }}
              >
                <Icon className={cn('h-4 w-4 shrink-0', exposure?.priority === 'high' ? 'text-red-600' : 'text-brand-600')} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-navy-900">{n.label}</span>
                  <span className="block truncate text-[11px] text-navy-500">{n.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-[11px] text-navy-600">
        Conceptual business exposure map. Links represent areas to investigate, not confirmed insurance coverage. Select a record to see
        what it connects to.
      </p>
      {sel && <NodeDetail node={sel} data={data} locationNames={locationNames} brokerName={brokerName} />}
    </div>
  )
}

function NodeDetail({ node, data, locationNames, brokerName }: { node: TwinNode; data: TwinData; locationNames: Record<string, string>; brokerName?: string | null }) {
  if (node.table === 'risk_exposures') {
    const e = data.exposures.find((x) => x.id === node.id)
    return e ? <ExposureCard key={e.id} exposure={e} locationNames={locationNames} brokerName={brokerName} defaultOpen /> : null
  }
  const rows: Array<[string, string, Parameters<typeof ProvenanceBadge>[0]['source'] | null]> = []
  if (node.table === 'business_locations') {
    const l = data.locations.find((x) => x.id === node.id)!
    rows.push(
      ['Address', [l.suburb, l.city, l.province].filter(Boolean).join(', ') || 'Not given', l.source],
      ['Occupancy', l.occupancy, l.source],
      ['Tenure', l.ownership, l.source],
      ['Construction', l.construction ?? 'Not given', l.construction ? l.source : 'missing'],
      ['Fire protection', l.fire_protection.join(', ') || 'None recorded', l.fire_protection.length ? l.source : 'missing'],
      ['Security', l.security.join(', ') || 'None recorded', l.security.length ? l.source : 'missing'],
      ['Backup power', l.backup_power === null ? 'Not stated' : l.backup_power ? 'Yes' : 'No', l.backup_power === null ? 'missing' : l.source],
    )
  } else if (node.table === 'commercial_assets') {
    const a = data.assets.find((x) => x.id === node.id)!
    rows.push(
      ['Class', a.asset_class.replace(/_/g, ' '), null],
      ['Quantity', String(a.quantity), a.source],
      ['Declared value', a.declared_value !== null ? rand(a.declared_value) : 'Not declared', a.declared_value !== null ? a.source : 'missing'],
      ['Valuation basis', a.value_basis, a.value_basis === 'unknown' ? 'missing' : a.source],
      ['Location', a.location_id ? (locationNames[a.location_id] ?? 'Site') : 'All sites', null],
    )
  } else if (node.table === 'business_activities') {
    const a = data.activities.find((x) => x.id === node.id)!
    rows.push(['Type', a.kind.replace(/_/g, ' '), null], ['Share of revenue', a.share_of_revenue ? `About ${Math.round(a.share_of_revenue * 100)}%` : 'Not stated', a.source])
    if (a.description) rows.push(['Note', a.description, a.source])
  } else if (node.table === 'business_legal_entities') {
    const e = data.legal_entities.find((x) => x.id === node.id)!
    rows.push(['Legal name', e.legal_name, e.source], ['Registration number', e.registration_number ?? 'Not given', e.registration_number ? e.source : 'missing'])
  } else {
    const p = data.profile
    rows.push(['Registered name', p.registered_name, p.field_sources.registered_name ?? 'declared'], ['Summary', p.activities_summary ?? 'Not given', null])
  }
  return (
    <div className="rounded-xl border border-navy-800/10 bg-white p-4">
      <p className="text-sm font-semibold text-navy-900">{node.label}</p>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v, s]) => (
          <div key={k}>
            <dt className="text-[11px] text-navy-500">{k}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium text-navy-900">
              {v} {s && <ProvenanceBadge source={s} />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
