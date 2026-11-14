import { Link } from 'react-router-dom'
import { ExternalLink, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StepResult } from '@/copilot/api'
import { referralUrl, shareText, useClientRecord, whatsappUrl, type BookGrid, type MemberRef } from '@/copilot/salesApi'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategoryBadge, CopyButton, EVENT_LABEL, KIND_LABEL, MemberLabel, OfferStatusBadge, RoleChip, StageBadge, dateTime, money, perFrequency, shortDate } from './bits'

/** A team member with their customer referral link and, after an invite, the separate private team invitation. */
export function MemberCard({ member, invitePath }: { member: MemberRef; invitePath?: string | null }) {
  const url = referralUrl(member.referral_path)
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-800/10 p-4">
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-navy-900">{member.name} <RoleChip member={member} /></p>
        {member.service_area && <p className="text-xs text-navy-600">{member.service_area}</p>}
        <p className="mt-3 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Customer referral link</p>
        <p className="font-mono text-sm break-all text-navy-900">{url}</p>
        <p className="mt-1 text-xs text-navy-500">Code <span className="font-mono font-semibold">{member.referral_code}</span>. Customers see who referred them; only a submitted enquiry creates a prospect.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={url} label="Copy referral link" variant="default" />
          <Button size="sm" variant="outline" asChild><a href={whatsappUrl(shareText(member))} target="_blank" rel="noreferrer"><MessageCircle /> Share on WhatsApp</a></Button>
          <Button size="sm" variant="outline" asChild><Link to={member.referral_path}><ExternalLink /> Open the enquiry form</Link></Button>
        </div>
      </div>
      {invitePath && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Private team invitation for {member.name.split(' ')[0]}</p>
          <p className="mt-1 text-xs">Send this to {member.name.split(' ')[0]} only. It lets them join your brokerage; it is not the customer link.</p>
          <p className="mt-2 font-mono text-xs break-all">{referralUrl(invitePath)}</p>
          <div className="mt-2"><CopyButton text={referralUrl(invitePath)} label="Copy team invitation" /></div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" asChild><Link to="/broker/book">Open my workspace</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/broker/book?tab=team">Team</Link></Button>
      </div>
    </div>
  )
}

export function GridPreview({ grid }: { grid: BookGrid }) {
  if (!grid.rows.length) return <EmptyState title="No clients match" />
  return (
    <div className="space-y-2">
      <p className="text-xs text-navy-600">
        {grid.member ? `Referred to or assigned to ${grid.member.name}` : grid.scope === 'mine' ? 'Assigned to you' : 'Team view'} · {grid.totals.offer_sent} offer sent · {grid.totals.accepted} accepted · {grid.totals.sold} sold
      </p>
      <ul className="divide-y divide-navy-800/5 rounded-xl border border-navy-800/10">
        {grid.rows.slice(0, 40).map((r) => (
          <li key={r.id} className="grid grid-cols-1 gap-1 px-3 py-2 text-sm sm:grid-cols-[1.3fr_1fr_auto]">
            <Link to={r.open_path} className="min-w-0 font-medium text-navy-900 hover:text-brand-700">
              {r.name} <span className="font-mono text-xs text-navy-500">{r.client_number}</span>
              <span className="block truncate text-xs font-normal text-navy-600">
                {r.last_communication ? `${shortDate(r.last_communication.at)} · ${KIND_LABEL[r.last_communication.kind] ?? r.last_communication.kind}: ${r.last_communication.summary}` : 'No communications yet'}
              </span>
            </Link>
            <span className="min-w-0 text-xs">
              <MemberLabel member={r.assigned} />
              {r.referred_by && <span className="block text-navy-500">Referred by {r.referred_by.name}</span>}
              {r.next_follow_up && <span className="block text-navy-500">Next: {r.next_follow_up.due_date ? shortDate(r.next_follow_up.due_date) : 'no date'}</span>}
            </span>
            <span className="flex items-start gap-1.5"><StageBadge stage={r.stage} /><CategoryBadge category={r.category} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The client a sales step touched: who referred and owns them, their offers, sale and latest communications. */
export function ClientSalesSummary({ personId }: { personId: string }) {
  const q = useClientRecord(personId)
  if (q.isLoading) return <LoadingState />
  if (q.error || !q.data) return <EmptyState title="Record unavailable">{(q.error as Error | null)?.message}</EmptyState>
  const r = q.data
  return (
    <div className="space-y-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-navy-900">
          {r.name} <span className="font-mono text-sm font-normal text-navy-500">{r.client_number}</span> <StageBadge stage={r.stage} /> <CategoryBadge category={r.category} />
        </p>
        <p className="text-xs text-navy-600">
          {r.contact_stage === 'client' ? 'Client' : 'Prospect'} · assigned to {r.assigned?.name ?? 'nobody'}{r.referred_by ? ` · referred by ${r.referred_by.name} (${r.referred_by.referral_code})` : ''}
        </p>
      </div>
      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-navy-500 uppercase">Offers</h3>
        {r.offers.length ? (
          <ul className="space-y-1.5">
            {r.offers.map((o) => (
              <li key={o.id} className="rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{o.reference}</span> {o.insurer} · {o.product.replace(/_/g, ' ')} <OfferStatusBadge status={o.status} />
                  {o.from_sample_quote && <span className="text-[10px] font-semibold text-amber-700">Sample quote</span>}</span>
                <span className="block text-xs text-navy-600">{money(o.premium_amount)} {perFrequency(o.premium_frequency)}{o.accepted_at ? ` · accepted ${shortDate(o.accepted_at)}` : ''}
                  {o.sale ? ` · sale ${o.sale.reference}, insurer ref ${o.sale.insurer_reference}, cover from ${shortDate(o.sale.cover_start_date)}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-navy-500">No offers yet.</p>}
      </section>
      <section>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-navy-500 uppercase">Latest communications</h3>
        {r.communications.length ? (
          <ul className="space-y-1.5">
            {r.communications.slice(0, 6).map((c) => (
              <li key={c.id} className="text-sm">
                <span className="text-xs text-navy-500">{dateTime(c.occurred_at)} · {KIND_LABEL[c.kind] ?? c.kind}{c.event !== 'logged' ? ` · ${EVENT_LABEL[c.event]}` : ''}{c.offer ? ` · ${c.offer.reference}` : ''}</span>
                <span className="block text-navy-900">{c.body}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-navy-500">Nothing logged yet.</p>}
      </section>
      {r.follow_ups.length > 0 && (
        <p className="text-xs text-navy-600">Next follow-up: {r.follow_ups[0].title} ({r.follow_ups[0].due_date ? shortDate(r.follow_ups[0].due_date) : 'no date'})</p>
      )}
      <Button size="sm" asChild><Link to={r.open_path}>Open in My workspace</Link></Button>
    </div>
  )
}

/** Picks the editor view for a sales step from the copilot (setup, team, referral links, grid or client). */
export function SalesStepView({ step }: { step: StepResult }) {
  const d = (step.data ?? {}) as Record<string, unknown>
  if (step.intent === 'sales_setup' || step.intent === 'sales_invite') {
    const member = d.member as MemberRef | undefined
    return member ? <MemberCard member={member} invitePath={d.invite_path as string | null | undefined} /> : null
  }
  if (step.intent === 'sales_referral_link' && d.referral_path) return <MemberCard member={d as unknown as MemberRef} />
  if (step.intent === 'sales_book' && Array.isArray(d.rows)) return <GridPreview grid={d as unknown as BookGrid} />
  const personId = step.subject?.record_type === 'client' ? step.subject.id : (d.client_id as string | undefined) ?? (d.person_id as string | undefined)
  if (personId) return <ClientSalesSummary personId={personId} />
  return null
}
