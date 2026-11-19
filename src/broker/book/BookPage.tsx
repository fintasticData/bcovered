import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Info, Maximize2, Minimize2, Plus, Share2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StepResult, TurnContext } from '@/copilot/api'
import { useBookGrid, useSalesProfile, useTeam, type MemberRef } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { fetchOrganisationMedia } from '@/lib/supabase/organisations'
import { cn } from '@/lib/utils'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategorySwitch } from '../copilot/CategorySwitch'
import { RoleChip } from './bits'
import { ClientRecordPanel } from './ClientRecordPanel'
import { DeskQueue, type BrowseMode, type QueueFilter } from './DeskQueue'
import { AddClientDialog, CreateOfferDialog, ShareReferralDialog } from './dialogs'
import { RussDeskPanel } from './RussDeskPanel'
import { ReferralsTab, TeamTab } from './TeamTab'
import { applyQueueCounts } from './queueCounts'

type Dialog = null | 'add' | 'share' | 'offer'

/** Unified desk: queue | workbench | Ava. */
export default function BookPage() {
  const { personId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  const profile = useSalesProfile()
  const p = profile.data
  const canManage = Boolean(p?.can_manage_team)
  const canSeeTeam = !p?.book_restricted
  const team = useTeam(canManage)
  const [expanded, setExpanded] = useState(false)
  const [russCollapsed, setRussCollapsed] = useState(false)
  const [pane, setPane] = useState<Pane>(personId ? 'work' : 'queue')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [context, setContext] = useState<TurnContext>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

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

  const tab = params.get('tab') ?? 'clients'
  const scope = (params.get('scope') as 'mine' | 'team' | null) ?? (canSeeTeam ? 'team' : 'mine')
  const memberId = params.get('member')
  const member = memberId
    ? (team.data?.find((m) => m.member_id === memberId) ??
      (context.member?.member_id === memberId ? context.member : null) ??
      ({ member_id: memberId, name: 'this team member', role: 'agent', role_label: 'Team', referral_code: '', referral_path: '' } as MemberRef))
    : null
  const recordTab = params.get('rtab') ?? 'overview'
  const mode = (params.get('mode') as BrowseMode | null) ?? 'people'
  const filter = (params.get('qfilter') as QueueFilter | null) ?? 'all'

  const countsGrid = useBookGrid({ scope, member_id: member?.member_id ?? null, stage: null, query: null })
  const filterCounts = useMemo(() => applyQueueCounts(countsGrid.data?.rows ?? []), [countsGrid.data?.rows])
  const itemRows = useMemo(() => {
    const rows = countsGrid.data?.rows ?? []
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
  }, [countsGrid.data?.rows, filter])

  const setQuery = (next: Record<string, string | null>, path?: string) => {
    const q = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) (v === null ? q.delete(k) : q.set(k, v))
    if (path) navigate({ pathname: path, search: q.toString() })
    else setParams(q, { replace: true })
  }
  const openClient = (id: string, extra: Record<string, string | null> = {}) => {
    setPane('work')
    setQuery({ tab: 'clients', rtab: null, offer: null, ...extra }, `/broker/book/clients/${id}`)
  }
  const back = () => {
    setPane('queue')
    setQuery({ offer: null, rtab: null }, '/broker/book')
  }

  const onSelect = (s: { key: string; step: StepResult } | null) => {
    setSelectedKey(s?.key ?? null)
    if (!s) return
    const step = s.step
    const target = step.links.find((l) => l.to.startsWith('/broker/book'))?.to ?? step.receipt?.open_path ?? ''
    const client = target.match(/\/broker\/book\/clients\/([0-9a-f-]{36})(?:\?offer=([0-9a-f-]{36}))?/i)
    if (client) return openClient(client[1], client[2] ? { offer: client[2], rtab: 'quotes' } : {})
    if (step.subject?.record_type === 'client' && step.intent.startsWith('sales_')) return openClient(step.subject.id)
    const mem = target.match(/[?&]member=([0-9a-f-]{36})/i)
    if (mem) {
      setPane('work')
      return setQuery({ tab: 'clients', member: mem[1], scope: 'team' }, '/broker/book')
    }
    if (/tab=team/.test(target)) {
      setPane('work')
      return setQuery({ tab: 'team' }, '/broker/book')
    }
  }

  if (auth.status !== 'signed_in') {
    return (
      <div className="p-6">
        <EmptyState title="Sign in to open your workspace">
          {auth.status === 'unconfigured'
            ? 'This build has no Supabase connection.'
            : 'Sign in with your broker login (or choose a brokerage staff identity under “Demo as”).'}
        </EmptyState>
      </div>
    )
  }
  if (profile.isLoading) return <LoadingState label="Opening your workspace…" />

  const me = p?.member ?? null
  const live = Boolean(p?.brokerage?.live_available)
  const first = (p?.name ?? 'there').split(' ')[0]
  const queueNeed = (filterCounts.quotes ?? 0) + (filterCounts.decision ?? 0) + (filterCounts.info ?? 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} queueLabel="Queue" workLabel="Workbench" chatLabel="Ava" />}

      <div className="border-b border-navy-800/10 bg-white px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            {logoUrl && <img src={logoUrl} alt="" className="mt-0.5 h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-navy-800/10" />}
            <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-navy-900">
              Welcome back, {first}. What would you like to work on?
            </h1>
            <p className="text-xs text-navy-600">
              {queueNeed > 0
                ? `${queueNeed} item${queueNeed === 1 ? '' : 's'} in Quotes ready, Awaiting decision or Information needed.`
                : 'No outstanding queue counts from the current filters.'}{' '}
              {p?.brokerage?.name ?? 'Brokerage'} · {category === 'live' ? 'Production' : 'Demo'}
            </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="accent" onClick={() => { setPane('queue'); setQuery({ qfilter: 'all' }) }}>
              My queue
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('add')}>
              <UserPlus /> Add a lead
            </Button>
            <CategorySwitch onChange={() => back()} />
            <Button
              size="sm"
              variant="ghost"
              className="hidden lg:inline-flex"
              onClick={() => {
                if (expanded) {
                  setExpanded(false)
                  setRussCollapsed(false)
                } else {
                  setRussCollapsed(true)
                  setExpanded(true)
                }
              }}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Ava' : 'Expand editor'}
            </Button>
          </div>
        </div>
        {!live && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Demo view: records here are sample data. Production (live clients) unlocks once B-Covered activates{' '}
            {p?.brokerage?.name ?? 'your brokerage'}. Use the side menu Workspace panel to switch.
          </p>
        )}
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-3 p-3 sm:p-4',
          'grid-cols-1',
          !expanded && !russCollapsed && 'xl:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)_minmax(16rem,0.95fr)]',
          !expanded && russCollapsed && 'xl:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1fr)]',
          expanded && 'xl:grid-cols-1',
        )}
      >
        {!expanded && (
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
              onOpen={(id) => openClient(id)}
              selectedId={personId}
              itemRows={itemRows}
            />
          </div>
        )}

        <section
          className={cn('panel flex min-h-0 flex-col max-xl:overflow-y-auto xl:overflow-hidden', !expanded && pane !== 'work' && 'hidden xl:flex')}
          aria-label="Main workbench"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800/10 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-navy-900">{personId ? 'Customer workbench' : 'My workspace'}</h2>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-navy-600">
                {p?.brokerage?.name ?? 'No brokerage'} · {p?.name}
                {me && <RoleChip member={me} />}
                {me && <span className="font-mono">{me.referral_code}</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog('share')} disabled={!me}>
                <Share2 /> Share referral
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('offer')}>
                <Plus /> Create offer
              </Button>
              {!expanded && (
                <Button size="sm" variant="ghost" className="hidden xl:inline-flex" onClick={() => setRussCollapsed((c) => !c)}>
                  {russCollapsed ? 'Show Ava' : 'Hide Ava'}
                </Button>
              )}
            </div>
          </header>

          <div className="flex-1 px-4 py-4 max-xl:shrink-0 xl:scroll-area">
            {personId ? (
              <ClientRecordPanel
                personId={personId}
                offerId={params.get('offer')}
                onBack={back}
                tab={recordTab}
                onTab={(t) => setQuery({ rtab: t })}
              />
            ) : (
              <Tabs value={tab} onValueChange={(t) => setQuery({ tab: t })} className="flex min-h-0 flex-col">
                <TabsList>
                  <TabsTrigger value="clients">Select a customer from the queue</TabsTrigger>
                  {canManage && <TabsTrigger value="team">Team</TabsTrigger>}
                  {canSeeTeam && <TabsTrigger value="referrals">Referrals</TabsTrigger>}
                </TabsList>
                <TabsContent value="clients" className="pt-4">
                  <EmptyState title="Choose someone from the left queue">
                    Keep your search and filters — opening a customer loads their workbench here without losing queue position.
                  </EmptyState>
                </TabsContent>
                {canManage && (
                  <TabsContent value="team" className="pt-4">
                    <TeamTab canManage={canManage} />
                  </TabsContent>
                )}
                {canSeeTeam && (
                  <TabsContent value="referrals" className="pt-4">
                    <ReferralsTab onOpenMember={(m) => setQuery({ tab: 'clients', member: m.member_id, scope: 'team' })} />
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        </section>

        {!expanded && !russCollapsed && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden xl:block')}>
            <RussDeskPanel
              context={context}
              onContextChange={setContext}
              onSelect={onSelect}
              selectedKey={selectedKey}
              personId={personId}
              onOpenTab={(t) => {
                if (personId) setQuery({ rtab: t })
                setPane('work')
              }}
            />
          </div>
        )}
      </div>

      {dialog === 'add' && (
        <AddClientDialog onClose={() => setDialog(null)} onCreated={(id) => openClient(id)} team={team.data ?? []} me={me} canAssign={canManage} />
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
          onCreated={(offerId, forPerson) => openClient(forPerson, { rtab: 'quotes', offer: offerId })}
        />
      )}
    </div>
  )
}
