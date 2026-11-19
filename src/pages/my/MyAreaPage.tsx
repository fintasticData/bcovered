import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock,
  FileText,
  MessageSquare,
  Sparkles,
  Users,
} from 'lucide-react'
import { useConversation, useInsurerAccess, useMe, usePortal, useSendMessage, useTeam } from '@/api/hooks'
import { usePersistentConversation } from '@/api/conversations'
import { ChatPanel } from '@/components/ChatPanel'
import { ShareInvite } from '@/components/ShareInvite'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { MobilePaneSwitch, type Pane } from '@/broker/MobilePaneSwitch'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { referralUrl, shareText, useTeam as useSalesTeam } from '@/copilot/salesApi'
import { describeVehicle } from '@/server/domain/motor'
import { getAssistantAdapter } from '@/server/llm'
import { BOOK_RESTRICTED_ROLES } from '@/server/onboarding/config'
import { rand } from '@/lib/quote'
import { cn, formatDate } from '@/lib/utils'
import { BusinessCoverView } from './BusinessCoverView'
import { CustomerCoverView } from './CustomerCoverView'
import { usePerspective } from '@/lib/perspective'

const REVIEW_LABEL: Record<string, string> = {
  draft: 'Being prepared',
  comparing: 'Comparing options',
  awaiting_approval: 'With your broker for review',
  approved: 'Approved, releasing shortly',
  rejected: 'Your broker will contact you',
  expired: 'Expired',
}

function QuotesCoversCustomer() {
  const { data, isLoading, error } = usePortal()
  if (isLoading) return <LoadingState label="Loading your quotes…" />
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load your quotes'} />
  return (
    <section className="panel space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">Quotes and covers</h2>
          <p className="mt-0.5 text-xs text-navy-600">Proposals ready to compare and work still with your broker.</p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/portal">Classic portal <ArrowRight /></Link>
        </Button>
      </div>
      {data.business_profile_id && (
        <Link to="/portal/business" className="flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-50/40 p-3 transition hover:border-brand-500/60">
          <Building2 className="h-5 w-5 text-brand-700" />
          <span className="flex-1 text-sm font-medium text-navy-900">Business portal</span>
          <ArrowRight className="h-4 w-4 text-brand-500" />
        </Link>
      )}
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Ready to compare</h3>
        {data.proposals.length === 0 ? (
          <p className="text-sm text-navy-600">No proposals yet. Ask Russ what cover you need, or open Find My Cover.</p>
        ) : (
          <ul className="space-y-2">
            {data.proposals.map((p) => {
              const cheapest = Math.min(...p.options.map((o) => o.monthly_premium))
              return (
                <li key={p.quote.id}>
                  <Link to={`/portal/proposals/${p.quote.id}`} className="flex items-center gap-3 rounded-xl border border-navy-800/10 bg-white p-3 transition hover:border-brand-500/40">
                    <FileText className="h-5 w-5 text-brand-700" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
                        Motor · {describeVehicle(p.quote.risk_summary.vehicle ?? {})}
                        <SimulatedBadge />
                      </span>
                      <span className="block text-xs text-navy-600">
                        {p.options.length} options from {rand(cheapest)}/mo · approved {formatDate(p.quote.released_at)}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-500" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {data.in_review.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">In progress</h3>
          <ul className="space-y-2">
            {data.in_review.map((r) => (
              <li key={r.quote_id} className="flex items-center gap-3 rounded-xl border border-navy-800/10 bg-white p-3 text-sm">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="flex-1 text-navy-800">{humanise(r.product_category)}</span>
                <span className="text-xs font-medium text-amber-800">{REVIEW_LABEL[r.status] ?? humanise(r.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function QuotesCoversStaff() {
  return (
    <section className="panel space-y-3 p-5">
      <h2 className="text-sm font-semibold text-navy-900">Quotes and covers</h2>
      <p className="text-xs text-navy-600">Jump into the work waiting in your brokerage workspace.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ['/broker/book', 'My workspace'],
          ['/broker/approvals', 'Approvals'],
          ['/broker/leads', 'Leads'],
          ['/broker/personal', 'Personal lines'],
          ['/broker/quotes/sample-motor', 'Sample motor quote'],
        ].map(([to, label]) => (
          <Link key={to} to={to} className="flex items-center justify-between rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm font-medium text-navy-900 transition hover:border-brand-500/40">
            {label} <ArrowRight className="h-4 w-4 text-brand-500" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function BlpCard() {
  const { data: me } = useMe()
  const { data, isLoading } = useInsurerAccess()
  const org = me?.organisation
  if (!org) return null
  return (
    <section className="panel space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-navy-900">Broker Licence Plate</h2>
          <p className="mt-0.5 font-mono text-lg font-semibold tracking-wide text-navy-900">
            {org.blp_number ?? 'Not assigned'}
          </p>
          <p className="text-xs text-navy-600">
            {org.name}
            {org.fsp_number ? ` · FSP ${org.fsp_number}${org.fsp_verified ? ' (verified)' : ' (declared)'}` : ' · FSP not declared'}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/broker/settings/insurers">Codes</Link>
        </Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-navy-500">Loading insurer codes…</p>
      ) : data && data.rows.length > 0 ? (
        <ul className="space-y-1.5">
          {data.rows.slice(0, 6).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50/60 px-3 py-2 text-xs text-navy-800">
              <span>{r.insurer_name}</span>
              <span className="font-mono font-semibold">{r.intermediary_code ?? '–'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-navy-600">No insurer intermediary codes configured yet.</p>
      )}
    </section>
  )
}

function AgentsCard() {
  const { data: me } = useMe()
  const { data: team } = useTeam()
  const sales = useSalesTeam(Boolean(me?.member_role))
  const restricted = me?.member_role ? BOOK_RESTRICTED_ROLES.includes(me.member_role) : false
  const agents = (team?.members ?? []).filter((m) => m.role === 'agent' || m.role === 'sub_broker' || m.role === 'representative')
  const meSales = (sales.data ?? []).find((m) => m.is_me)

  return (
    <section className="panel space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">{restricted ? 'My relationships' : 'Broker agents'}</h2>
          <p className="mt-0.5 text-xs text-navy-600">
            {restricted
              ? 'Your referral link and the clients you handle for this brokerage.'
              : 'People who handle customer relationships for this brokerage.'}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/broker/book?tab=team"><Users /> Team</Link>
        </Button>
      </div>
      {meSales && (
        <ShareInvite
          url={referralUrl(meSales.referral_path)}
          title={`Your customer referral · ${meSales.referral_code}`}
          hint={`${meSales.clients} assigned · ${meSales.referrals} referred`}
          whatsappText={shareText(meSales)}
        />
      )}
      {!restricted && (
        <ul className="space-y-1.5 text-sm text-navy-800">
          {agents.length === 0 ? (
            <li className="text-xs text-navy-600">
              No broker agents yet.{' '}
              <Link to="/broker/book?tab=team" className="font-semibold text-brand-600 underline">
                Invite an agent or sub-broker
              </Link>
              .
            </li>
          ) : (
            agents.slice(0, 5).map((m) => (
              <li key={m.membership_id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50/60 px-3 py-2">
                <span>
                  {m.full_name}
                  <span className="block text-[11px] text-navy-500">{m.role_label}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      {team?.capabilities.includes('manage_team') && (
        <p className="text-xs text-navy-600">
          Staff invites also live under{' '}
          <Link to="/broker/settings/team" className="font-semibold text-brand-600 underline">
            Brokerage settings → Team
          </Link>
          .
        </p>
      )}
    </section>
  )
}

export default function MyAreaPage() {
  const { data: me, isLoading } = useMe()
  const [pane, setPane] = useState<Pane>('work')
  const [russOpen, setRussOpen] = useState(false)
  const { conversationId, error: startError } = usePersistentConversation('portal', 'ava')
  const { data: view } = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const perspective = usePerspective()
  const first = (me?.full_name ?? 'there').split(' ')[0]
  const isCustomer = me?.role === 'customer' || perspective === 'customer'
  const isStaff = Boolean(me?.member_role) || ['broker', 'manager', 'admin'].includes(me?.role ?? '')
  const showCustomerCover = me?.role === 'customer' || (isStaff && perspective === 'customer')
  const { data: portalHint } = usePortal()
  const showBusinessCover = showCustomerCover && Boolean(portalHint?.business_profile_id)
  const starters = isCustomer
    ? ['Show me my quotes', 'I need a new comparison', 'What is waiting with my broker?']
    : ['Open my workspace queue', 'Where is my Broker Licence Plate?', 'How do I invite a broker agent?']

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoadingState label="Opening My Area…" />
      </div>
    )
  }

  return (
    <div className="bg-mist">
      <div className="border-b border-navy-800/10 bg-white/80">
        <div className="container-x space-y-4 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> My Area
              </p>
              <h1 className="font-display text-2xl font-bold text-navy-900 sm:text-3xl">Welcome back, {first}</h1>
              <p className="mt-1 max-w-xl text-sm text-navy-600">
                What would you like to work on? Russ stays compact until you ask.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isStaff && (
                <Button size="sm" variant="accent" asChild>
                  <Link to="/broker/book">My queue</Link>
                </Button>
              )}
              {isCustomer && (
                <Button size="sm" variant="accent" asChild>
                  <Link to="/portal">Compare my quotes</Link>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => { setRussOpen(true); setPane('chat') }}>
                <MessageSquare /> Ask Russ
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/assist">Find My Cover</Link>
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isStaff ? (
              <>
                <Button size="sm" variant="outline" asChild><Link to="/broker/book">Find a customer</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to="/broker/book">Add a lead</Link></Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" asChild><Link to="/portal">My quotes</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to="/assist">Start an enquiry</Link></Button>
              </>
            )}
          </div>
        </div>
      </div>

      {(russOpen || pane === 'chat') && (
        <MobilePaneSwitch pane={pane === 'queue' ? 'work' : pane} onChange={setPane} workLabel="My Area" chatLabel="Russ" showQueue={false} />
      )}

      <div className={cn('container-x grid grid-cols-1 gap-5 py-5', russOpen && 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]')}>
        <aside className={cn('space-y-5', russOpen && pane === 'chat' && 'hidden lg:block')} aria-label="My Area">
          {showCustomerCover && (
            <>
              {isStaff && perspective === 'customer' && (
                <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900" role="status">
                  Customer preview — presentation only. Your broker permissions are unchanged.
                </p>
              )}
              {showBusinessCover ? (
                <BusinessCoverView onAskRuss={() => { setRussOpen(true); setPane('chat') }} />
              ) : (
                <CustomerCoverView onAskRuss={() => { setRussOpen(true); setPane('chat') }} />
              )}
            </>
          )}
          {!showCustomerCover && isCustomer && <QuotesCoversCustomer />}
          {!showCustomerCover && isStaff && <QuotesCoversStaff />}
          {!showCustomerCover && isStaff && <BlpCard />}
          {!showCustomerCover && isStaff && <AgentsCard />}
        </aside>

        {russOpen && (
          <div className={cn('h-[min(70vh,32rem)] min-h-[360px]', pane === 'work' && 'hidden lg:block')}>
            <ChatPanel
              title="Russ"
              subtitle="Your workspace helper · not a licensed adviser"
              messages={view?.messages ?? []}
              sending={send.isPending}
              onSend={(t) => send.mutate(t)}
              disabled={!conversationId || send.isPending}
              error={startError ?? send.error?.message ?? null}
              placeholder="Ask Russ about a quote, cover, or next step…"
              starters={starters}
              footerNote={
                getAssistantAdapter().id === 'fal'
                  ? 'Russ helps you navigate My Area. A licensed broker confirms cover and price.'
                  : 'Russ runs on the demo adapter in this build.'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
