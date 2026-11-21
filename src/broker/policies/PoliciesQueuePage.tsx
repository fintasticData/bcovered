import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  FileStack,
  FileText,
  ListTodo,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  User,
} from 'lucide-react'
import { useSalesProfile } from '@/copilot/salesApi'
import { MediaAttachPanel } from '@/components/MediaAttachPanel'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import { usePolicyServiceRequests, usePolicyCovers } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { RouteStartButtons } from '../routes/RouteActionsMenu'
import { PolicyTasksSlideout } from './PolicyTasksSlideout'
import { RightSlideout } from '../shared/RightSlideout'
import {
  ViewModeToggle,
  useLayoutView,
  SelectedItemHubView,
  ActionCard,
  findRenewalForCustomer,
  renewalQueueHref,
  zar,
} from '@/fintastic-ux'
import { cn } from '@/lib/utils'
import { useStartRoute } from '@/api/hooks'
import { newKey } from '@/copilot/salesApi'
import { guidePath } from '../routes/launchRoute'
import { RowActionsButton, type ContextMenuItem, type ContextMenuState } from '../shared/RowContextMenu'

type PolicyCoverRow = {
  id: string
  policy_id: string
  reference: string | null
  policy_number: string | null
  client_number: string
  customer_name: string
  person_id: string
  insurer_name: string | null
  status: string
  item_summary: string | null
}

const ROW_PX = 44
const HEADER_PX = 36
const DEFAULT_VISIBLE = 6

/** Brokerage-wide Policies workspace — Fintastic = star + working grid + drawer. */
export default function PoliciesQueuePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const start = useStartRoute()
  const profile = useSalesProfile()
  const tenantId = profile.data?.brokerage?.id ?? null
  const { view: layoutView, setView: setLayoutView, isFintastic } = useLayoutView('fintastic')
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false)
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const queue: 'policies' | 'requests' =
    params.get('queue') === 'requests' ||
    (params.get('queue') == null && params.get('view') === 'requests')
      ? 'requests'
      : 'policies'
  const requests = usePolicyServiceRequests({ query: q || null, status: status || null })
  const covers = usePolicyCovers({ query: q || null })
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [gridExpanded, setGridExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [actionMenu, setActionMenu] = useState<ContextMenuState>(null)
  const scrollPos = useRef(0)
  const bodyRef = useRef<HTMLDivElement>(null)

  const policyRows = covers.data?.rows ?? []
  const focusedPolicy = useMemo(() => {
    if (!policyRows.length) return null
    return policyRows.find((r) => r.policy_id === focusedId) ?? policyRows[0]
  }, [policyRows, focusedId])

  const checkedPolicy = useMemo(
    () => policyRows.find((r) => checked.has(r.policy_id)),
    [policyRows, checked],
  )

  const setQueue = (id: 'policies' | 'requests') => {
    const next = new URLSearchParams(params)
    if (id === 'policies') next.delete('queue')
    else next.set('queue', id)
    if (layoutView === 'fintastic') next.set('view', 'fintastic')
    else if (layoutView === 'classic') next.set('view', 'classic')
    else next.delete('view')
    // clear legacy view=requests collision
    if (next.get('view') === 'requests') next.delete('view')
    setParams(next)
  }

  const setFocus = (policyId: string) => {
    setFocusedId(policyId)
  }

  const toggleCheck = (policyId: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(policyId)) next.delete(policyId)
      else next.add(policyId)
      return next
    })
  }

  const launchRoute = (definitionId: string, row: PolicyCoverRow) => {
    start.mutate(
      {
        definition_id: definitionId,
        person_id: row.person_id,
        policy_id: row.policy_id,
        key: newKey(),
      },
      { onSuccess: (s) => navigate(guidePath(s.progress.run.id)) },
    )
  }

  const menuFor = (row: PolicyCoverRow): ContextMenuItem[] => [
    {
      id: 'open',
      label: 'Open policy',
      icon: FileText,
      onSelect: () => navigate(`/broker/policies/${row.policy_id}?view=fintastic`),
    },
    {
      id: 'upload',
      label: 'Upload files',
      icon: Upload,
      onSelect: () => {
        setFocus(row.policy_id)
        setUploadDrawerOpen(true)
      },
    },
    {
      id: 'change',
      label: 'Request change',
      icon: Pencil,
      onSelect: () =>
        navigate(`/broker/policies/requests/new?personId=${row.person_id}&policyId=${row.policy_id}`),
    },
    {
      id: 'renew',
      label: 'Renew',
      icon: RefreshCw,
      onSelect: () => launchRoute('policy_renew', row),
    },
    {
      id: 'claim',
      label: 'Register claim',
      icon: ShieldAlert,
      onSelect: () => launchRoute('claim_register', row),
    },
    {
      id: 'client',
      label: 'Client record',
      icon: User,
      onSelect: () => navigate(`/broker/customers/people/${row.person_id}?rtab=policies`),
    },
  ]

  const focusedRenewal = focusedPolicy
    ? findRenewalForCustomer(focusedPolicy.person_id, focusedPolicy.customer_name)
    : null

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return policyRows
    return policyRows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(needle) ||
        (r.policy_number ?? '').toLowerCase().includes(needle) ||
        r.client_number.toLowerCase().includes(needle) ||
        (r.item_summary ?? '').toLowerCase().includes(needle) ||
        (r.insurer_name ?? '').toLowerCase().includes(needle),
    )
  }, [policyRows, q])

  const naturalCount = filteredRows.length
  const bodyHeight =
    naturalCount === 0
      ? ROW_PX * 2
      : naturalCount <= 2
        ? naturalCount * ROW_PX
        : gridExpanded
          ? undefined
          : Math.min(8, Math.max(5, Math.min(DEFAULT_VISIBLE, naturalCount))) * ROW_PX

  const compactStar = isFintastic && gridExpanded && focusedPolicy

  const primaryLabel = focusedRenewal
    ? 'Discuss renewal'
    : focusedPolicy?.status === 'in_force' || focusedPolicy?.status === 'active'
      ? 'Open policy'
      : 'Request a change'

  const onPrimary = () => {
    if (!focusedPolicy) return
    if (focusedRenewal) {
      navigate(renewalQueueHref(focusedRenewal.id))
      return
    }
    if (focusedPolicy.status === 'in_force' || focusedPolicy.status === 'active') {
      navigate(`/broker/policies/${focusedPolicy.policy_id}?view=fintastic`)
      return
    }
    navigate(
      `/broker/policies/requests/new?personId=${focusedPolicy.person_id}&policyId=${focusedPolicy.policy_id}`,
    )
  }

  const russMessage = focusedRenewal
    ? `Renewal pending for ${focusedPolicy?.customer_name}: excess ${zar(focusedRenewal.expiringExcess)} → ${zar(focusedRenewal.proposedExcess)}. Open the renewal queue to compare terms.`
    : focusedPolicy
      ? `${focusedPolicy.customer_name}'s ${focusedPolicy.item_summary ?? 'cover'} with ${focusedPolicy.insurer_name ?? 'the insurer'} is ${focusedPolicy.status.replace(/_/g, ' ')}. Open the policy to review schedule items, or start a change if cover needs updating.`
      : ''

  return (
    <Page>
      <PageHeader
        title="Policies"
        description="Customer-linked short-term cover. Focus a policy in the star, work the queue below, open detail in the drawer."
        actions={<ViewModeToggle view={layoutView} onChange={setLayoutView} />}
      />

      {queue === 'policies' && isFintastic && focusedPolicy && !compactStar && (
        <div className="mb-4">
          <SelectedItemHubView
            title={focusedPolicy.item_summary?.split('·')[0]?.trim() || focusedPolicy.customer_name}
            statusLabel={focusedPolicy.status.replace(/_/g, ' ')}
            statusTone={
              focusedRenewal
                ? 'attention'
                : focusedPolicy.status === 'in_force' || focusedPolicy.status === 'active'
                  ? 'ok'
                  : 'pending'
            }
            primaryActionLabel={primaryLabel}
            onPrimaryAction={onPrimary}
            copilotMessage={russMessage}
            copilotAction={
              focusedRenewal ? (
                <Button size="sm" variant="accent" asChild>
                  <Link to={renewalQueueHref(focusedRenewal.id)}>Open renewal queue</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" type="button" onClick={() => setDrawerOpen(true)}>
                  Inspect in drawer
                </Button>
              )
            }
            headerActions={
              <Button size="sm" variant="outline" type="button" onClick={() => setDrawerOpen(true)}>
                Preview
              </Button>
            }
            spokes={[
              {
                id: 'client',
                title: 'Client',
                body: (
                  <span>
                    {focusedPolicy.customer_name}
                    <span className="mt-0.5 block font-mono text-[10px] text-navy-500">{focusedPolicy.client_number}</span>
                  </span>
                ),
                onClick: () => navigate(`/broker/customers/people/${focusedPolicy.person_id}?rtab=policies`),
              },
              {
                id: 'insurer',
                title: 'Insurer / policy',
                body: (
                  <span>
                    {focusedPolicy.insurer_name ?? '—'}
                    <span className="mt-0.5 block font-mono text-[10px] text-navy-500">
                      {focusedPolicy.policy_number ?? focusedPolicy.reference ?? '—'}
                    </span>
                  </span>
                ),
                onClick: () => navigate(`/broker/policies/${focusedPolicy.policy_id}?view=fintastic`),
              },
              {
                id: 'docs',
                title: 'Documents',
                body: '+ Add photos or PDFs',
                onClick: () => setUploadDrawerOpen(true),
              },
              {
                id: 'next',
                title: focusedRenewal ? 'Renewal' : 'Items / requests',
                body: focusedRenewal
                  ? `Excess ${zar(focusedRenewal.expiringExcess)} → ${zar(focusedRenewal.proposedExcess)}`
                  : focusedPolicy.item_summary ?? 'Open tasks or start a change',
                onClick: () => {
                  if (focusedRenewal) navigate(renewalQueueHref(focusedRenewal.id))
                  else setTasksOpen(true)
                },
              },
            ]}
            invoicePreview={
              drawerOpen ? undefined : (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-navy-900">{focusedPolicy.customer_name}</p>
                  <p className="tabular-nums text-navy-700">{focusedPolicy.policy_number ?? focusedPolicy.reference}</p>
                  <p className="text-navy-600">{focusedPolicy.insurer_name}</p>
                  <p className="text-navy-600">{focusedPolicy.item_summary ?? 'No items'}</p>
                  <Button size="sm" variant="outline" className="w-full" type="button" onClick={() => setDrawerOpen(true)}>
                    Open drawer
                  </Button>
                </div>
              )
            }
          />
        </div>
      )}

      {compactStar && focusedPolicy && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200/80 bg-brand-50/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-navy-900">
              {focusedPolicy.customer_name} · {focusedPolicy.policy_number ?? focusedPolicy.reference}
            </p>
            <p className="text-xs text-navy-600">
              {focusedPolicy.insurer_name} · {focusedPolicy.item_summary ?? 'No items'}
            </p>
          </div>
          <Button size="sm" variant="accent" type="button" onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      )}

      {queue === 'policies' && checked.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2">
          <p className="text-xs font-semibold text-navy-800">{checked.size} selected</p>
          {checkedPolicy && (
            <>
              <Button
                size="sm"
                variant="accent"
                type="button"
                onClick={() => {
                  setFocusedId(checkedPolicy.policy_id)
                  setTasksOpen(true)
                }}
              >
                <ListTodo /> Open tasks
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={`/broker/policies/requests/new?personId=${checkedPolicy.person_id}&policyId=${checkedPolicy.policy_id}`}
                >
                  Start change
                </Link>
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" type="button" onClick={() => setChecked(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {(checkedPolicy || focusedPolicy) && (
        <PolicyTasksSlideout
          open={tasksOpen}
          onClose={() => setTasksOpen(false)}
          personId={(checkedPolicy ?? focusedPolicy)!.person_id}
          policyId={(checkedPolicy ?? focusedPolicy)!.policy_id}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-navy-100/70 p-0.5">
          {(
            [
              ['policies', 'Policies'],
              ['requests', 'Service requests'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${queue === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600'}`}
              onClick={() => setQueue(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
          <input
            className="w-full rounded-lg border border-navy-800/15 bg-white py-2 pr-3 pl-8 text-sm"
            placeholder="Search client, policy, item…"
            value={q}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('q', e.target.value)
              else next.delete('q')
              setParams(next)
            }}
          />
        </label>
        {queue === 'requests' && (
          <select
            className="rounded-lg border border-navy-800/15 bg-white px-2 py-2 text-sm"
            value={status}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('status', e.target.value)
              else next.delete('status')
              setParams(next)
            }}
          >
            <option value="">All statuses</option>
            <option value="requested">Requested</option>
            <option value="in_review">In review</option>
            <option value="awaiting_customer">Awaiting customer</option>
            <option value="awaiting_confirmation">Awaiting confirmation</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        )}
      </div>

      {queue === 'requests' ? (
        requests.isLoading ? (
          <LoadingState label="Loading requests…" />
        ) : requests.error ? (
          <ErrorState message={requests.error.message} />
        ) : (
          <RequestTable rows={requests.data?.rows ?? []} onGoPolicies={() => setQueue('policies')} />
        )
      ) : covers.isLoading ? (
        <LoadingState label="Loading policies…" />
      ) : covers.error ? (
        <ErrorState message={covers.error.message} />
      ) : isFintastic ? (
        <section className="rounded-2xl border border-navy-800/10 bg-white shadow-sm">
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-navy-800/10 bg-white px-3 py-2">
            <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Policy queue</p>
            <span className="text-xs text-navy-600">
              {filteredRows.length} of {policyRows.length} policies
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              type="button"
              onClick={() => {
                if (bodyRef.current) scrollPos.current = bodyRef.current.scrollTop
                setGridExpanded((v) => !v)
              }}
            >
              {gridExpanded ? (
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
          <div
            ref={bodyRef}
            className={cn('overflow-auto', gridExpanded && 'max-h-[min(70vh,36rem)]')}
            style={!gridExpanded && bodyHeight != null ? { maxHeight: bodyHeight + HEADER_PX } : undefined}
            onScroll={(e) => {
              scrollPos.current = e.currentTarget.scrollTop
            }}
          >
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-mist text-[10px] font-bold tracking-wide text-navy-500 uppercase">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <span className="sr-only">Select for bulk</span>
                  </th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Policy</th>
                  <th className="px-3 py-2">Insurer</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {policyRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-navy-600">
                      No policies yet. Switch to Demo for sample clients, or file cover from an accepted quote.
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-navy-600">
                      <p>No policies match these filters.</p>
                      <button
                        type="button"
                        className="mt-2 cursor-pointer text-sm font-semibold text-brand-700 underline"
                        onClick={() => {
                          const next = new URLSearchParams(params)
                          next.delete('q')
                          setParams(next)
                        }}
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const focused = r.policy_id === (focusedPolicy?.policy_id ?? null)
                    return (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        aria-selected={focused}
                        className={cn(
                          'cursor-pointer border-t border-navy-800/5 outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset',
                          focused ? 'bg-brand-50/70' : 'hover:bg-mist/80',
                        )}
                        style={{ height: ROW_PX }}
                        onClick={() => setFocus(r.policy_id)}
                        onKeyDown={(e: KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setFocus(r.policy_id)
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setFocus(r.policy_id)
                          setActionMenu({ x: e.clientX, y: e.clientY, items: menuFor(r) })
                        }}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.customer_name}`}
                            checked={checked.has(r.policy_id)}
                            onChange={() => toggleCheck(r.policy_id)}
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-navy-900">{r.customer_name}</td>
                        <td className="px-3 py-2 font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="cursor-pointer text-brand-700 hover:underline"
                            onClick={() => {
                              setFocus(r.policy_id)
                              setDrawerOpen(true)
                            }}
                          >
                            {r.policy_number ?? r.reference ?? '—'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-navy-700">{r.insurer_name ?? '—'}</td>
                        <td className="truncate px-3 py-2 text-navy-700">{r.item_summary ?? 'No items yet'}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <RowActionsButton items={menuFor(r)} onOpen={setActionMenu} />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <PolicyTableClassic
          rows={filteredRows}
          selected={[...checked]}
          onToggle={toggleCheck}
        />
      )}

      <RightSlideout
        open={drawerOpen && Boolean(focusedPolicy)}
        onClose={() => setDrawerOpen(false)}
        title={focusedPolicy ? focusedPolicy.customer_name : 'Policy'}
        subtitle={focusedPolicy?.policy_number ?? focusedPolicy?.reference ?? undefined}
        size="record"
        footer={
          focusedPolicy ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="accent" asChild>
                <Link to={`/broker/policies/${focusedPolicy.policy_id}?view=fintastic`}>Open full policy</Link>
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={() => setUploadDrawerOpen(true)}>
                <Upload /> Upload files
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={`/broker/policies/requests/new?personId=${focusedPolicy.person_id}&policyId=${focusedPolicy.policy_id}`}
                >
                  Request change
                </Link>
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={() => setDrawerOpen(false)}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        {focusedPolicy && (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm">
              <div className="rounded-xl border border-navy-800/10 bg-white p-3">
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Status</dt>
                <dd className="mt-1">
                  <StatusBadge status={focusedPolicy.status} />
                </dd>
              </div>
              <div className="rounded-xl border border-navy-800/10 bg-white p-3">
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Insurer</dt>
                <dd className="mt-1 text-navy-900">{focusedPolicy.insurer_name ?? '—'}</dd>
              </div>
              <div className="rounded-xl border border-navy-800/10 bg-white p-3">
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Items</dt>
                <dd className="mt-1 text-navy-900">{focusedPolicy.item_summary ?? 'No items yet'}</dd>
              </div>
              <div className="rounded-xl border border-navy-800/10 bg-white p-3">
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Client</dt>
                <dd className="mt-1">
                  <Link
                    className="font-semibold text-brand-700 hover:underline"
                    to={`/broker/customers/people/${focusedPolicy.person_id}?rtab=policies`}
                  >
                    {focusedPolicy.customer_name}
                  </Link>
                  <span className="mt-0.5 block font-mono text-[10px] text-navy-500">{focusedPolicy.client_number}</span>
                </dd>
              </div>
            </dl>
            <MediaAttachPanel
              tenantId={tenantId}
              purpose="policy_document"
              ownerTable="policy_covers"
              ownerId={focusedPolicy.policy_id}
              label={`Documents · ${focusedPolicy.customer_name}`}
              hint="Photos, PDFs or Word docs attach to this policy."
            />
            {focusedRenewal && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Renewal pending</p>
                <p className="mt-1">
                  Excess {zar(focusedRenewal.expiringExcess)} → {zar(focusedRenewal.proposedExcess)}
                </p>
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <Link to={renewalQueueHref(focusedRenewal.id)}>Open full queue</Link>
                </Button>
              </div>
            )}
            <p className="text-xs text-navy-500">
              Deeper schedule, rates and claims stay on the full policy page. This drawer keeps the queue in place.
            </p>
          </div>
        )}
      </RightSlideout>

      <RightSlideout
        open={uploadDrawerOpen && Boolean(focusedPolicy)}
        onClose={() => setUploadDrawerOpen(false)}
        title={focusedPolicy ? `Add document · ${focusedPolicy.customer_name}` : 'Upload files'}
        subtitle={focusedPolicy?.policy_number ?? focusedPolicy?.reference ?? undefined}
        footer={
          <Button size="sm" variant="outline" type="button" onClick={() => setUploadDrawerOpen(false)}>
            Done
          </Button>
        }
      >
        {focusedPolicy && (
          <MediaAttachPanel
            tenantId={tenantId}
            purpose="policy_document"
            ownerTable="policy_covers"
            ownerId={focusedPolicy.policy_id}
            label="Upload files"
            hint="Select one or more images, PDFs or documents. They stay linked to this policy."
          />
        )}
      </RightSlideout>

      <ActionCard state={actionMenu} onClose={() => setActionMenu(null)} />
    </Page>
  )
}

function RequestTable({
  rows,
  onGoPolicies,
}: {
  rows: Array<{
    id: string
    reference: string
    client_number: string
    customer_name: string
    person_id: string
    policy_id: string
    insurer_name: string | null
    item_label: string | null
    request_type: string
    status: string
    owner_name: string | null
    next_action: string | null
    due_at: string | null
  }>
  onGoPolicies: () => void
}) {
  if (rows.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-3 border-dashed p-10 text-center">
        <FileStack className="h-8 w-8 text-navy-300" />
        <p className="text-sm text-navy-600">
          No open service requests. Requests are always created against a customer policy — open Policies, select a client policy, then start a change.
        </p>
        <Button size="sm" variant="accent" type="button" onClick={onGoPolicies}>
          Go to Policies
        </Button>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Policy</th>
            <th className="px-3 py-2">Insurer</th>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Next action</th>
            <th className="px-3 py-2">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-navy-800/10 hover:bg-sky-50/40">
              <td className="px-3 py-2 font-mono text-xs">
                <Link className="text-brand-700 hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=policies`}>
                  {r.client_number}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Link className="font-medium text-navy-900 hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=policies`}>
                  {r.customer_name}
                </Link>
                <div className="font-mono text-[10px] text-navy-500">
                  <Link className="text-brand-700 hover:underline" to={`/broker/policies/requests/${r.id}`}>
                    {r.reference}
                  </Link>
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <Link className="text-brand-700 hover:underline" to={`/broker/policies/${r.policy_id}`}>
                  Open policy
                </Link>
              </td>
              <td className="px-3 py-2 text-navy-700">{r.insurer_name ?? '—'}</td>
              <td className="px-3 py-2 text-navy-700">{r.item_label ?? '—'}</td>
              <td className="px-3 py-2 capitalize">{r.request_type.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">{r.owner_name ?? '—'}</td>
              <td className="px-3 py-2 text-navy-700">{r.next_action ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-navy-600">{r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PolicyTableClassic({
  rows,
  selected,
  onToggle,
}: {
  rows: PolicyCoverRow[]
  selected: string[]
  onToggle: (policyId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="panel border-dashed p-8 text-center text-sm text-navy-600">
        No short-term policies in this category yet. Switch to Demo for sample clients, or file cover from an accepted quote on the client record.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-3 py-2">Select</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Policy</th>
            <th className="px-3 py-2">Insurer</th>
            <th className="px-3 py-2">Items</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-navy-800/10 hover:bg-sky-50/40">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${r.policy_number ?? r.reference ?? 'policy'}`}
                  checked={selected.includes(r.policy_id)}
                  onChange={() => onToggle(r.policy_id)}
                />
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <Link className="text-brand-700 hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=policies`}>
                  {r.client_number}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Link className="font-medium hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=policies`}>
                  {r.customer_name}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <Link className="text-brand-700 hover:underline" to={`/broker/policies/${r.policy_id}`}>
                  {r.policy_number ?? r.reference ?? '—'}
                </Link>
              </td>
              <td className="px-3 py-2">{r.insurer_name ?? '—'}</td>
              <td className="px-3 py-2 text-navy-700">{r.item_summary ?? 'No items yet'}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/broker/policies/requests/new?personId=${r.person_id}&policyId=${r.policy_id}`}>
                      Change
                    </Link>
                  </Button>
                  <RouteStartButtons
                    personId={r.person_id}
                    policyId={r.policy_id}
                    actions={[
                      { definition_id: 'policy_change', label: 'Route' },
                      { definition_id: 'policy_renew', label: 'Renew' },
                      { definition_id: 'claim_register', label: 'Claim' },
                    ]}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
