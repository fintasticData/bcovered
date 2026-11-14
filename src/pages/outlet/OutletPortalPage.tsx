import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FlaskConical, Loader2, LogIn, LogOut, MessageCircle, Send, Store } from 'lucide-react'
import { ReferralQr } from '@/components/ReferralQr'
import { outletApi, useOutletProfile, useOutletReferrals, type EnquiryStage, type OutletMembership } from '@/copilot/franchiseApi'
import { supabaseAuth, useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const COVER = ['Motor', 'Home (buildings)', 'Household contents', 'Life cover', 'Funeral cover', 'Business cover', 'Something else']
const STEPS: Array<{ stage: EnquiryStage; label: string }> = [
  { stage: 'received', label: 'Received' },
  { stage: 'contacted', label: 'Contacted' },
  { stage: 'offered', label: 'Offer sent' },
  { stage: 'sold', label: 'Sold' },
]
const ORDER: Record<EnquiryStage, number> = { received: 0, contacted: 1, offered: 2, sold: 3 }
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '')

/** The outlet portal: share the outlet's link, capture a customer's request for contact, and follow customer-facing progress. */
export default function OutletPortalPage() {
  const auth = useSupabaseAuth()
  const profile = useOutletProfile()
  const [outletId, setOutletId] = useState<string | null>(null)
  const outlets = profile.data?.outlets ?? []
  const current = outlets.find((o) => o.outlet.id === outletId) ?? outlets[0] ?? null
  useEffect(() => {
    document.title = current ? `${current.outlet.label} · B-Covered outlet` : 'Outlet portal · B-Covered'
  }, [current])

  if (auth.status !== 'signed_in') return <SignIn />
  if (profile.isLoading) return <div className="container-x grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
  if (!current) {
    return (
      <div className="container-x grid min-h-[60vh] place-items-center py-12">
        <div className="card w-full max-w-md space-y-3 p-8">
          <Store className="h-8 w-8 text-brand-600" />
          <h1 className="font-display text-2xl text-brand-900">No outlet linked to this login</h1>
          <p className="text-sm text-ink/70">Signed in as {auth.email}. Open the outlet invitation your broker sent you to link this login to your outlet.</p>
          <button type="button" className="text-sm font-semibold text-brand-600 underline" onClick={() => void supabaseAuth.signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  return (
    <div className="container-x space-y-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Outlet portal · {current.brokerage}</p>
          <h1 className="mt-2 font-display text-3xl text-brand-900">{current.outlet.label}</h1>
          <p className="mt-1 text-sm text-ink/70">
            {profile.data?.name} · {current.staff.role_label}
            {current.outlet.receiving_name ? ` · enquiries go to ${current.outlet.receiving_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {outlets.length > 1 && (
            <select aria-label="Outlet" className="field w-auto" value={current.outlet.id} onChange={(e) => setOutletId(e.target.value)}>
              {outlets.map((o) => <option key={o.outlet.id} value={o.outlet.id}>{o.outlet.label}</option>)}
            </select>
          )}
          {current.staff.can_sell && <Link to="/broker/book" className="btn-dark">Open My workspace to make offers</Link>}
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-ink" onClick={() => void supabaseAuth.signOut()}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      {current.outlet.category === 'sample' && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <FlaskConical className="h-4 w-4" /> Sample outlet: referrals here are demonstration records.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Share m={current} />
        <Capture m={current} />
      </div>
      <Referrals m={current} />
    </div>
  )
}

function SignIn() {
  const auth = useSupabaseAuth()
  const [f, setF] = useState({ email: '', password: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void supabaseAuth.signIn(f.email.trim(), f.password)
  }
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-8" noValidate>
        <p className="eyebrow">Outlet portal</p>
        <h1 className="font-display text-3xl text-brand-900">Sign in to your outlet</h1>
        <p className="text-sm text-ink/70">Share your outlet’s link and see how your referrals are progressing. First time? Open the invitation link your broker sent you.</p>
        <div>
          <label htmlFor="op-email" className="field-label">Email</label>
          <input id="op-email" type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="op-password" className="field-label">Password</label>
          <input id="op-password" type="password" className="field" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        </div>
        {auth.status === 'error' && <p className="field-error" role="alert">{auth.error}</p>}
        <button type="submit" className="btn-dark w-full" disabled={!f.email.trim() || !f.password || auth.status === 'signing_in'}>
          {auth.status === 'signing_in' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Sign in
        </button>
      </form>
    </div>
  )
}

function Share({ m }: { m: OutletMembership }) {
  const manager = m.staff.outlet_role === 'manager'
  const [which, setWhich] = useState<'mine' | 'outlet'>('mine')
  const path = which === 'outlet' ? m.outlet.referral_path : m.staff.referral_path
  const code = which === 'outlet' ? m.outlet.referral_code : m.staff.referral_code
  const url = `${window.location.origin}${path}`
  const [copied, setCopied] = useState(false)
  const text = `Need cover? Request a quote through ${m.outlet.label}: ${url}`
  return (
    <section className="card space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-brand-900">Share with a customer</h2>
        {manager && (
          <div role="radiogroup" aria-label="Which link" className="flex gap-1 rounded-full bg-sand p-1 text-xs">
            {(['mine', 'outlet'] as const).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={which === w} onClick={() => setWhich(w)}
                className={cn('cursor-pointer rounded-full px-3 py-1 font-semibold', which === w ? 'bg-white text-brand-900 shadow-sm' : 'text-ink/60')}>
                {w === 'mine' ? 'My link' : 'Outlet counter link'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <ReferralQr url={url} label={`Scan to request cover through ${m.outlet.label}`} filename={`${code}-qr`} />
        <div className="min-w-0 flex-1 space-y-3 text-sm">
          <p>Code <span className="font-mono font-semibold text-brand-900">{code}</span></p>
          <p className="break-all text-ink/70">{url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-dark" onClick={() => void navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) })}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
          <p className="text-xs text-ink/60">Customers see “{m.outlet.label}” before they submit. They can also give this code to the broker over the phone.</p>
        </div>
      </div>
    </section>
  )
}

function Capture({ m }: { m: OutletMembership }) {
  const qc = useQueryClient()
  const blank = { first_names: '', surname: '', phone: '', email: '', interest: COVER[0], message: '', consent: false }
  const [f, setF] = useState(blank)
  const [clientKey, setClientKey] = useState(() => `cap:${crypto.randomUUID()}`)
  const save = useMutation({
    mutationFn: () => outletApi.capture({ outlet_id: m.outlet.id, ...f, client_key: clientKey }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['supabase'] }),
  })
  const ready = f.first_names.trim() && f.surname.trim() && (f.phone.trim() || f.email.trim()) && f.consent
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ready && !save.isPending) save.mutate()
  }
  if (save.data?.ok) {
    return (
      <section className="card space-y-3 p-6">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        <h2 className="text-lg font-semibold text-brand-900">Request sent</h2>
        <p className="text-sm text-ink/70">
          {save.data.handler ?? 'The broker'} will contact {f.first_names.trim()} about {f.interest.toLowerCase()}. Reference <span className="font-mono font-semibold">{save.data.reference}</span>.
        </p>
        <button type="button" className="btn-dark" onClick={() => { setF(blank); setClientKey(`cap:${crypto.randomUUID()}`); save.reset() }}>Capture another</button>
      </section>
    )
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
      <h2 className="text-lg font-semibold text-brand-900">Capture a request for contact</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="oc-first" className="field-label">First name</label>
          <input id="oc-first" className="field" value={f.first_names} onChange={(e) => setF({ ...f, first_names: e.target.value })} />
        </div>
        <div>
          <label htmlFor="oc-surname" className="field-label">Surname</label>
          <input id="oc-surname" className="field" value={f.surname} onChange={(e) => setF({ ...f, surname: e.target.value })} />
        </div>
        <div>
          <label htmlFor="oc-phone" className="field-label">Mobile</label>
          <input id="oc-phone" className="field" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <label htmlFor="oc-email" className="field-label">Email</label>
          <input id="oc-email" type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor="oc-cover" className="field-label">Cover they want</label>
        <select id="oc-cover" className="field" value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })}>
          {COVER.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="oc-note" className="field-label">Note for the broker (optional)</label>
        <textarea id="oc-note" rows={2} className="field" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="e.g. Collected a 2023 Hilux today" />
      </div>
      <label className="flex items-start gap-3 text-sm text-ink/80">
        <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>The customer agreed that {m.brokerage} may contact them about insurance cover.</span>
      </label>
      {save.error && <p className="field-error" role="alert">{(save.error as Error).message}</p>}
      <button type="submit" className="btn-dark w-full" disabled={!ready || save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to the broker
      </button>
    </form>
  )
}

function Referrals({ m }: { m: OutletMembership }) {
  const q = useOutletReferrals(m.outlet.id)
  const d = q.data
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">{d?.scope === 'outlet' ? 'Outlet referrals' : 'My referrals'}</h2>
          <p className="text-sm text-ink/60">Customer-facing progress only. Offers, notes and policy documents stay with the broker.</p>
        </div>
        {d && (
          <p className="text-sm text-ink/70">
            {d.totals.received} received · {d.totals.contacted} contacted · {d.totals.offered} offered · <strong className="text-emerald-700">{d.totals.sold} sold</strong>
          </p>
        )}
      </div>
      {q.isLoading ? <Loader2 className="mt-6 h-5 w-5 animate-spin text-brand-600" /> : q.error ? (
        <p className="field-error mt-4" role="alert">{(q.error as Error).message}</p>
      ) : !d?.rows.length ? (
        <p className="mt-6 text-sm text-ink/60">No referrals yet. Share the link or capture a request above.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/5">
          {d.rows.map((r) => (
            <li key={r.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold text-brand-900">{r.customer} <span className="font-mono text-xs font-normal text-ink/50">{r.reference}</span></p>
                <p className="text-xs text-ink/60">
                  {day(r.received_at)}{r.interest ? ` · ${r.interest}` : ''}{d.scope === 'outlet' && r.referred_by ? ` · by ${r.referred_by}` : ''}
                </p>
              </div>
              <ol className="flex flex-wrap gap-1.5" aria-label={`Progress: ${r.progress}`}>
                {STEPS.map((s) => {
                  const reached = ORDER[r.stage] >= ORDER[s.stage]
                  const at = s.stage === 'received' ? r.received_at : s.stage === 'contacted' ? r.contacted_at : s.stage === 'offered' ? r.offered_at : r.sold_at
                  return (
                    <li key={s.stage} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      reached ? (s.stage === 'sold' ? 'bg-emerald-600 text-white' : 'bg-brand-500 text-white') : 'bg-sand text-ink/40')}>
                      {s.label}{reached && at ? ` · ${day(at)}` : ''}
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
