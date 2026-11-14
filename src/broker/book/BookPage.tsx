import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Info, Maximize2, Minimize2, Plus, Share2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StepResult, TurnContext } from '@/copilot/api'
import { useSalesProfile, useTeam, type MemberRef } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategorySwitch } from '../copilot/CategorySwitch'
import { CopilotPanel } from '../copilot/CopilotPanel'
import { RoleChip } from './bits'
import { ClientGrid } from './ClientGrid'
import { ClientRecordPanel } from './ClientRecordPanel'
import { AddClientDialog, CreateOfferDialog, ShareReferralDialog } from './dialogs'
import { ReferralsTab, TeamTab } from './TeamTab'

type Dialog = null | 'add' | 'share' | 'offer'

/** My workspace: choose a task, work it through with Russ, see and edit the result in the client grid and record. */
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
  const [pane, setPane] = useState<Pane>('work')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [context, setContext] = useState<TurnContext>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const tab = params.get('tab') ?? 'clients'
  const scope = (params.get('scope') as 'mine' | 'team' | null) ?? (canSeeTeam ? 'team' : 'mine')
  const memberId = params.get('member')
  const member = memberId ? (team.data?.find((m) => m.member_id === memberId) ?? (context.member?.member_id === memberId ? context.member : null) ?? ({ member_id: memberId, name: 'this team member', role: 'agent', role_label: 'Team', referral_code: '', referral_path: '' } as MemberRef)) : null
  const recordTab = params.get('rtab') ?? 'overview'

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
  const back = () => setQuery({ offer: null, rtab: null }, '/broker/book')

  /** A copilot result opens in the editor: the client it touched, a filtered grid or the team. */
  const onSelect = (s: { key: string; step: StepResult } | null) => {
    setSelectedKey(s?.key ?? null)
    if (!s) return
    const step = s.step
    const target = step.links.find((l) => l.to.startsWith('/broker/book'))?.to ?? step.receipt?.open_path ?? ''
    const client = target.match(/\/broker\/book\/clients\/([0-9a-f-]{36})(?:\?offer=([0-9a-f-]{36}))?/i)
    if (client) return openClient(client[1], client[2] ? { offer: client[2], rtab: 'offers' } : {})
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
          {auth.status === 'unconfigured' ? 'This build has no Supabase connection.' : 'Sign in with your broker login (or choose a brokerage staff identity under “Demo as”).'}
        </EmptyState>
      </div>
    )
  }
  if (profile.isLoading) return <LoadingState label="Opening your workspace…" />

  const me = p?.member ?? null
  const live = Boolean(p?.brokerage?.live_available)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Workspace" />}
      <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
            <CopilotPanel
              key={`russ:${category}`}
              copilot="russ"
              scope="book"
              context={context}
              onContextChange={setContext}
              onSelect={onSelect}
              selectedKey={selectedKey}
              intro="Tell Russ what you need: set up your brokerage, invite your team, load prospects, prepare offers, log what you sent and record confirmed cover. Each result opens on the right."
              starters={
                canManage
                  ? ['Set up my brokerage', 'Add Lerato as my agent and give me her customer referral link', 'Show my referral link', 'Show Lerato’s referrals, latest comms and sales']
                  : ['Show my referral link', 'Show my clients, latest comms and sales', 'Load prospect Sipho Dlamini 082 555 0101 against my code']
              }
            />
          </div>
        )}

        <section className={cn('panel flex min-h-0 flex-col max-lg:overflow-y-auto lg:overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="My workspace editor">
          <header className="space-y-3 border-b border-navy-800/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-navy-900">My workspace</h1>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-navy-600">
                  {p?.brokerage?.name ?? 'No brokerage'} · {p?.name}
                  {me && <RoleChip member={me} />}
                  {me && <span className="font-mono">{me.referral_code}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CategorySwitch onChange={() => back()} />
                <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                  {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Russ' : 'Expand editor'}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="accent" onClick={() => setDialog('add')}><UserPlus /> Add client</Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('share')} disabled={!me} title={me ? undefined : 'You need a sales profile in this brokerage'}><Share2 /> Share my referral link</Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('offer')}><Plus /> Create offer</Button>
            </div>
            {!live && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sample workspace: everything here is labelled Sample. Live clients, offers and sales unlock once B-Covered activates {p?.brokerage?.name ?? 'your brokerage'}.
              </p>
            )}
          </header>

          <div className="flex-1 px-4 py-4 max-lg:shrink-0 lg:scroll-area">
            {personId ? (
              <ClientRecordPanel personId={personId} offerId={params.get('offer')} onBack={back} tab={recordTab} onTab={(t) => setQuery({ rtab: t })} />
            ) : (
              <Tabs value={tab} onValueChange={(t) => setQuery({ tab: t })} className="flex min-h-0 flex-col">
                <TabsList>
                  <TabsTrigger value="clients">Clients</TabsTrigger>
                  {canManage && <TabsTrigger value="team">Team</TabsTrigger>}
                  {canSeeTeam && <TabsTrigger value="referrals">Referrals</TabsTrigger>}
                </TabsList>
                <TabsContent value="clients" className="pt-4">
                  <ClientGrid
                    scope={scope}
                    onScope={(s) => setQuery({ scope: s })}
                    canSeeTeam={canSeeTeam}
                    member={member}
                    onClearMember={() => setQuery({ member: null })}
                    onOpen={(id) => openClient(id)}
                  />
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
      </div>

      {dialog === 'add' && (
        <AddClientDialog onClose={() => setDialog(null)} onCreated={(id) => openClient(id)} team={team.data ?? []} me={me} canAssign={canManage} />
      )}
      {dialog === 'share' && me && <ShareReferralDialog member={me} live={live} onClose={() => setDialog(null)} />}
      {dialog === 'offer' && (
        <CreateOfferDialog personId={personId ?? null} onClose={() => setDialog(null)}
          onCreated={(offerId, forPerson) => openClient(forPerson, { rtab: 'offers', offer: offerId })} />
      )}
    </div>
  )
}
