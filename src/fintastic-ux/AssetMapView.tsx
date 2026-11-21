import { useMemo, useState, type MouseEvent } from 'react'
import {
  Check,
  ChevronRight,
  Fullscreen,
  Map as MapIcon,
  Minus,
  MoreHorizontal,
  Plus,
  Smartphone,
  TriangleAlert,
  CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { areasForPack, illustrationUrlForPack } from './illustratedPacks'
import { MAP_STATUS_LABEL, MAP_STATUS_PIN_CLASS } from './assetMapStatus'
import type { AssetMapModel, AssetMapPin, AssetMapPlace } from './assetMapTypes'

function SiteLayoutCanvas({
  floorPlanUrl,
  pins,
  alsoUsed,
  focusedId,
  onSelectPin,
  onPinMenu,
}: {
  floorPlanUrl: string
  pins: AssetMapPin[]
  alsoUsed: AssetMapPin[]
  focusedId: string | null
  onSelectPin: (id: string) => void
  onPinMenu?: (pinId: string, e: MouseEvent) => void
}) {
  const all = [
    ...pins.map((p) => ({ pin: p, alsoUsed: false as boolean })),
    ...alsoUsed.map((p) => ({ pin: p, alsoUsed: true as boolean })),
  ]
  return (
    <div className="relative mx-auto min-h-[14rem] w-full max-w-3xl overflow-hidden rounded-xl border border-navy-800/15 bg-navy-900/5 shadow-inner sm:min-h-[16rem]">
      <img
        src={floorPlanUrl}
        alt="Site floor plan"
        className="h-full min-h-[14rem] w-full object-cover opacity-90 sm:min-h-[16rem]"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/25 via-transparent to-navy-950/10" />
      {all.map(({ pin, alsoUsed: also }, i) => {
        const x = pin.layoutX ?? 20 + (i % 5) * 15
        const y = pin.layoutY ?? 25 + Math.floor(i / 5) * 18
        return (
          <div
            key={`${pin.id}-${also ? 'also' : 'base'}`}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <PinButton
              pin={pin}
              selected={focusedId === pin.id}
              onSelect={onSelectPin}
              onPinMenu={onPinMenu}
              alsoUsed={also}
            />
          </div>
        )
      })}
      {all.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm font-semibold text-white drop-shadow">
          No assets on this plan yet
        </p>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: AssetMapPin['status'] }) {
  if (status === 'covered') return <Check className="h-3 w-3" aria-hidden />
  if (status === 'awaiting_cover') return <TriangleAlert className="h-3 w-3" aria-hidden />
  return <CalendarClock className="h-3 w-3" aria-hidden />
}

function PinButton({
  pin,
  selected,
  onSelect,
  onPinMenu,
  alsoUsed,
}: {
  pin: AssetMapPin
  selected: boolean
  onSelect: (id: string) => void
  onPinMenu?: (pinId: string, e: MouseEvent) => void
  alsoUsed?: boolean
}) {
  return (
    <div className="group relative flex max-w-[11rem] flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(pin.id)}
        onContextMenu={(e) => {
          if (!onPinMenu) return
          e.preventDefault()
          e.stopPropagation()
          onPinMenu(pin.id, e)
        }}
        className={cn(
          'flex touch-manipulation flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-left transition',
          selected ? 'scale-105' : 'hover:scale-[1.02]',
        )}
        aria-pressed={selected}
        aria-label={`${pin.label}${alsoUsed ? ' (also used here)' : ''}`}
      >
        <span
          className={cn(
            'grid h-8 w-8 place-items-center rounded-full shadow-md ring-2',
            MAP_STATUS_PIN_CLASS[pin.status],
            selected && 'ring-4 ring-brand-300',
            alsoUsed && 'ring-dashed',
          )}
        >
          {pin.mobility === 'portable' ? (
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <StatusIcon status={pin.status} />
          )}
        </span>
        <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-navy-900 shadow-sm">
          {pin.label}
          {alsoUsed ? ' · also here' : ''}
        </span>
      </button>
      {onPinMenu && (
        <button
          type="button"
          className="absolute -top-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-navy-800/15 bg-white text-navy-600 opacity-100 shadow-sm transition touch-manipulation sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          aria-label={`Actions for ${pin.label}`}
          onClick={(e) => {
            e.stopPropagation()
            onPinMenu(pin.id, e)
          }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

function statusCounts(pins: AssetMapPin[]) {
  return {
    covered: pins.filter((p) => p.status === 'covered').length,
    awaiting: pins.filter((p) => p.status === 'awaiting_cover').length,
    review: pins.filter((p) => p.status === 'review_due').length,
  }
}

function StatusChips({ pins }: { pins: AssetMapPin[] }) {
  const { covered, awaiting, review } = statusCounts(pins)
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {covered > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
          <span className={cn('grid h-3.5 w-3.5 place-items-center rounded-full', MAP_STATUS_PIN_CLASS.covered)}>
            <StatusIcon status="covered" />
          </span>
          {covered}
        </span>
      )}
      {awaiting > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
          <span
            className={cn('grid h-3.5 w-3.5 place-items-center rounded-full', MAP_STATUS_PIN_CLASS.awaiting_cover)}
          >
            <StatusIcon status="awaiting_cover" />
          </span>
          {awaiting}
        </span>
      )}
      {review > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
          <span className={cn('grid h-3.5 w-3.5 place-items-center rounded-full', MAP_STATUS_PIN_CLASS.review_due)}>
            <StatusIcon status="review_due" />
          </span>
          {review}
        </span>
      )}
      {pins.length === 0 && <span className="text-[10px] font-semibold text-navy-500">No assets yet</span>}
    </div>
  )
}

export function AssetMapView({
  model,
  placeId,
  areaId = null,
  focusedId,
  onSelectPlace,
  onSelectArea,
  onSelectPin,
  onPinMenu,
  onExpand,
  className,
  compact,
}: {
  model: AssetMapModel
  placeId: string | null
  areaId?: string | null
  focusedId: string | null
  onSelectPlace: (placeId: string | null) => void
  onSelectArea?: (areaId: string | null) => void
  onSelectPin: (pinId: string) => void
  onPinMenu?: (pinId: string, e: MouseEvent) => void
  /** Restore the full map star from the compact strip (Show map). */
  onExpand?: () => void
  className?: string
  /** When Expand grid collapses the star. */
  compact?: boolean
}) {
  const [zoom, setZoom] = useState(1)
  const sites = useMemo(() => model.places.filter((p) => p.kind === 'site'), [model.places])
  const portableGroup = model.places.find((p) => p.kind === 'portable_group')
  const activePlace: AssetMapPlace | null = placeId
    ? (model.places.find((p) => p.id === placeId) ?? null)
    : null

  const sitePins = useMemo(() => {
    if (!activePlace || activePlace.kind !== 'site') return []
    return model.pins.filter(
      (p) =>
        p.placeId === activePlace.id ||
        (p.mobility === 'portable' && p.typicallyUsedPlaceIds.includes(activePlace.id)),
    )
  }, [activePlace, model.pins])

  const fixedAtSite = sitePins.filter(
    (p) => p.mobility !== 'portable' || p.placeId === activePlace?.id,
  )
  const alsoUsedHere = sitePins.filter(
    (p) =>
      p.mobility === 'portable' &&
      p.placeId !== activePlace?.id &&
      p.typicallyUsedPlaceIds.includes(activePlace?.id ?? ''),
  )
  const portablePins = model.pins.filter((p) => p.mobility === 'portable')
  const areas = areasForPack(model.industryPack)
  const activeArea = areaId ? areas.find((a) => a.id === areaId) ?? null : null
  const isBranchItems = areaId === 'branch-items'
  const packIllustration = illustrationUrlForPack(model.industryPack)
  const siteFloorPlan =
    activePlace?.kind === 'site' ? activePlace.floorPlanUrl || null : null
  const useSiteLayout = Boolean(siteFloorPlan)
  const styleLabel = useSiteLayout ? 'Site layout' : 'Illustrated overview'

  const areaScopedFixed = useMemo(() => {
    if (!areaId) return fixedAtSite
    if (areaId === 'branch-items') return fixedAtSite.filter((p) => !p.areaId)
    return fixedAtSite.filter((p) => p.areaId === areaId)
  }, [areaId, fixedAtSite])

  const crumbs = [
    { id: null as string | null, area: null as string | null, label: model.customerLabel },
    ...(activePlace ? [{ id: activePlace.id, area: null as string | null, label: activePlace.label }] : []),
    ...(activePlace?.kind === 'site' && (activeArea || isBranchItems)
      ? [
          {
            id: activePlace.id,
            area: areaId,
            label: activeArea?.label ?? 'Branch items',
          },
        ]
      : []),
  ]

  if (compact) {
    const focused = model.pins.find((p) => p.id === focusedId)
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-2xl border border-navy-800/10 bg-white px-4 py-3',
          className,
        )}
      >
        <MapIcon className="h-4 w-4 text-brand-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-navy-500 uppercase">{styleLabel}</p>
          <p className="truncate text-sm font-semibold text-navy-900">
            {focused
              ? focused.label
              : activeArea?.label ?? (isBranchItems ? 'Branch items' : activePlace?.label ?? model.title)}
          </p>
        </div>
        <Button size="sm" variant="outline" type="button" onClick={() => onExpand?.()}>
          Show map
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-navy-800/10 bg-white', className)}>
      <div className="flex flex-col gap-0 lg:flex-row">
        <nav
          className="w-full shrink-0 border-b border-navy-800/10 bg-mist/40 p-3 lg:w-52 lg:border-r lg:border-b-0"
          aria-label="Places"
        >
          <p className="mb-2 text-[10px] font-bold tracking-wide text-navy-500 uppercase">Places</p>
          {/* Mobile: horizontal chips; desktop: vertical list */}
          <ul className="scroll-x -mx-1 flex flex-nowrap gap-1.5 px-1 pb-0.5 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0">
            <li className="shrink-0 lg:block lg:w-full">
              <button
                type="button"
                className={cn(
                  'flex items-center justify-between rounded-full px-3 py-2 text-left text-xs font-semibold touch-manipulation lg:w-full lg:rounded-lg lg:px-2.5',
                  !placeId ? 'bg-brand-50 text-brand-900' : 'bg-white text-navy-700 ring-1 ring-navy-800/10 hover:bg-white lg:bg-transparent lg:ring-0',
                )}
                onClick={() => onSelectPlace(null)}
              >
                Overview
              </button>
            </li>
            {sites.map((site) => (
              <li key={site.id} className="shrink-0 lg:block lg:w-full">
                <button
                  type="button"
                  className={cn(
                    'flex max-w-[11rem] items-center justify-between gap-1.5 rounded-full px-3 py-2 text-left text-xs font-semibold touch-manipulation lg:max-w-none lg:w-full lg:rounded-lg lg:px-2.5',
                    placeId === site.id ? 'bg-brand-50 text-brand-900' : 'bg-white text-navy-700 ring-1 ring-navy-800/10 hover:bg-white lg:bg-transparent lg:ring-0',
                  )}
                  onClick={() => onSelectPlace(site.id)}
                >
                  <span className="truncate">{site.label}</span>
                  <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 opacity-50 lg:block" aria-hidden />
                </button>
              </li>
            ))}
            {portableGroup && (
              <li className="shrink-0 lg:block lg:w-full">
                <button
                  type="button"
                  className={cn(
                    'flex max-w-[11rem] items-center justify-between gap-1.5 rounded-full px-3 py-2 text-left text-xs font-semibold touch-manipulation lg:max-w-none lg:w-full lg:rounded-lg lg:px-2.5',
                    placeId === portableGroup.id ? 'bg-brand-50 text-brand-900' : 'bg-white text-navy-700 ring-1 ring-navy-800/10 hover:bg-white lg:bg-transparent lg:ring-0',
                  )}
                  onClick={() => onSelectPlace(portableGroup.id)}
                >
                  <span className="truncate">{portableGroup.label}</span>
                  <Smartphone className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                </button>
              </li>
            )}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800/10 px-4 py-2.5">
            <nav className="flex flex-wrap items-center gap-1 text-xs text-navy-600" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={`${c.id ?? 'root'}-${c.area ?? 'none'}-${i}`} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" aria-hidden />}
                  <button
                    type="button"
                    className={cn(
                      'rounded px-1 py-0.5 font-semibold',
                      i === crumbs.length - 1 ? 'text-navy-900' : 'hover:bg-mist',
                    )}
                    onClick={() => {
                      if (c.area) {
                        onSelectPlace(c.id)
                        onSelectArea?.(c.area)
                        return
                      }
                      onSelectPlace(c.id)
                      onSelectArea?.(null)
                    }}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
            </nav>
            <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{styleLabel}</p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-mist to-teal-50 p-3">
            {!activePlace && packIllustration && (
              <img
                src={packIllustration}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18]"
              />
            )}
            <div
              className={cn('relative', activePlace ? 'min-h-[16rem]' : 'min-h-[14rem]')}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            >
              {(activePlace || areaId) && (
                <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col gap-1">
                  <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-navy-800/15 bg-white shadow-sm">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center text-navy-700 hover:bg-mist"
                      aria-label="Zoom in"
                      onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center border-t border-navy-800/10 text-navy-700 hover:bg-mist"
                      aria-label="Zoom out"
                      onClick={() => setZoom((z) => Math.max(0.8, z - 0.1))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center border-t border-navy-800/10 text-navy-700 hover:bg-mist"
                      aria-label="Reset zoom"
                      onClick={() => setZoom(1)}
                    >
                      <Fullscreen className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {!activePlace && (
                <>
                  {/* Mobile overview: stacked place cards (radial star overflows small screens) */}
                  <div className="space-y-3 px-1 py-2 lg:hidden">
                    <div className="rounded-xl border border-brand-200 bg-white/95 px-3 py-3 shadow-sm">
                      <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Business</p>
                      <p className="text-sm font-bold text-navy-900">{model.customerLabel}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-navy-600">
                        {model.pins.length} asset{model.pins.length === 1 ? '' : 's'} · tap a place
                      </p>
                      <StatusChips pins={model.pins} />
                    </div>
                    <ul className="space-y-2">
                      {sites.map((site) => {
                        const pins = model.pins.filter(
                          (p) => p.placeId === site.id || p.typicallyUsedPlaceIds.includes(site.id),
                        )
                        return (
                          <li key={site.id}>
                            <button
                              type="button"
                              onClick={() => onSelectPlace(site.id)}
                              className="flex w-full items-start justify-between gap-3 rounded-xl border border-navy-800/10 bg-white/95 px-3 py-3 text-left shadow-sm transition touch-manipulation hover:border-brand-300 active:bg-mist"
                            >
                              <span className="min-w-0">
                                <p className="truncate text-sm font-semibold text-navy-900">{site.label}</p>
                                {site.subtitle && (
                                  <p className="truncate text-[11px] text-navy-500">{site.subtitle}</p>
                                )}
                                <p className="mt-1 text-[11px] font-semibold text-navy-700">
                                  {pins.length} asset{pins.length === 1 ? '' : 's'}
                                </p>
                                <StatusChips pins={pins} />
                              </span>
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-navy-400" aria-hidden />
                            </button>
                          </li>
                        )
                      })}
                      {portableGroup && (
                        <li>
                          <button
                            type="button"
                            onClick={() => onSelectPlace(portableGroup.id)}
                            className="flex w-full items-start justify-between gap-3 rounded-xl border border-dashed border-navy-800/25 bg-white/90 px-3 py-3 text-left shadow-sm transition touch-manipulation hover:border-brand-300"
                          >
                            <span className="min-w-0">
                              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-900">
                                <Smartphone className="h-4 w-4" aria-hidden />
                                {portableGroup.label}
                              </p>
                              <p className="mt-1 text-[11px] font-semibold text-navy-700">
                                {portablePins.length} portable
                              </p>
                              <StatusChips pins={portablePins} />
                            </span>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-navy-400" aria-hidden />
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Desktop overview: radial place star */}
                  <div className="relative mx-auto hidden min-h-[14rem] max-w-3xl items-center justify-center px-2 py-4 lg:flex">
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full text-navy-400/40"
                      aria-hidden
                    >
                      {sites.map((_, i) => {
                        const angle = (-90 + (360 / Math.max(sites.length, 1)) * i) * (Math.PI / 180)
                        const x2 = 50 + Math.cos(angle) * 38
                        const y2 = 50 + Math.sin(angle) * 34
                        return (
                          <line
                            key={i}
                            x1="50%"
                            y1="50%"
                            x2={`${x2}%`}
                            y2={`${y2}%`}
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeDasharray="4 4"
                          />
                        )
                      })}
                    </svg>

                    <div className="relative z-10 grid h-24 w-24 place-items-center rounded-full border-2 border-brand-300 bg-white shadow-md">
                      <div className="px-2 text-center">
                        <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Business</p>
                        <p className="text-xs font-bold text-navy-900 leading-tight">{model.customerLabel}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-navy-600">
                          {model.pins.length} asset{model.pins.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    {sites.map((site, i) => {
                      const pins = model.pins.filter(
                        (p) => p.placeId === site.id || p.typicallyUsedPlaceIds.includes(site.id),
                      )
                      const angle = (-90 + (360 / Math.max(sites.length, 1)) * i) * (Math.PI / 180)
                      const x = 50 + Math.cos(angle) * 38
                      const y = 50 + Math.sin(angle) * 34
                      return (
                        <button
                          key={site.id}
                          type="button"
                          onClick={() => onSelectPlace(site.id)}
                          className="absolute z-10 w-[9.5rem] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-navy-800/10 bg-white/95 px-3 py-2.5 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md"
                          style={{ left: `${x}%`, top: `${y}%` }}
                        >
                          <p className="truncate text-sm font-semibold text-navy-900">{site.label}</p>
                          {site.subtitle && <p className="truncate text-[11px] text-navy-500">{site.subtitle}</p>}
                          <p className="mt-1 text-[11px] font-semibold text-navy-700">
                            {pins.length} asset{pins.length === 1 ? '' : 's'}
                          </p>
                          <StatusChips pins={pins} />
                        </button>
                      )
                    })}

                    {portableGroup && (
                      <button
                        type="button"
                        onClick={() => onSelectPlace(portableGroup.id)}
                        className="absolute bottom-1 left-1/2 z-10 w-[10rem] -translate-x-1/2 rounded-xl border border-dashed border-navy-800/25 bg-white/90 px-3 py-2 text-left shadow-sm transition hover:border-brand-300"
                      >
                        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-900">
                          <Smartphone className="h-4 w-4" aria-hidden />
                          {portableGroup.label}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-navy-700">
                          {portablePins.length} portable
                        </p>
                        <StatusChips pins={portablePins} />
                      </button>
                    )}
                  </div>
                </>
              )}

              {activePlace?.kind === 'portable_group' && (
                <div className="space-y-4 pt-8 pb-6">
                  {portablePins.length === 0 ? (
                    <p className="text-center text-sm text-navy-600">No portable items yet.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap justify-center gap-4">
                        {portablePins.map((pin) => (
                          <PinButton
                            key={pin.id}
                            pin={pin}
                            selected={focusedId === pin.id}
                            onSelect={onSelectPin}
                            onPinMenu={onPinMenu}
                          />
                        ))}
                      </div>
                      <ul className="mx-auto max-w-lg space-y-1.5 px-2">
                        {portablePins.map((pin) => {
                          const placeLabels = pin.typicallyUsedPlaceIds
                            .map((id) => model.places.find((p) => p.id === id)?.label)
                            .filter(Boolean)
                          const base = model.places.find((p) => p.id === pin.placeId)?.label
                          return (
                            <li
                              key={`links-${pin.id}`}
                              className="rounded-lg border border-dashed border-navy-800/15 bg-white/80 px-3 py-2 text-[11px] text-navy-700"
                            >
                              <span className="font-semibold text-navy-900">{pin.label}</span>
                              {base ? ` · usual base ${base}` : ''}
                              {placeLabels.length > 0
                                ? ` · typically used at ${placeLabels.join(' · ')}`
                                : ''}
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {activePlace?.kind === 'site' && useSiteLayout && siteFloorPlan && (
                <div className="space-y-3 pt-4 pb-4">
                  <SiteLayoutCanvas
                    floorPlanUrl={siteFloorPlan}
                    pins={areaId ? areaScopedFixed : fixedAtSite}
                    alsoUsed={alsoUsedHere}
                    focusedId={focusedId}
                    onSelectPin={onSelectPin}
                    onPinMenu={onPinMenu}
                  />
                  {!areaId && (
                    <div className="flex flex-wrap gap-2">
                      {areas.map((area) => (
                        <Button
                          key={area.id}
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => onSelectArea?.(area.id)}
                        >
                          {area.label}
                        </Button>
                      ))}
                      {fixedAtSite.some((p) => !p.areaId) && (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => onSelectArea?.('branch-items')}
                        >
                          Branch items
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activePlace?.kind === 'site' && !useSiteLayout && !areaId && (
                <div className="space-y-4 pt-6 pb-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {areas.map((area) => {
                      const inArea = fixedAtSite.filter((p) => p.areaId === area.id)
                      return (
                        <div
                          key={area.id}
                          className={cn(
                            'relative min-h-[7.5rem] rounded-2xl border border-white/60 bg-gradient-to-br p-3 text-left shadow-sm transition hover:ring-2 hover:ring-brand-300',
                            area.accent,
                          )}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => onSelectArea?.(area.id)}
                          >
                            <p className="text-xs font-bold text-navy-900">{area.label}</p>
                            <p className="text-[10px] text-navy-600">{area.hint}</p>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {inArea.map((pin) => (
                              <PinButton
                                key={pin.id}
                                pin={pin}
                                selected={focusedId === pin.id}
                                onSelect={(id) => {
                                  onSelectArea?.(area.id)
                                  onSelectPin(id)
                                }}
                                onPinMenu={onPinMenu}
                              />
                            ))}
                          </div>
                          {inArea.length === 0 && (
                            <button
                              type="button"
                              className="mt-3 text-[10px] text-navy-500 hover:text-navy-700"
                              onClick={() => onSelectArea?.(area.id)}
                            >
                              No assets assigned yet — open area
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {fixedAtSite.filter((p) => !p.areaId).length > 0 && (
                    <div className="w-full rounded-xl border border-dashed border-navy-800/20 bg-white/70 p-3 text-left transition hover:border-brand-300">
                      <button
                        type="button"
                        className="mb-2 text-[10px] font-bold tracking-wide text-navy-500 uppercase hover:text-navy-800"
                        onClick={() => onSelectArea?.('branch-items')}
                      >
                        Branch items
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {fixedAtSite
                          .filter((p) => !p.areaId)
                          .map((pin) => (
                            <PinButton
                              key={pin.id}
                              pin={pin}
                              selected={focusedId === pin.id}
                              onSelect={(id) => {
                                onSelectArea?.('branch-items')
                                onSelectPin(id)
                              }}
                              onPinMenu={onPinMenu}
                            />
                          ))}
                      </div>
                    </div>
                  )}
                  {alsoUsedHere.length > 0 && (
                    <div className="rounded-xl border border-brand-200/60 bg-brand-50/50 p-3">
                      <p className="mb-2 text-[10px] font-bold tracking-wide text-brand-800 uppercase">
                        Also used here
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {alsoUsedHere.map((pin) => (
                          <PinButton
                            key={pin.id}
                            pin={pin}
                            selected={focusedId === pin.id}
                            onSelect={onSelectPin}
                            onPinMenu={onPinMenu}
                            alsoUsed
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activePlace?.kind === 'site' && !useSiteLayout && areaId && (
                <div className="space-y-4 pt-6 pb-4">
                  <div
                    className={cn(
                      'min-h-[10rem] rounded-2xl border border-white/60 bg-gradient-to-br p-4 shadow-sm',
                      activeArea?.accent ?? 'from-mist to-white',
                    )}
                  >
                    <p className="text-sm font-bold text-navy-900">
                      {activeArea?.label ?? 'Branch items'}
                    </p>
                    <p className="text-xs text-navy-600">
                      {activeArea?.hint ?? 'Items at this site without an area assignment'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {areaScopedFixed.length === 0 ? (
                        <p className="text-sm text-navy-600">No assets in this area yet.</p>
                      ) : (
                        areaScopedFixed.map((pin) => (
                          <PinButton
                            key={pin.id}
                            pin={pin}
                            selected={focusedId === pin.id}
                            onSelect={onSelectPin}
                            onPinMenu={onPinMenu}
                          />
                        ))
                      )}
                    </div>
                  </div>
                  {alsoUsedHere.length > 0 && (
                    <div className="rounded-xl border border-brand-200/60 bg-brand-50/50 p-3">
                      <p className="mb-2 text-[10px] font-bold tracking-wide text-brand-800 uppercase">
                        Also used here
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {alsoUsedHere.map((pin) => (
                          <PinButton
                            key={pin.id}
                            pin={pin}
                            selected={focusedId === pin.id}
                            onSelect={onSelectPin}
                            onPinMenu={onPinMenu}
                            alsoUsed
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-800/10 px-4 py-2 text-[11px] text-navy-600">
            {(['covered', 'awaiting_cover', 'review_due'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 font-semibold">
                <span className={cn('grid h-5 w-5 place-items-center rounded-full', MAP_STATUS_PIN_CLASS[s])}>
                  <StatusIcon status={s} />
                </span>
                {MAP_STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
