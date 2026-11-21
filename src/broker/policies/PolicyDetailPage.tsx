import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Building2, Car, FileWarning, Home, ListTodo, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page, zar } from '../shared/ui'
import { newKey, usePolicyClaimsMutation, usePolicyDetail, policyClaimsApi } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { RouteStartButtons } from '../routes/RouteActionsMenu'
import { PolicyTasksSlideout } from './PolicyTasksSlideout'
import { DemoSampleBadge } from '../quotes/shared'
import { useDataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { ReportClaimSlideout } from '@/pages/my/ReportClaimSlideout'
import { SelectedItemHubView, ViewModeToggle, useLayoutView } from '@/fintastic-ux'
import { useSalesProfile } from '@/copilot/salesApi'
import { MediaAttachPanel } from '@/components/MediaAttachPanel'

type Tab = 'overview' | 'schedule' | 'rates' | 'transactions' | 'claims'

function formatCoverDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const isDateOnly = /T00:00:00/.test(iso) || (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0)
  return isDateOnly ? d.toLocaleDateString() : d.toLocaleString()
}

function itemIcon(type: string) {
  if (type === 'building') return Building2
  if (type === 'contents') return Home
  return Car
}

function ScheduleFields({ details, itemType }: { details: Record<string, unknown>; itemType: string }) {
  const rows: Array<[string, string]> = []
  if (itemType === 'vehicle') {
    if (details.registration) rows.push(['Registration', String(details.registration)])
    if (details.use) rows.push(['Use', String(details.use)])
    if (details.valuation_basis) rows.push(['Valuation', String(details.valuation_basis)])
    if (details.make || details.model) rows.push(['Vehicle', [details.make, details.model, details.year].filter(Boolean).join(' ')])
  } else if (itemType === 'building') {
    if (details.risk_address) rows.push(['Risk address', String(details.risk_address)])
    if (details.building_sum_insured != null) rows.push(['Building SI', zar(Number(details.building_sum_insured))])
    if (details.construction) rows.push(['Construction', String(details.construction)])
  } else if (itemType === 'contents') {
    if (details.location) rows.push(['Location', String(details.location)])
    if (details.contents_limit != null) rows.push(['Contents limit', zar(Number(details.contents_limit))])
    if (details.specified_valuables) rows.push(['Specified valuables', String(details.specified_valuables)])
  }
  if (!rows.length) return <p className="text-xs text-navy-500">No type-specific fields recorded yet.</p>
  return (
    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="font-semibold text-navy-500 uppercase tracking-wide text-[10px]">{k}</dt>
          <dd className="text-navy-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function PolicyDetailPage() {
  const { policyId } = useParams<{ policyId: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const category = useDataCategory()
  const profile = useSalesProfile()
  const tenantId = profile.data?.brokerage?.id ?? null
  const { view: layoutView, setView: setLayoutView, isFintastic } = useLayoutView('fintastic')
  const { data, isLoading, error, refetch } = usePolicyDetail(policyId)
  const addItem = usePolicyClaimsMutation(policyClaimsApi.addPolicyItem)
  const [itemLabel, setItemLabel] = useState('')
  const [itemType, setItemType] = useState('vehicle')
  const [showAdd, setShowAdd] = useState(params.get('task') === 'add_item')
  const [tasksOpen, setTasksOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const initialTab = (params.get('tab') as Tab | null)
  const [tab, setTab] = useState<Tab>(
    initialTab && ['overview', 'schedule', 'rates', 'transactions', 'claims'].includes(initialTab) ? initialTab : 'overview',
  )

  const tabs = useMemo(
    () =>
      [
        ['overview', 'Overview'],
        ['schedule', 'Schedule'],
        ['rates', 'Rates'],
        ['transactions', 'Transactions'],
        ['claims', 'Claims'],
      ] as const,
    [],
  )

  if (isLoading) return <div className="p-6"><LoadingState label="Loading policy…" /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Policy not found'} /></div>

  const current = data.current_version
  const items = data.items ?? []
  const premium = current?.terms?.premium ?? data.premium_amount ?? null
  const excess = current?.terms?.excess ?? null
  const rates = data.premium_rates ?? []
  const txns = data.transactions ?? []

  const onAddItem = async () => {
    const label = itemLabel.trim()
    if (!label || !policyId) return
    await addItem.mutateAsync({
      policy_id: policyId,
      item_label: label,
      item_type: itemType,
      key: newKey(),
    })
    setItemLabel('')
    setShowAdd(false)
    void refetch()
  }

  return (
    <Page>
      <PageHeader
        title={data.policy_number ?? data.reference ?? 'Policy'}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {data.customer_name} · {data.client_number} · {data.insurer_name ?? 'Insurer TBD'}
            {category === 'sample' && <DemoSampleBadge />}
            {data.schedule_required && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
                Schedule required
              </span>
            )}
          </span>
        }
        actions={
          <>
            <ViewModeToggle view={layoutView} onChange={setLayoutView} />
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${data.person_id}?rtab=policies`}>
                <ArrowLeft /> Client record
              </Link>
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => setTasksOpen(true)}>
              <ListTodo /> Tasks
            </Button>
            <RouteStartButtons
              personId={data.person_id}
              policyId={data.policy_id}
              actions={[
                { definition_id: 'policy_change', label: 'Change' },
                { definition_id: 'claim_register', label: 'Claim' },
              ]}
            />
            <Button size="sm" variant="outline" type="button" onClick={() => setReportOpen(true)}>
              <FileWarning /> Report an incident
            </Button>
            <Button size="sm" variant="accent" asChild>
              <Link to={`/broker/policies/requests/new?policyId=${data.policy_id}&personId=${data.person_id}`}>
                <Plus /> Request a change
              </Link>
            </Button>
          </>
        }
      />

      <PolicyTasksSlideout
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        personId={data.person_id}
        policyId={data.policy_id}
      />
      <ReportClaimSlideout
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        mode="broker"
        target={{
          personId: data.person_id,
          policyId: data.policy_id,
          itemLabel: data.policy_number ?? data.reference,
        }}
        onDone={(res) => {
          void refetch()
          if (res.claim_id) {
            window.location.assign(`/broker/claims/${res.claim_id}?view=fintastic`)
          }
        }}
      />

      <div role="tablist" className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-navy-100/70 p-0.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn(
              'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold',
              tab === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600',
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && isFintastic && (
        <div className="mb-4 space-y-4">
          <SelectedItemHubView
            title={data.policy_number ?? data.reference ?? 'Policy'}
            statusLabel={data.status.replace(/_/g, ' ')}
            statusTone={data.schedule_required ? 'attention' : data.status === 'active' || data.status === 'in_force' ? 'ok' : 'pending'}
            primaryActionLabel={data.schedule_required ? 'Add schedule item' : 'Request a change'}
            onPrimaryAction={() => {
              if (data.schedule_required) {
                setTab('schedule')
                setShowAdd(true)
              } else {
                navigate(`/broker/policies/requests/new?policyId=${data.policy_id}&personId=${data.person_id}`)
              }
            }}
            copilotMessage={
              data.next_action ??
              (data.schedule_required
                ? 'Schedule items are still required before this cover is complete.'
                : `Policyholder ${data.customer_name}. Open requests stay on the client record.`)
            }
            spokes={[
              {
                id: 'schedule',
                title: 'Schedule items',
                body: `${items.length} item${items.length === 1 ? '' : 's'}`,
                onClick: () => setTab('schedule'),
              },
              {
                id: 'docs',
                title: 'Documents',
                body: '+ Add photos or PDFs',
                onClick: () => {
                  document.getElementById('policy-media-attach')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                },
              },
              {
                id: 'premium',
                title: 'Premium / excess',
                body: (
                  <span className="tabular-nums">
                    {premium != null ? `${zar(Number(premium))}/mo` : '—'} · Excess {excess != null ? zar(Number(excess)) : '—'}
                  </span>
                ),
                onClick: () => setTab('rates'),
              },
              {
                id: 'claims',
                title: 'Claims',
                body: 'View claims on this policy',
                onClick: () => setTab('claims'),
              },
            ]}
          />
          <div id="policy-media-attach" className="scroll-mt-4">
            <MediaAttachPanel
              tenantId={tenantId}
              purpose="policy_document"
              ownerTable="policy_covers"
              ownerId={data.policy_id}
              label={`Documents · ${data.customer_name}`}
              hint="Upload one or more images, PDFs or Word docs against this policy."
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel space-y-2 p-4">
              <h2 className="text-sm font-semibold text-navy-900">Facts</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Fact label="Client number" value={data.client_number} />
                <Fact label="Policyholder" value={data.customer_name} />
                <Fact label="Insurer" value={data.insurer_name ?? '—'} />
                <Fact label="Cover type" value={data.cover_type ?? '—'} />
                <Fact label="Inception" value={data.inception_date ? formatCoverDate(data.inception_date) : '—'} />
                <Fact label="Current effective" value={formatCoverDate(current?.effective_at)} />
              </dl>
            </section>
            <section className="panel space-y-2 p-4">
              <h2 className="text-sm font-semibold text-navy-900">Policy history</h2>
              <ul className="space-y-2 text-xs text-navy-700">
                {(data.versions ?? []).map((v) => (
                  <li key={v.id} className="rounded-lg border border-navy-800/10 px-2 py-1.5">
                    <span className="font-semibold">v{v.version_no}</span> · from {formatCoverDate(v.effective_at)}
                    {v.superseded_at ? ` · exclusive to ${formatCoverDate(v.superseded_at)}` : ' · current'}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {tab === 'overview' && !isFintastic && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel space-y-3 p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold text-navy-900">Policy overview</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Fact label="Client number" value={data.client_number} />
              <Fact label="Policyholder" value={data.customer_name} />
              <Fact label="Insurer" value={data.insurer_name ?? '—'} />
              <Fact label="Policy number" value={data.policy_number ?? '—'} />
              <Fact label="Status" value={<StatusBadge status={data.status} />} />
              <Fact label="Cover type" value={data.cover_type ?? '—'} />
              <Fact label="Inception" value={data.inception_date ? formatCoverDate(data.inception_date) : '—'} />
              <Fact label="Current effective" value={formatCoverDate(current?.effective_at)} />
              <Fact label="Premium" value={premium != null ? `${zar(Number(premium))}/mo` : '—'} />
              <Fact label="Excess" value={excess != null ? zar(Number(excess)) : '—'} />
              <Fact label="Next action" value={data.next_action ?? (data.schedule_required ? 'Schedule required' : '—')} />
            </dl>
            <p className="text-xs text-navy-600">
              Approval and insurer confirmation stay distinct on service requests — cover shows as in force only after confirmed effective date.
            </p>
          </section>
          <aside className="space-y-4">
            <section className="panel space-y-2 p-4">
              <h2 className="text-sm font-semibold text-navy-900">Open requests</h2>
              {(data.open_requests ?? []).length === 0 ? (
                <p className="text-xs text-navy-500">None</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.open_requests.map((r) => (
                    <li key={r.id}>
                      <Link className="font-medium text-brand-700 hover:underline" to={`/broker/policies/requests/${r.id}`}>
                        {r.reference}
                      </Link>
                      <span className="ml-2 text-xs text-navy-600">{r.status.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel space-y-2 p-4">
              <h2 className="text-sm font-semibold text-navy-900">Policy history</h2>
              <ul className="space-y-2 text-xs text-navy-700">
                {(data.versions ?? []).map((v) => (
                  <li key={v.id} className="rounded-lg border border-navy-800/10 px-2 py-1.5">
                    <span className="font-semibold">v{v.version_no}</span> · from {formatCoverDate(v.effective_at)}
                    {v.superseded_at ? ` · exclusive to ${formatCoverDate(v.superseded_at)}` : ' · current'}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}

      {tab === 'schedule' && (
        <section className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-navy-900">Items & cover</h2>
            <Button size="sm" variant="outline" type="button" onClick={() => setShowAdd((v) => !v)}>
              <Plus /> Add item
            </Button>
          </div>
          {showAdd && (
            <div className="grid gap-2 rounded-lg border border-navy-800/15 bg-navy-50/40 p-3 sm:grid-cols-[1fr_140px_auto]">
              <input
                className="rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                placeholder="e.g. 2019 Toyota Corolla CA 123-456"
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
              <select
                className="rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
              >
                <option value="vehicle">Vehicle</option>
                <option value="building">Building</option>
                <option value="contents">Contents</option>
              </select>
              <Button size="sm" variant="accent" disabled={!itemLabel.trim() || addItem.isPending} onClick={() => void onAddItem()}>
                Save item
              </Button>
            </div>
          )}
          <ul className="space-y-2">
            {items.map((item) => {
              const Icon = itemIcon(item.item_type)
              const terms = item.item_terms ?? {}
              return (
                <li key={item.id} className="rounded-lg border border-navy-800/10 px-3 py-2">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 text-navy-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-900">{item.display_label}</p>
                      <p className="text-xs text-navy-600 capitalize">
                        {item.item_type} · {item.status.replace(/_/g, ' ')}
                        {terms.excess != null ? ` · excess ${zar(Number(terms.excess))}` : ''}
                      </p>
                      <ScheduleFields details={item.details ?? {}} itemType={item.item_type} />
                    </div>
                    {item.item_type === 'vehicle' && item.status === 'covered' && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/broker/policies/requests/new?policyId=${data.policy_id}&personId=${data.person_id}&itemId=${item.id}&type=vehicle_replacement`}>
                          Replace vehicle
                        </Link>
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
            {items.length === 0 && (
              <div className="rounded-lg border border-dashed border-navy-800/20 px-3 py-4 text-sm text-navy-600">
                <p>No insured items on the current version yet.</p>
                <p className="mt-1 text-xs text-navy-500">Schedule required — add the vehicle or property so claims know what is covered.</p>
              </div>
            )}
          </ul>
        </section>
      )}

      {tab === 'rates' && (
        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold text-navy-900">Premium history</h2>
          {rates.length === 0 ? (
            <p className="text-sm text-navy-600">Breakdown unavailable</p>
          ) : (
            <ul className="space-y-2">
              {rates.map((r) => (
                <li key={r.id} className="rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-navy-900">{zar(Number(r.amount))} / {r.frequency}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-navy-600">
                    {r.effective_from}
                    {r.effective_to ? ` → ${r.effective_to}` : ' → current'} · {r.source}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </p>
                  <p className="text-xs text-navy-500">
                    {r.included_in_policy
                      ? 'Included in policy premium'
                      : r.breakdown_available
                        ? 'Section/item breakdown available'
                        : 'Breakdown unavailable'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'transactions' && (
        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold text-navy-900">Policy transactions</h2>
          {txns.length === 0 ? (
            <p className="text-sm text-navy-600">No collection entries yet — amount due shows only after a due entry exists.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Recon</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-t border-navy-800/10">
                      <td className="px-3 py-2">{t.txn_date}</td>
                      <td className="px-3 py-2 capitalize">{t.txn_type}</td>
                      <td className="px-3 py-2">{zar(Number(t.amount), true)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{t.reference ?? '—'}</td>
                      <td className="px-3 py-2">{t.source}</td>
                      <td className="px-3 py-2">{t.reconciliation_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'claims' && (
        <section className="panel space-y-2 p-4">
          <h2 className="text-sm font-semibold text-navy-900">Related claims</h2>
          {(data.related_claims ?? []).length === 0 ? (
            <p className="text-xs text-navy-500">None</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.related_claims.map((c) => (
                <li key={c.id} className="flex justify-between gap-2 rounded-lg border border-navy-800/10 px-3 py-2">
                  <Link className="font-medium text-brand-700 hover:underline" to={`/broker/claims/${c.id}`}>
                    {c.reference}
                  </Link>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Page>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-navy-900">{value}</dd>
    </div>
  )
}
