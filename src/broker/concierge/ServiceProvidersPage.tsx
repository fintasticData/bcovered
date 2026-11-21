import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, MapPin, Phone, Plus, Search, Wrench } from 'lucide-react'
import {
  useClaimSuggestedTrades,
  useServiceProvider,
  useServiceProviders,
  useServiceTradeTypes,
  type ServiceProviderSummary,
} from '@/api/serviceProviders'
import { useClaimDetail } from '@/copilot/policyClaimsApi'
import { claimQuotesUnlocked, incidentTypeLabel } from '@/broker/claims/claimServiceQuotes'
import { QeSuburbSelect } from '@/components/qe/QeSuburbSelect'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page } from '../shared/ui'
import { Button } from '@/components/ui/button'
import { ProviderFormDialog } from './ProviderFormDialog'
import { FindProvidersPanel } from './FindProvidersPanel'
import { ProviderRecordPanel } from './ProviderRecordPanel'
import { CreateServiceJobPanel } from './CreateServiceJobPanel'
import { ProviderCard, ProviderListRow } from './ProviderDirectoryViews'
import { RightSlideout } from '../shared/RightSlideout'
import { SelectedItemHubView, ViewModeToggle, useLayoutView } from '@/fintastic-ux'
import { cn } from '@/lib/utils'

type ViewMode = 'cards' | 'list'

function displayAddress(p: ServiceProviderSummary): string {
  return (
    p.address_formatted ||
    [p.street_address, p.suburb, p.city].filter(Boolean).join(', ') ||
    ''
  )
}

export default function ServiceProvidersPage() {
  const { providerId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { view: layoutView, setView: setLayoutView, isFintastic } = useLayoutView('fintastic')
  const trades = useServiceTradeTypes()
  const [query, setQuery] = useState('')
  const [tradeTypeId, setTradeTypeId] = useState<string>(params.get('trade') ?? '')
  const [area, setArea] = useState(params.get('area') ?? '')
  const [activeOnly, setActiveOnly] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(params.get('find') === '1')
  const [jobOpen, setJobOpen] = useState(params.get('job') === '1')
  const [jobProviderId, setJobProviderId] = useState<string | null>(null)
  const [jobPersonId, setJobPersonId] = useState<string | null>(params.get('personId'))
  const jobClaimId = params.get('claimId')
  const [editOpen, setEditOpen] = useState(false)
  const [view, setView] = useState<ViewMode>(() => (params.get('layout') === 'list' ? 'list' : 'cards'))

  const claimDetail = useClaimDetail(jobClaimId)
  const suggestedTrades = useClaimSuggestedTrades(claimDetail.data?.incident_type)
  const quotesOpen = claimQuotesUnlocked({
    status: claimDetail.data?.status,
    decision: claimDetail.data?.decision,
    quotes_unlocked: claimDetail.data?.quotes_unlocked,
  })

  useEffect(() => {
    if (!jobClaimId || !claimDetail.data) return
    if (claimDetail.data.person_id && !jobPersonId) {
      setJobPersonId(claimDetail.data.person_id)
    }
  }, [jobClaimId, claimDetail.data, jobPersonId])

  useEffect(() => {
    if (tradeTypeId || !suggestedTrades.data?.length) return
    setTradeTypeId(suggestedTrades.data[0].id)
  }, [suggestedTrades.data, tradeTypeId])

  const filters = useMemo(
    () => ({
      query: query.trim() || undefined,
      tradeTypeId: tradeTypeId || null,
      area: area.trim() || undefined,
      active: activeOnly ? true : null,
    }),
    [query, tradeTypeId, area, activeOnly],
  )
  const list = useServiceProviders(filters)
  const selectedId = providerId ?? null
  const focused = useServiceProvider(selectedId ?? undefined)

  const openProvider = (id: string) => navigate(`/broker/concierge/providers/${id}`)
  const closeProvider = () => navigate('/broker/concierge/providers')

  const setViewMode = (mode: ViewMode) => {
    setView(mode)
    setParams((p) => {
      // layout view uses ?view=fintastic|classic — keep cards/list in ?layout=
      if (mode === 'cards') p.delete('layout')
      else p.set('layout', mode)
      return p
    })
  }

  const openFind = () => {
    setFindOpen(true)
    setParams((p) => {
      p.set('find', '1')
      return p
    })
  }

  const openCreateJob = (id?: string | null) => {
    setJobProviderId(id ?? selectedId)
    setJobOpen(true)
  }

  const hub = focused.data
  const showStar = isFintastic && hub

  return (
    <Page>
      <PageHeader
        title="Service providers"
        description={
          jobClaimId && claimDetail.data
            ? `Quotes for ${claimDetail.data.reference} · ${incidentTypeLabel(claimDetail.data.incident_type)} · ${claimDetail.data.customer_name}`
            : 'Directory of tradespeople your Concierge team can allocate to customer jobs. Add manually or find providers in an area.'
        }
        actions={
          <>
            <ViewModeToggle view={layoutView} onChange={setLayoutView} />
            {jobClaimId && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/claims/${jobClaimId}?view=fintastic`}>Open claim</Link>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openFind}>
              <Search /> Find
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> Add provider
            </Button>
          </>
        }
      />

      {jobClaimId && claimDetail.data && !quotesOpen && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          Insurer has not accepted this claim yet — repair jobs stay locked until status is decision received and
          approved.
        </p>
      )}

      {showStar && (
        <div className="mb-4">
          <SelectedItemHubView
            title={hub.trading_name}
            statusLabel={hub.active ? 'Active' : 'Inactive'}
            statusTone={hub.active ? 'ok' : 'attention'}
            primaryActionLabel="Create job"
            onPrimaryAction={() => openCreateJob(hub.id)}
            onClose={closeProvider}
            headerActions={
              <Button size="sm" variant="outline" type="button" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            }
            spokes={[
              {
                id: 'contact',
                title: 'Contact',
                body: (
                  <div className="space-y-1 text-sm text-navy-800">
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-navy-400" />
                      {hub.phone ?? hub.email ?? '—'}
                    </p>
                    {hub.website && <p className="truncate text-xs text-navy-500">{hub.website}</p>}
                  </div>
                ),
              },
              {
                id: 'address',
                title: 'Address',
                body: (
                  <p className="flex items-start gap-1.5 text-sm text-navy-800">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" />
                    <span>{displayAddress(hub) || 'No map address yet'}</span>
                  </p>
                ),
              },
              {
                id: 'trades',
                title: 'Trades',
                body: (
                  <div className="flex flex-wrap gap-1">
                    {hub.trades.map((t) => (
                      <span key={t.id} className="rounded-md bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-800">
                        {t.label}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                id: 'jobs',
                title: 'Open jobs',
                body: (
                  <p className="text-sm text-navy-800">
                    {(hub.jobs_current ?? []).length === 0
                      ? 'None yet — create a job for a customer'
                      : `${hub.jobs_current!.length} open`}
                  </p>
                ),
              },
            ]}
            copilotMessage={`Allocate ${hub.trading_name} to a customer job, or find more ${hub.trades[0]?.label?.toLowerCase() ?? 'trade'} providers near ${area || 'this area'}.`}
            copilotAction={
              <Button size="sm" variant="outline" type="button" onClick={openFind}>
                Find nearby
              </Button>
            }
          />
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-navy-800/10 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="field min-w-[180px] flex-1"
            placeholder="Search name, phone or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="field w-auto min-w-[140px]" value={tradeTypeId} onChange={(e) => setTradeTypeId(e.target.value)}>
            <option value="">All trades</option>
            {(trades.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <QeSuburbSelect
            className="min-w-[200px] flex-1 sm:max-w-xs"
            value={area}
            valueMode="area"
            onChange={setArea}
            placeholder="Filter by suburb"
          />
          <label className="inline-flex h-9 items-center gap-2 px-1 text-sm text-navy-700">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <div className="ml-auto inline-flex rounded-xl border border-navy-800/10 bg-navy-50/60 p-0.5">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                view === 'cards' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-800',
              )}
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                view === 'list' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-800',
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-navy-600">
          <p>
            {list.data ? `${list.data.length} provider${list.data.length === 1 ? '' : 's'}` : '…'}
            {area.trim() ? ` · near ${area.trim()}` : ''}
            {tradeTypeId ? ` · ${(trades.data ?? []).find((t) => t.id === tradeTypeId)?.label}` : ''}
          </p>
          {(area.trim() || tradeTypeId || query.trim()) && (
            <button
              type="button"
              className="font-semibold text-brand-700 underline"
              onClick={() => {
                setQuery('')
                setTradeTypeId('')
                setArea('')
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {list.isLoading && <LoadingState label="Loading providers…" />}
      {list.error && <ErrorState message={list.error.message} />}

      {list.data && list.data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-navy-800/15 bg-white px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <Wrench className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-navy-950">
            {query || area || tradeTypeId ? 'No providers match these filters' : 'No providers yet'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-navy-600">
            {query || area || tradeTypeId
              ? 'Clear filters, or find providers for this area.'
              : 'Find providers in an area, or add one you already work with.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={openFind}>
              <Search /> Find
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> Add provider
            </Button>
          </div>
        </div>
      )}

      {list.data && list.data.length > 0 && view === 'cards' && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((p) => (
            <li key={p.id} className="relative">
              <ProviderCard p={p} selected={selectedId === p.id} onOpen={() => openProvider(p.id)} />
              <button
                type="button"
                className="absolute top-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-brand-800 shadow-sm ring-1 ring-navy-800/10 hover:bg-brand-50"
                onClick={(e) => {
                  e.stopPropagation()
                  openCreateJob(p.id)
                }}
              >
                + Job
              </button>
            </li>
          ))}
        </ul>
      )}

      {list.data && list.data.length > 0 && view === 'list' && (
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-3 px-3 text-[10px] font-semibold tracking-wide text-navy-500 uppercase md:grid">
            <span>Provider</span>
            <span>Address</span>
            <span>Contact</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="space-y-1.5">
            {list.data.map((p) => (
              <li key={p.id} className="relative">
                <ProviderListRow p={p} selected={selectedId === p.id} onOpen={() => openProvider(p.id)} />
                <button
                  type="button"
                  className="absolute top-1/2 right-14 -translate-y-1/2 rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-brand-800 ring-1 ring-navy-800/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    openCreateJob(p.id)
                  }}
                >
                  + Job
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isFintastic && (
        <RightSlideout
          open={Boolean(selectedId)}
          onClose={closeProvider}
          title="Provider"
          subtitle="Working on · service directory"
          size="record"
          footer={null}
        >
          {selectedId && (
            <ProviderRecordPanel
              providerId={selectedId}
              onClose={closeProvider}
              onCreateJob={() => openCreateJob(selectedId)}
            />
          )}
        </RightSlideout>
      )}

      {isFintastic && selectedId && !hub && focused.isLoading && (
        <p className="mt-2 text-sm text-navy-500">Opening provider…</p>
      )}

      <ProviderFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultTradeTypeId={tradeTypeId || null}
        defaultArea={area.trim() || null}
        onSaved={(id) => {
          setAddOpen(false)
          openProvider(id)
        }}
      />

      <ProviderFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={focused.data ?? null}
        onSaved={() => {
          setEditOpen(false)
          void focused.refetch()
          void list.refetch()
        }}
      />

      <FindProvidersPanel
        open={findOpen}
        defaultArea={area}
        defaultTradeCode={(trades.data ?? []).find((t) => t.id === tradeTypeId)?.code}
        onClose={() => {
          setFindOpen(false)
          setParams((p) => {
            p.delete('find')
            return p
          })
        }}
        onAdded={() => {
          void list.refetch()
        }}
      />

      <CreateServiceJobPanel
        open={jobOpen}
        providerId={jobProviderId}
        personId={jobPersonId ?? claimDetail.data?.person_id ?? null}
        personName={claimDetail.data?.customer_name ?? null}
        claimId={quotesOpen ? jobClaimId : null}
        claimReference={claimDetail.data?.reference ?? null}
        incidentType={claimDetail.data?.incident_type ?? null}
        preferredTradeTypeId={suggestedTrades.data?.[0]?.id ?? (tradeTypeId || null)}
        onClose={() => {
          setJobOpen(false)
          setJobProviderId(null)
          setParams((p) => {
            p.delete('job')
            p.delete('personId')
            // keep claimId so returning to directory stays claim-scoped
            return p
          })
        }}
        onCreated={() => {
          void claimDetail.refetch()
        }}
      />
    </Page>
  )
}
