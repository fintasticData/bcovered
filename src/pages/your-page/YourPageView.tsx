import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutGrid,
  List,
  Map as MapIcon,
  MessageSquare,
  PanelRightOpen,
  Phone,
  Plus,
  ShieldAlert,
} from 'lucide-react'
import type { CustomerItemStatus, CustomerPageDto, CustomerPageItem } from '@/api/customerPage'
import { CUSTOMER_CLAIM_STATUS } from '@/broker/claims/claimLabels'
import { LoadingState } from '@/broker/PageHeader'
import { DataGrid } from '@/broker/shared/DataGrid'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { RowActionsButton, type ContextMenuState, RowContextMenu } from '@/broker/shared/RowContextMenu'
import {
  ActionCard,
  AssetMapView,
  enrichPersonalItemsForMap,
  SelectedItemHubView,
  toPersonalMapModel,
  useLayoutView,
  ViewModeToggle,
} from '@/fintastic-ux'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { AddItemSlideout } from '@/pages/my/AddItemSlideout'
import { PersonalItemCards } from '@/pages/my/PersonalItemCards'
import { useLayoutOwnsTabs } from '@/pages/my/CustomerLayout'
import { CustomerRoutesStrip, type CustomerRouteId } from '@/pages/my/CustomerRoutesStrip'
import { GetQuoteSlideout } from '@/pages/my/GetQuoteSlideout'
import { ReportClaimSlideout, type ReportClaimTarget } from '@/pages/my/ReportClaimSlideout'
import { missingRequiredFields } from '@/pages/my/itemRequirements'
import { buildPortalItemMenu, itemStatus } from '@/pages/my/portalItemMenu'
import { freq, insurerPolicyLabel, money, moneyOrNotSupplied } from '@/pages/my/portalFormat'
import type { DataCategory } from '@/lib/supabase/category'
import { CustomerPageClaimsPanel } from '@/pages/your-page/CustomerPageClaimsPanel'
import { CustomerPageCommsPanel } from '@/pages/your-page/CustomerPageCommsPanel'
import { CustomerPageQuotesPanel } from '@/pages/your-page/CustomerPageQuotesPanel'
import { DeskShell } from '@/pages/your-page/DeskShell'
import { buildPersonalValuesSummary } from '@/pages/your-page/buildValuesPaymentsSummary'
import { ValuesPaymentsPanel } from '@/pages/your-page/ValuesPaymentsPanel'
import { useBfTransactions } from '@/copilot/brokerFinancialsApi'
import { usePolicyPaymentRows } from '@/pages/your-page/usePolicyPaymentRows'

export type CustomerDeskTab = 'items' | 'values' | 'quotes' | 'claims' | 'comms'

function parseDeskTab(raw: string | null): CustomerDeskTab {
  if (raw === 'values' || raw === 'quotes' || raw === 'claims' || raw === 'comms') return raw
  return 'items'
}

const STATUS_LABEL: Record<CustomerItemStatus, string> = {
  covered: 'Covered',
  view_quote: 'View quote',
  request_sent: 'Request sent',
  awaiting_cover: 'Awaiting cover',
  replaced: 'Replaced',
  removed: 'Removed',
}

const STATUS_CLASS: Record<CustomerItemStatus, string> = {
  covered: 'bg-emerald-100 text-emerald-900',
  view_quote: 'bg-sky-100 text-sky-900',
  request_sent: 'bg-amber-100 text-amber-900',
  awaiting_cover: 'bg-navy-100 text-navy-800',
  replaced: 'bg-navy-100 text-navy-600',
  removed: 'bg-navy-100 text-navy-600',
}

function nextActionLabel(status: CustomerItemStatus): string {
  if (status === 'view_quote') return 'View quote'
  if (status === 'covered') return 'Report a claim'
  if (status === 'request_sent') return 'Waiting on broker'
  if (status === 'awaiting_cover') return 'Get a quote'
  return STATUS_LABEL[status] ?? status
}

function remapAttentionHref(href: string, basePath: '/my' | '/demo/my') {
  if (href.includes('/quotes') || href.startsWith('/portal/proposals')) return `${basePath}?tab=quotes`
  if (href.includes('/claims')) return `${basePath}?tab=claims`
  if (href.startsWith('/my')) {
    const rest = href.slice('/my'.length)
    if (!rest || rest === '/') return basePath
    if (rest.startsWith('/quotes')) return `${basePath}?tab=quotes`
    if (rest.startsWith('/claims')) return `${basePath}?tab=claims`
    return `${basePath}${rest}`
  }
  return href
}

export function YourPageView({
  dto,
  mode,
  loading,
  error,
  onAskAva,
  onAskRuss,
  onWorkingOn,
  onRefresh,
  conciergeEnabled = false,
  onMessageConcierge,
  basePath = '/my',
  category = 'live',
  /** When set (broker embed), lock to one desk panel and hide tab chrome. */
  deskLocked,
  /** When true, Cover desk layout owns tabs — hide in-page DeskShell tabs. */
  hideDeskTabs = false,
}: {
  dto: CustomerPageDto | undefined
  mode: 'customer' | 'preview'
  loading?: boolean
  error?: string | null
  onAskAva?: (ctx?: { itemIds?: string[]; label: string }) => void
  /** @deprecated use onAskAva */
  onAskRuss?: () => void
  onWorkingOn?: (label: string | null) => void
  onRefresh?: () => void
  conciergeEnabled?: boolean
  /** Opens Cover concierge chat slideout (FAIS-backed). */
  onMessageConcierge?: () => void
  basePath?: '/my' | '/demo/my'
  category?: DataCategory
  deskLocked?: CustomerDeskTab
  hideDeskTabs?: boolean
}) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const layoutOwnsTabs = useLayoutOwnsTabs()
  const suppressDeskTabs = hideDeskTabs || layoutOwnsTabs || Boolean(deskLocked)
  const deskTab = deskLocked ?? parseDeskTab(params.get('tab'))
  const askAva = onAskAva ?? (onAskRuss ? () => onAskRuss() : undefined)
  const [addOpen, setAddOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quotePreselect, setQuotePreselect] = useState<string[]>([])
  const [quoteNotes, setQuoteNotes] = useState('')
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimTarget, setClaimTarget] = useState<ReportClaimTarget | null>(null)
  const [selected, setSelected] = useState<CustomerPageItem | null>(null)
  const [detailTab, setDetailTab] = useState('overview')
  /** Classic (and Fintastic deep-dive) use the slide-out; Fintastic hub lives in the main workspace. */
  const [slideOpen, setSlideOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<ContextMenuState>(null)
  const [invoiceEdgeOpen, setInvoiceEdgeOpen] = useState(false)
  const [invoiceAttached, setInvoiceAttached] = useState(false)
  const { view, setView, isFintastic } = useLayoutView('fintastic')
  const itemLayout =
    params.get('layout') === 'map' ? 'map' : params.get('layout') === 'cards' ? 'cards' : 'list'
  const mapPlaceId = itemLayout === 'map' ? params.get('place') : null
  const mapAreaId = itemLayout === 'map' ? params.get('area') : null
  /** true = map star visible; false = Expand grid (compact strip). */
  const [mapExpanded, setMapExpanded] = useState(true)
  const personalMapModel = useMemo(
    () => (dto && itemLayout === 'map' ? toPersonalMapModel(dto) : null),
    [dto, itemLayout],
  )
  const mapScopedItems = useMemo(() => {
    if (!dto || itemLayout !== 'map') return dto?.items ?? []
    const enriched = enrichPersonalItemsForMap(dto.items)
    let list = enriched
    if (mapPlaceId === 'portable-group') {
      list = enriched.filter((i) => (i.details?.mobility_type as string) === 'portable')
    } else if (mapPlaceId) {
      list = enriched.filter((i) => {
        const used = (i.details?.typically_used_place_ids as string[] | undefined) ?? []
        const base = (i.details?.usual_base_place_id as string | undefined) ?? i.location_id
        return base === mapPlaceId || used.includes(mapPlaceId)
      })
    }
    if (!mapAreaId || !mapPlaceId || mapPlaceId === 'portable-group') return list
    return list.filter((i) => {
      const mobility = i.details?.mobility_type as string | undefined
      const base = (i.details?.usual_base_place_id as string | undefined) ?? i.location_id
      if (mobility === 'portable' && base !== mapPlaceId) return true
      const area = (i.details?.area_id as string | undefined) ?? null
      if (mapAreaId === 'branch-items') return !area
      return area === mapAreaId
    })
  }, [dto, itemLayout, mapPlaceId, mapAreaId])

  const setItemLayout = (next: 'list' | 'cards' | 'map') => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === 'list') {
          copy.delete('layout')
          copy.delete('place')
          copy.delete('area')
        } else {
          copy.set('layout', next)
          if (next !== 'map') {
            copy.delete('place')
            copy.delete('area')
          }
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
  const commissionByPerson = useBfTransactions({
    person_id: deskTab === 'values' || mode === 'preview' ? dto?.person_id ?? null : null,
  })
  const valuesCommissionTxns = commissionByPerson.data ?? []
  const valuesPolicyIds = useMemo(() => {
    const fromPolicies = dto?.policies?.map((p) => p.id) ?? []
    const fromItems = (dto?.items ?? [])
      .map((i) => i.policy_id)
      .filter((id): id is string => Boolean(id))
    return [...new Set([...fromPolicies, ...fromItems])]
  }, [dto])
  const monthStart = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const paymentRowsQuery = usePolicyPaymentRows({
    policyIds: valuesPolicyIds,
    from: monthStart,
    to: today,
    category,
    enabled: deskTab === 'values',
  })

  const readOnly = mode === 'preview'

  const closeItem = () => {
    setSelected(null)
    setSlideOpen(false)
    setInvoiceEdgeOpen(false)
    setInvoiceAttached(false)
    onWorkingOn?.(null)
  }

  const openDeepDive = (tab: string) => {
    setDetailTab(tab)
    setSlideOpen(true)
  }

  const setDeskTab = (tab: CustomerDeskTab) => {
    if (deskLocked) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'items') next.delete('tab')
        else next.set('tab', tab)
        if (tab !== 'quotes') {
          next.delete('request')
          next.delete('getQuote')
        }
        if (tab !== 'comms') {
          next.delete('thread')
          next.delete('claimId')
          next.delete('quoteRequestId')
        }
        return next
      },
      { replace: true },
    )
  }

  const openItem = (item: CustomerPageItem, tab = 'overview') => {
    const alreadyOpen = selected?.id === item.id
    if (isFintastic && alreadyOpen && !slideOpen && tab === 'overview') {
      closeItem()
      return
    }
    setSelected(item)
    setDetailTab(tab === 'cover' ? 'cover' : tab)
    setInvoiceEdgeOpen(false)
    setInvoiceAttached(false)
    onWorkingOn?.(item.display_label)
    if (!isFintastic) {
      setSlideOpen(true)
      return
    }
    // Queue-first: hub lives in the expanded row; slide-out only for inspect tabs
    setSlideOpen(tab === 'documents' || tab === 'quote' || tab === 'activity' || tab === 'cover')
  }

  const toggleExpandItem = (item: CustomerPageItem) => {
    if (selected?.id === item.id && isFintastic && !slideOpen) {
      closeItem()
      return
    }
    openItem(item)
  }

  /**
   * Deep-link: ?item=Delivery+van+04 (or item id) focuses the hub.
   * Optional ?panel=1|overview|cover|documents|activity|quote opens the thin
   * focused-item inspect slide-out (Fintastic drawer mode).
   */
  useEffect(() => {
    if (!dto?.items?.length) return
    const raw = params.get('item')
    if (!raw) return
    const key = decodeURIComponent(raw).trim().toLowerCase()
    const match = dto.items.find(
      (i) => i.id === raw || i.display_label.toLowerCase() === key || i.display_label.toLowerCase().includes(key),
    )
    if (!match) return
    if (selected?.id === match.id) return
    const panelRaw = (params.get('panel') ?? '').trim().toLowerCase()
    const panelTab =
      panelRaw === '1' || panelRaw === 'true' || panelRaw === 'overview'
        ? 'overview'
        : panelRaw === 'cover' ||
            panelRaw === 'documents' ||
            panelRaw === 'activity' ||
            panelRaw === 'quote'
          ? panelRaw
          : null
    if (panelTab) {
      // Open hub + inspect panel (thin by design when isFintastic)
      setSelected(match)
      setDetailTab(panelTab)
      setInvoiceEdgeOpen(false)
      setInvoiceAttached(false)
      onWorkingOn?.(match.display_label)
      setSlideOpen(true)
    } else {
      openItem(match)
    }
    const inv = match.details?.invoice
    if (inv && typeof inv === 'object' && isFintastic) {
      setInvoiceEdgeOpen(true)
    }
    // Keep item/panel for shareable deep links (Map / Cards / List).
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('item', match.display_label)
        if (panelTab) next.set('panel', panelTab)
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional deep-link once when dto/param ready
  }, [dto?.items, params.get('item'), params.get('panel'), isFintastic])

  const openQuoteFor = (item?: CustomerPageItem, notes?: string) => {
    setQuotePreselect(item ? [item.id] : [])
    setQuoteNotes(notes ?? (invoiceAttached && item ? `Attach invoice for ${item.display_label} to this request.` : ''))
    setQuoteOpen(true)
  }

  const openReportClaim = (item?: CustomerPageItem, policyId?: string | null) => {
    const pid = policyId ?? item?.policy_id ?? dto?.policies[0]?.id ?? dto?.items.find((i) => i.policy_id)?.policy_id
    setClaimTarget({
      policyId: pid ?? null,
      itemId: item?.id ?? null,
      personId: dto?.person_id ?? null,
      itemLabel: item?.display_label ?? null,
    })
    setClaimOpen(true)
  }

  /** Deep-link: ?reportClaim=1&policyId=&itemId= opens ReportClaimSlideout in-context. */
  useEffect(() => {
    if (readOnly || !dto) return
    const flag = params.get('reportClaim')
    if (flag !== '1' && flag !== 'true') return
    const policyId = params.get('policyId')
    const itemId = params.get('itemId')
    const item = itemId ? dto.items.find((i) => i.id === itemId) : undefined
    openReportClaim(item, policyId)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('reportClaim')
        next.delete('policyId')
        next.delete('itemId')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from URL
  }, [dto?.person_id, params.get('reportClaim'), readOnly])

  const itemInvoice = (item: CustomerPageItem) => {
    const inv = item.details?.invoice
    if (!inv || typeof inv !== 'object') return null
    return inv as {
      label?: string
      supplier?: string
      amount?: number
      vehicle?: string
      status?: string
      url?: string | null
    }
  }

  const itemDriver = (item: CustomerPageItem) => {
    const d = item.details?.driver
    if (!d || typeof d !== 'object') return null
    return d as { name?: string; licence?: string; id_number?: string; licence_expiry?: string }
  }

  const hubStatusLabel = (item: CustomerPageItem) => {
    const s = itemStatus(item)
    if (s === 'request_sent' || s === 'awaiting_cover') return 'Cover pending'
    return STATUS_LABEL[s]
  }

  const launchRoute = (id: CustomerRouteId) => {
    if (readOnly) return
    if (id === 'add_item') {
      setDeskTab('items')
      setAddOpen(true)
    } else if (id === 'get_quote') {
      setDeskTab('quotes')
      openQuoteFor()
    } else if (id === 'report_claim') {
      setDeskTab('items')
      openReportClaim()
    } else if (id === 'concierge') {
      if (onMessageConcierge) onMessageConcierge()
      else {
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('tab', 'comms')
            next.set('thread', 'concierge')
            return next
          },
          { replace: false },
        )
      }
    }
  }

  const menuFor = (item: CustomerPageItem) =>
    buildPortalItemMenu(item, {
      basePath,
      readOnly,
      onOpen: openItem,
      onAskAva: askAva
        ? () => askAva({ itemIds: [item.id], label: item.display_label })
        : undefined,
      onRequestQuote: readOnly ? undefined : (row) => openQuoteFor(row),
      onReportClaim: readOnly ? undefined : (row) => openReportClaim(row),
    })

  const columns = useMemo<ColumnDef<CustomerPageItem, unknown>[]>(() => {
    if (!dto) return []
    return [
      {
        id: 'expand',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const focused = selected?.id === row.original.id
          const expanded = isFintastic && focused
          const drawerOpen = !isFintastic && focused && slideOpen
          const expandRegionId = `datagrid-expand-customer-portal-items-${row.original.id}`
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
                if (isFintastic) toggleExpandItem(row.original)
                else if (drawerOpen) closeItem()
                else openItem(row.original)
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
        id: 'item',
        accessorFn: (r) => r.display_label,
        header: 'Item',
        cell: ({ row }) => (
          <button
            type="button"
            className="cursor-pointer text-left"
            onClick={() => (isFintastic ? toggleExpandItem(row.original) : openItem(row.original))}
          >
            <p className="font-semibold text-navy-900">{row.original.display_label}</p>
            <p className="text-xs capitalize text-navy-500">{row.original.item_type}</p>
          </button>
        ),
      },
      {
        id: 'value',
        accessorFn: (r) => r.insured_value ?? 0,
        header: 'Recorded asset value',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">{moneyOrNotSupplied(row.original.insured_value)}</span>
        ),
      },
      {
        id: 'premium',
        accessorFn: (r) => r.premium_amount ?? 0,
        header: 'Premium',
        cell: ({ row }) => {
          const p = money(row.original.premium_amount)
          return (
            <span className="block text-right tabular-nums">
              {p ? `${p}${freq(row.original.premium_frequency)}` : '—'}
            </span>
          )
        },
      },
      {
        id: 'policy',
        accessorFn: (r) => r.policy_reference ?? '',
        header: 'Insurer / policy',
        cell: ({ row }) => {
          const insurer =
            row.original.insurer_name ||
            dto.policies.find((p) => p.id === row.original.policy_id)?.insurer_name
          return insurerPolicyLabel(insurer, row.original.policy_reference)
        },
      },
      {
        id: 'status',
        accessorFn: (r) => itemStatus(r),
        header: 'Status',
        cell: ({ row }) => {
          const status = itemStatus(row.original)
          return (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_CLASS[status])}>
              {STATUS_LABEL[status] ?? status}
            </span>
          )
        },
      },
      {
        id: 'next',
        accessorFn: (r) => itemStatus(r),
        header: 'Next action',
        cell: ({ row }) => {
          const status = itemStatus(row.original)
          if (readOnly) return <span className="text-xs text-navy-600">{nextActionLabel(status)}</span>
          if (status === 'view_quote') {
            return (
              <Button size="sm" variant="accent" onClick={() => openItem(row.original, 'quote')}>
                View quote
              </Button>
            )
          }
          if (status === 'awaiting_cover' || status === 'request_sent') {
            return (
              <Button size="sm" variant="outline" onClick={() => openQuoteFor(row.original)}>
                Get a quote
              </Button>
            )
          }
          if (status === 'covered' && row.original.policy_id) {
            return (
              <Button size="sm" variant="outline" onClick={() => openReportClaim(row.original)}>
                Report a claim
              </Button>
            )
          }
          return <span className="text-xs text-navy-600">{nextActionLabel(status)}</span>
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <RowActionsButton items={menuFor(row.original)} onOpen={setRowMenu} />,
      },
    ]
  }, [dto, basePath, readOnly, askAva, navigate, selected?.id, isFintastic, slideOpen])

  if (loading) return <LoadingState label="Opening Your page…" />
  if (error || !dto) {
    return (
      <section className="rounded-2xl border border-navy-800/10 bg-white p-6 text-center">
        <h2 className="text-base font-semibold text-navy-900">Your page is ready when your profile is linked</h2>
        <p className="mt-2 text-sm text-navy-600">
          Ask your broker to share your invitation link, or open the link they sent you. Once linked, your items, quotes
          and claims appear here.
        </p>
        {error && <p className="mt-2 text-xs text-navy-500">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="accent" asChild>
            <Link to="/assist">Find My Cover</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/contact">Contact my broker</Link>
          </Button>
        </div>
      </section>
    )
  }

  const attention = dto.attention?.[0] ?? null
  const selectedPolicy = selected ? dto.policies.find((p) => p.id === selected.policy_id) : undefined
  const quoteRequests = dto.quote_requests ?? []
  const gaps = selected
    ? missingRequiredFields({
        item_type: selected.item_type,
        display_label: selected.display_label,
        insured_value: selected.insured_value,
        details: selected.details,
      })
    : []

  const renderItemHub = (item: CustomerPageItem) => {
    const driver = itemDriver(item)
    const invoice = itemInvoice(item)
    const status = itemStatus(item)
    const canRequest = status === 'awaiting_cover' || status === 'request_sent'
    const showAttachPrompt = Boolean(invoice) && canRequest && !invoiceAttached && status !== 'request_sent'
    const policy = dto.policies.find((p) => p.id === item.policy_id)
    const itemGaps = missingRequiredFields({
      item_type: item.item_type,
      display_label: item.display_label,
      insured_value: item.insured_value,
      details: item.details,
    })
    return (
      <SelectedItemHubView
        title={item.display_label}
        statusLabel={hubStatusLabel(item)}
        statusTone={
          status === 'covered'
            ? 'ok'
            : status === 'awaiting_cover' || status === 'request_sent' || status === 'view_quote'
              ? 'pending'
              : 'attention'
        }
        imageUrl={item.photo_url ?? undefined}
        imageAlt={item.display_label}
        primaryActionLabel={
          status === 'covered'
            ? 'Report a claim'
            : status === 'view_quote'
              ? 'View quote'
              : status === 'request_sent'
                ? 'Request sent'
                : 'Request cover'
        }
        onPrimaryAction={
          readOnly || status === 'request_sent'
            ? undefined
            : () => {
                if (status === 'covered' && item.policy_id) {
                  openReportClaim(item)
                  return
                }
                openQuoteFor(item)
              }
        }
        onClose={closeItem}
        spokes={[
          {
            id: 'driver',
            title: 'Driver',
            body: driver ? (
              <>
                <p className="font-medium">{driver.name ?? 'Assigned driver'}</p>
                {driver.licence && <p className="text-xs text-navy-500">{driver.licence}</p>}
                {driver.licence_expiry && (
                  <p className="text-xs text-navy-500">Expires {driver.licence_expiry}</p>
                )}
              </>
            ) : (
              <p className="text-navy-600">Not assigned</p>
            ),
          },
          {
            id: 'value',
            title: 'Vehicle value',
            body: (
              <>
                <p className="font-semibold tabular-nums">{moneyOrNotSupplied(item.insured_value)}</p>
                <p className="text-xs text-navy-500">Estimated market value</p>
              </>
            ),
          },
          {
            id: 'documents',
            title: 'Documents',
            body: invoice ? (
              <>
                <p className="font-medium">{invoice.label ?? 'Vehicle invoice'}</p>
                <p className="text-xs text-navy-500">
                  {invoiceAttached || invoice.status === 'attached'
                    ? 'Attached'
                    : 'Ready to attach — open'}
                </p>
              </>
            ) : policy?.documents?.length ? (
              `${policy.documents.length} on file — open`
            ) : (
              'No documents yet'
            ),
            onClick: () => {
              if (invoice) setInvoiceEdgeOpen(true)
              openDeepDive('documents')
            },
          },
          {
            id: 'broker',
            title: 'Broker',
            body: (
              <>
                <p className="font-medium">{dto.broker?.name ?? dto.brokerage.trading_name}</p>
                <p className="text-xs text-navy-500">{dto.brokerage.trading_name}</p>
              </>
            ),
          },
        ]}
        headerActions={
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => {
              setSelected(item)
              onWorkingOn?.(item.display_label)
              openDeepDive('overview')
            }}
          >
            Details
          </Button>
        }
        copilotMessage={
          showAttachPrompt
            ? 'Attach the invoice to this request?'
            : invoiceAttached && canRequest
              ? 'Invoice will be noted on your cover request.'
              : status === 'request_sent'
                ? 'Your cover request is with the broker. Status stays Cover pending until confirmed.'
                : canRequest
                  ? 'Ready when you are — request cover for this vehicle.'
                  : itemGaps.length
                    ? `A few details still help a quote: ${itemGaps
                        .slice(0, 2)
                        .map((g) => g.label)
                        .join(', ')}.`
                    : undefined
        }
        copilotAction={
          showAttachPrompt && !readOnly ? (
            <>
              <Button
                size="sm"
                variant="accent"
                onClick={() => {
                  setInvoiceAttached(true)
                  setInvoiceEdgeOpen(true)
                }}
              >
                Yes, attach invoice
              </Button>
              <Button size="sm" variant="outline" onClick={() => setInvoiceAttached(false)}>
                No, not now
              </Button>
            </>
          ) : askAva && !readOnly ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => askAva({ itemIds: [item.id], label: item.display_label })}
            >
              Ask Ava
            </Button>
          ) : undefined
        }
        invoicePreview={
          invoiceEdgeOpen && invoice ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-navy-900">{invoice.label ?? 'Invoice'}</p>
              <p className="text-navy-600">{invoice.supplier ?? 'Supplier on file'}</p>
              {invoice.vehicle && <p className="text-navy-800">{invoice.vehicle}</p>}
              {typeof invoice.amount === 'number' && (
                <p className="font-semibold tabular-nums text-navy-900">
                  R{invoice.amount.toLocaleString('en-ZA')}
                </p>
              )}
              {invoice.url ? (
                <a
                  href={invoice.url}
                  className="font-semibold text-brand-700 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open document
                </a>
              ) : (
                <p className="rounded-lg bg-mist px-2 py-1.5 text-xs text-navy-600">
                  Preview unavailable — document not linked yet. You can still attach it to the request.
                </p>
              )}
              {invoiceAttached && (
                <p className="text-xs font-semibold text-emerald-800">Marked to attach with Request cover.</p>
              )}
            </div>
          ) : undefined
        }
      />
    )
  }

  const quoteCount = quoteRequests.length || dto.released_quote_count
  const claimCount = dto.claims.length
  const policyCount = dto.policies.length
  const compactCover = suppressDeskTabs && !deskLocked

  return (
    <DeskShell
      hideChrome={Boolean(deskLocked)}
      hideHeader={compactCover}
      readOnly={readOnly}
      readOnlyMessage="Read-only preview — this is exactly what the customer sees. Submissions are disabled."
      isSample={dto.is_sample}
      sampleLabel="Sample page"
      eyebrow={dto.brokerage.trading_name}
      title={`Hello, ${dto.greeting_name}`}
      subtitle={`Your insurance page with ${dto.brokerage.trading_name}${dto.is_sample ? ' · Demo' : ''}`}
      logoUrl={dto.brokerage.logo_url}
      actions={
        !readOnly && askAva && !compactCover ? (
          <Button size="sm" variant="outline" onClick={() => askAva()}>
            <MessageSquare /> Ask Ava
          </Button>
        ) : null
      }
      beforeTabs={
        !readOnly && !compactCover ? (
          <CustomerRoutesStrip
            account="personal"
            onLaunch={launchRoute}
            conciergeEnabled={conciergeEnabled}
          />
        ) : null
      }
      tabs={
        suppressDeskTabs
          ? []
          : [
              { id: 'items', label: 'Items & cover' },
              { id: 'values', label: 'Values & payments' },
              { id: 'quotes', label: 'Quotes' },
              { id: 'claims', label: 'Claims' },
              { id: 'comms', label: 'Comms' },
            ]
      }
      activeTab={deskTab}
      onTabChange={(id) => setDeskTab(id as CustomerDeskTab)}
      tablistLabel="My Page desk"
      attentionVariant={compactCover ? 'chip' : 'card'}
      attention={
        deskTab === 'items' && attention
          ? {
              label: attention.label,
              continueDisabled: readOnly,
              onContinue: !readOnly && attention.href.includes('#add-item') ? () => setAddOpen(true) : undefined,
              href:
                !readOnly && !attention.href.includes('#add-item')
                  ? remapAttentionHref(attention.href, basePath)
                  : undefined,
            }
          : null
      }
    >
      {deskTab === 'values' && (
        <ValuesPaymentsPanel
          summary={buildPersonalValuesSummary(dto, {
            audience: mode === 'preview' ? 'broker' : 'customer',
            commissionTxns: valuesCommissionTxns,
            paymentRows: paymentRowsQuery.data ?? [],
            periodFrom: monthStart,
            periodTo: today,
          })}
          scope="personal"
          audience={mode === 'preview' ? 'broker' : 'customer'}
          locations={
            dto.business?.locations?.map((l) => ({
              id: l.id,
              name: l.city ? `${l.name} · ${l.city}` : l.name,
            })) ??
            [...new Map(
              dto.items
                .filter((i) => i.location_name)
                .map((i) => [i.location_name!, { id: i.location_id ?? i.location_name!, name: i.location_name! }]),
            ).values()]
          }
          onOpenItem={(row) => {
            const item = dto.items.find((i) => i.id === row.item_id || i.id === row.id)
            if (item) openItem(item)
          }}
        />
      )}

      {deskTab === 'quotes' && (
        <CustomerPageQuotesPanel
          dto={dto}
          mode={mode}
          category={category}
          basePath={basePath}
          onRefresh={onRefresh}
          onAskAva={askAva}
          onWorkingOn={onWorkingOn}
        />
      )}

      {deskTab === 'claims' && (
        <CustomerPageClaimsPanel
          dto={dto}
          mode={mode}
          basePath={basePath}
          onAskAva={askAva}
          onWorkingOn={onWorkingOn}
          onReportClaim={
            readOnly
              ? undefined
              : () => openReportClaim()
          }
        />
      )}

      {deskTab === 'comms' && (
        <CustomerPageCommsPanel
          category={category}
          basePath={basePath}
          conciergeEnabled={conciergeEnabled}
          greetingName={dto.greeting_name}
        />
      )}

      {deskTab === 'items' && (
      <>
      <section aria-label="My items and cover" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">My items & cover</h2>
            {!compactCover && (
              <p className="text-xs text-navy-600">
                {isFintastic
                  ? 'Expand a row to work on that item in place — open Details on the right when you need the full panel.'
                  : 'Open an item with the expand control, or right-click / ⋯ for actions.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-navy-600">
              <button
                type="button"
                className="rounded-md px-2 py-1 hover:bg-mist hover:text-navy-900"
                onClick={() => setDeskTab('quotes')}
              >
                {quoteCount} quote{quoteCount === 1 ? '' : 's'}
              </button>
              <span className="text-navy-300" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="rounded-md px-2 py-1 hover:bg-mist hover:text-navy-900"
                onClick={() => setDeskTab('claims')}
              >
                {claimCount} claim{claimCount === 1 ? '' : 's'}
              </button>
              <span className="text-navy-300" aria-hidden>
                ·
              </span>
              <span className="rounded-md px-2 py-1 tabular-nums">
                {policyCount} polic{policyCount === 1 ? 'y' : 'ies'}
              </span>
            </div>
            <ViewModeToggle
              view={view}
              onChange={(next) => {
                setView(next)
                if (selected) setSlideOpen(next !== 'fintastic')
              }}
            />
            <div
              className="inline-flex rounded-lg border border-navy-800/15 bg-white p-0.5"
              role="group"
              aria-label="Item layout"
            >
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                  itemLayout === 'list' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-mist',
                )}
                aria-pressed={itemLayout === 'list'}
                onClick={() => setItemLayout('list')}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                List
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                  itemLayout === 'cards' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-mist',
                )}
                aria-pressed={itemLayout === 'cards'}
                onClick={() => setItemLayout('cards')}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Cards
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                  itemLayout === 'map' ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-mist',
                )}
                aria-pressed={itemLayout === 'map'}
                onClick={() => {
                  setItemLayout('map')
                  setMapExpanded(true)
                }}
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden />
                Map
              </button>
            </div>
            {!readOnly && (
              <Button size="sm" variant="accent" onClick={() => setAddOpen(true)}>
                <Plus /> Add item
              </Button>
            )}
          </div>
        </div>

        {itemLayout === 'map' && personalMapModel && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-navy-600">
                {mapAreaId
                  ? `Showing items in this area · ${mapScopedItems.length}`
                  : mapPlaceId
                    ? `Showing items at this place · ${mapScopedItems.length}`
                    : `All places · ${mapScopedItems.length} items`}
              </p>
              <Button size="sm" variant="ghost" type="button" onClick={() => setMapExpanded((v) => !v)}>
                {mapExpanded ? 'Expand grid' : 'Collapse grid'}
              </Button>
            </div>
            <AssetMapView
              model={personalMapModel}
              placeId={mapPlaceId}
              areaId={mapAreaId}
              focusedId={selected?.id ?? null}
              compact={!mapExpanded}
              onExpand={() => setMapExpanded(true)}
              onSelectPlace={setMapPlace}
              onSelectArea={setMapArea}
              onSelectPin={(id) => {
                const item = dto.items.find((i) => i.id === id) ?? mapScopedItems.find((i) => i.id === id)
                if (!item) return
                if (isFintastic) toggleExpandItem(item)
                else openItem(item)
              }}
              onPinMenu={
                readOnly
                  ? undefined
                  : (id, e) => {
                      const item = dto.items.find((i) => i.id === id) ?? mapScopedItems.find((i) => i.id === id)
                      if (!item) return
                      setRowMenu({ x: e.clientX, y: e.clientY, items: menuFor(item) })
                    }
              }
            />
          </div>
        )}

        {isFintastic && quoteOpen && !readOnly && (
          <GetQuoteSlideout
            open={quoteOpen}
            onClose={() => {
              setQuoteOpen(false)
              setQuoteNotes('')
            }}
            dto={dto}
            category={category}
            preselectedIds={quotePreselect}
            initialNotes={quoteNotes}
            variant="journey"
            onAskAva={askAva ? () => askAva({ label: 'Quote request' }) : undefined}
            onDone={(requestId) => {
              onRefresh?.()
              setQuoteOpen(false)
              setQuoteNotes('')
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('tab', 'quotes')
                  next.set('view', 'fintastic')
                  next.set('request', requestId)
                  return next
                },
                { replace: true },
              )
            }}
          />
        )}

        {itemLayout === 'cards' ? (
          dto.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-8 text-center">
              <p className="text-sm text-navy-600">Nothing listed yet. Add an item to your asset register.</p>
            </div>
          ) : (
            <PersonalItemCards
              items={dto.items}
              selectedId={selected?.id ?? null}
              readOnly={readOnly}
              menuFor={menuFor}
              onOpenMenu={setRowMenu}
              onOpen={(item) => (isFintastic ? toggleExpandItem(item) : openItem(item))}
              onPrimary={readOnly ? undefined : (item) => openQuoteFor(item)}
              primaryLabel="Get quote"
              renderExpanded={isFintastic && !quoteOpen ? (item) => renderItemHub(item) : undefined}
            />
          )
        ) : (
        <DataGrid
          data={itemLayout === 'map' ? mapScopedItems : dto.items}
          columns={columns}
          getRowId={(r) => r.id}
          storageKey="customer-portal-items"
          searchPlaceholder="Search items…"
          searchText={(r) =>
            `${r.display_label} ${r.item_type} ${r.reference ?? ''} ${r.policy_reference ?? ''} ${r.insurer_name ?? ''}`
          }
          getRowContextMenu={readOnly ? undefined : (row) => menuFor(row)}
          rowClassName={(row) => (selected?.id === row.id ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-200' : undefined)}
          minWidth={760}
          expandedRowId={isFintastic && !quoteOpen ? selected?.id ?? null : null}
          onExpandedRowChange={(id) => {
            if (!isFintastic) return
            if (!id) {
              closeItem()
              return
            }
            const item =
              (itemLayout === 'map' ? mapScopedItems : dto.items).find((i) => i.id === id) ??
              dto.items.find((i) => i.id === id)
            if (item) toggleExpandItem(item)
          }}
          renderExpandedRow={
            isFintastic && !quoteOpen ? (item) => renderItemHub(item) : undefined
          }
          empty={
            <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-8 text-center">
              <p className="text-sm text-navy-600">Nothing listed yet. Add an item to your asset register.</p>
              {!readOnly && (
                <Button size="sm" variant="accent" className="mt-3" onClick={() => setAddOpen(true)}>
                  <Plus /> Add item
                </Button>
              )}
            </div>
          }
          bulkActions={
            readOnly
              ? undefined
              : (rows, clear) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-navy-700">{rows.length} selected</span>
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => {
                        setQuotePreselect(rows.map((r) => r.id))
                        setQuoteOpen(true)
                        clear()
                      }}
                    >
                      <Plus /> Get a quote
                    </Button>
                    {askAva && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          askAva({
                            itemIds: rows.map((r) => r.id),
                            label: rows.length === 1 ? rows[0]!.display_label : `${rows.length} selected`,
                          })
                          clear()
                        }}
                      >
                        <MessageSquare /> Ask Ava
                      </Button>
                    )}
                    {rows.every((r) => itemStatus(r) === 'covered' && r.policy_id) && rows[0] && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          openReportClaim(rows[0])
                          clear()
                        }}
                      >
                        <ShieldAlert /> Report claim
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={clear}>
                      Clear
                    </Button>
                  </div>
                )
          }
          mobileCard={(row, sel) => {
            const status = itemStatus(row)
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
                    onClick={() => (isFintastic ? toggleExpandItem(row) : openItem(row))}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{row.display_label}</p>
                        <p className="text-xs capitalize text-navy-600">{row.item_type}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_CLASS[status])}>
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg',
                      open ? 'bg-brand-100 text-brand-800' : 'text-navy-600 hover:bg-mist',
                    )}
                    aria-label={
                      isFintastic
                        ? open
                          ? `Collapse ${row.display_label}`
                          : `Expand ${row.display_label}`
                        : open
                          ? `Close ${row.display_label}`
                          : `Open ${row.display_label}`
                    }
                    aria-expanded={open}
                    onClick={() =>
                      isFintastic
                        ? toggleExpandItem(row)
                        : open && slideOpen
                          ? closeItem()
                          : openItem(row)
                    }
                  >
                    {isFintastic ? (
                      open ? (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      )
                    ) : (
                      <PanelRightOpen className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  <RowActionsButton items={menuFor(row)} onOpen={setRowMenu} />
                </div>
                {isFintastic && open && !quoteOpen ? <div className="mt-3">{renderItemHub(row)}</div> : null}
              </div>
            )
          }}
        />
        )}
        {dto.items.length > 0 && (
          <p className="rounded-lg border border-navy-800/10 bg-navy-50/50 px-3 py-2 text-right text-xs font-semibold text-navy-800 tabular-nums">
            Recorded asset value ·{' '}
            {money(dto.items.reduce((s, i) => s + (i.insured_value ?? 0), 0)) ?? '—'}
            <span className="mt-0.5 block font-medium text-navy-500">
              {dto.items.filter((i) => i.insured_value != null).length} of {dto.items.length} priced
              · insured value shown when cover is active
            </span>
          </p>
        )}
      </section>

      {!deskLocked && !compactCover && (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Quotes & requests"
          count={quoteCount}
          detail={
            quoteRequests[0]
              ? `${quoteRequests[0].reference} · ${quoteRequests[0].next_step}`
              : dto.released_quote_count
                ? `${dto.released_quote_count} released`
                : 'None yet'
          }
          onClick={() => setDeskTab('quotes')}
        />
        <SummaryCard
          title="Policies & documents"
          count={policyCount}
          detail={
            dto.policies[0]
              ? insurerPolicyLabel(dto.policies[0].insurer_name, dto.policies[0].policy_number || dto.policies[0].reference)
              : 'No issued policies'
          }
        />
        <SummaryCard
          title="Claims"
          count={claimCount}
          detail={
            dto.claims[0]
              ? `${dto.claims[0].reference} · ${CUSTOMER_CLAIM_STATUS[dto.claims[0].status] ?? dto.claims[0].status}`
              : 'No claims yet'
          }
          onClick={() => setDeskTab('claims')}
          actionLabel={dto.claims.length ? 'View all' : 'Open claims'}
        />
        <section className="rounded-xl border border-navy-800/10 bg-white px-3 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">My broker</p>
          <p className="mt-1 text-sm font-semibold text-navy-900">{dto.broker?.name ?? 'Your assigned broker'}</p>
          <p className="text-xs text-navy-600">{dto.brokerage.trading_name}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dto.broker?.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${dto.broker.phone}`}>
                  <Phone /> Call
                </a>
              </Button>
            )}
            {!readOnly && askAva && (
              <Button size="sm" variant="outline" onClick={() => askAva()}>
                <MessageSquare /> Ask Ava
              </Button>
            )}
          </div>
        </section>
      </div>
      )}
      </>
      )}

      <AddItemSlideout
        open={addOpen}
        onClose={() => setAddOpen(false)}
        dto={dto}
        category={category}
        readOnly={readOnly}
        onDone={() => onRefresh?.()}
        onSavedAndQuote={(itemId) => {
          setAddOpen(false)
          setQuotePreselect([itemId])
          setQuoteOpen(true)
          onRefresh?.()
        }}
      />

      {!readOnly && !isFintastic && (
        <GetQuoteSlideout
          open={quoteOpen}
          onClose={() => {
            setQuoteOpen(false)
            setQuoteNotes('')
          }}
          dto={dto}
          category={category}
          preselectedIds={quotePreselect}
          initialNotes={quoteNotes}
          variant="slideout"
          onDone={(requestId) => {
            onRefresh?.()
            setQuoteOpen(false)
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', 'quotes')
                next.set('request', requestId)
                return next
              },
              { replace: true },
            )
          }}
        />
      )}

      {!readOnly && (
        <ReportClaimSlideout
          open={claimOpen}
          onClose={() => {
            setClaimOpen(false)
            setClaimTarget(null)
          }}
          mode="customer"
          dto={dto}
          category={category}
          target={claimTarget}
          onDone={() => {
            onRefresh?.()
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', 'claims')
                next.set('view', 'fintastic')
                return next
              },
              { replace: true },
            )
          }}
        />
      )}

      <RightSlideout
        open={Boolean(selected) && slideOpen}
        onClose={() => {
          if (isFintastic) {
            // Keep the in-page hub; only dismiss the detail panel
            setSlideOpen(false)
            return
          }
          closeItem()
        }}
        title={selected?.display_label ?? 'Item'}
        subtitle={
          selected
            ? `${selected.item_type}${selected.reference ? ` · ${selected.reference}` : ''}${
                isFintastic ? ' · details' : ''
              }`
            : undefined
        }
        size="wide"
        footer={
          selected && !readOnly && !isFintastic ? (
            <div className="flex flex-wrap gap-2">
              {(itemStatus(selected) === 'awaiting_cover' || itemStatus(selected) === 'request_sent') && (
                <Button size="sm" variant="accent" onClick={() => { closeItem(); openQuoteFor(selected) }}>
                  Get a quote
                </Button>
              )}
              {itemStatus(selected) === 'covered' && selected.policy_id && (
                <Button size="sm" variant="outline" onClick={() => openReportClaim(selected)}>
                  Report a claim
                </Button>
              )}
              {askAva && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => askAva({ itemIds: [selected.id], label: selected.display_label })}
                >
                  Ask Ava
                </Button>
              )}
            </div>
          ) : selected && isFintastic ? (
            <p className="text-xs text-navy-500">
              Primary action stays in the expanded row. Close this panel to return to the table.
            </p>
          ) : null
        }
      >
        {selected && (
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="cover">Cover</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="quote">Quote</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4 space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Status</dt>
                  <dd className="mt-0.5 font-semibold text-navy-900">{STATUS_LABEL[itemStatus(selected)]}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Value</dt>
                  <dd className="mt-0.5 text-right tabular-nums text-navy-800">
                    {moneyOrNotSupplied(selected.insured_value)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Premium</dt>
                  <dd className="mt-0.5 text-right tabular-nums text-navy-800">
                    {money(selected.premium_amount)
                      ? `${money(selected.premium_amount)}${freq(selected.premium_frequency)}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Insurer / policy</dt>
                  <dd className="mt-0.5 text-navy-800">
                    {insurerPolicyLabel(
                      selected.insurer_name || selectedPolicy?.insurer_name,
                      selected.policy_reference,
                    )}
                  </dd>
                </div>
              </dl>
              {gaps.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Missing for a quote: {gaps.map((g) => g.label).join(', ')}.
                </p>
              )}
            </TabsContent>
            <TabsContent value="cover" className="mt-4 space-y-3 text-sm">
              {itemStatus(selected) === 'covered' ? (
                <p className="text-navy-700">
                  This item is on cover
                  {selectedPolicy?.insurer_name ? ` with ${selectedPolicy.insurer_name}` : ''}.
                  {selected.policy_reference ? ` Policy ${selected.policy_reference}.` : ''}
                </p>
              ) : (
                <p className="text-navy-700">Not on active cover yet. Request a quote to proceed.</p>
              )}
            </TabsContent>
            <TabsContent value="documents" className="mt-4 space-y-3 text-sm">
              {(selectedPolicy?.documents?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {selectedPolicy!.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-700" />
                      {d.url ? (
                        <a href={d.url} className="font-semibold text-brand-700 underline" target="_blank" rel="noreferrer">
                          {d.label}
                        </a>
                      ) : (
                        <span>{d.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-navy-700">No policy documents available yet.</p>
              )}
            </TabsContent>
            <TabsContent value="activity" className="mt-4 text-sm text-navy-700">
              {selected.quote_request_reference
                ? `Quote request ${selected.quote_request_reference} linked to this item.`
                : 'No recent activity on this item.'}
            </TabsContent>
            <TabsContent value="quote" className="mt-4 space-y-3 text-sm">
              {selected.quote_request_reference ? (
                <>
                  <p className="text-navy-700">
                    Request {selected.quote_request_reference} is with your broker.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(null)
                      setParams(
                        (prev) => {
                          const next = new URLSearchParams(prev)
                          next.set('tab', 'quotes')
                          if (selected.quote_request_id) next.set('request', selected.quote_request_id)
                          return next
                        },
                        { replace: true },
                      )
                    }}
                  >
                    Open on Quotes
                  </Button>
                </>
              ) : itemStatus(selected) === 'view_quote' && selected.quote_id ? (
                <p className="text-navy-700">
                  Offers are ready. Open My quotes to compare — we no longer jump to a detached proposal page by default.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-navy-700">No quote request on this item yet.</p>
                  {!readOnly && (
                    <Button size="sm" variant="accent" onClick={() => { closeItem(); openQuoteFor(selected) }}>
                      <Plus /> Get a quote
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
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

function SummaryCard({
  title,
  count,
  detail,
  to,
  onClick,
  actionLabel,
}: {
  title: string
  count: number
  detail: string
  to?: string
  onClick?: () => void
  actionLabel?: string
}) {
  return (
    <section className="rounded-xl border border-navy-800/10 bg-white px-3 py-3">
      <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{title}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-navy-900">{count}</p>
      <p className="truncate text-xs text-navy-600">{detail}</p>
      {onClick ? (
        <Button size="sm" variant="ghost" className="mt-1 px-0" type="button" onClick={onClick}>
          {actionLabel ?? 'View all'}
        </Button>
      ) : to ? (
        <Button size="sm" variant="ghost" className="mt-1 px-0" asChild>
          <Link to={to}>{actionLabel ?? 'View all'}</Link>
        </Button>
      ) : null}
    </section>
  )
}
