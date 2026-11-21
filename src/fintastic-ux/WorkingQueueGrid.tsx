import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  RENEWAL_DEMO,
  STATUS_CLASS,
  STATUS_LABEL,
  zar,
  type RenewalRow,
  type RenewalStatus,
} from './renewalsDemo'
import { RowActionsButton, type ContextMenuItem, type ContextMenuState } from '@/broker/shared/RowContextMenu'

const ROW_PX = 44
const HEADER_PX = 36
const DEFAULT_VISIBLE = 6
const MIN_VISIBLE = 5
const MAX_VISIBLE = 8

export type WorkingQueueFilters = {
  search: string
  status: 'all' | RenewalStatus
  dateFrom: string
  dateTo: string
}

export const EMPTY_QUEUE_FILTERS: WorkingQueueFilters = {
  search: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
}

export function filterRenewalRows(rows: RenewalRow[], filters: WorkingQueueFilters): RenewalRow[] {
  const q = filters.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (filters.status !== 'all' && r.status !== filters.status) return false
    if (filters.dateFrom && r.renewalDate < filters.dateFrom) return false
    if (filters.dateTo && r.renewalDate > filters.dateTo) return false
    if (!q) return true
    return r.client.toLowerCase().includes(q) || r.policyNumber.toLowerCase().includes(q)
  })
}

type SortKey = 'client' | 'policyNumber' | 'renewalDate' | 'expiringExcess' | 'proposedExcess' | 'status'
type SortDir = 'asc' | 'desc'

/** Working renewal queue: ~6-row viewport, expand/collapse, focus ≠ checked. */
export function WorkingQueueGrid({
  rows = RENEWAL_DEMO,
  focusedId,
  onFocus,
  checkedIds,
  onToggleCheck,
  onToggleCheckAll,
  filters,
  onFiltersChange,
  expanded,
  onExpandedChange,
  menuFor,
  onActionMenu,
  onPolicyClick,
  emptyNoDataLabel = 'No renewals yet',
  className,
  compactSummary,
}: {
  rows?: RenewalRow[]
  focusedId: string
  onFocus: (id: string) => void
  checkedIds: Set<string>
  onToggleCheck: (id: string) => void
  onToggleCheckAll?: (ids: string[], select: boolean) => void
  filters: WorkingQueueFilters
  onFiltersChange: (next: WorkingQueueFilters) => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  menuFor: (row: RenewalRow) => ContextMenuItem[]
  onActionMenu: (state: ContextMenuState) => void
  onPolicyClick?: (row: RenewalRow) => void
  emptyNoDataLabel?: string
  className?: string
  /** When expanded is false and star is compact, optional note above toolbar */
  compactSummary?: ReactNode
}) {
  const [sortKey, setSortKey] = useState<SortKey>('renewalDate')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollPos = useRef(0)

  const filtered = useMemo(() => filterRenewalRows(rows, filters), [rows, filters])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [filtered, sortKey, sortDir])

  const visibleTarget = Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, DEFAULT_VISIBLE))
  const naturalCount = sorted.length
  const bodyHeight =
    naturalCount === 0
      ? ROW_PX * 2
      : naturalCount <= 2
        ? naturalCount * ROW_PX
        : expanded
          ? undefined
          : Math.min(visibleTarget, Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, naturalCount))) * ROW_PX

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (expanded) {
      el.scrollTop = scrollPos.current
    } else {
      scrollPos.current = el.scrollTop
    }
  }, [expanded])

  const activeChips: { id: string; label: string; clear: () => void }[] = []
  if (filters.search.trim()) {
    activeChips.push({
      id: 'search',
      label: `Search: ${filters.search.trim()}`,
      clear: () => onFiltersChange({ ...filters, search: '' }),
    })
  }
  if (filters.status !== 'all') {
    activeChips.push({
      id: 'status',
      label: STATUS_LABEL[filters.status],
      clear: () => onFiltersChange({ ...filters, status: 'all' }),
    })
  }
  if (filters.dateFrom || filters.dateTo) {
    activeChips.push({
      id: 'dates',
      label: `Dates ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`,
      clear: () => onFiltersChange({ ...filters, dateFrom: '', dateTo: '' }),
    })
  }

  const hasFilters = activeChips.length > 0
  const allFilteredChecked = sorted.length > 0 && sorted.every((r) => checkedIds.has(r.id))
  const someFilteredChecked = sorted.some((r) => checkedIds.has(r.id))

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const onRowKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onFocus(id)
    }
  }

  const SortBtn = ({ col, label, align = 'left' }: { col: SortKey; label: string; align?: 'left' | 'right' }) => (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer items-center gap-0.5 font-bold tracking-wide uppercase hover:text-navy-800',
        align === 'right' && 'w-full justify-end',
        sortKey === col && 'text-navy-900',
      )}
      onClick={() => toggleSort(col)}
    >
      {label}
      {sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
    </button>
  )

  return (
    <section className={cn('rounded-2xl border border-navy-800/10 bg-white shadow-sm', className)}>
      {compactSummary}

      <div className="sticky top-0 z-10 space-y-2 border-b border-navy-800/10 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Renewal queue</p>
          <span className="text-xs text-navy-600">
            {sorted.length} of {rows.length} renewals
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => onExpandedChange(!expanded)}>
              {expanded ? (
                <>
                  <ChevronUp /> Collapse grid
                </>
              ) : (
                <>
                  <ChevronDown /> Expand grid
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
            <input
              className="field w-full py-1.5 pl-7 text-sm"
              placeholder="Search customer or policy…"
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              aria-label="Search renewals"
            />
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
            Status
            <select
              className="field mt-0.5 block py-1.5 text-sm font-normal normal-case"
              value={filters.status}
              onChange={(e) =>
                onFiltersChange({ ...filters, status: e.target.value as WorkingQueueFilters['status'] })
              }
            >
              <option value="all">All</option>
              <option value="review_excess">Review excess</option>
              <option value="review_change">Review change</option>
              <option value="no_change">No change</option>
            </select>
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
            From
            <input
              type="date"
              className="field mt-0.5 block py-1.5 text-sm font-normal normal-case"
              value={filters.dateFrom}
              onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            />
          </label>
          <label className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
            To
            <input
              type="date"
              className="field mt-0.5 block py-1.5 text-sm font-normal normal-case"
              value={filters.dateTo}
              onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
            />
          </label>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.map((c) => (
              <button
                key={c.id}
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-navy-700"
                onClick={c.clear}
              >
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button
              type="button"
              className="cursor-pointer text-[11px] font-semibold text-brand-700 underline"
              onClick={() => onFiltersChange(EMPTY_QUEUE_FILTERS)}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div
        ref={bodyRef}
        className={cn('overflow-auto', expanded && 'max-h-[min(70vh,36rem)]')}
        style={!expanded && bodyHeight != null ? { maxHeight: bodyHeight + HEADER_PX } : undefined}
        onScroll={(e) => {
          scrollPos.current = e.currentTarget.scrollTop
        }}
      >
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-mist text-[10px] font-bold tracking-wide text-navy-500 uppercase">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={
                    hasFilters
                      ? `Select all ${sorted.length} filtered renewals`
                      : `Select all ${rows.length} renewals in queue`
                  }
                  checked={allFilteredChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allFilteredChecked && someFilteredChecked
                  }}
                  onChange={() => {
                    if (!onToggleCheckAll) return
                    onToggleCheckAll(
                      sorted.map((r) => r.id),
                      !allFilteredChecked,
                    )
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
              <th className="px-3 py-2">
                <SortBtn col="client" label="Customer" />
              </th>
              <th className="px-3 py-2">
                <SortBtn col="policyNumber" label="Policy" />
              </th>
              <th className="px-3 py-2">
                <SortBtn col="renewalDate" label="Renewal date" />
              </th>
              <th className="px-3 py-2 text-right">
                <SortBtn col="expiringExcess" label="Expiring excess" align="right" />
              </th>
              <th className="px-3 py-2 text-right">
                <SortBtn col="proposedExcess" label="Proposed excess" align="right" />
              </th>
              <th className="px-3 py-2">
                <SortBtn col="status" label="Status" />
              </th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-navy-600">
                  {emptyNoDataLabel}
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-navy-600">
                  <p>No renewals match these filters.</p>
                  <button
                    type="button"
                    className="mt-2 cursor-pointer text-sm font-semibold text-brand-700 underline"
                    onClick={() => onFiltersChange(EMPTY_QUEUE_FILTERS)}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const focusedRow = row.id === focusedId
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="row"
                    aria-selected={focusedRow}
                    className={cn(
                      'cursor-pointer border-t border-navy-800/5 outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset',
                      focusedRow && 'bg-brand-50/70',
                      !focusedRow && 'hover:bg-mist/80',
                    )}
                    style={{ height: ROW_PX }}
                    onClick={() => onFocus(row.id)}
                    onKeyDown={(e) => onRowKey(e, row.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onFocus(row.id)
                      onActionMenu({ x: e.clientX, y: e.clientY, items: menuFor(row) })
                    }}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(row.id)}
                        onChange={() => onToggleCheck(row.id)}
                        aria-label={`Select ${row.client}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-navy-900">{row.client}</td>
                    <td className="px-3 py-2 tabular-nums text-navy-700" onClick={(e) => e.stopPropagation()}>
                      {onPolicyClick ? (
                        <button
                          type="button"
                          className="cursor-pointer font-medium text-brand-700 hover:underline"
                          onClick={() => onPolicyClick(row)}
                        >
                          {row.policyNumber}
                        </button>
                      ) : (
                        row.policyNumber
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-navy-700">{row.renewalDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{zar(row.expiringExcess)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{zar(row.proposedExcess)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_CLASS[row.status])}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <RowActionsButton items={menuFor(row)} onOpen={onActionMenu} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
