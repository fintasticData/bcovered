import { Fragment, type ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import type { BusinessPageAsset } from '@/api/businessPage'
import { RowActionsButton, type ContextMenuItem, type ContextMenuState } from '@/broker/shared/RowContextMenu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { moneyOrNotSupplied } from '@/pages/my/portalFormat'
import {
  ASSET_STATUS_CLASS,
  ASSET_STATUS_LABEL,
  assetStatus,
  assetTypeDef,
  humaniseClass,
  primaryActionFor,
} from '@/pages/my/assetTypeRegistry'

/** Card grid for My Business Page assets — complements the working table. */
export function BusinessAssetCards({
  assets,
  selectedId,
  readOnly,
  menuFor,
  onOpenMenu,
  onOpen,
  onPrimary,
  renderExpanded,
}: {
  assets: BusinessPageAsset[]
  selectedId: string | null
  readOnly?: boolean
  menuFor: (asset: BusinessPageAsset) => ContextMenuItem[]
  onOpenMenu: (state: ContextMenuState) => void
  onOpen: (asset: BusinessPageAsset) => void
  onPrimary: (asset: BusinessPageAsset) => void
  /** Fintastic queue-first: hub under the focused card. */
  renderExpanded?: (asset: BusinessPageAsset) => ReactNode
}) {
  if (assets.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Asset cards">
      {assets.map((asset) => {
        const status = assetStatus(asset)
        const action = primaryActionFor(status)
        const def = assetTypeDef(asset.asset_class)
        const Icon = def.Icon
        const focused = selectedId === asset.id
        return (
          <Fragment key={asset.id}>
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
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    onClick={() => onOpen(asset)}
                    aria-expanded={Boolean(renderExpanded) && focused}
                  >
                    <p className="font-semibold leading-snug text-navy-900">{asset.display_label}</p>
                    <p className="mt-0.5 text-xs capitalize text-navy-500">{humaniseClass(asset.asset_class)}</p>
                  </button>
                </div>
                {!readOnly && <RowActionsButton items={menuFor(asset)} onOpen={onOpenMenu} />}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Value</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-navy-900">
                    {moneyOrNotSupplied(asset.declared_value)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Qty</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-navy-900">{asset.quantity}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Location</dt>
                  <dd className="mt-0.5 flex items-start gap-1 text-navy-800">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-navy-400" aria-hidden />
                    <span className="min-w-0">{asset.location_name ?? 'No location set'}</span>
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-800/10 pt-3">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    ASSET_STATUS_CLASS[status],
                  )}
                >
                  {ASSET_STATUS_LABEL[status]}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" type="button" onClick={() => onOpen(asset)}>
                    Open
                  </Button>
                  {!readOnly && action.kind !== 'none' && (
                    <Button size="sm" variant="accent" type="button" onClick={() => onPrimary(asset)}>
                      {action.label}
                    </Button>
                  )}
                </div>
              </div>
            </article>
            {focused && renderExpanded ? (
              <div className="col-span-full" role="region" aria-label={`${asset.display_label} details`}>
                {renderExpanded(asset)}
              </div>
            ) : null}
          </Fragment>
        )
      })}
    </div>
  )
}
