import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Building2, FlaskConical, MessageSquare, Plus, Share2, Upload, UserPlus, Users } from 'lucide-react'
import { useCommercialClient, useCommercialClients } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StepResult, TurnContext } from '@/copilot/api'
import { useFranchiseList } from '@/copilot/franchiseApi'
import {
  useBookGrid,
  useClientRecord,
  useSalesProfile,
  useTeam,
  type GridRow,
  type MemberRef,
  STAGE_LABEL,
} from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { fetchOrganisationMedia } from '@/lib/supabase/organisations'
import { cn, formatDateTime } from '@/lib/utils'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { CategorySwitch } from '../copilot/CategorySwitch'
import { ClientRecordPanel } from '../book/ClientRecordPanel'
import { DeskQueue, type BrowseMode, type QueueFilter } from '../book/DeskQueue'
import { AddClientDialog, CreateOfferDialog, ShareReferralDialog } from '../book/dialogs'
import { applyQueueCounts } from '../book/queueCounts'
import { ReferralsTab, TeamTab } from '../book/TeamTab'
import { SetupFranchiseDialog } from '../franchise/dialogs'
import { DataGrid } from '../shared/DataGrid'
import { RightSlideout } from '../shared/RightSlideout'
import { AddBusinessDialog, type BusinessPrefill } from './AddBusinessDialog'
import { AvaDeskPanel } from './AvaDeskPanel'
import { BusinessRecordPanel } from './BusinessRecordPanel'
import { SeedDemoCustomersButton } from './SeedDemoCustomersButton'

type AreaTab = 'customers' | 'businesses'
type DeskTab = 'queue' | 'team' | 'referrals'
type Dialog = null | 'add-customer' | 'add-business' | 'import' | 'franchise' | 'seed-demo' | 'share' | 'offer'

function filterQueueRows(rows: GridRow[], filter: QueueFilter): GridRow[] {
  if (filter === 'renewals') return []
  if (filter === 'leads') return rows.filter((r) => r.stage === 'new_enquiry')
  if (filter === 'quotes') return rows.filter((r) => r.stage === 'offer_sent')
  if (filter === 'decision') return rows.filter((r) => r.stage === 'accepted')
  if (filter === 'covered') return rows.filter((r) => r.stage === 'sold' || r.stage === 'client' || r.sales > 0)
  if (filter === 'info') {
    const now = Date.now()
    return rows.filter(
      (r) => (r.stage === 'new_enquiry' && r.offers === 0) || Boolean(r.next_follow_up?.due_date && new Date(r.next_follow_up.due_date).getTime() < now),
    )
  }
  return rows.filter((r) => r.offers > 0 || r.sales > 0 || r.stage !== 'new_enquiry')
}

export default function CustomerAreaPage() {
  const { personId, profileId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  const profile = useSalesProfile()
  const p = profile.data
  const canSeeTeam = !p?.book_restricted
  const canManage = Boolean(p?.can_manage_team)
  const team = useTeam(canManage)

  const tab = ((params.get('tab') as AreaTab | null) ?? 'customers') as AreaTab
  const desk = ((params.get('desk') as DeskTab | null) ?? 'queue') as DeskTab
  const scope = (params.get('scope') as 'mine' | 'team' | null) ?? (canSeeTeam ? 'team' : 'mine')
  const roleFilter = params.get('role') ?? ''
  const recordTab = params.get('rtab') ?? 'overview'
  const mode = (params.get('mode') as BrowseMode | null) ?? 'people'
  const filter = (params.get('qfilter') as QueueFilter | null) ?? 'all'
  const memberId = params.get('member')

  const [avaCollapsed, setAvaCollapsed] = useState(true)
  const [pane, setPane] = useState<Pane>(() => (personId || profileId ? 'work' : 'queue'))
  const [dialog, setDialog] = useState<Dialog>(null)
  const [businessPrefill, setBusinessPrefill] = useState<BusinessPrefill | undefined>(undefined)
  const [context, setContext] = useState<TurnContext>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const member = memberId
    ? (team.data?.find((m) => m.member_id === memberId) ??
      (context.member?.member_id === memberId ? context.member : null) ??
      ({
        member_id: memberId,
        name: 'this team member',
        role: 'agent',
        role_label: 'Team',
        referral_code: '',
        referral_path: '',
      } as MemberRef))
    : null

  const grid = useBookGrid({ scope, member_id: member?.member_id ?? null, stage: null, query: null })
  const businesses = useCommercialClients()
  const franchise = useFranchiseList(category)
  const slidePerson = useClientRecord(personId)
  const slideBusiness = useCommercialClient(profileId)

  const filterCounts = useMemo(() => applyQueueCounts(grid.data?.rows ?? []), [grid.data?.rows])
  const itemRows = useMemo(() => filterQueueRows(grid.data?.rows ?? [], filter), [grid.data?.rows, filter])

  useEffect(() => {
    const id = p?.brokerage?.id
    if (!id) {
      setLogoUrl(null)
      return
    }
    let cancelled = false
    void fetchOrganisationMedia(id).then((media) => {
      if (!cancelled) setLogoUrl(media?.logo_url ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [p?.brokerage?.id])

  const franchiseByCustomer = useMemo(() => {
    const map = new Map<string, { partnerId: string; name: string; outlets: number }>()
    for (const partner of franchise.data?.partners ?? []) {
      if (partner.customer_id) map.set(partner.customer_id, { partnerId: partner.id, name: partner.name, outlets: partner.outlets.length })
    }
    return map
  }, [franchise.data?.partners])

  useEffect(() => {
    if (personId && grid.data?.rows) {
      const row = grid.data.rows.find((r) => r.id === personId)
      if (row) {
        setContext((c) => ({
          ...c,
          person: {
            record_type: 'client',
            id: row.id,
            number: row.client_number,
            name: row.name,
            category: row.category,
            open_path: `/broker/customers/people/${row.id}`,
          },
        }))
      }
    }
  }, [personId, grid.data?.rows])

  useEffect(() => {
    if (profileId && businesses.data) {
      const row = businesses.data.find((r) => r.profile.id === profileId)
      if (row) {
        const name = row.profile.trading_name ?? row.profile.registered_name
        setContext((c) => ({
          ...c,
          account: {
            record_type: 'account',
            id: row.profile.customer_id,
            number: (row as { account_number?: string }).account_number ?? row.profile.customer_id.slice(0, 8),
            name,
            category,
            detail: 'Business account',
            open_path: `/broker/customers/businesses/${row.profile.id}`,
          },
        }))
      }
    }
  }, [profileId, businesses.data, category])

  const setQuery = (next: Record<string, string | null>, path?: string) => {
    const q = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) (v === null ? q.delete(k) : q.set(k, v))
    if (path) navigate({ pathname: path, search: q.toString() })
    else setParams(q, { replace: true })
  }

  const openPerson = (id: string, extra: Record<string, string | null> = {}) => {
    setPane('work')
    setQuery({ tab: 'customers', desk: 'queue', rtab: null, ...extra }, `/broker/customers/people/${id}`)
  }

  const openBusiness = (id: string, extra: Record<string, string | null> = {}) => {
    setPane('work')
    setQuery({ tab: 'businesses', rtab: null, ...extra }, `/broker/customers/businesses/${id}`)
  }

  const back = () => {
    setPane('queue')
    setQuery({ rtab: null, offer: null }, '/broker/customers')
  }

  const onSelect = (s: { key: string; step: StepResult } | null) => {
    setSelectedKey(s?.key ?? null)
    if (!s) return
    const step = s.step
    const target = step.links.find((l) => l.to.includes('/broker/'))?.to ?? step.receipt?.open_path ?? ''
    const person = target.match(/\/(?:customers\/people|book\/clients)\/([0-9a-f-]{36})(?:\?[^#]*)?(?:&|\?)?offer=([0-9a-f-]{36})?/i)
    if (person) {
      return openPerson(person[1], person[2] ? { offer: person[2], rtab: 'quotes' } : {})
    }
    const personOnly = target.match(/\/(?:customers\/people|book\/clients)\/([0-9a-f-]{36})/i)
    if (personOnly) return openPerson(personOnly[1])
    const biz = target.match(/\/(?:customers\/businesses|commercial\/clients)\/([0-9a-f-]{36})/i)
    if (biz) return openBusiness(biz[1])
    if (step.subject?.record_type === 'client') return openPerson(step.subject.id)
    if (step.subject?.record_type === 'account') {
      const fromPath = step.subject.open_path?.match(/\/(?:customers\/businesses|commercial\/clients)\/([0-9a-f-]{36})/i)
      if (fromPath) return openBusiness(fromPath[1])
    }
    const mem = target.match(/[?&]member=([0-9a-f-]{36})/i)
    if (mem) {
      setPane('queue')
      return setQuery({ tab: 'customers', desk: 'queue', member: mem[1], scope: 'team' }, '/broker/customers')
    }
    if (/[?&]desk=team|tab=team/.test(target)) {
      setPane('work')
      return setQuery({ tab: 'customers', desk: 'team' }, '/broker/customers')
    }
    if (/[?&]desk=referrals|tab=referrals/.test(target)) {
      setPane('work')
      return setQuery({ tab: 'customers', desk: 'referrals' }, '/broker/customers')
    }
  }

  const me = p?.member ?? null
  const live = Boolean(p?.brokerage?.live_available)
  const detailOpen = Boolean(personId || profileId)
  /** Ava stays hidden while a record slide-out is open; preference restores when it closes. */
  const showAva = !avaCollapsed && !detailOpen
  const workingLabel = context.person
    ? `${context.person.name} · ${context.person.number}`
    : context.account
      ? `${context.account.name}${context.account.number ? ` · ${context.account.number}` : ''}`
      : 'no record selected'
  const slideBizName =
    slideBusiness.data?.profile.trading_name ?? slideBusiness.data?.profile.registered_name ?? context.account?.name
  const slideTitle = personId
    ? (slidePerson.data?.name ?? context.person?.name ?? 'Customer')
    : (slideBizName ?? 'Business')
  const slideSubtitle = personId
    ? (() => {
        const number = slidePerson.data?.client_number ?? context.person?.number
        const stage = slidePerson.data?.stage
        if (!number) return undefined
        return stage ? `${number} · ${STAGE_LABEL[stage] ?? stage}` : number
      })()
    : context.account?.number
  const slideDemo = personId
    ? (slidePerson.data?.category ?? context.person?.category) === 'sample'
    : category === 'sample'

  const customerColumns = useMemo<ColumnDef<GridRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (r) => r.name,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-[11rem]">
            <button type="button" className="cursor-pointer font-medium text-navy-900 hover:text-brand-600" onClick={() => openPerson(r.id)}>
              {r.name}
            </button>
            <p className="font-mono text-[11px] text-navy-500">{r.client_number}</p>
          </div>
        ),
      },
      {
        id: 'contact',
        header: 'Mobile / email',
        accessorFn: (r) => `${r.account?.phone ?? ''} ${r.account?.email ?? ''}`,
        cell: ({ row: { original: r } }) => (
          <span className="text-xs text-navy-700">{[r.account?.phone, r.account?.email].filter(Boolean).join(' · ') || '–'}</span>
        ),
      },
      {
        id: 'business',
        header: 'Linked business',
        accessorFn: (r) => r.account?.number ?? '',
        cell: ({ row: { original: r } }) => <span className="font-mono text-xs text-navy-600">{r.account?.number ?? '–'}</span>,
      },
      {
        id: 'broker',
        header: 'Responsible broker',
        accessorFn: (r) => r.assigned?.name ?? '',
        cell: ({ row: { original: r } }) => <span className="text-xs text-navy-700">{r.assigned?.name ?? '–'}</span>,
      },
      {
        id: 'last',
        header: 'Last contact',
        accessorFn: (r) => r.last_communication?.at ?? '',
        cell: ({ row: { original: r } }) =>
          r.last_communication ? (
            <span className="block max-w-[14rem] truncate text-xs text-navy-700" title={r.last_communication.summary}>
              {formatDateTime(r.last_communication.at)} · {r.last_communication.summary}
            </span>
          ) : (
            <span className="text-xs text-navy-400">None yet</span>
          ),
      },
      {
        id: 'next',
        header: 'Next action',
        accessorFn: (r) => r.next_follow_up?.title ?? STAGE_LABEL[r.stage] ?? r.stage,
        cell: ({ row: { original: r } }) => (
          <span className="text-xs text-navy-700">{r.next_follow_up?.title ?? STAGE_LABEL[r.stage] ?? humanise(r.stage)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => r.contact_stage,
        cell: ({ row: { original: r } }) => <StatusBadge status={r.contact_stage} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personId, scope],
  )

  type BizRow = NonNullable<typeof businesses.data>[number] & { roles: string[] }

  const businessRows: BizRow[] = useMemo(() => {
    const rows = (businesses.data ?? []).map((r) => {
      const franchisee = franchiseByCustomer.get(r.profile.customer_id)
      const roles = ['commercial_client', ...(franchisee ? ['franchisee'] : [])]
      return { ...r, roles }
    })
    if (roleFilter === 'franchisee') return rows.filter((r) => r.roles.includes('franchisee'))
    return rows
  }, [businesses.data, franchiseByCustomer, roleFilter])

  const businessColumns = useMemo<ColumnDef<BizRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Trading name',
        accessorFn: (r) => r.profile.trading_name ?? r.profile.registered_name,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-[11rem]">
            <button type="button" className="cursor-pointer font-medium text-navy-900 hover:text-brand-600" onClick={() => openBusiness(r.profile.id)}>
              {r.profile.trading_name ?? r.profile.registered_name}
            </button>
            <p className="text-[11px] text-navy-500">{r.industry_name}</p>
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Business roles',
        accessorFn: (r) => r.roles.join(','),
        cell: ({ row: { original: r } }) => (
          <span className="flex flex-wrap gap-1">
            {r.roles.map((role) => (
              <span key={role} className="rounded-full bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700 ring-1 ring-navy-800/10">
                {humanise(role)}
              </span>
            ))}
          </span>
        ),
      },
      {
        id: 'area',
        header: 'Area',
        accessorFn: (r) => r.profile.operating_regions?.toString?.() ?? '',
        cell: ({ row: { original: r } }) => (
          <span className="text-xs text-navy-700">
            {r.location_count} location{r.location_count === 1 ? '' : 's'}
          </span>
        ),
      },
      {
        id: 'broker',
        header: 'Responsible broker',
        accessorFn: (r) => r.assigned_broker ?? '',
        cell: ({ row: { original: r } }) => <span className="text-xs text-navy-700">{r.assigned_broker ?? '–'}</span>,
      },
      {
        id: 'next',
        header: 'Next action',
        accessorFn: (r) => r.open_customer_tasks + r.open_broker_tasks,
        cell: ({ row: { original: r } }) => (
          <span className="text-xs text-navy-700">
            {r.open_customer_tasks + r.open_broker_tasks > 0
              ? `${r.open_customer_tasks + r.open_broker_tasks} open request${r.open_customer_tasks + r.open_broker_tasks === 1 ? '' : 's'}`
              : r.twin_version
                ? 'Review cover'
                : 'Build Risk Twin'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => r.profile.status,
        cell: ({ row: { original: r } }) => <StatusBadge status={r.profile.status} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roleFilter],
  )

  if (auth.status !== 'signed_in') {
    return (
      <div className="p-6">
        <EmptyState title="Sign in to open Customer Area">
          {auth.status === 'unconfigured' ? 'This build has no Supabase connection.' : 'Sign in with your broker login.'}
        </EmptyState>
      </div>
    )
  }
  if (profile.isLoading) return <LoadingState label="Opening Customer Area…" />

  const openAddBusiness = (prefill?: BusinessPrefill) => {
    setBusinessPrefill(prefill)
    setDialog('add-business')
  }

  const onMobilePane = (next: Pane) => {
    if (next === 'chat') {
      setAvaCollapsed(false)
      setPane('chat')
      return
    }
    if (next === 'work') {
      setPane(detailOpen || tab === 'customers' ? 'work' : 'queue')
      return
    }
    setPane('queue')
  }

  const mobilePane: Pane = pane === 'chat' && showAva ? 'chat' : detailOpen && pane === 'work' ? 'work' : pane === 'work' ? 'work' : 'queue'
  const peopleLayout = tab === 'customers'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobilePaneSwitch
        pane={mobilePane}
        onChange={onMobilePane}
        queueLabel={peopleLayout ? 'Queue' : 'Tables'}
        workLabel={peopleLayout ? 'Workbench' : 'Record'}
        chatLabel="Ava"
      />

      <div className="border-b border-navy-800/10 bg-white px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-navy-900">Customer Area</h1>
            <p className="text-xs text-navy-600">
              Find a person or business, see what happened last, and take the next action. {p?.brokerage?.name ?? 'Brokerage'} ·{' '}
              {category === 'live' ? 'Production' : 'Demo'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {peopleLayout && (
              <>
                <Button size="sm" variant="outline" onClick={() => setDialog('share')} disabled={!me}>
                  <Share2 /> Share referral
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialog('offer')}>
                  <Plus /> Create offer
                </Button>
              </>
            )}
            <CategorySwitch onChange={back} />
            <Button
              size="sm"
              variant={avaCollapsed || detailOpen ? 'ghost' : 'outline'}
              className="hidden xl:inline-flex"
              aria-label={showAva ? 'Hide Ava' : 'Show Ava'}
              aria-pressed={showAva}
              title={detailOpen ? 'Close the record to chat with Ava' : showAva ? 'Hide Ava' : 'Show Ava'}
              disabled={detailOpen}
              onClick={() => {
                setAvaCollapsed((c) => !c)
                setPane((prev) => (prev === 'chat' ? 'queue' : prev))
              }}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="sr-only">{showAva ? 'Hide Ava' : 'Show Ava'}</span>
              <span className="hidden 2xl:inline">Ava</span>
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-3 p-3 sm:p-4',
          'grid-cols-1',
          peopleLayout && showAva && 'xl:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)_minmax(16rem,0.95fr)]',
          peopleLayout && !showAva && 'xl:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1fr)]',
          !peopleLayout && showAva && 'xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)]',
          !peopleLayout && !showAva && 'xl:grid-cols-1',
        )}
      >
        {peopleLayout && (
          <div className={cn('min-h-0', pane !== 'queue' && 'hidden xl:block')}>
            <DeskQueue
              mode={mode}
              onMode={(m) => setQuery({ mode: m })}
              filter={filter}
              onFilter={(f) => setQuery({ qfilter: f })}
              filterCounts={filterCounts}
              scope={scope}
              onScope={(s) => setQuery({ scope: s })}
              canSeeTeam={canSeeTeam}
              member={member}
              onClearMember={() => setQuery({ member: null })}
              onOpen={(id) => openPerson(id)}
              selectedId={personId}
              itemRows={itemRows}
            />
          </div>
        )}

        <section
          className={cn(
            'panel flex min-h-0 flex-col overflow-hidden',
            pane === 'chat' && showAva && 'max-xl:hidden xl:flex',
            peopleLayout && pane !== 'work' && 'max-xl:hidden xl:flex',
          )}
          aria-label="Customer Area"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800/10 px-4 py-3">
              <div className="flex gap-1 rounded-lg bg-mist p-1" role="tablist" aria-label="Customer Area tables">
                {(
                  [
                    ['customers', 'Customers', Users],
                    ['businesses', 'Businesses', Building2],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => {
                      setPane('queue')
                      setQuery({ tab: id, role: null, desk: id === 'customers' ? desk : null }, '/broker/customers')
                    }}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold',
                      tab === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {tab === 'customers' ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDialog('seed-demo')}>
                      <FlaskConical /> Demo clients
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDialog('import')}>
                      <Upload /> Import
                    </Button>
                    <Button size="sm" variant="accent" onClick={() => setDialog('add-customer')}>
                      <UserPlus /> Add customer
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDialog('import')}>
                      <Upload /> Import
                    </Button>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => setDialog('franchise')}>
                        <Building2 /> Set up franchisee
                      </Button>
                    )}
                    <Button size="sm" variant="accent" onClick={() => openAddBusiness()}>
                      <Plus /> Add business
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto px-4 py-4">
              {tab === 'customers' && (
                <Tabs
                  value={desk === 'team' || desk === 'referrals' ? desk : 'queue'}
                  onValueChange={(t) => {
                    setPane('work')
                    setQuery({ desk: t === 'queue' ? null : t })
                  }}
                  className="flex min-h-0 flex-col"
                >
                  <TabsList>
                    <TabsTrigger value="queue">Customers</TabsTrigger>
                    {canManage && <TabsTrigger value="team">Team</TabsTrigger>}
                    {canSeeTeam && <TabsTrigger value="referrals">Referrals</TabsTrigger>}
                  </TabsList>
                  <TabsContent value="queue" className="pt-4">
                    {grid.isLoading && <LoadingState label="Loading customers…" />}
                    {grid.error && <ErrorState message={(grid.error as Error).message} />}
                    {grid.data && (
                      <DataGrid
                        data={filter === 'all' ? grid.data.rows : itemRows}
                        columns={customerColumns}
                        getRowId={(r) => r.id}
                        storageKey="customer-area-people"
                        searchPlaceholder="Search name, customer no., mobile or email…"
                        searchText={(r) => `${r.name} ${r.client_number} ${r.account?.phone ?? ''} ${r.account?.email ?? ''} ${r.assigned?.name ?? ''}`}
                        rowClassName={(r) => (r.id === personId ? 'bg-brand-50/80' : undefined)}
                        bulkActions={(selected, clear) => (
                          <span className="text-xs text-navy-700">
                            {selected.length} selected · Ask Ava to assign, create follow-ups, or link businesses
                            <button type="button" className="ml-2 font-semibold text-brand-700" onClick={clear}>
                              Clear
                            </button>
                          </span>
                        )}
                        empty={
                          <EmptyState title={scope === 'mine' ? 'No customers in Mine yet' : 'No customers match this filter'}>
                            <div className="mt-3 flex flex-wrap justify-center gap-2">
                              <Button size="sm" onClick={() => setDialog('add-customer')}>
                                <UserPlus /> Add customer
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setQuery({ qfilter: 'all' })}>
                                Clear filter
                              </Button>
                              {scope === 'mine' && canSeeTeam && (
                                <Button size="sm" variant="outline" onClick={() => setQuery({ scope: 'team' })}>
                                  View team records
                                </Button>
                              )}
                            </div>
                          </EmptyState>
                        }
                        csv={{
                          filename: 'customers',
                          columns: [
                            { header: 'Name', value: (r) => r.name },
                            { header: 'Customer no.', value: (r) => r.client_number },
                            { header: 'Phone', value: (r) => r.account?.phone },
                            { header: 'Email', value: (r) => r.account?.email },
                            { header: 'Broker', value: (r) => r.assigned?.name },
                            { header: 'Stage', value: (r) => r.stage },
                          ],
                        }}
                      />
                    )}
                  </TabsContent>
                  {canManage && (
                    <TabsContent value="team" className="pt-4">
                      <TeamTab canManage={canManage} />
                    </TabsContent>
                  )}
                  {canSeeTeam && (
                    <TabsContent value="referrals" className="pt-4">
                      <ReferralsTab
                        onOpenMember={(m) => {
                          setPane('queue')
                          setQuery({ desk: null, member: m.member_id, scope: 'team' })
                        }}
                      />
                    </TabsContent>
                  )}
                </Tabs>
              )}

              {tab === 'businesses' && (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <select
                      className="field max-w-[12rem] py-1.5 text-xs"
                      aria-label="Business role filter"
                      value={roleFilter}
                      onChange={(e) => setQuery({ role: e.target.value || null })}
                    >
                      <option value="">All roles</option>
                      <option value="franchisee">Franchisees</option>
                    </select>
                    <Link to="/broker/franchise" className="text-xs font-semibold text-brand-700 hover:underline">
                      Franchise operations
                    </Link>
                  </div>
                  {businesses.isLoading && <LoadingState label="Loading businesses…" />}
                  {businesses.error && <ErrorState message={businesses.error.message} />}
                  {businesses.data && (
                    <DataGrid
                      data={businessRows}
                      columns={businessColumns}
                      getRowId={(r) => r.profile.id}
                      storageKey="customer-area-businesses"
                      searchPlaceholder="Search trading name, industry or broker…"
                      searchText={(r) =>
                        `${r.profile.trading_name ?? ''} ${r.profile.registered_name} ${r.industry_name} ${r.assigned_broker ?? ''} ${r.roles.join(' ')}`
                      }
                      rowClassName={(r) => (r.profile.id === profileId ? 'bg-brand-50/80' : undefined)}
                      bulkActions={(selected, clear) => (
                        <span className="text-xs text-navy-700">
                          {selected.length} selected · Ask Russ (via Ava) for follow-ups or commercial quotes
                          <button type="button" className="ml-2 font-semibold text-brand-700" onClick={clear}>
                            Clear
                          </button>
                        </span>
                      )}
                      empty={
                        <EmptyState title="No businesses yet">
                          <div className="mt-3 flex flex-wrap justify-center gap-2">
                            <Button size="sm" onClick={() => openAddBusiness()}>
                              <Plus /> Add business
                            </Button>
                            {canManage && (
                              <Button size="sm" variant="outline" onClick={() => setDialog('franchise')}>
                                Set up franchisee
                              </Button>
                            )}
                          </div>
                        </EmptyState>
                      }
                      csv={{
                        filename: 'businesses',
                        columns: [
                          { header: 'Trading name', value: (r) => r.profile.trading_name ?? r.profile.registered_name },
                          { header: 'Roles', value: (r) => r.roles.join('|') },
                          { header: 'Industry', value: (r) => r.industry_name },
                          { header: 'Broker', value: (r) => r.assigned_broker },
                          { header: 'Status', value: (r) => r.profile.status },
                        ],
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {showAva && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden xl:block')}>
            <AvaDeskPanel
              context={context}
              onContextChange={setContext}
              onSelect={onSelect}
              selectedKey={selectedKey}
              personId={personId}
              profileId={profileId}
              workingLabel={workingLabel}
              onOpenTab={(t) => {
                setQuery({ rtab: t })
                setPane('work')
              }}
              onOpenPerson={(id) => openPerson(id)}
            />
          </div>
        )}
      </div>

      <RightSlideout
        open={detailOpen}
        onClose={back}
        title={slideTitle}
        subtitle={slideSubtitle ? `Working on · ${slideSubtitle}` : undefined}
        demo={slideDemo}
        size="record"
        footer={null}
      >
        {personId && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 px-1">
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/concierge?personId=${personId}`}>Concierge requests</Link>
              </Button>
              <Button size="sm" variant="accent" asChild>
                <Link to={`/broker/concierge/providers?job=1&personId=${personId}`}>Create job</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/broker/concierge/providers">Service providers</Link>
              </Button>
            </div>
            <ClientRecordPanel
              personId={personId}
              offerId={params.get('offer')}
              onBack={back}
              tab={recordTab}
              onTab={(t) => setQuery({ rtab: t })}
              embedded
            />
          </div>
        )}
        {profileId && (
          <BusinessRecordPanel profileId={profileId} tab={recordTab} onTab={(t) => setQuery({ rtab: t })} canManage={canManage} />
        )}
      </RightSlideout>

      {dialog === 'seed-demo' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4" role="dialog" aria-modal="true" aria-label="Create demo clients">
          <div className="panel w-full max-w-md space-y-4 p-5">
            <PageHeader
              title="Create demo clients"
              description="Ava seeds fictional people in Demo (sample). Each is marked as a demo client; several include estimate covers for practice."
            />
            <SeedDemoCustomersButton
              variant="accent"
              onDone={(id) => {
                setDialog(null)
                if (id) openPerson(id)
              }}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {dialog === 'add-customer' && (
        <AddClientDialog
          onClose={() => setDialog(null)}
          onCreated={(id, meta) => {
            openPerson(id)
            if (meta.interests.includes('business')) {
              queueMicrotask(() =>
                openAddBusiness({
                  contact_name: `${meta.first_names} ${meta.surname}`.trim(),
                  phone: meta.phone,
                  email: meta.email,
                  fromPersonName: `${meta.first_names} ${meta.surname}`.trim(),
                  note: 'Opened from personal Business cover enquiry.',
                }),
              )
            }
          }}
          team={team.data ?? []}
          me={me}
          canAssign={canManage}
        />
      )}
      {dialog === 'share' && me && (
        <ShareReferralDialog
          member={me}
          live={live}
          brokerage={{ name: p?.brokerage?.name ?? null, logo_url: logoUrl }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'offer' && (
        <CreateOfferDialog
          personId={personId ?? null}
          onClose={() => setDialog(null)}
          onCreated={(offerId, forPerson) => openPerson(forPerson, { rtab: 'quotes', offer: offerId })}
        />
      )}
      {dialog === 'add-business' && (
        <AddBusinessDialog
          prefill={businessPrefill}
          onClose={() => {
            setBusinessPrefill(undefined)
            setDialog(null)
          }}
          onCreated={(createdProfileId) => {
            setBusinessPrefill(undefined)
            openBusiness(createdProfileId)
          }}
        />
      )}
      {dialog === 'import' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/40 p-4" role="dialog" aria-modal="true" aria-label="Import">
          <div className="panel w-full max-w-lg space-y-4 p-5">
            <PageHeader
              title="Import records"
              description="Ask Ava to map columns and preview rows, or open the client-book import controls for spreadsheet uploads."
            />
            <p className="text-sm text-navy-700">
              Paste or upload from Excel in Controls, or tell Ava: “Load these contacts and link them to the companies in column D.”
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                Close
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/broker/controls/imports" onClick={() => setDialog(null)}>
                  Open import controls
                </Link>
              </Button>
              <Button
                size="sm"
                variant="accent"
                onClick={() => {
                  setDialog(null)
                  setAvaCollapsed(false)
                  setPane('chat')
                }}
              >
                Ask Ava
              </Button>
            </div>
          </div>
        </div>
      )}
      {dialog === 'franchise' && (
        <SetupFranchiseDialog
          onClose={() => setDialog(null)}
          onDone={(outletId) => {
            setDialog(null)
            navigate(`/broker/franchise?tab=franchisees&outlet=${outletId}`)
          }}
        />
      )}
    </div>
  )
}
