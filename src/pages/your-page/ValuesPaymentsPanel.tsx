import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { DataGrid } from '@/broker/shared/DataGrid'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { money, moneyOrNotSupplied } from '@/pages/my/portalFormat'
import type {
  ValuesAudience,
  ValuesLineRow,
  ValuesPaymentsSummary,
  ValuesScope,
  ValuesTotalKey,
} from './valuesPaymentsTypes'

const ROW_PX = 44
const HEADER_PX = 36
const DEFAULT_VISIBLE = 6

function totalMatchesLine(key: ValuesTotalKey, row: ValuesLineRow): boolean {
  switch (key) {
    case 'purchase':
      return row.kind === 'item' && row.purchase_value != null
    case 'recorded':
      return row.kind === 'item' && row.recorded_value != null
    case 'insured':
      return row.kind === 'item' && row.insured_value != null
    case 'replacement':
      return row.kind === 'item' && row.replacement_value != null
    case 'premium':
      return row.premium_amount != null
    case 'paid':
      return row.kind === 'payment' && row.paid_amount != null
    case 'outstanding':
      return row.outstanding_amount != null
    case 'commission_expected':
    case 'commission_earned':
    case 'commission_received':
    case 'commission_outstanding':
      return row.kind === 'commission' || (row.commission_amount != null && row.kind !== 'payment')
    default:
      return true
  }
}

function amountForKey(key: ValuesTotalKey, row: ValuesLineRow): number | null {
  switch (key) {
    case 'purchase':
      return row.purchase_value
    case 'recorded':
      return row.recorded_value
    case 'insured':
      return row.insured_value
    case 'replacement':
      return row.replacement_value
    case 'premium':
      return row.premium_amount
    case 'paid':
      return row.paid_amount
    case 'outstanding':
      return row.outstanding_amount
    case 'commission_expected':
      return row.commission_amount
    case 'commission_earned':
      return row.commission_earned ?? row.commission_amount
    case 'commission_received':
      return row.commission_received
    case 'commission_outstanding':
      return row.commission_outstanding
    default:
      return null
  }
}

/** Fintastic Values & payments: compact summary strip + working grid (5–8 rows) + thin inspect. */
export function ValuesPaymentsPanel({
  summary,
  scope,
  audience = 'customer',
  locations = [],
  onOpenItem,
  inspectBody,
  className,
}: {
  summary: ValuesPaymentsSummary
  scope: ValuesScope
  audience?: ValuesAudience
  locations?: Array<{ id: string; name: string }>
  onOpenItem?: (row: ValuesLineRow) => void
  inspectBody?: (row: ValuesLineRow) => ReactNode
  className?: string
}) {
  const [asAt, setAsAt] = useState(summary.as_at)
  const [from, setFrom] = useState(summary.period_from)
  const [to, setTo] = useState(summary.period_to)
  const [focusKey, setFocusKey] = useState<ValuesTotalKey | null>(null)
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState<ValuesLineRow | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return summary.lines.filter((row) => {
      if (focusKey && !totalMatchesLine(focusKey, row)) return false
      if (locationFilter && row.location !== locationFilter && !row.location?.includes(locationFilter)) return false
      if (statusFilter && row.cover_status !== statusFilter) return false
      if (!q) return true
      return `${row.label} ${row.secondary ?? ''} ${row.location ?? ''}`.toLowerCase().includes(q)
    })
  }, [summary.lines, focusKey, locationFilter, statusFilter, search])

  const statuses = useMemo(
    () => [...new Set(summary.lines.map((l) => l.cover_status).filter(Boolean))] as string[],
    [summary.lines],
  )

  const openRow = (row: ValuesLineRow) => {
    setFocused(row)
    setPanelOpen(true)
    onOpenItem?.(row)
  }

  const columns = useMemo<ColumnDef<ValuesLineRow, unknown>[]>(
    () => [
      {
        id: 'label',
        accessorFn: (r) => r.label,
        header: scope === 'business' ? 'Asset / policy' : 'Item / policy',
        cell: ({ row }) => (
          <button type="button" className="cursor-pointer text-left" onClick={() => openRow(row.original)}>
            <p className="font-semibold text-navy-900">{row.original.label}</p>
            <p className="text-xs capitalize text-navy-500">
              {[row.original.secondary, row.original.kind].filter(Boolean).join(' · ')}
            </p>
          </button>
        ),
      },
      {
        id: 'location',
        accessorFn: (r) => r.location ?? '',
        header: scope === 'business' ? 'Site' : 'Location',
        cell: ({ row }) => <span className="text-navy-700">{row.original.location ?? '—'}</span>,
      },
      {
        id: 'purchase',
        accessorFn: (r) => r.purchase_value ?? 0,
        header: 'Purchase',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">{money(row.original.purchase_value) ?? '—'}</span>
        ),
      },
      {
        id: 'recorded',
        accessorFn: (r) => r.recorded_value ?? 0,
        header: 'Recorded',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">{moneyOrNotSupplied(row.original.recorded_value)}</span>
        ),
      },
      {
        id: 'insured',
        accessorFn: (r) => r.insured_value ?? 0,
        header: 'Insured',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">{money(row.original.insured_value) ?? '—'}</span>
        ),
      },
      {
        id: 'premium',
        accessorFn: (r) => r.premium_amount ?? 0,
        header: 'Premium',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const p = money(row.original.premium_amount)
          return (
            <span className="block text-right tabular-nums">
              {p ? `${p}${row.original.premium_frequency === 'annually' ? '/yr' : row.original.premium_frequency === 'monthly' ? '/mo' : ''}` : '—'}
            </span>
          )
        },
      },
      {
        id: 'commission',
        accessorFn: (r) => r.commission_amount ?? 0,
        header: 'Commission',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const c = money(row.original.commission_amount)
          if (!c) return <span className="block text-right text-navy-500">—</span>
          return (
            <button
              type="button"
              className="block w-full cursor-pointer text-right font-semibold text-brand-800 tabular-nums underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                openRow(row.original)
              }}
            >
              {c}
              {row.original.commission_included ? (
                <span className="mt-0.5 block text-[10px] font-medium text-navy-500 no-underline">Included in premium</span>
              ) : null}
            </button>
          )
        },
      },
    ],
    [scope],
  )

  const bodyMax = expanded ? undefined : DEFAULT_VISIBLE * ROW_PX + HEADER_PX
  const hasFilters = Boolean(focusKey || locationFilter || statusFilter || search)

  return (
    <section aria-label="Values and payments" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">Values & payments</h2>
          <p className="text-xs text-navy-600">
            {scope === 'business'
              ? 'Company totals with drill-down by site, asset and policy. Commission is separate from Comms.'
              : 'Purchase, insured and replacement figures with premiums, payments and disclosed Commission.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
            As at
            <input
              type="date"
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
              className="mt-0.5 block rounded-lg border border-navy-800/15 bg-white px-2 py-1.5 text-xs font-semibold text-navy-800"
            />
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 block rounded-lg border border-navy-800/15 bg-white px-2 py-1.5 text-xs font-semibold text-navy-800"
            />
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 block rounded-lg border border-navy-800/15 bg-white px-2 py-1.5 text-xs font-semibold text-navy-800"
            />
          </label>
        </div>
      </div>

      <div
        className="scroll-x flex flex-nowrap gap-2"
        role="list"
        aria-label="Value and payment totals"
      >
        {summary.totals.map((card) => {
          const active = focusKey === card.key
          return (
            <button
              key={card.key}
              type="button"
              role="listitem"
              onClick={() => setFocusKey(active ? null : card.key)}
              className={cn(
                'min-w-[9.5rem] shrink-0 rounded-xl border px-3 py-2 text-left transition sm:min-w-[10.5rem]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
                active
                  ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-200'
                  : 'border-navy-800/10 bg-white hover:border-brand-300',
              )}
            >
              <p className="truncate text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{card.label}</p>
              <p className="mt-0.5 text-base font-semibold text-navy-900 tabular-nums sm:text-lg">
                {card.amount != null ? money(card.amount) : '—'}
                {card.frequencyLabel && card.amount != null ? (
                  <span className="ml-1 text-xs font-medium text-navy-600">{card.frequencyLabel}</span>
                ) : null}
              </p>
              {card.hint ? <p className="mt-0.5 truncate text-[11px] text-navy-600">{card.hint}</p> : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {locations.length > 0 && (
          <select
            className="rounded-lg border border-navy-800/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-800"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            aria-label="Filter by location"
          >
            <option value="">All {scope === 'business' ? 'sites' : 'locations'}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {statuses.length > 0 && (
          <select
            className="rounded-lg border border-navy-800/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-800"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by cover status"
          >
            <option value="">All cover statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
        <label className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search values grid</span>
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-navy-800/15 bg-white py-1.5 pr-2.5 pl-7 text-xs text-navy-800"
          />
        </label>
        <span className="text-xs font-semibold text-navy-600">
          {filtered.length} of {summary.lines.length} rows
          {focusKey ? ` · ${summary.totals.find((t) => t.key === focusKey)?.label}` : ''}
        </span>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => {
              setFocusKey(null)
              setLocationFilter('')
              setStatusFilter('')
              setSearch('')
            }}
          >
            Clear filters
          </Button>
        )}
        <Button size="sm" variant="outline" type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Collapse grid
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Expand grid
            </>
          )}
        </Button>
      </div>

      <div
        className="overflow-hidden rounded-xl border border-navy-800/10 bg-white"
        style={bodyMax != null ? { maxHeight: bodyMax } : undefined}
      >
        <div className={cn(!expanded && 'overflow-y-auto')} style={bodyMax != null ? { maxHeight: bodyMax } : undefined}>
          <DataGrid
            data={filtered}
            columns={columns}
            getRowId={(r) => r.id}
            storageKey={`values-payments-${scope}`}
            searchPlaceholder="Search…"
            searchText={(r) => `${r.label} ${r.secondary ?? ''} ${r.location ?? ''}`}
            rowClassName={(row) =>
              focused?.id === row.id ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-200' : undefined
            }
            minWidth={880}
            empty={
              <div className="px-4 py-8 text-center text-sm text-navy-600">
                {summary.lines.length === 0
                  ? 'No value or payment lines yet.'
                  : 'No rows match these filters.'}
              </div>
            }
          />
        </div>
      </div>

      {audience === 'broker' && (
        <p className="text-[11px] text-navy-600">
          Broker view: Expected, Earned, Received and Outstanding Commission are clickable. Agent splits stay on{' '}
          <span className="font-semibold">Broker financials</span>.
        </p>
      )}

      <RightSlideout
        open={panelOpen && Boolean(focused)}
        onClose={() => setPanelOpen(false)}
        title={focused?.label ?? 'Detail'}
        subtitle={
          focused
            ? [focused.secondary, focused.location, focused.cover_status?.replace(/_/g, ' ')].filter(Boolean).join(' · ')
            : undefined
        }
        size="wide"
      >
        {focused && (
          <div className="space-y-4 p-4">
            <p className="text-xs text-navy-600">Primary action stays on the centre hub when opened from Assets / Items.</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ['Purchase', focused.purchase_value],
                  ['Recorded', focused.recorded_value],
                  ['Insured', focused.insured_value],
                  ['Replacement', focused.replacement_value],
                  ['Premium', focused.premium_amount],
                  ['Commission', focused.commission_amount],
                  ['Earned', focused.commission_earned],
                  ['Received', focused.commission_received],
                  ['Outstanding commission', focused.commission_outstanding],
                  ['Paid', focused.paid_amount],
                  ['Due', focused.outstanding_amount],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-navy-800/10 px-3 py-2">
                  <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{label}</dt>
                  <dd className="mt-0.5 font-semibold text-navy-900 tabular-nums">{money(value) ?? '—'}</dd>
                </div>
              ))}
            </dl>
            {focused.commission_included && (
              <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
                Included in your premium — this is the disclosed broker commission, not an extra charge.
              </p>
            )}
            {focusKey && (
              <p className="text-xs text-navy-600">
                Contributes to <span className="font-semibold">{summary.totals.find((t) => t.key === focusKey)?.label}</span>
                {amountForKey(focusKey, focused) != null ? `: ${money(amountForKey(focusKey, focused))}` : ''}.
              </p>
            )}
            {inspectBody?.(focused)}
          </div>
        )}
      </RightSlideout>
    </section>
  )
}
