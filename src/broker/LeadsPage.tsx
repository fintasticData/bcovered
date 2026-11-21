import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Building2, Car, ChevronRight, ClipboardCopy, ExternalLink, Mail, Phone, Plus, X } from 'lucide-react'
import { useBulkLeads, useCloseLead, useLead, useLeads } from '@/api/hooks'
import { humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useTeam } from '@/copilot/salesApi'
import { products } from '@/data/products'
import { useLeadRun, useLeadRuns, runTitle } from '@/lib/leadResearch/api'
import { useDataCategory } from '@/lib/supabase/category'
import { formatDateTime } from '@/lib/utils'
import type { LeadRow } from '@/server/api'
import type { LeadStatus, ProspectStatus } from '@/server/db/schema'
import { LEAD_PIPELINE_STAGES } from '@/server/db/schema'
import { categoriesFor, PRODUCT_KEYS } from '@/server/shortTermApi'
import { CategoryBadge } from './copilot/identity'
import { LeadProgressBar } from './leads/LeadProgressBar'
import { buildLeadContextMenu, isLeadOverdue } from './leads/leadContextMenu'
import { AreaFindings, SampleDataBadge } from './leads/LeadRunViews'
import { DemoAdvanceBar } from './leads/DemoAdvanceBar'
import { LeadRecordPanel } from './leads/LeadRecordPanel'
import { NewLeadModal } from './leads/NewLeadModal'
import { DemoSampleBadge } from './quotes/shared'
import { DataGrid, type CsvColumn } from './shared/DataGrid'
import { RightSlideout } from './shared/RightSlideout'
import { RowActionsButton, RowContextMenu, type ContextMenuState } from './shared/RowContextMenu'
import { EmptyState, ErrorState, LoadingState, PageHeader } from './PageHeader'

const VIEWS = [
  { id: 'open', label: 'Open', match: (s: string) => !['live', 'closed'].includes(s) },
  { id: 'live', label: 'Live', match: (s: string) => s === 'live' },
  { id: 'closed', label: 'Closed', match: (s: string) => s === 'closed' },
  { id: 'all', label: 'All', match: () => true },
]

const STATUSES: LeadStatus[] = [...LEAD_PIPELINE_STAGES, 'closed']
const TYPE_FILTERS = [
  { id: 'all', label: 'All types' },
  { id: 'people', label: 'People' },
  { id: 'businesses', label: 'Businesses' },
] as const

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  if (!options.length) return null
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="field max-w-[11rem] py-1.5 text-xs">
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {humanise(o)}
        </option>
      ))}
    </select>
  )
}

function RunHeader({ runId, onClear }: { runId: string; onClear: () => void }) {
  const { data: run, isLoading, error } = useLeadRun(runId)
  return (
    <section className="panel mb-4 space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-business-700 uppercase">
            <Building2 className="h-3.5 w-3.5" aria-hidden /> Russ lead search
          </p>
          <h2 className="text-base font-semibold text-navy-900">{run ? runTitle(run.inputs.filters) : isLoading ? 'Loading the search…' : 'Lead search'}</h2>
          {run && (
            <p className="text-sm text-navy-700">
              {run.outputs.summary ?? `${run.outputs.progress.found} of ${run.outputs.progress.requested} found with published emails so far.`}
              {run.inputs.filters.cover_type ? ` Cover: ${run.inputs.filters.cover_type}.` : ''}
            </p>
          )}
          {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/jobs/${runId}`}>Open job</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X /> Show all leads
          </Button>
        </div>
      </div>
      {run && <AreaFindings findings={run.outputs.area_findings ?? []} summary={run.outputs.area_summary} defaultOpen={false} />}
    </section>
  )
}

function FollowUpForm({ onSubmit, busy }: { onSubmit: (title: string, due: string | null) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('Call to introduce cover')
  const [due, setDue] = useState('')
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Set follow-up
      </Button>
    )
  }
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        onSubmit(title.trim(), due ? new Date(`${due}T09:00:00`).toISOString() : null)
        setOpen(false)
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="field py-1 text-xs" aria-label="Follow-up title" />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field py-1 text-xs" aria-label="Due date" />
      <Button size="sm" type="submit" disabled={busy || !title.trim()}>
        Create
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  )
}

export default function LeadsPage() {
  const { leadId } = useParams()
  const { data: leads, isLoading, error } = useLeads()
  const slideLead = useLead(leadId)
  const category = useDataCategory()
  const runs = useLeadRuns()
  const team = useTeam()
  const bulk = useBulkLeads()
  const closeLead = useCloseLead()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [notice, setNotice] = useState<string | null>(null)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<ContextMenuState>(null)

  const openLead = useCallback(
    (id: string) => {
      sessionStorage.setItem('bcovered:leads-scroll', String(window.scrollY))
      navigate({ pathname: `/broker/leads/${id}`, search: params.toString() })
    },
    [navigate, params],
  )

  const closeSlideout = useCallback(() => {
    navigate({ pathname: '/broker/leads', search: params.toString() })
  }, [navigate, params])

  const runOne = useCallback(
    (body: Parameters<typeof bulk.mutate>[0], label: string) => {
      bulk.mutate(body, {
        onSuccess: (r) => setNotice(`${label}: ${r.updated} updated${r.skipped ? `, ${r.skipped} unchanged` : ''}.`),
        onError: (e) => setNotice((e as Error).message),
      })
    },
    [bulk],
  )

  const menuActions = useMemo(
    () => ({
      open: (lead: LeadRow) => openLead(lead.id),
      openCustomerArea: (lead: LeadRow) => navigate(lead.customer_area_path || '/broker/customers'),
      setStatus: (lead: LeadRow, status: LeadStatus) =>
        runOne({ lead_ids: [lead.id], action: 'status', status }, `Status set to ${humanise(status)}`),
      setFollowUp: (lead: LeadRow) => {
        const title = window.prompt('Follow-up', lead.next_action?.trim() || 'Call to introduce cover')
        if (!title?.trim()) return
        const due = window.prompt('Due date (YYYY-MM-DD), optional', lead.next_action_due_at?.slice(0, 10) ?? '')
        runOne({ lead_ids: [lead.id], action: 'follow_up', title: title.trim(), due_date: due?.trim() || null }, 'Follow-up set')
      },
      assignOwner: (lead: LeadRow) => {
        const members = team.data ?? []
        if (!members.length) {
          setNotice('No team members to assign.')
          return
        }
        const list = members.map((m, i) => `${i + 1}. ${m.name}`).join('\n')
        const pick = window.prompt(`Assign owner — enter number (or 0 for nobody):\n${list}`, '1')
        if (pick == null) return
        const n = Number(pick)
        if (n === 0) {
          runOne({ lead_ids: [lead.id], action: 'assign', member_id: null }, 'Unassigned')
          return
        }
        const member = members[n - 1]
        if (!member) {
          setNotice('Invalid owner choice.')
          return
        }
        runOne({ lead_ids: [lead.id], action: 'assign', member_id: member.member_id }, `Assigned to ${member.name}`)
      },
      close: (lead: LeadRow) => {
        const reason = window.prompt('Close reason', lead.closed_reason?.trim() || 'Declined')
        if (!reason?.trim()) return
        const stage = LEAD_PIPELINE_STAGES.includes(lead.status as (typeof LEAD_PIPELINE_STAGES)[number])
          ? (lead.status as (typeof LEAD_PIPELINE_STAGES)[number])
          : 'lead'
        closeLead.mutate(
          { lead_id: lead.id, reason: reason.trim(), closed_at_stage: stage },
          {
            onSuccess: () => setNotice('Opportunity closed.'),
            onError: (e) => setNotice((e as Error).message),
          },
        )
      },
      askRuss: (lead: LeadRow) => {
        sessionStorage.setItem('bcovered:working-on-lead', lead.id)
        navigate(`/broker/workspace?copilot=russ&leadId=${lead.id}`)
      },
    }),
    [navigate, openLead, runOne, team.data, closeLead],
  )

  const slideTitle =
    slideLead.data?.customer.full_name ??
    leads?.find((l) => l.id === leadId)?.customer_name ??
    'Lead'
  const slideSubtitle = (() => {
    const row = slideLead.data
    const fromList = leads?.find((l) => l.id === leadId)
    const kind = (row?.customer.customer_type ?? fromList?.customer_type) === 'commercial' ? 'Business' : 'Person'
    const cover = row?.lead.product_category
      ? humanise(row.lead.product_category)
      : fromList?.product_category
        ? humanise(fromList.product_category)
        : null
    const status = row?.lead.status ?? fromList?.status
    return [kind, cover, status ? humanise(status) : null].filter(Boolean).join(' · ')
  })()
  const slideDemo =
    slideLead.data?.prospect?.is_sample ||
    leads?.find((l) => l.id === leadId)?.prospect?.is_sample ||
    category === 'sample'

  const leadMenu = useCallback((lead: LeadRow) => buildLeadContextMenu(lead, menuActions), [menuActions])

  useEffect(() => {
    const key = 'bcovered:leads-scroll'
    const saved = sessionStorage.getItem(key)
    if (saved) {
      const y = Number(saved)
      if (Number.isFinite(y)) window.requestAnimationFrame(() => window.scrollTo(0, y))
      sessionStorage.removeItem(key)
    }
    const onLeave = () => sessionStorage.setItem(key, String(window.scrollY))
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  const view = VIEWS.find((v) => v.id === params.get('view')) ?? VIEWS[0]
  const typeFilter = TYPE_FILTERS.find((t) => t.id === params.get('type')) ?? TYPE_FILTERS[0]
  const product = PRODUCT_KEYS.find((k) => k === params.get('product')) ?? null
  const market = params.get('market') === 'personal' || params.get('market') === 'commercial' ? params.get('market') : null
  const runId = params.get('run')
  const stageFilter = params.get('stage') ?? ''
  const f = { source: params.get('source') ?? '', cover: params.get('cover') ?? '', industry: params.get('industry') ?? '', fn: params.get('fn') ?? '', area: params.get('area') ?? '' }
  const hasEmail = params.get('email') === '1'

  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
        next.delete('page')
        return next
      },
      { replace: true },
    )

  const runNames = useMemo(() => new Map((runs.data ?? []).map((r) => [r.id, runTitle(r.filters)])), [runs.data])
  const members = useMemo(() => new Map((team.data ?? []).map((m) => [m.member_id, m.name])), [team.data])
  const all = useMemo(() => leads ?? [], [leads])
  const distinct = (pick: (l: LeadRow) => string | null | undefined) => [...new Set(all.map(pick).filter((v): v is string => Boolean(v)))].sort()

  const rows = useMemo(
    () =>
      all.filter(
        (l) =>
          (runId ? l.run_ids.includes(runId) : view.match(l.status)) &&
          (typeFilter.id === 'all' ||
            (typeFilter.id === 'people' ? l.customer_type === 'personal' : l.customer_type === 'commercial')) &&
          (!stageFilter || l.status === stageFilter) &&
          (!product || (l.product_category && categoriesFor(product).includes(l.product_category))) &&
          (!market || l.line === market) &&
          (!f.source || l.source === f.source) &&
          (!f.cover || l.product_category === f.cover) &&
          (!f.industry || l.prospect?.industry === f.industry) &&
          (!f.fn || l.prospect?.business_function === f.fn) &&
          (!f.area || l.prospect?.area === f.area) &&
          (!hasEmail || Boolean(l.prospect?.email ?? l.customer_email)),
      ),
    [all, runId, view, typeFilter, stageFilter, product, market, f.source, f.cover, f.industry, f.fn, f.area, hasEmail],
  )
  const scope = product ? (products.find((p) => p.slug === product)?.name ?? product) : market === 'personal' ? 'Personal lines' : market === 'commercial' ? 'Commercial' : null
  const anyResearch = all.some((l) => l.prospect)

  const columns = useMemo<ColumnDef<LeadRow, unknown>[]>(
    () => [
      {
        id: 'customer',
        header: 'Lead',
        accessorFn: (l) => l.customer_name,
        cell: ({ row: { original: l } }) => {
          const kind = l.customer_type === 'commercial' ? 'Business' : 'Person'
          const cover = l.product_category ? humanise(l.product_category) : null
          return (
            <div className="min-w-[12rem]">
              <span className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="cursor-pointer font-medium text-navy-900 hover:text-brand-600"
                  onClick={() => openLead(l.id)}
                >
                  {l.customer_name}
                </button>
                {l.prospect?.is_sample && <SampleDataBadge />}
                {l.prospect?.status && l.prospect.status !== 'active' && (
                  <span className="rounded bg-navy-100 px-1 text-[10px] font-semibold text-navy-700 uppercase">{humanise(l.prospect.status)}</span>
                )}
              </span>
              <p className="text-[11px] text-navy-500">
                {kind}
                {cover ? ` · ${cover}` : ''}
              </p>
              <p className="max-w-xs truncate text-[11px] text-navy-500">{l.match?.cover_fit ?? l.qualification.summary}</p>
            </div>
          )
        },
      },
      {
        id: 'email',
        header: 'Contact',
        accessorFn: (l) => l.prospect?.email ?? l.customer_email ?? l.customer_phone ?? '',
        cell: ({ row: { original: l } }) => {
          const phone = l.prospect?.phone ?? l.customer_phone
          const email = l.prospect?.email ?? l.customer_email
          if (!phone && !email) return <span className="text-xs text-navy-400">–</span>
          return (
            <div className="space-y-0.5 text-xs">
              {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-1 font-medium text-navy-900 hover:underline">
                  <Phone className="h-3 w-3" aria-hidden /> {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-1 text-navy-800 hover:underline">
                  <Mail className="h-3 w-3" aria-hidden /> {email}
                </a>
              )}
              {l.match?.evidence.email_source_url && (
                <a href={l.match.evidence.email_source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand-700 hover:underline" title="The public page that shows this email">
                  <ExternalLink className="h-3 w-3" aria-hidden /> {hostLabel(l.match.evidence.email_source_url)}
                </a>
              )}
            </div>
          )
        },
      },
      { id: 'area', header: 'Area', accessorFn: (l) => l.prospect?.area ?? '', cell: ({ getValue }) => <span className="text-xs text-navy-700">{(getValue() as string) || '–'}</span> },
      { id: 'industry', header: 'Industry', accessorFn: (l) => l.prospect?.industry ?? '', cell: ({ getValue }) => <span className="text-xs text-navy-700">{(getValue() as string) || '–'}</span> },
      { id: 'function', header: 'Function', accessorFn: (l) => l.prospect?.business_function ?? '', cell: ({ getValue }) => <span className="text-xs text-navy-700">{(getValue() as string) || '–'}</span> },
      {
        id: 'product',
        header: 'Cover',
        accessorFn: (l) => l.product_category ?? '',
        cell: ({ row: { original: l } }) =>
          l.product_category ? (
            <span className="text-navy-700">
              {humanise(l.product_category)} <span className="text-[11px] text-navy-500">· {l.line}</span>
            </span>
          ) : (
            <span className="text-xs text-navy-400">No cover yet</span>
          ),
      },
      {
        id: 'status',
        header: 'Stage',
        accessorFn: (l) => STATUSES.indexOf(l.status),
        cell: ({ row: { original: l } }) => (
          <LeadProgressBar
            status={l.status}
            closedReason={l.closed_reason}
            closedAtStage={l.closed_at_stage}
            overdue={isLeadOverdue(l)}
            compact
          />
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row: { original: l } }) => (
          <RowActionsButton items={leadMenu(l)} onOpen={setRowMenu} />
        ),
      },
      {
        id: 'assigned',
        header: 'Owner',
        accessorFn: (l) => (l.assigned_member_id ? (members.get(l.assigned_member_id) ?? '') : ''),
        cell: ({ getValue }) => <span className="text-xs text-navy-700">{(getValue() as string) || '–'}</span>,
      },
      {
        id: 'next_action',
        header: 'Next action',
        accessorFn: (l) => l.next_action ?? l.blocker ?? '',
        cell: ({ row: { original: l } }) => (
          <span className="max-w-[14rem] truncate text-xs text-navy-800" title={l.next_action ?? l.blocker ?? undefined}>
            {l.next_action?.trim() || l.blocker || '–'}
          </span>
        ),
      },
      {
        id: 'due',
        header: 'Due',
        accessorFn: (l) => l.next_action_due_at ?? '',
        cell: ({ row: { original: l } }) => (
          <span className="text-xs text-navy-700">{l.next_action_due_at ? formatDateTime(l.next_action_due_at) : '–'}</span>
        ),
      },
      {
        id: 'last_activity',
        header: 'Last activity',
        accessorFn: (l) => l.last_activity_at ?? l.updated_at,
        cell: ({ row: { original: l } }) => (
          <span className="text-xs text-navy-600">{formatDateTime(l.last_activity_at ?? l.updated_at)}</span>
        ),
      },
      {
        id: 'urgency',
        header: 'Urgency',
        accessorFn: (l) => ({ high: 3, medium: 2, low: 1 })[l.urgency ?? 'low'] ?? 0,
        cell: ({ row: { original: l } }) => <span className="text-xs text-navy-700">{l.urgency ? humanise(l.urgency) : '–'}</span>,
      },
      {
        id: 'tasks',
        header: 'Follow-ups',
        accessorFn: (l) => l.open_tasks,
        cell: ({ row: { original: l } }) => <span className="text-xs text-navy-700">{l.open_tasks || '–'}</span>,
      },
      { id: 'source', header: 'Source', accessorFn: (l) => l.source, cell: ({ row: { original: l } }) => <span className="text-xs text-navy-700">{l.source === 'russ_research' ? 'Russ research' : humanise(l.source)}</span> },
      {
        id: 'run',
        header: 'Run',
        accessorFn: (l) => (l.run_ids[0] ? (runNames.get(l.run_ids[0]) ?? '') : ''),
        cell: ({ row: { original: l } }) =>
          l.run_ids.length ? (
            <button type="button" onClick={() => setParam('run', l.run_ids[0])} className="max-w-[12rem] cursor-pointer truncate text-left text-xs text-brand-700 hover:underline" title="Show this run only">
              {runNames.get(l.run_ids[0]) ?? 'Russ lead search'}
              {l.run_ids.length > 1 ? ` +${l.run_ids.length - 1}` : ''}
            </button>
          ) : (
            <span className="text-xs text-navy-400">–</span>
          ),
      },
      {
        id: 'category',
        header: 'Data',
        accessorFn: (l) => l.data_category ?? category,
        enableSorting: false,
        cell: ({ row: { original: l } }) => <CategoryBadge category={l.data_category ?? category} />,
      },
      { id: 'created', header: 'Created', accessorFn: (l) => l.created_at, cell: ({ row: { original: l } }) => <span className="text-xs text-navy-600">{formatDateTime(l.created_at)}</span> },
    ],
    [runNames, members, category, leadMenu, openLead],
  )

  const csv: CsvColumn<LeadRow>[] = [
    { header: 'Lead', value: (l) => l.customer_name },
    { header: 'Type', value: (l) => (l.customer_type === 'commercial' ? 'Business' : 'Person') },
    { header: 'Phone', value: (l) => l.prospect?.phone ?? l.customer_phone },
    { header: 'Email', value: (l) => l.prospect?.email ?? l.customer_email },
    { header: 'Email source', value: (l) => l.match?.evidence.email_source_url },
    { header: 'Website', value: (l) => l.prospect?.website },
    { header: 'Address', value: (l) => l.prospect?.address },
    { header: 'Area', value: (l) => l.prospect?.area },
    { header: 'Industry', value: (l) => l.prospect?.industry },
    { header: 'Business function', value: (l) => l.prospect?.business_function },
    { header: 'Cover', value: (l) => l.product_category },
    { header: 'Cover fit', value: (l) => l.match?.cover_fit ?? l.qualification.summary },
    { header: 'Status', value: (l) => l.status },
    { header: 'Closed reason', value: (l) => l.closed_reason },
    { header: 'Closed at stage', value: (l) => l.closed_at_stage },
    { header: 'Source', value: (l) => l.source },
    { header: 'Retrieved', value: (l) => l.match?.retrieved_at },
    { header: 'Sample data', value: (l) => (l.prospect?.is_sample ? 'yes' : '') },
    { header: 'Created', value: (l) => l.created_at },
  ]

  const run = (body: Parameters<typeof bulk.mutate>[0], label: string, clear: () => void) =>
    bulk.mutate(body, {
      onSuccess: (r) => {
        setNotice(`${label}: ${r.updated} updated${r.skipped ? `, ${r.skipped} unchanged` : ''}.`)
        clear()
      },
      onError: (e) => setNotice((e as Error).message),
    })

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <NewLeadModal open={newLeadOpen} onClose={() => setNewLeadOpen(false)} />
      <PageHeader
        title="Leads"
        description="People and businesses captured by brokers, Ava, the web form, the Copilot and Russ. Each row is an opportunity with its own progress."
        actions={
          <>
            {!runId &&
              VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setParam('view', v.id === 'open' ? null : v.id)}
                  aria-pressed={view.id === v.id}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${view.id === v.id ? 'bg-navy-800 text-white' : 'bg-white text-navy-700 ring-1 ring-navy-800/10'}`}
                >
                  {v.label}
                </button>
              ))}
            <Button size="sm" variant="outline" asChild>
              <Link to="/broker/workspace?copilot=russ">
                <Building2 /> Find leads with Russ
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={category === 'sample' ? '/broker/quotes/sample-motor' : '/broker/routes?start=motor_quotes'}>
                <Plus /> New motor quote
              </Link>
            </Button>
            <Button variant="accent" size="sm" onClick={() => setNewLeadOpen(true)}>
              <Plus /> New lead
            </Button>
          </>
        }
      />
      {runId ? (
        <RunHeader runId={runId} onClear={() => setParam('run', null)} />
      ) : category === 'sample' ? (
        <Link to="/broker/quotes/sample-motor" className="panel mb-4 flex items-center gap-4 p-4 transition hover:border-brand-500/40">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Car className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-navy-900">Sample client · Private motor</span>
              <DemoSampleBadge />
            </span>
            <span className="mt-0.5 block text-xs text-navy-600">Lerato Sample · one private vehicle, prefilled. Edit the details and get three sample insurer results.</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-navy-400" />
        </Link>
      ) : null}
      {scope && (
        <p className="mb-3 text-xs text-navy-600">
          Showing {scope} leads only.{' '}
          <Link to="/broker/leads" className="font-semibold text-brand-600">
            Show all leads
          </Link>
        </p>
      )}
      {notice && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {leads && (
        <DataGrid
          data={rows}
          columns={columns}
          getRowId={(l) => l.id}
          storageKey="broker-leads-v2"
          searchPlaceholder="Search name, email, area or summary"
          searchText={(l) =>
            [l.customer_name, l.customer_email, l.customer_phone, l.qualification.summary, l.product_category, l.source, l.next_action, l.prospect?.email, l.prospect?.phone, l.prospect?.area, l.prospect?.industry, l.prospect?.business_function, l.prospect?.address]
              .filter(Boolean)
              .join(' ')
          }
          initialSort={[{ id: 'due', desc: false }, { id: 'last_activity', desc: true }]}
          defaultHidden={['email', 'area', 'industry', 'function', 'product', 'urgency', 'tasks', 'source', 'run', 'category', 'created']}
          minWidth={1100}
          rowClassName={(l) => (l.id === leadId ? 'bg-brand-50/80' : undefined)}
          csv={{ filename: runId ? `russ-leads-${runId.slice(0, 8)}` : 'leads', columns: csv }}
          empty={<EmptyState title="No leads in this view">Add a lead, change the filters, or ask Russ to find businesses in an area.</EmptyState>}
          toolbar={
            <>
              <select value={typeFilter.id} onChange={(e) => setParam('type', e.target.value === 'all' ? null : e.target.value)} aria-label="Lead type" className="field max-w-[11rem] py-1.5 text-xs">
                {TYPE_FILTERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select value={stageFilter} onChange={(e) => setParam('stage', e.target.value || null)} aria-label="Stage" className="field max-w-[12rem] py-1.5 text-xs">
                <option value="">Stage: all</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
              <FilterSelect label="Source" value={f.source} options={distinct((l) => l.source)} onChange={(v) => setParam('source', v)} />
              <FilterSelect label="Cover" value={f.cover} options={distinct((l) => l.product_category)} onChange={(v) => setParam('cover', v)} />
              {anyResearch && (
                <>
                  <FilterSelect label="Industry" value={f.industry} options={distinct((l) => l.prospect?.industry)} onChange={(v) => setParam('industry', v)} />
                  <FilterSelect label="Function" value={f.fn} options={distinct((l) => l.prospect?.business_function)} onChange={(v) => setParam('fn', v)} />
                  <FilterSelect label="Area" value={f.area} options={distinct((l) => l.prospect?.area)} onChange={(v) => setParam('area', v)} />
                  <label className="flex items-center gap-1 text-xs text-navy-700">
                    <input type="checkbox" checked={hasEmail} onChange={(e) => setParam('email', e.target.checked ? '1' : null)} /> Has email
                  </label>
                </>
              )}
              {(runs.data?.length ?? 0) > 0 && (
                <select value={runId ?? ''} onChange={(e) => setParam('run', e.target.value || null)} aria-label="Russ run" className="field max-w-[14rem] py-1.5 text-xs">
                  <option value="">Russ run: all</option>
                  {runs.data!.map((r) => (
                    <option key={r.id} value={r.id}>
                      {runTitle(r.filters)} · {r.progress ? `${r.progress.found}/${r.progress.requested}` : r.status} · {formatDateTime(r.created_at)}
                    </option>
                  ))}
                </select>
              )}
            </>
          }
          bulkActions={(selected, clear) => {
            const ids = selected.map((l) => l.id)
            const emails = [...new Set(selected.map((l) => l.prospect?.email).filter(Boolean))] as string[]
            const prospects = selected.filter((l) => l.prospect).length
            return (
              <>
                {category === 'sample' && (
                  <div className="w-full basis-full">
                    <DemoAdvanceBar selectedIds={ids} clear={clear} />
                  </div>
                )}
                <select
                  value=""
                  disabled={bulk.isPending}
                  onChange={(e) => e.target.value && run({ lead_ids: ids, action: 'status', status: e.target.value as LeadStatus }, `Status set to ${humanise(e.target.value)}`, clear)}
                  aria-label="Change status"
                  className="field py-1 text-xs"
                >
                  <option value="">Change status…</option>
                  {LEAD_PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {humanise(s)}
                    </option>
                  ))}
                </select>
                {(team.data?.length ?? 0) > 0 && (
                  <select
                    value=""
                    disabled={bulk.isPending}
                    onChange={(e) =>
                      e.target.value &&
                      run({ lead_ids: ids, action: 'assign', member_id: e.target.value === 'none' ? null : e.target.value }, e.target.value === 'none' ? 'Unassigned' : `Assigned to ${members.get(e.target.value)}`, clear)
                    }
                    aria-label="Assign to team member"
                    className="field py-1 text-xs"
                  >
                    <option value="">Assign owner…</option>
                    {team.data!.map((m) => (
                      <option key={m.member_id} value={m.member_id}>
                        {m.name}
                      </option>
                    ))}
                    <option value="none">Nobody</option>
                  </select>
                )}
                <FollowUpForm busy={bulk.isPending} onSubmit={(title, due) => run({ lead_ids: ids, action: 'follow_up', title, due_date: due }, 'Follow-ups set', clear)} />
                {prospects > 0 && (
                  <select
                    value=""
                    disabled={bulk.isPending}
                    onChange={(e) => e.target.value && run({ lead_ids: ids, action: 'prospect_status', status: e.target.value as ProspectStatus }, `Marked ${humanise(e.target.value)}`, clear)}
                    aria-label="Prospect status"
                    className="field py-1 text-xs"
                  >
                    <option value="">Prospect…</option>
                    <option value="do_not_contact">Do not contact</option>
                    <option value="archived">Archive</option>
                    <option value="active">Reactivate</option>
                  </select>
                )}
                {emails.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void navigator.clipboard?.writeText(emails.join('; ')).then(() => setNotice(`${emails.length} email${emails.length === 1 ? '' : 's'} copied.`))}
                  >
                    <ClipboardCopy /> Copy {emails.length} email{emails.length === 1 ? '' : 's'}
                  </Button>
                )}
              </>
            )
          }}
          getRowContextMenu={leadMenu}
          mobileCard={(l, sel) => (
            <div className="panel flex gap-3 p-4">
              <input type="checkbox" checked={sel.selected} onChange={sel.toggle} aria-label={`Select ${l.customer_name}`} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="min-w-0 cursor-pointer text-left active:bg-mist" onClick={() => openLead(l.id)}>
                    <span className="font-medium text-navy-900">{l.customer_name}</span>
                    <span className="mt-0.5 block text-[11px] text-navy-500">
                      {l.customer_type === 'commercial' ? 'Business' : 'Person'}
                      {l.product_category ? ` · ${humanise(l.product_category)}` : ''}
                    </span>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <LeadProgressBar
                      status={l.status}
                      closedReason={l.closed_reason}
                      closedAtStage={l.closed_at_stage}
                      overdue={isLeadOverdue(l)}
                      compact
                    />
                    <RowActionsButton items={leadMenu(l)} onOpen={setRowMenu} />
                  </div>
                </div>
                {(l.customer_phone || l.customer_email || l.prospect) && (
                  <p className="mt-0.5 truncate text-xs text-navy-700">
                    {[l.prospect?.phone ?? l.customer_phone, l.prospect?.email ?? l.customer_email, l.prospect?.area].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="mt-1 line-clamp-2 text-xs text-navy-600">{l.match?.cover_fit ?? l.qualification.summary}</p>
                <p className="mt-2 text-[11px] text-navy-500">
                  {l.product_category ? humanise(l.product_category) : 'No cover yet'} · {l.line} · {l.missing_info.length ? `${l.missing_info.length} missing` : 'complete'} · {formatDateTime(l.created_at)}
                </p>
              </div>
            </div>
          )}
        />
      )}
      <RowContextMenu state={rowMenu} onClose={() => setRowMenu(null)} />

      <RightSlideout
        open={Boolean(leadId)}
        onClose={closeSlideout}
        title={slideTitle}
        subtitle={slideSubtitle || undefined}
        demo={Boolean(slideDemo)}
        size="record"
        footer={null}
      >
        {leadId && <LeadRecordPanel leadId={leadId} embedded onOpenLead={openLead} />}
      </RightSlideout>
    </div>
  )
}
