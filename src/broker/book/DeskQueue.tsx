import { Building2, Package, UserRound } from 'lucide-react'
import { STAGE_LABEL, type GridRow, type MemberRef } from '@/copilot/salesApi'
import { cn } from '@/lib/utils'
import { ClientGrid } from './ClientGrid'
import { QUEUE_FILTERS, type BrowseMode, type QueueFilter } from './queueTypes'

export type { BrowseMode, QueueFilter }
export { QUEUE_FILTERS }

function nextAction(r: GridRow): string {
  if (r.next_follow_up) return r.next_follow_up.title
  if (r.stage === 'new_enquiry') return 'Capture requirements'
  if (r.stage === 'offer_sent') return 'Follow up on offer'
  if (r.stage === 'accepted') return 'Record decision'
  if (r.stage === 'sold' || r.stage === 'client') return 'Service cover'
  return 'Review'
}

function ItemRows({ rows, selectedId, onOpen }: { rows: GridRow[]; selectedId?: string | null; onOpen: (id: string) => void }) {
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-navy-800/15 bg-white px-3 py-6 text-center text-sm text-navy-600">No insured items match this filter. Open a customer to add offers or record cover.</p>
  }
  return (
    <ul className="space-y-2" aria-label="Insured items">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className={cn(
              'block w-full cursor-pointer rounded-xl border bg-white p-3 text-left text-sm',
              selectedId === r.id ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10 hover:border-brand-500/40',
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium text-navy-900">
                  {r.contact_stage === 'client' ? <Package className="h-3.5 w-3.5 text-brand-700" /> : <Building2 className="h-3.5 w-3.5 text-navy-500" />}
                  <span className="truncate">{r.offers > 0 ? `${r.offers} offer${r.offers === 1 ? '' : 's'}` : r.sales > 0 ? 'Cover on record' : 'No item yet'} · {r.name}</span>
                </span>
                <span className="mt-0.5 block text-xs text-navy-500">
                  Owner <span className="font-mono">{r.client_number}</span> · {STAGE_LABEL[r.stage]}
                </span>
              </span>
            </span>
            <span className="mt-2 block text-xs text-navy-700">
              <span className="font-semibold text-navy-500 uppercase tracking-wide text-[10px]">Next action</span>
              <span className="mt-0.5 block truncate">{nextAction(r)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Left desk queue: People & businesses or Insured items, with readable work filters. */
export function DeskQueue({
  mode,
  onMode,
  filter,
  onFilter,
  filterCounts,
  scope,
  onScope,
  canSeeTeam,
  member,
  onClearMember,
  onOpen,
  selectedId,
  itemRows,
}: {
  mode: BrowseMode
  onMode: (m: BrowseMode) => void
  filter: QueueFilter
  onFilter: (f: QueueFilter) => void
  filterCounts: Partial<Record<QueueFilter, number>>
  scope: 'mine' | 'team'
  onScope: (s: 'mine' | 'team') => void
  canSeeTeam: boolean
  member: MemberRef | null
  onClearMember: () => void
  onOpen: (personId: string) => void
  selectedId?: string | null
  itemRows: GridRow[]
}) {
  return (
    <aside className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Work queue">
      <div className="space-y-3 border-b border-navy-800/10 px-3 py-3">
        <div role="tablist" aria-label="Browse mode" className="grid grid-cols-2 gap-1 rounded-xl bg-navy-100/70 p-0.5">
          {(
            [
              ['people', 'People & businesses', UserRound],
              ['items', 'Insured items', Package],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => onMode(id)}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold',
                mode === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Queue filters">
          {QUEUE_FILTERS.map((f) => {
            const n = filterCounts[f.id]
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilter(f.id)}
                className={cn(
                  'cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition',
                  filter === f.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-navy-700 ring-navy-800/10 hover:ring-brand-500/40',
                )}
              >
                {f.label}
                {typeof n === 'number' ? ` (${n})` : ''}
              </button>
            )
          })}
        </div>
      </div>
      <div className="scroll-area flex-1 px-3 py-3">
        {filter === 'renewals' ? (
          <p className="rounded-xl border border-dashed border-navy-800/15 bg-white px-3 py-6 text-center text-sm text-navy-600">
            No renewal queue is wired yet. Covered customers appear under Covered; renewals will use policy renewal dates when that feed is connected.
          </p>
        ) : mode === 'items' ? (
          <ItemRows rows={itemRows} selectedId={selectedId} onOpen={onOpen} />
        ) : (
          <ClientGrid
            scope={scope}
            onScope={onScope}
            canSeeTeam={canSeeTeam}
            member={member}
            onClearMember={onClearMember}
            onOpen={onOpen}
            selectedId={selectedId}
            queueFilter={filter}
          />
        )}
      </div>
    </aside>
  )
}
