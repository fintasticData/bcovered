import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Pause, Play, Plus, Save, ShieldCheck, Store, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReferralQr } from '@/components/ReferralQr'
import { franchiseApi, useFranchiseList, useFranchiseMutation, useOutletDetail, type OutletDetail, type OutletStaff, type SalesMode } from '@/copilot/franchiseApi'
import { newKey } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategoryBadge, CopyButton, ErrorText, MemberLabel, inputClass } from '../book/bits'
import { InviteStaffDialog, LinkSellerDialog } from './dialogs'
import { absUrl, outletShareText, waShare } from './shared'

/** Franchisees and their outlets in the workspace category. */
export function FranchiseesTab({ onOpenOutlet, onAddOutlet, onSetup }: {
  onOpenOutlet: (outletId: string) => void
  onAddOutlet: (partner: { id: string; name: string }) => void
  onSetup: () => void
}) {
  const category = useDataCategory()
  const q = useFranchiseList(category)
  if (q.isLoading) return <LoadingState label="Loading franchisees…" />
  if (q.error) return <ErrorText error={q.error} />
  const d = q.data!
  if (!d.partners.length) {
    return (
      <EmptyState title="No franchisees yet">
        <span className="block">Set up a franchisee and its outlet to give the outlet a customer code, a shareable link and a QR code.</span>
        {d.can_manage && <Button size="sm" variant="accent" className="mt-3" onClick={onSetup}><Store /> Set up franchisee</Button>}
      </EmptyState>
    )
  }
  return (
    <div className="space-y-4">
      {d.partners.map((p) => (
        <section key={p.id} className="rounded-xl border border-navy-800/10 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800/10 px-3 py-2">
            <div>
              <h3 className="text-sm font-semibold text-navy-900">{p.name}</h3>
              <p className="text-[11px] text-navy-500">{p.outlets.length} outlet{p.outlets.length === 1 ? '' : 's'}{p.status === 'paused' ? ' · paused' : ''}</p>
            </div>
            {d.can_manage && <Button size="sm" variant="outline" onClick={() => onAddOutlet({ id: p.id, name: p.name })}><Plus /> Add outlet</Button>}
          </header>
          <ul className="divide-y divide-navy-800/5">
            {p.outlets.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onOpenOutlet(o.id)} className="grid w-full cursor-pointer gap-1 px-3 py-2.5 text-left hover:bg-brand-50/40 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center">
                  <span>
                    <span className="block font-medium text-navy-900">{o.name}</span>
                    <span className="block text-[11px] text-navy-500">{o.service_area ?? 'No area'} · <span className="font-mono">{o.referral_code}</span></span>
                  </span>
                  <span className="text-xs text-navy-700">{o.sales_mode_label}{o.status === 'paused' ? ' · paused' : ''}</span>
                  <span className="text-xs text-navy-700">To {o.receiving?.name ?? 'nobody'}</span>
                  <span className="text-xs text-navy-600">{o.enquiries} enquiries · {o.sold} sold · {o.staff} staff</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** One outlet: share link and QR code, routing, sales mode and the people at the outlet. */
export function OutletPanel({ outletId, showQr, onBack, onOpenEnquiries }: { outletId: string; showQr: boolean; onBack: () => void; onOpenEnquiries: () => void }) {
  const category = useDataCategory()
  const q = useOutletDetail(category, outletId)
  const qrRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (showQr && q.data) qrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [showQr, q.data])
  if (q.isLoading) return <LoadingState label="Opening outlet…" />
  if (q.error) return <div className="space-y-3"><Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft /> Franchisees</Button><ErrorText error={q.error} /></div>
  const o = q.data!
  const link = absUrl(o.referral_path)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2"><ArrowLeft /> Franchisees</Button>
          <h2 className="mt-1 text-lg font-semibold text-navy-900">{o.label}</h2>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-navy-600">
            {o.service_area ?? 'No service area'} · {o.sales_mode_label}{o.status === 'paused' ? ' · paused' : ''} <CategoryBadge category={o.category} />
          </p>
        </div>
        <button type="button" onClick={onOpenEnquiries} className="cursor-pointer rounded-xl border border-navy-800/10 bg-white px-3 py-2 text-left text-xs text-navy-700 hover:border-brand-500">
          <span className="block font-semibold text-navy-900">{o.counts.enquiries} enquiries</span>
          {o.counts.contacted} contacted · {o.counts.offered} offered · {o.counts.sold} sold
        </button>
      </div>

      <section ref={qrRef} className={cn('rounded-xl border bg-white p-4', showQr ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-navy-800/10')}>
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-navy-500 uppercase">Customer link and QR code</h3>
        <div className="flex flex-wrap items-start gap-5">
          <ReferralQr url={link} label={`Scan to request cover through ${o.label}`} filename={`${o.referral_code}-qr`} />
          <div className="min-w-0 flex-1 space-y-3 text-sm">
            <p>Code <span className="font-mono font-semibold text-navy-900">{o.referral_code}</span></p>
            <p className="break-all text-navy-700">{link}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={link} label="Copy link" />
              <Button size="sm" variant="outline" asChild>
                <a href={waShare(outletShareText(o.label, o.referral_path))} target="_blank" rel="noreferrer"><MessageCircle /> Share on WhatsApp</a>
              </Button>
            </div>
            <p className="text-[11px] text-navy-500">Customers see “{o.label}” before they submit. A customer can also give the code to a broker over the phone. Each staff member below has a personal code that credits this outlet.</p>
          </div>
        </div>
      </section>

      {o.can_manage && <Routing o={o} />}

      <Staff o={o} />
    </div>
  )
}

function Routing({ o }: { o: OutletDetail }) {
  const category = useDataCategory()
  const [key, setKey] = useState(newKey)
  const [receiving, setReceiving] = useState(o.receiving?.member_id ?? '')
  const [mode, setMode] = useState<SalesMode>(o.sales_mode)
  const save = useFranchiseMutation(category, franchiseApi.updateOutlet)
  const dirty = receiving !== (o.receiving?.member_id ?? '') || mode !== o.sales_mode
  const run = (extra: { status?: 'active' | 'paused' } = {}) => {
    save.mutate({ outlet_id: o.id, receiving_member_id: receiving || undefined, sales_mode: mode, key, ...extra }, { onSuccess: () => setKey(newKey()) })
  }
  return (
    <section className="space-y-3 rounded-xl border border-navy-800/10 bg-white p-4">
      <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Routing</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-navy-700">
          Receiving broker
          <select className={cn(inputClass, 'mt-1')} value={receiving} onChange={(e) => setReceiving(e.target.value)}>
            {o.team.map((m) => <option key={m.member_id} value={m.member_id}>{m.name} · {m.role_label}</option>)}
          </select>
        </label>
        <div className="text-xs font-semibold text-navy-700">
          How the outlet sells
          <div role="radiogroup" aria-label="How the outlet sells" className="mt-1 inline-flex w-full gap-0.5 rounded-xl bg-navy-100/70 p-0.5">
            {(['refer', 'sell'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={cn('flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold', mode === m ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600')}>
                {m === 'refer' ? 'Refer to broker' : 'Sell at outlet'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-navy-500">
        {mode === 'sell'
          ? 'Enquiries under an authorised seller’s outlet code go to that seller. The outlet code and referral-only staff codes still go to the receiving broker.'
          : 'Every enquiry from this outlet goes to the receiving broker. Changing routing never moves credit for enquiries already received.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => run()}><Save /> Save routing</Button>
        <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => run({ status: o.status === 'paused' ? 'active' : 'paused' })}>
          {o.status === 'paused' ? <><Play /> Reopen outlet</> : <><Pause /> Pause outlet</>}
        </Button>
      </div>
      {save.data?.outcome === 'saved' && <p className="text-xs text-emerald-700">{save.data.summary}.</p>}
      <ErrorText error={save.error} />
    </section>
  )
}

const INVITE_LABEL: Record<OutletStaff['invite_status'], string> = {
  joined: 'Signed in', pending: 'Invitation sent', needs_email: 'Needs an email', not_sent: 'Not invited', expired: 'Invitation expired', revoked: 'Invitation replaced', suspended: 'Suspended',
}

function Staff({ o }: { o: OutletDetail }) {
  const category = useDataCategory()
  const [dialog, setDialog] = useState<null | 'invite' | 'seller'>(null)
  const link = useFranchiseMutation(category, (c, staffId: string) => franchiseApi.staffInviteLink(c, staffId))
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">People at this outlet</h3>
        {o.can_manage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog('invite')}><UserPlus /> Invite staff</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('seller')}><ShieldCheck /> Authorise seller</Button>
          </div>
        )}
      </div>
      {o.staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-navy-800/15 px-3 py-4 text-sm text-navy-600">No outlet staff yet. Invite the outlet manager so they can follow their referrals.</p>
      ) : (
        <ul className="divide-y divide-navy-800/5 rounded-xl border border-navy-800/10 bg-white">
          {o.staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-navy-900">{s.name}</span>
                  <span className="rounded-full bg-navy-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">{s.role_label}</span>
                  {s.can_sell && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Can sell</span>}
                </span>
                <span className="block text-[11px] text-navy-500">
                  <span className="font-mono">{s.referral_code}</span> · {INVITE_LABEL[s.invite_status]} · {s.referrals ?? 0} referrals
                  {s.seller && <> · seller profile <MemberLabel member={s.seller} /></>}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                <CopyButton text={absUrl(s.referral_path)} label="Copy link" />
                {o.can_manage && !s.user_id && s.email && (
                  <Button size="sm" variant="ghost" disabled={link.isPending}
                    onClick={() => link.mutate(s.id, { onSuccess: (r) => void navigator.clipboard?.writeText(absUrl(r.invite_path)) })}>
                    {link.isPending && link.variables === s.id ? 'Copying…' : link.isSuccess && link.variables === s.id ? 'Invitation copied' : 'Copy new invitation'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={link.error} />
      {dialog === 'invite' && <InviteStaffDialog outletId={o.id} outletLabel={o.label} onClose={() => setDialog(null)} />}
      {dialog === 'seller' && <LinkSellerDialog outletId={o.id} outletLabel={o.label} linked={o.staff.flatMap((s) => (s.seller ? [s.seller.member_id] : []))} onClose={() => setDialog(null)} />}
    </section>
  )
}
