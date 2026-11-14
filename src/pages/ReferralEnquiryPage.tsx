import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, FlaskConical, Loader2, Send, ShieldCheck, UserRound } from 'lucide-react'
import { referralApi } from '@/copilot/salesApi'

const COVER = ['Motor', 'Home (buildings)', 'Household contents', 'Life cover', 'Funeral cover', 'Business cover', 'Something else']

/**
 * The customer's enquiry form behind a referral link (/r/CODE) or with a code they type (/enquire). Opening or forwarding
 * the link stores nothing; only a submitted enquiry creates a prospect for the referring person.
 */
export default function ReferralEnquiryPage() {
  const { code: routeCode } = useParams()
  const [params] = useSearchParams()
  const fromLink = Boolean(routeCode)
  const category = params.get('mode') === 'sample' ? 'sample' : 'live'
  const [codeInput, setCodeInput] = useState((routeCode ?? params.get('code') ?? '').toUpperCase())
  const [code, setCode] = useState(codeInput.trim())
  const [clientKey] = useState(() => `${fromLink ? 'link' : 'code'}:${crypto.randomUUID()}`)
  const [f, setF] = useState({ first_names: '', surname: '', phone: '', email: '', interest: COVER[0], message: '', consent: false })

  const referral = useQuery({ queryKey: ['referral', code], queryFn: () => referralApi.resolve(code), enabled: code.length >= 6, retry: false })
  const r = referral.data
  const submit = useMutation({
    mutationFn: () => referralApi.submit({ code: r!.code, ...f, client_key: clientKey, category }),
  })
  // A franchise outlet code: the customer sees the outlet, and its enquiries follow the outlet's Sample or Live setting.
  const outlet = Boolean(r?.valid && r.kind === 'outlet')
  const via = outlet ? r!.outlet_label : r?.referrer_name
  const effective = outlet && r?.category ? r.category : category
  useEffect(() => {
    document.title = r?.valid ? `Enquiry for ${via} · B-Covered` : 'Send an enquiry · B-Covered'
  }, [r?.valid, via])

  const accepting = Boolean(r?.valid && (effective === 'sample' || r.live_accepting))
  const ready = accepting && f.first_names.trim() && f.surname.trim() && (f.phone.trim() || f.email.trim()) && f.consent
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (ready && !submit.isPending) submit.mutate()
  }

  if (submit.data?.ok) {
    return (
      <div className="container-x grid min-h-[70vh] place-items-center py-12">
        <div className="card w-full max-w-md p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 font-display text-3xl text-brand-900">Thank you, {f.first_names.trim()}</h1>
          <p className="mt-2 text-ink/70">
            {submit.data.outlet_label
              ? `${submit.data.brokerage} has your enquiry from ${submit.data.outlet_label} and will contact you about ${f.interest.toLowerCase()}.`
              : `${submit.data.referrer_name} at ${submit.data.brokerage} has your enquiry and will contact you about ${f.interest.toLowerCase()}.`}
          </p>
          <p className="mt-4 text-sm text-ink/60">Your reference: <span className="font-mono font-semibold text-brand-900">{submit.data.reference}</span></p>
          {submit.data.category === 'sample' && <p className="mt-3 text-xs font-semibold text-amber-700">Sample enquiry: for demonstration only.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="container-x py-12">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow">Get covered</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-brand-900">Tell us what you need covered</h1>
          <p className="mt-4 text-lg text-ink/70">Send your details and the person who referred you will come back to you with options. There is no obligation.</p>
          {r?.valid && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-brand-500/20 bg-brand-50 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-white"><UserRound className="h-5 w-5" /></span>
              <span>
                <span className="block text-sm text-ink/60">Referred by</span>
                <span className="block text-lg font-semibold text-brand-900">{via}</span>
                <span className="block text-sm text-ink/70">
                  {outlet && r.referrer_name ? `${r.referrer_name} · ` : ''}{r.role_label} · {r.brokerage}
                </span>
              </span>
            </div>
          )}
          {effective === 'sample' && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <FlaskConical className="h-4 w-4" /> Sample link: enquiries sent here are demonstration records.
            </p>
          )}
          <p className="mt-6 flex items-start gap-2 text-sm text-ink/60">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> Your details go only to the referring adviser&rsquo;s brokerage, to contact you about this enquiry.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6 sm:p-8" noValidate>
          <div>
            <label htmlFor="re-code" className="field-label">Referral code</label>
            <div className="flex gap-2">
              <input id="re-code" className="field font-mono uppercase" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onBlur={() => setCode(codeInput.trim())} placeholder="e.g. LERATO-QSA4" aria-describedby="re-code-help" />
              <button type="button" className="btn-dark shrink-0" onClick={() => setCode(codeInput.trim())} disabled={codeInput.trim().length < 6}>Check</button>
            </div>
            <p id="re-code-help" className="mt-1 text-xs" role="status">
              {referral.isFetching ? <span className="text-ink/60">Checking…</span>
                : r?.valid ? <span className="font-semibold text-emerald-700">Code accepted: {via}, {r.brokerage}</span>
                : r && !r.valid ? <span className="font-semibold text-red-700">{r.reason} Correct the code to continue.</span>
                : <span className="text-ink/60">Enter the code your adviser gave you. No code? <Link to="/contact" className="underline">Contact us</Link> instead.</span>}
            </p>
            {r?.valid && effective === 'live' && !r.live_accepting && (
              <p className="mt-1 text-xs font-semibold text-amber-700">{r.brokerage} is not accepting online enquiries yet. Please contact {via} directly.</p>
            )}
          </div>
          <fieldset disabled={!accepting} className="space-y-4 disabled:opacity-60">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="re-first" className="field-label">First name</label>
                <input id="re-first" className="field" value={f.first_names} onChange={(e) => setF({ ...f, first_names: e.target.value })} autoComplete="given-name" required />
              </div>
              <div>
                <label htmlFor="re-surname" className="field-label">Surname</label>
                <input id="re-surname" className="field" value={f.surname} onChange={(e) => setF({ ...f, surname: e.target.value })} autoComplete="family-name" required />
              </div>
              <div>
                <label htmlFor="re-phone" className="field-label">Mobile</label>
                <input id="re-phone" className="field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" inputMode="tel" />
              </div>
              <div>
                <label htmlFor="re-email" className="field-label">Email</label>
                <input id="re-email" type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
              </div>
            </div>
            <p className="-mt-2 text-xs text-ink/60">A mobile number or an email address is enough.</p>
            <div>
              <label htmlFor="re-cover" className="field-label">What would you like covered?</label>
              <select id="re-cover" className="field" value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })}>
                {COVER.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="re-message" className="field-label">Anything else (optional)</label>
              <textarea id="re-message" rows={3} className="field" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="e.g. 2021 VW Polo, cover from next month" />
            </div>
            <label className="flex items-start gap-3 text-sm text-ink/80">
              <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
              <span>I agree that {r?.valid ? (outlet ? `${r.brokerage} (through ${via})` : `${r.referrer_name} at ${r.brokerage}`) : 'the referring adviser'} may use these details to contact me about insurance cover, as described in the <Link to="/legal" className="underline">privacy notice</Link>.</span>
            </label>
          </fieldset>
          {submit.error && <p className="field-error" role="alert">{(submit.error as Error).message}</p>}
          <button type="submit" className="btn-dark w-full" disabled={!ready || submit.isPending}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send my enquiry
          </button>
        </form>
      </div>
    </div>
  )
}
