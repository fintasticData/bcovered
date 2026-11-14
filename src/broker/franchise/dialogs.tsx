import { useState, type FormEvent } from 'react'
import { Loader2, Store, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReferralQr } from '@/components/ReferralQr'
import { franchiseApi, useFranchiseMutation, type OutletStaff, type SalesMode, type SetupReceipt } from '@/copilot/franchiseApi'
import { newKey, useTeam, type MemberRef } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { CopyButton, Dialog, ErrorText, Field, inputClass } from '../book/bits'
import { absUrl } from './shared'

function ModeChoice({ value, onChange }: { value: SalesMode; onChange: (m: SalesMode) => void }) {
  const opt = (m: SalesMode, title: string, text: string) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${value === m ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/15 bg-white'}`}>
      <input type="radio" name="sales-mode" className="mt-1" checked={value === m} onChange={() => onChange(m)} />
      <span>
        <span className="block font-semibold text-navy-900">{title}</span>
        <span className="block text-xs text-navy-600">{text}</span>
      </span>
    </label>
  )
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-1 text-xs font-semibold text-navy-700">How the outlet sells</legend>
      {opt('refer', 'Refer to broker', 'Outlet staff share the link or capture a request; the receiving broker makes the offer.')}
      {opt('sell', 'Sell at outlet', 'An authorised seller at the outlet takes the customer through to an offer.')}
    </fieldset>
  )
}

function MemberSelect({ id, value, onChange, team, me }: { id: string; value: string; onChange: (v: string) => void; team: MemberRef[]; me: MemberRef | null }) {
  const list = team.length ? team : me ? [me] : []
  return (
    <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((m) => <option key={m.member_id} value={m.member_id}>{m.name} · {m.role_label}{m.service_area ? ` · ${m.service_area}` : ''}</option>)}
    </select>
  )
}

/** The outlet's code, link, QR code and the manager's private invitation, after setup. */
export function OutletReceipt({ r }: { r: SetupReceipt }) {
  const o = r.outlet!
  const link = absUrl(o.referral_path)
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{r.summary}{r.replayed ? ' (already saved; nothing was repeated)' : ''}.</p>
      <div className="flex flex-wrap items-start gap-5">
        <ReferralQr url={link} label={`Scan to request cover through ${o.label}`} filename={`${o.referral_code}-qr`} />
        <dl className="min-w-0 flex-1 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-navy-500">Customer code</dt>
            <dd className="font-mono font-semibold text-navy-900">{o.referral_code}</dd>
          </div>
          <div>
            <dt className="text-xs text-navy-500">Customer link</dt>
            <dd className="break-all text-navy-800">{link}</dd>
            <dd className="mt-1"><CopyButton text={link} label="Copy link" /></dd>
          </div>
          {r.invite_path && (
            <div>
              <dt className="text-xs text-navy-500">Outlet manager’s private sign-in invitation</dt>
              <dd className="mt-1"><CopyButton text={absUrl(r.invite_path)} label="Copy manager invitation" /></dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

/** One step: franchisee + outlet + routing + manager. With a partner preset it adds another outlet to that franchisee. */
export function SetupFranchiseDialog({ partner, onClose, onDone }: { partner?: { id: string; name: string } | null; onClose: () => void; onDone: (outletId: string) => void }) {
  const category = useDataCategory()
  const team = useTeam(true)
  const members = (team.data ?? []).filter((m) => m.status !== 'suspended')
  const me = members.find((m) => m.is_me) ?? null
  const [key] = useState(newKey)
  const [f, setF] = useState({ partner_name: '', outlet_name: '', service_area: '', receiving: '', sales_mode: 'refer' as SalesMode, manager_name: '', manager_email: '', manager_phone: '' })
  const receiving = f.receiving || me?.member_id || members[0]?.member_id || ''
  const save = useFranchiseMutation(category, franchiseApi.setup)
  const r = save.data
  const ready = (partner || f.partner_name.trim().length >= 2) && (!partner || f.outlet_name.trim().length >= 2) && receiving
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready || save.isPending) return
    save.mutate({
      partner_name: partner ? undefined : f.partner_name.trim(), partner_id: partner?.id, outlet_name: f.outlet_name.trim() || undefined,
      service_area: f.service_area.trim() || undefined, receiving_member_id: receiving, sales_mode: f.sales_mode,
      manager_name: f.manager_name.trim() || undefined, manager_email: f.manager_email.trim() || undefined, manager_phone: f.manager_phone.trim() || undefined, key,
    })
  }
  const title = partner ? `Add an outlet to ${partner.name}` : 'Set up a franchisee'
  if (r?.outcome === 'saved' && r.outlet) {
    return (
      <Dialog title={r.created_outlet ? 'Outlet ready' : 'Outlet updated'} onClose={onClose} wide footer={<Button size="sm" onClick={() => onDone(r.outlet!.id)}>Open outlet</Button>}>
        <OutletReceipt r={r} />
      </Dialog>
    )
  }
  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="accent" type="submit" form="franchise-setup" disabled={!ready || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Store />} {partner ? 'Add outlet' : 'Set up franchisee'}
          </Button>
        </>
      }
    >
      <form id="franchise-setup" onSubmit={submit} className="space-y-4" noValidate>
        {!partner && (
          <Field label="Franchisee (partner business)" htmlFor="fs-partner" hint="An existing franchisee with this name is reopened, not duplicated.">
            <input id="fs-partner" className={inputClass} value={f.partner_name} onChange={(e) => setF({ ...f, partner_name: e.target.value })} placeholder="e.g. Benoni Motors" autoFocus />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Outlet" htmlFor="fs-outlet" hint={partner ? undefined : 'Leave blank for a single-location franchisee.'}>
            <input id="fs-outlet" className={inputClass} value={f.outlet_name} onChange={(e) => setF({ ...f, outlet_name: e.target.value })} placeholder="e.g. Benoni outlet" autoFocus={Boolean(partner)} />
          </Field>
          <Field label="Service area" htmlFor="fs-area">
            <input id="fs-area" className={inputClass} value={f.service_area} onChange={(e) => setF({ ...f, service_area: e.target.value })} placeholder="e.g. Benoni" />
          </Field>
        </div>
        <Field label="Receiving broker" htmlFor="fs-receiving" hint="New enquiries from this outlet land in this person’s work queue.">
          <MemberSelect id="fs-receiving" value={receiving} onChange={(v) => setF({ ...f, receiving: v })} team={members} me={me} />
        </Field>
        <ModeChoice value={f.sales_mode} onChange={(m) => setF({ ...f, sales_mode: m })} />
        <fieldset className="space-y-3 rounded-xl border border-navy-800/10 p-3">
          <legend className="px-1 text-xs font-semibold text-navy-700">Outlet manager (optional)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <input aria-label="Manager name" className={inputClass} value={f.manager_name} onChange={(e) => setF({ ...f, manager_name: e.target.value })} placeholder="Full name" />
            <input aria-label="Manager email" type="email" className={inputClass} value={f.manager_email} onChange={(e) => setF({ ...f, manager_email: e.target.value })} placeholder="Email for sign-in" />
            <input aria-label="Manager phone" className={inputClass} value={f.manager_phone} onChange={(e) => setF({ ...f, manager_phone: e.target.value })} placeholder="Mobile" />
          </div>
          <p className="text-[11px] text-navy-500">The manager gets referral access only: the outlet’s referrals and their progress, never client records.</p>
        </fieldset>
        {r?.outcome === 'needs_input' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{r.summary}</p>}
        <ErrorText error={save.error} />
      </form>
    </Dialog>
  )
}

export function InviteStaffDialog({ outletId, outletLabel, onClose }: { outletId: string; outletLabel: string; onClose: () => void }) {
  const category = useDataCategory()
  const [key] = useState(newKey)
  const [f, setF] = useState({ full_name: '', email: '', phone: '', outlet_role: 'staff' as 'manager' | 'staff' })
  const save = useFranchiseMutation(category, franchiseApi.inviteStaff)
  const r = save.data
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (f.full_name.trim().length < 2 || save.isPending) return
    save.mutate({ outlet_id: outletId, full_name: f.full_name.trim(), email: f.email.trim() || undefined, phone: f.phone.trim() || undefined, outlet_role: f.outlet_role, key })
  }
  if (r?.outcome === 'saved') return <StaffResult title="Outlet staff added" summary={r.summary} staff={r.staff} invitePath={r.invite_path} onClose={onClose} />
  return (
    <Dialog
      title={`Invite staff at ${outletLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="accent" type="submit" form="outlet-invite" disabled={f.full_name.trim().length < 2 || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Add and invite
          </Button>
        </>
      }
    >
      <form id="outlet-invite" onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Full name" htmlFor="oi-name"><input id="oi-name" className={inputClass} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="oi-email" hint="Needed for their sign-in invitation."><input id="oi-email" type="email" className={inputClass} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Mobile" htmlFor="oi-phone"><input id="oi-phone" className={inputClass} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <Field label="Role at the outlet" htmlFor="oi-role" hint="Managers see all of the outlet’s referrals; staff see their own.">
          <select id="oi-role" className={inputClass} value={f.outlet_role} onChange={(e) => setF({ ...f, outlet_role: e.target.value as 'manager' | 'staff' })}>
            <option value="staff">Outlet staff</option>
            <option value="manager">Outlet manager</option>
          </select>
        </Field>
        <p className="text-[11px] text-navy-500">An outlet invitation gives referral access only. To let someone sell at the outlet, authorise an existing B-Covered seller instead.</p>
        <ErrorText error={save.error} />
      </form>
    </Dialog>
  )
}

export function LinkSellerDialog({ outletId, outletLabel, linked, onClose }: { outletId: string; outletLabel: string; linked: string[]; onClose: () => void }) {
  const category = useDataCategory()
  const team = useTeam(true)
  const sellers = (team.data ?? []).filter((m) => m.invite_status === 'joined' && !linked.includes(m.member_id))
  const [key] = useState(newKey)
  const [memberId, setMemberId] = useState('')
  const chosen = memberId || sellers[0]?.member_id || ''
  const save = useFranchiseMutation(category, franchiseApi.linkSeller)
  const r = save.data
  if (r?.outcome === 'saved') return <StaffResult title="Seller authorised" summary={r.summary} staff={r.staff} invitePath={null} onClose={onClose} />
  return (
    <Dialog
      title={`Authorise a seller at ${outletLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="accent" disabled={!chosen || save.isPending} onClick={() => save.mutate({ outlet_id: outletId, member_id: chosen, key })}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Authorise
          </Button>
        </>
      }
    >
      {team.isLoading ? <p className="text-sm text-navy-600">Loading your team…</p> : sellers.length === 0 ? (
        <p className="text-sm text-navy-700">Everyone who has joined your team is already linked here. Invite the person as an agent in My workspace first; once they join, authorise them here.</p>
      ) : (
        <div className="space-y-3">
          <Field label="Team member with selling permissions" htmlFor="ls-member">
            <MemberSelect id="ls-member" value={chosen} onChange={setMemberId} team={sellers} me={null} />
          </Field>
          <p className="text-[11px] text-navy-500">They get a personal outlet code. When the outlet is set to “Sell at outlet”, enquiries under that code go straight to them; the outlet keeps the credit.</p>
          <ErrorText error={save.error} />
        </div>
      )}
    </Dialog>
  )
}

function StaffResult({ title, summary, staff, invitePath, onClose }: { title: string; summary: string; staff: OutletStaff; invitePath: string | null; onClose: () => void }) {
  const link = absUrl(staff.referral_path)
  return (
    <Dialog title={title} onClose={onClose} footer={<Button size="sm" onClick={onClose}>Done</Button>}>
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">{summary}.</p>
        <p>Personal customer link: <span className="break-all">{link}</span></p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={link} label="Copy customer link" />
          {invitePath && <CopyButton text={absUrl(invitePath)} label="Copy sign-in invitation" />}
        </div>
      </div>
    </Dialog>
  )
}
