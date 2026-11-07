import { useMemo, useState, type ReactNode } from 'react'
import { Boxes, Building2, Factory, Focus, MapPin, Minus, Plus, Receipt, RotateCcw, ShieldAlert, Truck } from 'lucide-react'
import type { BusinessDetail } from '@/api/client'
import type { RiskDependency, TwinTable } from '@/server/db/commercialSchema'
import { rand } from '@/lib/quote'
import { cn } from '@/lib/utils'
import { COVERAGE_BORDER, COVERAGE_LABEL, ProvenanceBadge } from './badges'
import { ExposureCard } from './ExposureCard'

type TwinData = Pick<BusinessDetail, 'profile' | 'legal_entities' | 'locations' | 'activities' | 'assets' | 'exposures' | 'dependencies'>

export interface TwinNode {
  key: string
  table: TwinTable
  id: string
  col: number
  label: string
  sub: string
}

const COLUMNS = ['Business', 'Locations', 'Activities and assets', 'Revenue and dependencies', 'Potential exposures']
const COL_W = 196
const GAP = 52
const NODE_H = 50
const V_GAP = 10
const TOP = 30
const OPERATIONAL: RiskDependency['relation'][] = ['supports', 'stores', 'feeds', 'supplies', 'serves']

const ICON: Record<TwinTable, typeof Building2> = {
  business_profiles: Building2,
  business_legal_entities: Building2,
  business_locations: MapPin,
  business_activities: Factory,
  commercial_assets: Boxes,
  risk_exposures: ShieldAlert,
}

export const twinKey = (table: string, id: string) => `${table}:${id}`

function buildNodes(d: TwinData): TwinNode[] {
  return [
    { key: twinKey('business_profiles', d.profile.id), table: 'business_profiles', id: d.profile.id, col: 0, label: d.profile.trading_name ?? d.profile.registered_name, sub: 'Business' },
    ...d.legal_entities.map((e) => ({ key: twinKey('business_legal_entities', e.id), table: 'business_legal_entities' as const, id: e.id, col: 0, label: e.legal_name, sub: `Legal entity · ${e.role}` })),
    ...d.locations.map((l) => ({ key: twinKey('business_locations', l.id), table: 'business_locations' as const, id: l.id, col: 1, label: l.name, sub: `${l.ownership} · ${l.occupancy}` })),
    ...d.activities
      .filter((a) => a.kind === 'operation')
      .map((a) => ({ key: twinKey('business_activities', a.id), table: 'business_activities' as const, id: a.id, col: 2, label: a.name, sub: 'Operation' })),
    ...d.assets.map((a) => ({
      key: twinKey('commercial_assets', a.id),
      table: 'commercial_assets' as const,
      id: a.id,
      col: 2,
      label: a.description,
      sub: `${a.quantity > 1 ? `${a.quantity} × ` : ''}${a.declared_value !== null ? rand(a.declared_value) : 'no value'} · ${a.value_basis}`,
    })),
    ...d.activities
      .filter((a) => a.kind !== 'operation')
      .map((a) => ({
        key: twinKey('business_activities', a.id),
        table: 'business_activities' as const,
        id: a.id,
        col: 3,
        label: a.name,
        sub: a.kind === 'revenue_stream' ? `Revenue${a.share_of_revenue ? ` · ~${Math.round(a.share_of_revenue * 100)}%` : ''}` : a.kind === 'supplier_dependency' ? 'Supplier dependency' : 'Customer dependency',
      })),
    ...d.exposures.map((e) => ({
      key: twinKey('risk_exposures', e.id),
      table: 'risk_exposures' as const,
      id: e.id,
      col: 4,
      label: e.title,
      sub: `${e.priority_override ?? e.priority} priority · ${COVERAGE_LABEL[e.coverage_status].toLowerCase()}`,
    })),
  ]
}

interface Props {
  data: TwinData
  brokerName?: string | null
  /** Records and links on traced impact paths. */
  impact?: { keys: string[]; edge_ids: string[] } | null
  selected?: string | null
  onSelect?: (node: TwinNode | null) => void
  /** Replaces the built-in read-only detail panel. */
  renderDetail?: (node: TwinNode) => ReactNode
}

export function RiskTwinMap({ data, brokerName, impact, selected: controlled, onSelect, renderDetail }: Props) {
  const nodes = useMemo(() => buildNodes(data), [data])
  const [own, setOwn] = useState<string | null>(null)
  const selected = controlled !== undefined ? controlled : own
  const [zoom, setZoom] = useState(1)
  const [focus, setFocus] = useState(false)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const impactKeys = useMemo(() => new Set(impact?.keys ?? []), [impact])
  const impactEdges = useMemo(() => new Set(impact?.edge_ids ?? []), [impact])

  const select = (key: string | null) => {
    const node = key ? (nodes.find((n) => n.key === key) ?? null) : null
    if (controlled === undefined) setOwn(key)
    onSelect?.(node)
  }

  const allEdges = useMemo(
    () =>
      data.dependencies.map((d) => ({
        id: d.id,
        from: twinKey(d.from_table, d.from_id),
        to: twinKey(d.to_table, d.to_id),
        relation: d.relation,
        operational: OPERATIONAL.includes(d.relation),
        inferred: d.source === 'inferred',
      })),
    [data.dependencies],
  )

  const connected = useMemo(() => {
    if (!selected) return null
    const set = new Set([selected])
    allEdges.forEach((e) => {
      if (e.from === selected) set.add(e.to)
      if (e.to === selected) set.add(e.from)
    })
    return set
  }, [selected, allEdges])

  const visible = useMemo(
    () => nodes.filter((n) => !hidden.has(n.col) && (!focus || (!connected && !impactKeys.size) || connected?.has(n.key) || impactKeys.has(n.key))),
    [nodes, hidden, focus, connected, impactKeys],
  )

  const pos = useMemo(() => {
    const counters = [0, 0, 0, 0, 0]
    const out = new Map<string, { x: number; y: number; col: number }>()
    visible.forEach((n) => out.set(n.key, { x: n.col * (COL_W + GAP), y: TOP + counters[n.col]++ * (NODE_H + V_GAP), col: n.col }))
    return { out, rows: Math.max(...counters, 1) }
  }, [visible])

  const edges = allEdges.filter((e) => pos.out.has(e.from) && pos.out.has(e.to))
  const width = COLUMNS.length * COL_W + (COLUMNS.length - 1) * GAP + 40
  const height = TOP + pos.rows * (NODE_H + V_GAP)
  const sel = nodes.find((n) => n.key === selected)
  const locationNames = Object.fromEntries(data.locations.map((l) => [l.id, l.suburb ?? l.name]))
  const toggleCol = (i: number) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show columns">
          {COLUMNS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCol(i)}
              aria-pressed={!hidden.has(i)}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                hidden.has(i) ? 'border-navy-800/10 text-navy-400' : 'border-brand-500/30 bg-brand-50 text-brand-700',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Graph view">
          <button
            type="button"
            onClick={() => setFocus((f) => !f)}
            aria-pressed={focus}
            className={cn('flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold', focus ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-800/10 text-navy-700')}
            title="Show only the selected record, its relationships and any traced impact"
          >
            <Focus className="h-3.5 w-3.5" /> Focus
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-navy-800/10 text-navy-700" aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-[11px] text-navy-600" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)))} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-navy-800/10 text-navy-700" aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1)
              setFocus(false)
              setHidden(new Set())
              select(null)
            }}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-navy-800/10 text-navy-700"
            aria-label="Reset view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-navy-600">
        <span className="font-semibold text-navy-800">Coverage evidence:</span>
        {(['awaiting_broker_review', 'unknown', 'potentially_covered', 'confirmed_covered', 'confirmed_excluded'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-sm border-2 bg-white', COVERAGE_BORDER[s])} /> {COVERAGE_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-brand-500" /> Operational dependency
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-violet-400" /> AI inferred, needs confirmation
        </span>
        {impact && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 bg-amber-500" /> Traced impact path
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-brand-700 lg:hidden">Swipe sideways to see all five columns.</p>
      <div className="scroll-area overflow-auto overscroll-contain rounded-xl border border-navy-800/10 bg-mist/60 p-3" style={{ maxHeight: 640 }}>
        <div className="relative origin-top-left" style={{ width: width * zoom, height: height * zoom }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            {COLUMNS.map((c, i) =>
              hidden.has(i) ? null : (
                <p key={c} className="absolute top-0 text-[11px] font-semibold tracking-wide text-navy-500 uppercase" style={{ left: i * (COL_W + GAP), width: COL_W }}>
                  {c}
                </p>
              ),
            )}
            <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
              {edges.map((e) => {
                let a = pos.out.get(e.from)!
                let b = pos.out.get(e.to)!
                const on = Boolean(selected && (e.from === selected || e.to === selected))
                const traced = impactEdges.has(e.id)
                let d: string
                if (a.col === b.col) {
                  const x = a.x + COL_W
                  const bulge = 18 + Math.min(30, Math.abs(b.y - a.y) / 6)
                  d = `M ${x} ${a.y + NODE_H / 2} C ${x + bulge} ${a.y + NODE_H / 2}, ${x + bulge} ${b.y + NODE_H / 2}, ${x} ${b.y + NODE_H / 2}`
                } else {
                  if (a.x > b.x) [a, b] = [b, a]
                  const x1 = a.x + COL_W
                  const y1 = a.y + NODE_H / 2
                  const x2 = b.x
                  const y2 = b.y + NODE_H / 2
                  const dx = (x2 - x1) / 2
                  d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
                }
                return (
                  <path
                    key={e.id}
                    d={d}
                    fill="none"
                    className={cn(
                      'transition',
                      traced
                        ? 'stroke-amber-500'
                        : on
                          ? 'stroke-brand-500'
                          : e.inferred
                            ? 'stroke-violet-400'
                            : e.operational
                              ? 'stroke-brand-500/60'
                              : connected
                                ? 'stroke-navy-100'
                                : 'stroke-navy-200',
                    )}
                    strokeWidth={traced ? 3 : on ? 2 : e.operational ? 1.5 : 1}
                    strokeDasharray={e.relation === 'exposes' ? '4 3' : e.inferred ? '6 3' : undefined}
                  />
                )
              })}
            </svg>
            {visible.map((n) => {
              const p = pos.out.get(n.key)!
              const Icon = n.table === 'commercial_assets' && /vehicle|scooter|truck/i.test(n.label) ? Truck : n.table === 'business_activities' && n.col === 3 ? Receipt : ICON[n.table]
              const exposure = n.table === 'risk_exposures' ? data.exposures.find((e) => e.id === n.id) : undefined
              const dim = connected && !connected.has(n.key) && !impactKeys.has(n.key)
              const traced = impactKeys.has(n.key)
              const high = exposure && ['critical', 'high'].includes(exposure.priority_override ?? exposure.priority)
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => select(selected === n.key ? null : n.key)}
                  aria-pressed={selected === n.key}
                  title={`${n.label} · ${n.sub}`}
                  className={cn(
                    'absolute flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border bg-white px-2.5 text-left shadow-sm transition hover:border-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500',
                    exposure ? cn('border-l-4', COVERAGE_BORDER[exposure.coverage_status]) : 'border-navy-800/10',
                    traced && 'ring-2 ring-amber-400',
                    selected === n.key && 'ring-2 ring-brand-500',
                    dim && 'opacity-35',
                  )}
                  style={{ left: p.x, top: p.y, width: COL_W, height: NODE_H }}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', high ? 'text-red-600' : 'text-brand-600')} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-navy-900">{n.label}</span>
                    <span className="block truncate text-[11px] text-navy-500">{n.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-navy-600">
        Conceptual business exposure map. Links represent recorded relationships and areas to investigate, not confirmed insurance coverage. Select a record to see
        what it connects to.
      </p>
      {sel && (renderDetail ? renderDetail(sel) : <NodeDetail node={sel} data={data} locationNames={locationNames} brokerName={brokerName} />)}
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
