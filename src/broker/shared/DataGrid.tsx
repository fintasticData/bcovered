// A broker data grid: search, sortable headers, column choice (remembered per grid), pagination, row selection across
// every filtered row, a bulk action bar and CSV export. Search, sort and page live in the URL so a view can be shared and
// survives a refresh. Below the md breakpoint rows render as cards.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Rows3, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RowContextMenu, type ContextMenuItem, type ContextMenuState } from './RowContextMenu'

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

export interface DataGridProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  /** Remembers column choice and density per grid. */
  storageKey: string
  searchPlaceholder?: string
  /** Text searched by the box; defaults to every string value in the row. */
  searchText?: (row: T) => string
  initialSort?: SortingState
  defaultHidden?: string[]
  toolbar?: ReactNode
  bulkActions?: (selected: T[], clear: () => void) => ReactNode
  csv?: { filename: string; columns: CsvColumn<T>[] }
  mobileCard?: (row: T, selection: { selected: boolean; toggle: () => void }) => ReactNode
  rowClassName?: (row: T) => string | undefined
  /** Right-click / long-press row menu. Return null to keep the browser menu. */
  getRowContextMenu?: (row: T) => ContextMenuItem[] | null | undefined
  empty?: ReactNode
  minWidth?: number
  /** Controlled expanded row (one at a time). Pair with `renderExpandedRow`. */
  expandedRowId?: string | null
  onExpandedRowChange?: (id: string | null) => void
  /** Full-width panel rendered under the expanded row (desktop table only). */
  renderExpandedRow?: (row: T) => ReactNode
}

const PAGE_SIZES = [25, 50, 100]

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string) {
  const lines = [columns.map((c) => csvCell(c.header)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','))]
  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function readPrefs(key: string): { hidden?: string[]; compact?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(`bcovered_grid_v1:${key}`) ?? '{}')
  } catch {
    return {}
  }
}

const defaultSearchText = (row: unknown) =>
  Object.values(row as Record<string, unknown>)
    .flatMap((v) => (typeof v === 'string' || typeof v === 'number' ? [String(v)] : v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).filter((x) => typeof x === 'string') : []))
    .join(' ')
    .toLowerCase()

export function DataGrid<T>({
  data,
  columns,
  getRowId,
  storageKey,
  searchPlaceholder = 'Search',
  searchText,
  initialSort = [],
  defaultHidden = [],
  toolbar,
  bulkActions,
  csv,
  mobileCard,
  rowClassName,
  getRowContextMenu,
  empty,
  minWidth = 900,
  expandedRowId = null,
  onExpandedRowChange: _onExpandedRowChange,
  renderExpandedRow,
}: DataGridProps<T>) {
  void _onExpandedRowChange
  const [params, setParams] = useSearchParams()
  const prefs = useMemo(() => readPrefs(storageKey), [storageKey])
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries((prefs.hidden ?? defaultHidden).map((id) => [id, false])),
  )
  const [compact, setCompact] = useState(Boolean(prefs.compact))
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [showColumns, setShowColumns] = useState(false)

  useEffect(() => {
    try {
      const hidden = Object.entries(visibility).filter(([, v]) => v === false).map(([k]) => k)
      localStorage.setItem(`bcovered_grid_v1:${storageKey}`, JSON.stringify({ hidden, compact }))
    } catch {
      /* preferences last for this visit */
    }
  }, [visibility, compact, storageKey])

  const q = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sorting: SortingState = sortParam ? [{ id: sortParam.replace(/^-/, ''), desc: sortParam.startsWith('-') }] : initialSort
  const pageSize = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : 25
  const pageIndex = Math.max(0, Number(params.get('page') ?? 1) - 1)

  const setParam = (updates: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(updates)) (v === null || v === '' ? next.delete(k) : next.set(k, v))
        return next
      },
      { replace: true },
    )

  const text = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of data) m.set(getRowId(r), (searchText ? searchText(r) : defaultSearchText(r)).toLowerCase())
    return m
  }, [data, getRowId, searchText])

  const selectColumn: ColumnDef<T, unknown> = {
    id: '_select',
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="Select all rows in this view"
        checked={table.getIsAllRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomeRowsSelected()
        }}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => <input type="checkbox" aria-label="Select row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} />,
  }

  const table = useReactTable<T>({
    data,
    columns: bulkActions || csv ? [selectColumn, ...columns] : columns,
    getRowId: (r) => getRowId(r),
    state: { sorting, globalFilter: q, columnVisibility: visibility, rowSelection: selection, pagination: { pageIndex, pageSize } },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      setParam({ sort: next[0] ? `${next[0].desc ? '-' : ''}${next[0].id}` : null, page: null })
    },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
      setParam({ page: next.pageIndex ? String(next.pageIndex + 1) : null, size: next.pageSize === 25 ? null : String(next.pageSize) })
    },
    globalFilterFn: (row, _id, value: string) => {
      const needle = String(value ?? '').trim().toLowerCase()
      if (!needle) return true
      const hay = text.get(row.id) ?? ''
      return needle.split(/\s+/).every((w) => hay.includes(w))
    },
    enableRowSelection: true,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Selection only ever covers rows that still exist in this view.
  const filteredIds = table.getFilteredRowModel().rows.map((r) => r.id).join('|')
  useEffect(() => {
    const keep = new Set(filteredIds.split('|'))
    setSelection((s) => {
      const next = Object.fromEntries(Object.entries(s).filter(([id]) => keep.has(id)))
      return Object.keys(next).length === Object.keys(s).length ? s : next
    })
  }, [filteredIds])

  const filtered = table.getFilteredRowModel().rows
  const selectedRows = table.getSelectedRowModel().flatRows.map((r) => r.original)
  const pageRows = table.getRowModel().rows
  const pageCount = Math.max(1, table.getPageCount())
  const clear = () => setSelection({})
  const toggle = (row: Row<T>) => () => row.toggleSelected()
  const cellPad = compact ? 'px-3 py-1.5' : 'px-4 py-3'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-navy-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setParam({ q: e.target.value, page: null })}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="field w-full py-1.5 pl-8 text-sm"
          />
          {q && (
            <button type="button" onClick={() => setParam({ q: null, page: null })} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-navy-400 hover:text-navy-700" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        {toolbar}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Button size="sm" variant="outline" onClick={() => setShowColumns((s) => !s)} aria-expanded={showColumns}>
              <Columns3 /> Columns
            </Button>
            {showColumns && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-navy-800/10 bg-white p-2 shadow-lg">
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-navy-800 hover:bg-mist">
                      <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                      {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                    </label>
                  ))}
                <button type="button" onClick={() => setVisibility({})} className="mt-1 w-full cursor-pointer rounded px-2 py-1 text-left text-xs font-semibold text-brand-700 hover:bg-mist">
                  Show all columns
                </button>
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCompact((c) => !c)} title={compact ? 'Comfortable rows' : 'Compact rows'} aria-pressed={compact}>
            <Rows3 />
          </Button>
          {csv && (
            <Button size="sm" variant="outline" onClick={() => downloadCsv(selectedRows.length ? selectedRows : filtered.map((r) => r.original), csv.columns, csv.filename)}>
              <Download /> {selectedRows.length ? `Export ${selectedRows.length}` : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      {bulkActions && selectedRows.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-50 px-3 py-2" role="region" aria-label="Bulk actions">
          <span className="text-sm font-semibold text-navy-900">{selectedRows.length} selected</span>
          {selectedRows.length < filtered.length && (
            <button type="button" onClick={() => table.toggleAllRowsSelected(true)} className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">
              Select all {filtered.length} in this view
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-navy-800/15" aria-hidden />
          {bulkActions(selectedRows, clear)}
          <button type="button" onClick={clear} className="ml-auto cursor-pointer text-xs font-semibold text-navy-600 hover:text-navy-900">
            Clear selection
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        empty
      ) : (
        <>
          {mobileCard && (
            <ul className="space-y-2 md:hidden">
              {pageRows.map((r) => (
                <li
                  key={r.id}
                  onContextMenu={(e) => {
                    if (!getRowContextMenu) return
                    const items = getRowContextMenu(r.original)
                    if (!items?.length) return
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, items })
                  }}
                >
                  {mobileCard(r.original, { selected: r.getIsSelected(), toggle: toggle(r) })}
                </li>
              ))}
            </ul>
          )}
          <div className={cn('panel scroll-area max-h-[70vh] overflow-auto', mobileCard && 'hidden md:block')}>
            <table className="w-full text-sm" style={{ minWidth }}>
              <thead className="sticky top-0 z-[1] bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const sorted = h.column.getIsSorted()
                      return (
                        <th key={h.id} className={cn(compact ? 'px-3 py-2' : 'px-4 py-3', h.column.id === '_select' && 'w-8')} aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}>
                          {h.isPlaceholder ? null : h.column.getCanSort() ? (
                            <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-navy-800">
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {sorted === 'asc' ? <ArrowUp className="h-3 w-3" /> : sorted === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {pageRows.map((r) => {
                  const isExpanded = Boolean(renderExpandedRow) && expandedRowId === r.id
                  const expandRegionId = `datagrid-expand-${storageKey}-${r.id}`
                  const colCount = r.getVisibleCells().length
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={cn(
                          'hover:bg-mist/60',
                          r.getIsSelected() && 'bg-brand-50/60',
                          isExpanded && 'bg-brand-50/40',
                          rowClassName?.(r.original),
                        )}
                        onContextMenu={(e) => {
                          if (!getRowContextMenu) return
                          const items = getRowContextMenu(r.original)
                          if (!items?.length) return
                          e.preventDefault()
                          setContextMenu({ x: e.clientX, y: e.clientY, items })
                        }}
                      >
                        {r.getVisibleCells().map((c) => (
                          <td key={c.id} className={cn(cellPad, 'align-top')}>
                            {flexRender(c.column.columnDef.cell, c.getContext())}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr className="bg-brand-50/30 hover:bg-brand-50/30">
                          <td
                            colSpan={colCount}
                            className="p-0 align-top"
                            id={expandRegionId}
                            role="region"
                            aria-label="Expanded row detail"
                          >
                            <div className="max-h-[min(52vh,28rem)] overflow-auto border-t border-brand-200/60 px-3 py-3 sm:px-4">
                              {renderExpandedRow?.(r.original)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <RowContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-navy-600">
        <span>
          {filtered.length === data.length ? `${data.length} rows` : `${filtered.length} of ${data.length} rows`}
          {selectedRows.length ? ` · ${selectedRows.length} selected` : ''}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            Rows per page
            <select value={pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))} className="field py-0.5 text-xs" aria-label="Rows per page">
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="ghost" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span>
            Page {Math.min(pageIndex + 1, pageCount)} of {pageCount}
          </span>
          <Button size="sm" variant="ghost" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
