import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  LayoutGrid,
  List,
  Map as MapIcon,
  MessageSquare,
  Network,
  PanelRightOpen,
} from 'lucide-react'
import type { BusinessPageAsset, BusinessPageDto } from '@/api/businessPage'
import { LoadingState } from '@/broker/PageHeader'
import { DataGrid } from '@/broker/shared/DataGrid'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import {
  RowActionsButton,
  type ContextMenuItem,
  type ContextMenuState,
  RowContextMenu,
} from '@/broker/shared/RowContextMenu'
import {
  ActionCard,
  AssetMapView,
  assetsAtPlace,
  SelectedItemHubView,
  toBusinessMapModel,
  useLayoutView,
  ViewModeToggle,
  type HubSpoke,
} from '@/fintastic-ux'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLayoutOwnsTabs } from '@/pages/my/CustomerLayout'
import { CustomerRoutesStrip, type CustomerRouteId } from '@/pages/my/CustomerRoutesStrip'
import { BusinessAssetCards } from '@/pages/my/BusinessAssetCards'
import { BusinessAssetInspect } from '@/pages/my/BusinessAssetInspect'
import { money, moneyOrNotSupplied } from '@/pages/my/portalFormat'
import {
  ASSET_STATUS_CLASS,
  ASSET_STATUS_LABEL,
  assetStatus,
  assetTypeDef,
  humaniseClass,
  hubStatusTone,
  knownAssetClasses,
  missingRequiredFields,
  primaryActionFor,
} from '@/pages/my/assetTypeRegistry'
import { DeskShell } from '@/pages/your-page/DeskShell'
import { buildBusinessValuesSummary } from '@/pages/your-page/buildValuesPaymentsSummary'
import { ValuesPaymentsPanel } from '@/pages/your-page/ValuesPaymentsPanel'

type AssetListLayout = 'table' | 'cards' | 'map'

function parseListLayout(raw: string | null): AssetListLayout {
  if (raw === 'cards' || raw === 'map') return raw
  return 'table'
}

function valueBasisLabel(basis: string): string {
  return basis.replace(/_/g, ' ')
}

/** Live desk tabs only — quotes/claims/comms stay hidden until commercial panels ship. */
export type BusinessDeskTab = 'overview' | 'assets' | 'values' | 'requests'

function parseDeskTab(raw: string | null): BusinessDeskTab {
  if (raw === 'assets' || raw === 'values' || raw === 'requests') return raw
  return 'overview'
}

export function BusinessPageView({
  dto,
  mode,
  loading,
  error,
  onAskRuss,
  onWorkingOn,
  basePath = '/my/business',
  hideDeskTabs = false,
}: {
  dto: BusinessPageDto | undefined
  mode: 'customer' | 'preview'
  loading?: boolean
  error?: string | null
  onAskRuss?: (ctx?: { assetIds?: string[]; label: string }) => void
  onWorkingOn?: (label: string | null) => void
  basePath?: string
  /** When Cover desk layout owns tabs, hide in-page DeskShell tabs. */
  hideDeskTabs?: boolean
}) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const layoutOwnsTabs = useLayoutOwnsTabs()
  const suppressDeskTabs = hideDeskTabs || layoutOwnsTabs
  const deskTab = parseDeskTab(params.get('tab'))
  const readOnly = mode === 'preview'
  const [selected, setSelected] = useState<BusinessPageAsset | null>(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [slideOpen, setSlideOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<ContextMenuState>(null)
  const [locationFilter, setLocationFilter] = useState<string>('')
  const [classFilter, setClassFilter] = useState<string>('')
  const [cardQuery, setCardQuery] = useState('')
  const listLayout = parseListLayout(params.get('layout'))
  const { view, setView, isFintastic } = useLayoutView('fintastic')
  const riskProfilePath = `${basePath}/risk-profile`

  const setDeskTab = (tab: BusinessDeskTab) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'overview') next.delete('tab')
        else next.set('tab', tab)
        return next
      },
      { replace: true },
    )
  }

  const setListLayout = (next: AssetListLayout) => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === 'table') copy.delete('layout')
        else copy.set('layout', next)
        if (next !== 'map') {
          copy.delete('place')
          copy.delete('area')
        }
        return copy
      },
      { replace: true },
    )
  }

  const setMapPlace = (place: string | null) => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (!place) {
          copy.delete('place')
          copy.delete('area')
        } else {
          copy.set('place', place)
          copy.delete('area')
        }
        return copy
      },
      { replace: true },
    )
  }

  const setMapArea = (area: string | null) => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (!area) copy.delete('area')
        else copy.set('area', area)
        return copy
      },
      { replace: true },
    )
  }

  const closeAsset = () => {
    setSelected(null)
    setSlideOpen(false)
    onWorkingOn?.(null)
  }

  const openDeepDive = (tab: string) => {
    setDetailTab(tab)
    setSlideOpen(true)
  }

  const openAsset = (asset: BusinessPageAsset, tab = 'overview') => {
    const alreadyOpen = selected?.id === asset.id
    if (isFintastic && alreadyOpen && !slideOpen && tab === 'overview') {
      closeAsset()
      return
    }
    setSelected(asset)
    setDetailTab(tab)
    onWorkingOn?.(asset.display_label)
    if (!isFintastic) {
      setSlideOpen(true)
      return
    }
    setSlideOpen(tab === 'documents' || tab === 'activity' || tab === 'cover')
  }

  const toggleExpandAsset = (asset: BusinessPageAsset) => {
    if (selected?.id === asset.id && isFintastic && !slideOpen) {
      closeAsset()
      return
    }
    openAsset(asset)
  }

  useEffect(() => {
    if (!dto?.assets?.length) return
    const raw = params.get('item')
    if (!raw) return
    const key = decodeURIComponent(raw).trim().toLowerCase()
    const match = dto.assets.find(
      (a) =>
        a.id === raw ||
        a.display_label.toLowerCase() === key ||
        a.display_label.toLowerCase().includes(key),
    )
    if (!match) return
    if (selected?.id === match.id) return
    const panelRaw = (params.get('panel') ?? '').trim().toLowerCase()
    const panelTab =
      panelRaw === '1' || panelRaw === 'true' || panelRaw === 'overview'
        ? 'overview'
        : panelRaw === 'cover' || panelRaw === 'documents' || panelRaw === 'activity'
          ? panelRaw
          : null
    if (panelTab) {
      setSelected(match)
      setDetailTab(panelTab)
      onWorkingOn?.(match.display_label)
      setSlideOpen(true)
    } else {
      openAsset(match)
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', 'assets')
        // Keep item/panel for shareable deep links (Map / Cards / List).
        next.set('item', match.display_label)
        if (panelTab) next.set('panel', panelTab)
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dto?.assets, params.get('item'), params.get('panel'), isFintastic])

  const mapPlaceId = listLayout === 'map' ? params.get('place') : null
  const mapAreaId = listLayout === 'map' ? params.get('area') : null

  const mapModel = useMemo(() => {
    if (!dto || listLayout !== 'map') return null
    return toBusinessMapModel(dto, dto.industry_name)
  }, [dto, listLayout])

  /** true = map star visible; false = Expand grid (compact strip). */
  const [mapExpanded, setMapExpanded] = useState(true)

  const filteredAssets = useMemo(() => {
    if (!dto) return []
    const q = listLayout === 'cards' || listLayout === 'map' ? cardQuery.trim().toLowerCase() : ''
    const base =
      listLayout === 'map'
        ? assetsAtPlace(dto, mapPlaceId, mapAreaId)
        : dto.assets
    return base.filter((a) => {
      if (listLayout !== 'map' && locationFilter && a.location_id !== locationFilter) return false
      if (classFilter && a.asset_class !== classFilter) return false
      if (
        q &&
        !`${a.display_label} ${a.asset_class} ${a.location_name ?? ''} ${a.description}`.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [dto, locationFilter, classFilter, cardQuery, listLayout, mapPlaceId, mapAreaId])

  const runPrimaryFor = (asset: BusinessPageAsset) => {
    const action = primaryActionFor(assetStatus(asset))
    if (action.kind === 'review_risk' || action.kind === 'confirm_values') {
      window.location.href = riskProfilePath
      return
    }
    openAsset(asset, 'overview')
    setSlideOpen(true)
  }

  const clearFilters = () => {
    setLocationFilter('')
    setClassFilter('')
    setCardQuery('')
  }

  const hasActiveFilters = Boolean(locationFilter || classFilter || (listLayout === 'cards' && cardQuery.trim()))

  const menuFor = (asset: BusinessPageAsset): ContextMenuItem[] => {
    const status = assetStatus(asset)
    const action = primaryActionFor(status)
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: 'Open asset',
        icon: Eye,
        onSelect: () => openAsset(asset),
      },
      {
        id: 'details',
        label: 'Open details',
        icon: PanelRightOpen,
        onSelect: () => {
          setSelected(asset)
          setDetailTab('overview')
          onWorkingOn?.(asset.display_label)
          setSlideOpen(true)
        },
      },
    ]
    if (onAskRuss) {
      items.push({
        id: 'russ',
        label: 'Ask Russ',
        icon: MessageSquare,
        onSelect: () => onAskRuss({ assetIds: [asset.id], label: asset.display_label }),
      })
    }
    if (!readOnly && (action.kind === 'review_risk' || action.kind === 'confirm_values')) {
      items.push({
        id: 'risk',
        label: 'Review risk profile',
        icon: Network,
        onSelect: () => {
          window.location.href = riskProfilePath
        },
      })
    }
    return items
  }

  const hubSpokes = (asset: BusinessPageAsset): HubSpoke[] => {
    const def = assetTypeDef(asset.asset_class)
    return def.spokes.slice(0, 4).map((s) => {
      if (s.kind === 'location') {
        return {
          id: s.id,
          title: s.title,
          body: (
            <p className="font-medium">{asset.location_name ?? 'No location set'}</p>
          ),
        }
      }
      if (s.kind === 'value') {
        return {
          id: s.id,
          title: s.title,
          body: (
            <>
              <p className="font-semibold tabular-nums">{moneyOrNotSupplied(asset.declared_value)}</p>
              <p className="text-xs text-navy-500">{valueBasisLabel(String(asset.value_basis))}</p>
            </>
          ),
        }
      }
      if (s.kind === 'quantity') {
        return {
          id: s.id,
          title: s.title,
          body: <p className="font-semibold tabular-nums">{asset.quantity}</p>,
        }
      }
      if (s.kind === 'class') {
        return {
          id: s.id,
          title: s.title,
          body: <p className="font-medium capitalize">{humaniseClass(asset.asset_class)}</p>,
        }
      }
      return {
        id: s.id,
        title: s.title,
        body: (
          <>
            <p className="font-medium">{dto?.assigned_broker ?? 'Your broker'}</p>
            <p className="text-xs text-navy-500">{dto?.brokerage.trading_name}</p>
          </>
        ),
      }
    })
  }

  const columns = useMemo<ColumnDef<BusinessPageAsset, unknown>[]>(() => {
    return [
      {
        id: 'expand',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const focused = selected?.id === row.original.id
          const expanded = isFintastic && focused
          const drawerOpen = !isFintastic && focused && slideOpen
          const expandRegionId = `datagrid-expand-business-portal-assets-${row.original.id}`
          return (
            <button
              type="button"
              className={cn(
                'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-navy-600 transition',
                expanded || drawerOpen ? 'bg-brand-100 text-brand-800' : 'hover:bg-mist hover:text-navy-900',
              )}
              aria-label={
                isFintastic
                  ? expanded
                    ? `Collapse ${row.original.display_label}`
                    : `Expand ${row.original.display_label}`
                  : drawerOpen
                    ? `Close ${row.original.display_label}`
                    : `Open ${row.original.display_label}`
              }
              aria-expanded={isFintastic ? expanded : drawerOpen}
              aria-controls={isFintastic ? expandRegionId : undefined}
              onClick={(e) => {
                e.stopPropagation()
                if (isFintastic) toggleExpandAsset(row.original)
                else if (drawerOpen) closeAsset()
                else openAsset(row.original)
              }}
            >
              {isFintastic ? (
                expanded ? (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                )
              ) : (
                <PanelRightOpen className="h-4 w-4" aria-hidden />
              )}
            </button>
          )
        },
      },
      {
        id: 'asset',
        accessorFn: (r) => r.display_label,
        header: 'Asset',
        cell: ({ row }) => (
          <button
            type="button"
            className="cursor-pointer text-left"
            onClick={() => (isFintastic ? toggleExpandAsset(row.original) : openAsset(row.original))}
          >
            <p className="font-semibold text-navy-900">{row.original.display_label}</p>
            <p className="text-xs capitalize text-navy-500">{humaniseClass(row.original.asset_class)}</p>
          </button>
        ),
      },
      {
        id: 'class',
        accessorFn: (r) => r.asset_class,
        header: 'Class',
        cell: ({ row }) => (
          <span className="capitalize text-navy-700">{humaniseClass(row.original.asset_class)}</span>
        ),
      },
      {
        id: 'location',
        accessorFn: (r) => r.location_name ?? '',
        header: 'Location',
        cell: ({ row }) => (
          <span className="text-navy-700">{row.original.location_name ?? '—'}</span>
        ),
      },
      {
        id: 'value',
        accessorFn: (r) => r.declared_value ?? 0,
        header: 'Recorded asset value',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">{moneyOrNotSupplied(row.original.declared_value)}</span>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => assetStatus(r),
        header: 'Status',
        cell: ({ row }) => {
          const status = assetStatus(row.original)
          return (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', ASSET_STATUS_CLASS[status])}>
              {ASSET_STATUS_LABEL[status]}
            </span>
          )
        },
      },
      {
        id: 'next',
        accessorFn: (r) => assetStatus(r),
        header: 'Next action',
        cell: ({ row }) => {
          const action = primaryActionFor(assetStatus(row.original))
          if (readOnly) return <span className="text-xs text-navy-600">{action.label}</span>
          if (action.kind === 'review_risk') {
            return (
              <Button size="sm" variant="accent" asChild>
                <Link to={riskProfilePath}>{action.label}</Link>
              </Button>
            )
          }
          if (action.kind === 'none') {
            return (
              <Button size="sm" variant="outline" onClick={() => openAsset(row.original)}>
                {action.label}
              </Button>
            )
          }
          return (
            <Button size="sm" variant="accent" onClick={() => runPrimaryFor(row.original)}>
              {action.label}
            </Button>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <RowActionsButton items={menuFor(row.original)} onOpen={setRowMenu} />,
      },
    ]
  }, [dto, readOnly, selected?.id, isFintastic, slideOpen, onAskRuss, riskProfilePath])

  if (loading) return <LoadingState label="Opening My Business Page…" />
  if (error || !dto) {
    return (
      <section className="rounded-2xl border border-navy-800/10 bg-white p-6 text-center">
        <h2 className="text-base font-semibold text-navy-900">No business linked yet</h2>
        <p className="mt-2 text-sm text-navy-600">
          Ask your broker to link a business profile, or start a risk review. Personal cover stays on My Page.
        </p>
        {error && <p className="mt-2 text-xs text-navy-500">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="accent" asChild>
            <Link to="/business/risk-review">Start a risk review</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={basePath.startsWith('/demo') ? '/demo/my' : '/my'}>Back to Cover</Link>
          </Button>
        </div>
      </section>
    )
  }

  const attention = dto.attention[0] ?? null

  const renderAssetHub = (asset: BusinessPageAsset) => {
    const gaps = missingRequiredFields(asset)
    const status = assetStatus(asset)
    const action = primaryActionFor(status)
    return (
      <SelectedItemHubView
        title={asset.display_label}
        statusLabel={ASSET_STATUS_LABEL[status]}
        statusTone={hubStatusTone(status)}
        imageUrl={asset.photo_url ?? undefined}
        imageAlt={asset.display_label}
        primaryActionLabel={action.label}
        onPrimaryAction={
          readOnly || action.kind === 'none'
            ? undefined
            : () => {
                if (action.kind === 'review_risk') {
                  navigate(riskProfilePath)
                  return
                }
                setSelected(asset)
                onWorkingOn?.(asset.display_label)
                openDeepDive('overview')
              }
        }
        onClose={closeAsset}
        spokes={hubSpokes(asset)}
        headerActions={
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => {
              setSelected(asset)
              onWorkingOn?.(asset.display_label)
              openDeepDive('overview')
            }}
          >
            Details
          </Button>
        }
        copilotMessage={
          gaps.length
            ? `A few details still help cover: ${gaps
                .slice(0, 2)
                .map((g) => g.label)
                .join(', ')}.`
            : status === 'awaiting_cover'
              ? 'Values look ready — ask your broker to place cover.'
              : undefined
        }
        copilotAction={
          onAskRuss && !readOnly ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAskRuss({ assetIds: [asset.id], label: asset.display_label })}
            >
              Ask Russ
            </Button>
          ) : undefined
        }
      />
    )
  }

  const attentionNav =
    attention &&
    (attention.href.startsWith('http') ||
      attention.href.startsWith('/portal') ||
      attention.href.includes('risk-profile'))
  const attentionHref = attentionNav
    ? attention!.href.startsWith('/portal') || attention!.href.includes('risk-profile')
      ? riskProfilePath
      : attention!.href
    : undefined

  const launchBusinessRoute = (id: CustomerRouteId) => {
    if (readOnly) return
    if (id === 'review_risk') {
      navigate(riskProfilePath)
      return
    }
    if (id === 'confirm_values') {
      setDeskTab('values')
      return
    }
    if (id === 'open_requests') {
      setDeskTab('requests')
    }
  }

  const compactCover = suppressDeskTabs && mode === 'customer'

  return (
    <DeskShell
      readOnly={readOnly}
      hideHeader={compactCover}
      readOnlyMessage="Read-only preview — this is what the business contact sees on My Business Page."
      isSample={dto.is_sample}
      sampleLabel="Sample business"
      eyebrow="My Business Page"
      title={dto.trading_name}
      subtitle={`${dto.industry_name}${dto.registered_name !== dto.trading_name ? ` · ${dto.registered_name}` : ''}${dto.is_sample ? ' · Demo' : ''}`}
      actions={
        <>
          {!readOnly && onAskRuss && !compactCover && (
            <Button size="sm" variant="outline" onClick={() => onAskRuss({ label: dto.trading_name })}>
              <MessageSquare /> Ask Russ
            </Button>
          )}
          {mode === 'customer' && !suppressDeskTabs && (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link to={riskProfilePath}>Risk profile</Link>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to={basePath.startsWith('/demo') ? '/demo/my' : '/my'}>Personal cover</Link>
              </Button>
            </>
          )}
        </>
      }
      beforeTabs={
        !readOnly && !compactCover ? (
          <CustomerRoutesStrip account="business" onLaunch={launchBusinessRoute} />
        ) : null
      }
      tabs={
        suppressDeskTabs
          ? []
          : [
              { id: 'overview', label: 'Overview' },
              { id: 'assets', label: 'Assets & cover' },
              { id: 'values', label: 'Values & payments' },
              {
                id: 'requests',
                label: `Requests${dto.open_request_count ? ` (${dto.open_request_count})` : ''}`,
              },
            ]
      }
      activeTab={deskTab}
      onTabChange={(id) => setDeskTab(id as BusinessDeskTab)}
      tablistLabel="My Business Page desk"
      attentionVariant={compactCover ? 'chip' : 'card'}
      attention={
        (deskTab === 'overview' || deskTab === 'assets') && attention
          ? {
              label: attention.label,
              href: attentionHref,
              onContinue: !attentionNav
                ? () => {
                    if (attention.kind === 'open_request') setDeskTab('requests')
                    else {
                      setDeskTab('assets')
                      const asset = dto.assets.find((a) => a.id === attention.target_id)
                      if (asset) openAsset(asset)
                    }
                  }
                : undefined,
            }
          : null
      }
    >
      {deskTab === 'overview' && (
        <section aria-label="Business overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setDeskTab('assets')}
              className="rounded-xl border border-navy-800/10 bg-white px-4 py-3 text-left transition hover:border-brand-300 hover:shadow-sm"
            >
              <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Locations</p>
              <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{dto.locations.length}</p>
              <p className="mt-1 text-xs font-semibold text-brand-800">Open assets →</p>
            </button>
            <button
              type="button"
              onClick={() => setDeskTab('assets')}
              className="rounded-xl border border-navy-800/10 bg-white px-4 py-3 text-left transition hover:border-brand-300 hover:shadow-sm"
            >
              <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Assets</p>
              <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{dto.assets.length}</p>
              <p className="mt-1 text-xs text-navy-600">
                {money(dto.assets.reduce((s, a) => s + (a.declared_value ?? 0), 0)) ?? '—'} recorded
              </p>
            </button>
            <button
              type="button"
              onClick={() => setDeskTab(dto.open_request_count ? 'requests' : 'assets')}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition hover:shadow-sm',
                dto.open_request_count
                  ? 'border-amber-300 bg-amber-50/60 hover:border-amber-400'
                  : 'border-navy-800/10 bg-white hover:border-brand-300',
              )}
            >
              <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Needs attention</p>
              <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{dto.open_request_count}</p>
              <p className="mt-1 text-xs font-semibold text-navy-700">
                {dto.open_request_count ? 'Open requests →' : 'Nothing outstanding'}
              </p>
            </button>
          </div>

          <div className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-navy-900">What to do next</h2>
                <p className="mt-0.5 text-xs text-navy-600">
                  Work the asset register, confirm values, or answer broker requests.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="accent" type="button" onClick={() => setDeskTab('assets')}>
                  Assets & cover
                </Button>
                {!readOnly && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={riskProfilePath}>Risk profile</Link>
                  </Button>
                )}
                <Button size="sm" variant="ghost" type="button" onClick={() => setDeskTab('values')}>
                  Values & payments
                </Button>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-navy-800/10 border-t border-navy-800/10">
              {dto.assets.slice(0, 4).map((asset) => {
                const status = assetStatus(asset)
                const action = primaryActionFor(status)
                return (
                  <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900">{asset.display_label}</p>
                      <p className="text-xs text-navy-500">
                        {asset.location_name ?? 'No location'} · {ASSET_STATUS_LABEL[status]}
                      </p>
                    </div>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant={action.kind === 'none' ? 'outline' : 'accent'}
                        type="button"
                        onClick={() => {
                          setDeskTab('assets')
                          runPrimaryFor(asset)
                        }}
                      >
                        {action.label}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            {dto.assets.length > 4 && (
              <Button size="sm" variant="ghost" className="mt-1" type="button" onClick={() => setDeskTab('assets')}>
                View all {dto.assets.length} assets
              </Button>
            )}
          </div>
        </section>
      )}

      {deskTab === 'requests' && (
        <section className="space-y-3 rounded-2xl border border-navy-800/10 bg-white p-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-brand-700" />
            <h2 className="text-sm font-semibold text-navy-900">Information your broker needs</h2>
          </div>
          {dto.open_requests.length === 0 ? (
            <p className="text-sm text-navy-600">Nothing outstanding. Your broker has everything requested so far.</p>
          ) : (
            <ul className="space-y-2">
              {dto.open_requests.map((r) => (
                <li key={r.id} className="rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
                  <p className="font-medium text-navy-900">{r.title}</p>
                  {r.detail && <p className="text-xs text-navy-600">{r.detail}</p>}
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to={riskProfilePath}>Review risk profile</Link>
          </Button>
        </section>
      )}

      {deskTab === 'assets' && (
        <section aria-label="Business assets and cover" className="space-y-3">
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            <div className="rounded-xl border border-navy-800/10 bg-white px-2.5 py-2 sm:px-3 sm:py-2.5">
              <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Locations</p>
              <p className="mt-0.5 text-xl font-semibold text-navy-900 tabular-nums">{dto.locations.length}</p>
            </div>
            <div className="rounded-xl border border-navy-800/10 bg-white px-2.5 py-2 sm:px-3 sm:py-2.5">
              <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Assets</p>
              <p className="mt-0.5 text-xl font-semibold text-navy-900 tabular-nums">{filteredAssets.length}</p>
              <p className="text-[10px] font-medium text-navy-500">
                {money(filteredAssets.reduce((s, a) => s + (a.declared_value ?? 0), 0)) ?? '—'} recorded
              </p>
            </div>
            <div
              className={cn(
                'rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5',
                dto.open_request_count ? 'border-amber-300 bg-amber-50/50' : 'border-navy-800/10 bg-white',
              )}
            >
              <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Needs attention</p>
              <p className="mt-0.5 text-xl font-semibold text-navy-900 tabular-nums">{dto.open_request_count}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <h2 className="mr-auto text-sm font-semibold text-navy-900">Asset register</h2>
            <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="bp-location-filter">
              Location
            </label>
            <select
              id="bp-location-filter"
              className="min-h-10 rounded-lg border border-navy-800/15 bg-white px-2.5 py-2 text-xs font-semibold text-navy-800 sm:min-h-0 sm:py-1.5"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="">All locations</option>
              {dto.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.city ? ` · ${l.city}` : ''}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="bp-class-filter">
              Asset class
            </label>
            <select
              id="bp-class-filter"
              className="min-h-10 rounded-lg border border-navy-800/15 bg-white px-2.5 py-2 text-xs font-semibold text-navy-800 sm:min-h-0 sm:py-1.5"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {knownAssetClasses().map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {(listLayout === 'cards' || listLayout === 'map') && (
              <label className="relative min-w-[9rem] flex-1 sm:max-w-[12rem]">
                <span className="sr-only">Search assets</span>
                <input
                  type="search"
                  value={cardQuery}
                  onChange={(e) => setCardQuery(e.target.value)}
                  placeholder="Search…"
                  className="min-h-10 w-full rounded-lg border border-navy-800/15 bg-white px-2.5 py-2 text-xs text-navy-800 sm:min-h-0 sm:py-1.5"
                />
              </label>
            )}
            <div
              className="inline-flex rounded-lg border border-navy-800/15 bg-white p-0.5"
              role="group"
              aria-label="Asset layout"
            >
              <button
                type="button"
                className={cn(
                  'inline-flex min-h-10 items-center gap-1 rounded-md px-2.5 py-2 text-xs font-semibold sm:min-h-0 sm:py-1',
                  listLayout === 'table' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-mist',
                )}
                aria-pressed={listLayout === 'table'}
                onClick={() => setListLayout('table')}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                List
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex min-h-10 items-center gap-1 rounded-md px-2.5 py-2 text-xs font-semibold sm:min-h-0 sm:py-1',
                  listLayout === 'cards' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-mist',
                )}
                aria-pressed={listLayout === 'cards'}
                onClick={() => setListLayout('cards')}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Cards
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex min-h-10 items-center gap-1 rounded-md px-2.5 py-2 text-xs font-semibold sm:min-h-0 sm:py-1',
                  listLayout === 'map' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-mist',
                )}
                aria-pressed={listLayout === 'map'}
                onClick={() => {
                  setListLayout('map')
                  setMapExpanded(true)
                }}
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden />
                Map
              </button>
            </div>
            <ViewModeToggle
              view={view}
              onChange={(next) => {
                setView(next)
                if (selected) setSlideOpen(next !== 'fintastic')
              }}
            />
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" type="button" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
            </div>
          </div>

          {listLayout === 'map' && mapModel && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-navy-600">
                  {mapAreaId
                    ? `Showing assets in this area · ${filteredAssets.length}`
                    : mapPlaceId
                      ? `Showing assets at this place · ${filteredAssets.length}`
                      : `All places · ${filteredAssets.length} assets`}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setMapExpanded((v) => !v)}
                >
                  {mapExpanded ? 'Expand grid' : 'Collapse grid'}
                </Button>
              </div>
              <AssetMapView
                model={mapModel}
                placeId={mapPlaceId}
                areaId={mapAreaId}
                focusedId={selected?.id ?? null}
                compact={!mapExpanded}
                onExpand={() => setMapExpanded(true)}
                onSelectPlace={(id) => {
                  setMapPlace(id)
                  if (id && id !== 'portable-group') setLocationFilter(id)
                  else setLocationFilter('')
                }}
                onSelectArea={setMapArea}
                onSelectPin={(id) => {
                  const asset = dto.assets.find((a) => a.id === id)
                  if (!asset) return
                  if (isFintastic) toggleExpandAsset(asset)
                  else openAsset(asset)
                }}
                onPinMenu={
                  readOnly
                    ? undefined
                    : (id, e) => {
                        const asset = dto.assets.find((a) => a.id === id)
                        if (!asset) return
                        setRowMenu({ x: e.clientX, y: e.clientY, items: menuFor(asset) })
                      }
                }
              />
            </div>
          )}

          {listLayout === 'cards' ? (
            filteredAssets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-8 text-center">
                <p className="text-sm text-navy-600">
                  {hasActiveFilters
                    ? 'No assets match these filters.'
                    : 'No assets listed yet. Open the risk profile or ask Russ to add equipment and locations.'}
                </p>
                {hasActiveFilters ? (
                  <Button size="sm" variant="outline" className="mt-3" type="button" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" variant="accent" className="mt-3" asChild>
                    <Link to={riskProfilePath}>Review risk profile</Link>
                  </Button>
                )}
              </div>
            ) : (
              <BusinessAssetCards
                assets={filteredAssets}
                selectedId={selected?.id ?? null}
                readOnly={readOnly}
                menuFor={menuFor}
                onOpenMenu={setRowMenu}
                onOpen={(asset) => (isFintastic ? toggleExpandAsset(asset) : openAsset(asset))}
                onPrimary={runPrimaryFor}
                renderExpanded={isFintastic ? (asset) => renderAssetHub(asset) : undefined}
              />
            )
          ) : (
            <>
            <DataGrid
              data={filteredAssets}
              columns={columns}
              getRowId={(r) => r.id}
              storageKey="business-portal-assets"
              searchPlaceholder="Search assets…"
              searchText={(r) =>
                `${r.display_label} ${r.asset_class} ${r.location_name ?? ''} ${r.description}`
              }
              getRowContextMenu={readOnly ? undefined : (row) => menuFor(row)}
              rowClassName={(row) =>
                selected?.id === row.id ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-200' : undefined
              }
              minWidth={760}
              expandedRowId={isFintastic ? selected?.id ?? null : null}
              onExpandedRowChange={(id) => {
                if (!isFintastic) return
                if (!id) {
                  closeAsset()
                  return
                }
                const asset = filteredAssets.find((a) => a.id === id)
                if (asset) toggleExpandAsset(asset)
              }}
              renderExpandedRow={isFintastic ? (asset) => renderAssetHub(asset) : undefined}
              empty={
                <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-8 text-center">
                  <p className="text-sm text-navy-600">
                    {hasActiveFilters
                      ? 'No assets match these filters.'
                      : 'No assets listed yet. Open the risk profile or ask Russ to add equipment and locations.'}
                  </p>
                  {hasActiveFilters ? (
                    <Button size="sm" variant="outline" className="mt-3" type="button" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button size="sm" variant="accent" className="mt-3" asChild>
                      <Link to={riskProfilePath}>Review risk profile</Link>
                    </Button>
                  )}
                </div>
              }
              bulkActions={
                readOnly || !onAskRuss
                  ? undefined
                  : (rows, clear) => (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-navy-700">{rows.length} selected</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onAskRuss({
                              assetIds: rows.map((r) => r.id),
                              label: rows.length === 1 ? rows[0]!.display_label : `${rows.length} assets`,
                            })
                            clear()
                          }}
                        >
                          <MessageSquare /> Ask Russ
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clear}>
                          Clear
                        </Button>
                      </div>
                    )
              }
              mobileCard={(row, sel) => {
                const status = assetStatus(row)
                const action = primaryActionFor(status)
                const open = selected?.id === row.id
                return (
                  <div
                    className={cn(
                      'rounded-xl border bg-white p-4',
                      open ? 'border-brand-300 ring-1 ring-brand-200' : 'border-navy-800/10',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={sel.selected} onChange={sel.toggle} className="mt-1" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        onClick={() => (isFintastic ? toggleExpandAsset(row) : openAsset(row))}
                        aria-expanded={isFintastic ? open : undefined}
                      >
                        <p className="font-semibold text-navy-900">{row.display_label}</p>
                        <p className="text-xs capitalize text-navy-500">
                          {humaniseClass(row.asset_class)} · {row.location_name ?? 'No location'} ·{' '}
                          {moneyOrNotSupplied(row.declared_value)}
                        </p>
                        <span
                          className={cn(
                            'mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            ASSET_STATUS_CLASS[status],
                          )}
                        >
                          {ASSET_STATUS_LABEL[status]}
                        </span>
                      </button>
                      <RowActionsButton items={menuFor(row)} onOpen={setRowMenu} />
                    </div>
                    {!readOnly && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {action.kind === 'review_risk' ? (
                          <Button size="sm" variant="accent" className="min-h-10" asChild>
                            <Link to={riskProfilePath}>{action.label}</Link>
                          </Button>
                        ) : action.kind === 'none' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10"
                            type="button"
                            onClick={() => openAsset(row)}
                          >
                            {action.label}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="accent"
                            className="min-h-10"
                            type="button"
                            onClick={() => runPrimaryFor(row)}
                          >
                            {action.label}
                          </Button>
                        )}
                      </div>
                    )}
                    {isFintastic && open ? <div className="mt-3">{renderAssetHub(row)}</div> : null}
                  </div>
                )
              }}
            />
            </>
          )}
        </section>
      )}

      {deskTab === 'values' && (
        <ValuesPaymentsPanel
          summary={buildBusinessValuesSummary(dto, { audience: mode === 'preview' ? 'broker' : 'customer' })}
          scope="business"
          audience={mode === 'preview' ? 'broker' : 'customer'}
          locations={dto.locations.map((l) => ({ id: l.id, name: l.city ? `${l.name} · ${l.city}` : l.name }))}
          onOpenItem={(row) => {
            const asset = dto.assets.find((a) => a.id === row.item_id || a.id === row.id)
            if (asset) openAsset(asset)
          }}
        />
      )}

      <RightSlideout
        open={Boolean(selected) && slideOpen}
        onClose={() => {
          if (isFintastic) {
            setSlideOpen(false)
            return
          }
          closeAsset()
        }}
        title={selected?.display_label ?? 'Asset'}
        subtitle={
          selected
            ? `${humaniseClass(selected.asset_class)}${isFintastic ? ' · details' : ''}`
            : undefined
        }
        size="wide"
        footer={
          selected && isFintastic ? (
            <p className="text-xs text-navy-500">
              Primary action stays in the expanded row. Close this panel to return to the table.
            </p>
          ) : null
        }
      >
        {selected && (
          <BusinessAssetInspect
            asset={selected}
            dto={dto}
            tab={detailTab}
            onTab={setDetailTab}
            readOnly={readOnly}
            onAskRuss={
              onAskRuss
                ? () => onAskRuss({ assetIds: [selected.id], label: selected.display_label })
                : undefined
            }
            onOpenRisk={() => {
              window.location.href = riskProfilePath
            }}
          />
        )}
      </RightSlideout>

      {isFintastic ? (
        <ActionCard state={rowMenu} onClose={() => setRowMenu(null)} />
      ) : (
        <RowContextMenu state={rowMenu} onClose={() => setRowMenu(null)} />
      )}
    </DeskShell>
  )
}
