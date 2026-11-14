import { useState, type FormEvent } from 'react'
import { Link2, Loader2, MessageCircle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { newKey, referralUrl, salesApi, shareText, useFunnel, useSalesMutation, useTeam, whatsappUrl, type MemberRef, type TeamMember } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategoryBadge, CopyButton, ErrorText, Field, inputClass, money, RoleChip } from './bits'

const INVITE_LABEL: Record<TeamMember['invite_status'], { text: string; tone: string }> = {
  joined: { text: 'Joined', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  pending: { text: 'Invitation pending', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  needs_email: { text: 'Needs an email to invite', tone: 'bg-navy-50 text-navy-700 border-navy-800/10' },
  not_sent: { text: 'Not invited yet', tone: 'bg-navy-50 text-navy-700 border-navy-800/10' },
  expired: { text: 'Invitation expired', tone: 'bg-red-50 text-red-700 border-red-200' },
  revoked: { text: 'Invitation replaced', tone: 'bg-navy-50 text-navy-700 border-navy-800/10' },
  suspended: { text: 'Suspended', tone: 'bg-red-50 text-red-700 border-red-200' },
}

function InviteForm({ onInvited }: { onInvited: (r: { member: MemberRef; invite_path: string | null }) => void }) {
  const [key, setKey] = useState(newKey)
  const [f, setF] = useState({ full_name: '', email: '', phone: '', role: 'agent' as 'agent' | 'sub_broker', service_area: '' })
  const invite = useSalesMutation(salesApi.invite)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate({ ...f, key }, { onSuccess: (r) => { onInvited({ member: r.member, invite_path: r.invite_path }); setF({ ...f, full_name: '', email: '', phone: '', service_area: '' }); setKey(newKey()) } })
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-navy-800/10 bg-navy-50/40 p-4" aria-label="Invite a team member">
      <h3 className="text-sm font-semibold text-navy-900">Invite a sub-broker or agent</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" htmlFor="in-name"><input id="in-name" className={inputClass} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Role" htmlFor="in-role">
          <select id="in-role" className={inputClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'agent' | 'sub_broker' })}>
            <option value="agent">Agent</option><option value="sub_broker">Sub-broker</option>
          </select>
        </Field>
        <Field label="Email" htmlFor="in-email" hint="Their private team invitation is tied to this address."><input id="in-email" type="email" className={inputClass} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Service area" htmlFor="in-area"><input id="in-area" className={inputClass} value={f.service_area} onChange={(e) => setF({ ...f, service_area: e.target.value })} placeholder="e.g. Benoni" /></Field>
      </div>
      <Button type="submit" size="sm" variant="accent" disabled={f.full_name.trim().length < 2 || invite.isPending}>
        {invite.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite
      </Button>
      <ErrorText error={invite.error} />
    </form>
  )
}

function MemberRow({ m, canManage }: { m: TeamMember; canManage: boolean }) {
  const [invitePath, setInvitePath] = useState<string | null>(null)
  const link = useSalesMutation((c, id: string) => salesApi.inviteLink(c, id))
  const s = INVITE_LABEL[m.invite_status]
  return (
    <li className="rounded-xl border border-navy-800/10 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
            {m.name} <RoleChip member={m} /> {m.is_me && <span className="text-[11px] font-normal text-navy-500">(you)</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', s.tone)}>{s.text}</span>
          </p>
          <p className="text-xs text-navy-600">{[m.service_area, m.email, m.phone].filter(Boolean).join(' · ') || 'No contact details'} · {m.clients} assigned · {m.referrals} referred</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Customer referral code</p>
          <p className="font-mono text-sm font-semibold text-navy-900">{m.referral_code}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <CopyButton text={referralUrl(m.referral_path)} label="Copy customer referral link" />
        <Button size="sm" variant="outline" asChild>
          <a href={whatsappUrl(shareText(m))} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
        </Button>
        {canManage && !m.is_me && ['pending', 'expired', 'revoked', 'not_sent'].includes(m.invite_status) && (
          <Button size="sm" variant="ghost" disabled={link.isPending} onClick={() => link.mutate(m.member_id, { onSuccess: (r) => setInvitePath(r.invite_path) })}>
            <Link2 /> New team invitation link
          </Button>
        )}
      </div>
      {invitePath && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          Private team invitation for {m.name} (only works for {m.email}; the previous link no longer works):
          <span className="mt-1 block font-mono break-all">{referralUrl(invitePath)}</span>
          <div className="mt-1"><CopyButton text={referralUrl(invitePath)} label="Copy invitation" /></div>
        </div>
      )}
      <ErrorText error={link.error} />
    </li>
  )
}

export function TeamTab({ canManage }: { canManage: boolean }) {
  const team = useTeam()
  const [justInvited, setJustInvited] = useState<{ member: MemberRef; invite_path: string | null } | null>(null)
  if (team.isLoading) return <LoadingState label="Loading team…" />
  return (
    <div className="space-y-4">
      {canManage && <InviteForm onInvited={setJustInvited} />}
      {justInvited && (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p><strong>{justInvited.member.name}</strong> is on your team as {justInvited.member.role_label}. Two separate links:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-white p-2 ring-1 ring-emerald-200">
              <p className="text-[11px] font-semibold uppercase">Private team invitation (send to {justInvited.member.name.split(' ')[0]})</p>
              {justInvited.invite_path ? (
                <>
                  <p className="font-mono text-[11px] break-all">{referralUrl(justInvited.invite_path)}</p>
                  <CopyButton text={referralUrl(justInvited.invite_path)} label="Copy invitation" />
                </>
              ) : <p className="text-xs">Add their email to issue the invitation.</p>}
            </div>
            <div className="rounded-lg bg-white p-2 ring-1 ring-emerald-200">
              <p className="text-[11px] font-semibold uppercase">Customer referral link (for their customers)</p>
              <p className="font-mono text-[11px] break-all">{referralUrl(justInvited.member.referral_path)}</p>
              <CopyButton text={referralUrl(justInvited.member.referral_path)} label="Copy referral link" />
            </div>
          </div>
        </div>
      )}
      <ErrorText error={team.error} />
      <ul className="space-y-2">{(team.data ?? []).map((m) => <MemberRow key={m.member_id} m={m} canManage={canManage} />)}</ul>
    </div>
  )
}

export function ReferralsTab({ onOpenMember }: { onOpenMember: (m: MemberRef) => void }) {
  const category = useDataCategory()
  const funnel = useFunnel()
  if (funnel.isLoading) return <LoadingState label="Loading referrals…" />
  const rows = funnel.data?.members ?? []
  if (!rows.length) return <EmptyState title="No team members yet" />
  return (
    <div className="@container space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-xs text-navy-600">
        Which referrals became enquiries, received offers and converted to sales. <CategoryBadge category={category} />
        {category === 'live' ? 'Live totals count Live sales only.' : 'Sample totals are for demonstration.'}
      </p>
      <ul className="space-y-2 @3xl:hidden" aria-label="Referrals by team member">
        {rows.map((r) => (
          <li key={r.member_id}>
            <button type="button" onClick={() => onOpenMember(r)} className="block w-full cursor-pointer rounded-xl border border-navy-800/10 bg-white p-3 text-left text-sm active:bg-brand-50/60">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-navy-900">{r.name}</span>
                  <span className="block font-mono text-[11px] text-navy-500">{r.referral_code} · {r.role_label}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold text-navy-900 tabular-nums">{money(r.sold_premium)}</span>
                  <span className="block text-[10px] text-navy-500">monthly premium sold</span>
                </span>
              </span>
              <span className="mt-2 grid grid-cols-3 gap-2 border-t border-navy-800/5 pt-2 text-xs">
                {([['Enquiries', r.enquiries], ['Prospects', r.prospects], ['With offer', r.with_offer], ['Offers sent', r.offers_sent], ['Accepted', r.accepted], ['Sold', r.sold]] as const).map(([label, n]) => (
                  <span key={label}>
                    <span className="block text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{label}</span>
                    <span className="font-semibold text-navy-900 tabular-nums">{n}</span>
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-navy-800/10 bg-white @3xl:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
            <tr>
              <th className="px-3 py-2">Referrer</th>
              <th className="px-3 py-2 text-right">Enquiries</th>
              <th className="px-3 py-2 text-right">Prospects</th>
              <th className="px-3 py-2 text-right">With offer</th>
              <th className="px-3 py-2 text-right">Offers sent</th>
              <th className="px-3 py-2 text-right">Accepted</th>
              <th className="px-3 py-2 text-right">Sold</th>
              <th className="px-3 py-2 text-right">Monthly premium sold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/5">
            {rows.map((r) => (
              <tr key={r.member_id} className="hover:bg-brand-50/40">
                <td className="px-3 py-2">
                  <button type="button" className="cursor-pointer text-left font-medium text-navy-900 hover:text-brand-700" onClick={() => onOpenMember(r)}>{r.name}</button>
                  <span className="block font-mono text-[11px] text-navy-500">{r.referral_code} · {r.role_label}</span>
                </td>
                {[r.enquiries, r.prospects, r.with_offer, r.offers_sent, r.accepted, r.sold].map((n, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{n}</td>)}
                <td className="px-3 py-2 text-right tabular-nums">{money(r.sold_premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
