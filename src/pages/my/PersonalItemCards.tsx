import { Fragment, type ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import type { CustomerPageItem } from '@/api/customerPage'
import { RowActionsButton, type ContextMenuItem, type ContextMenuState } from '@/broker/shared/RowContextMenu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { moneyOrNotSupplied } from '@/pages/my/portalFormat'
import { itemStatus } from '@/pages/my/portalItemMenu'

const STATUS_CLASS: Record<string, string> = {
  covered: 'bg-emerald-50 text-emerald-800',
  awaiting_cover: 'bg-amber-50 text-amber-900',
  request_sent: 'bg-sky-50 text-sky-900',
  review_needed: 'bg-rose-50 text-rose-800',
  not_confirmed: 'bg-navy-50 text-navy-700',
}

const STATUS_LABEL: Record<string, string> = {
  covered: 'Covered',
  awaiting_cover: 'Awaiting cover',
  request_sent: 'Request sent',
  review_needed: 'Review needed',
  not_confirmed: 'Not confirmed',
}

/** Card grid for personal Assets & cover — complements List and Map. */
export function PersonalItemCards({
  items,
  selectedId,
  readOnly,
  menuFor,
  onOpenMenu,
  onOpen,
  onPrimary,
  primaryLabel = 'Open',
  renderExpanded,
}: {
  items: CustomerPageItem[]
  selectedId: string | null
  readOnly?: boolean
  menuFor: (item: CustomerPageItem) => ContextMenuItem[]
  onOpenMenu: (state: ContextMenuState) => void
  onOpen: (item: CustomerPageItem) => void
  onPrimary?: (item: CustomerPageItem) => void
  primaryLabel?: string
  renderExpanded?: (item: CustomerPageItem) => ReactNode
}) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Item cards">
      {items.map((item) => {
        const status = itemStatus(item)
        const focused = selectedId === item.id
        return (
          <Fragment key={item.id}>
            <article
              role="listitem"
              className={cn(
                'flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition',
                focused
                  ? 'border-brand-300 ring-1 ring-brand-200'
                  : 'border-navy-800/10 hover:border-brand-300/50',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    onClick={() => onOpen(item)}
                    aria-expanded={Boolean(renderExpanded) && focused}
                  >
                    <p className="font-semibold leading-snug text-navy-900">{item.display_label}</p>
                    <p className="mt-0.5 text-xs capitalize text-navy-500">{item.item_type}</p>
                  </button>
                </div>
                {!readOnly && <RowActionsButton items={menuFor(item)} onOpen={onOpenMenu} />}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Value</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-navy-900">
                    {moneyOrNotSupplied(item.insured_value)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Location</dt>
                  <dd className="mt-0.5 flex items-start gap-1 text-navy-800">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-navy-400" aria-hidden />
                    <span className="min-w-0">{item.location_name ?? 'No location set'}</span>
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-800/10 pt-3">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    STATUS_CLASS[status] ?? STATUS_CLASS.not_confirmed,
                  )}
                >
                  {STATUS_LABEL[status] ?? status}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" type="button" onClick={() => onOpen(item)}>
                    Open
                  </Button>
                  {!readOnly && onPrimary && (
                    <Button size="sm" variant="accent" type="button" onClick={() => onPrimary(item)}>
                      {primaryLabel}
                    </Button>
                  )}
                </div>
              </div>
            </article>
            {focused && renderExpanded ? (
              <div className="col-span-full" role="region" aria-label={`${item.display_label} details`}>
                {renderExpanded(item)}
              </div>
            ) : null}
          </Fragment>
        )
      })}
    </div>
  )
}
