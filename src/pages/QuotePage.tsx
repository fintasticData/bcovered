import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Loader2, Lock, ShieldCheck, Star } from 'lucide-react'
import Stepper from '../components/Stepper'
import { getProduct, personalProducts, type ProductSlug } from '../data/products'
import { calculateOffers, provinces, rand, reference, type InsurerOffer, type QuoteInput } from '../lib/quote'

const STEPS = ['Cover', 'Details', 'Contact', 'Compare']

const valueLabel: Record<ProductSlug, string> = {
  car: 'Vehicle value (retail)',
  home: 'Rebuild value of your home',
  contents: 'Total value of your contents',
  business: 'Value of assets & stock',
  motorbike: 'Motorcycle value (retail)',
  valuables: 'Total value of items',
}

const defaultValue: Record<ProductSlug, number> = {
  car: 280000,
  home: 2200000,
  contents: 350000,
  business: 600000,
  motorbike: 140000,
  valuables: 45000,
}

interface Contact {
  name: string
  email: string
  phone: string
  consent: boolean
}

type Errors = Partial<Record<string, string>>

export default function QuotePage() {
  const [params] = useSearchParams()
  const preselected = getProduct(params.get('product') ?? '')?.slug
  const initial: ProductSlug = preselected ?? 'car'

  const [step, setStep] = useState(preselected ? 1 : 0)
  const [quote, setQuote] = useState<QuoteInput>({
    product: initial,
    value: defaultValue[initial],
    age: 35,
    province: 'Gauteng',
    claimsLast3Years: 0,
    excess: 'standard',
    security: true,
  })
  const [contact, setContact] = useState<Contact>({ name: '', email: '', phone: '', consent: false })
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)
  const [chosen, setChosen] = useState<{ offer: InsurerOffer; ref: string } | null>(null)

  const offers = useMemo(() => calculateOffers(quote), [quote])
  const product = getProduct(quote.product)!
  const isVehicle = quote.product === 'car' || quote.product === 'motorbike'

  useEffect(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [step, chosen])

  const selectProduct = (slug: ProductSlug) =>
    setQuote((q) => ({ ...q, product: slug, value: defaultValue[slug] }))

  const validateDetails = () => {
    const e: Errors = {}
    if (!quote.value || quote.value < 1000) e.value = 'Please enter a value of at least R1,000.'
    if (quote.value > 50_000_000) e.value = 'For values above R50m, please contact an adviser.'
    if (isVehicle && (quote.age < 18 || quote.age > 99)) e.age = 'Driver age must be between 18 and 99.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateContact = () => {
    const e: Errors = {}
    if (contact.name.trim().length < 2) e.name = 'Please enter your full name.'
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) e.email = 'Please enter a valid email address.'
    if (!/^(\+27|0)\d{9}$/.test(contact.phone.replace(/\s/g, ''))) e.phone = 'Use a SA number, e.g. 082 123 4567.'
    if (!contact.consent) e.consent = 'We need your consent to process your quote.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = (e?: FormEvent) => {
    e?.preventDefault()
    if (step === 1 && !validateDetails()) return
    if (step === 2) {
      if (!validateContact()) return
      setLoading(true)
      setTimeout(() => {
        setLoading(false)
        setStep(3)
      }, 1400)
      return
    }
    setStep((s) => s + 1)
  }

  const choose = (offer: InsurerOffer) => {
    const ref = reference('QT')
    const saved = JSON.parse(localStorage.getItem('bcovered_quotes') ?? '[]')
    saved.push({ ref, quote, contact, offer, at: new Date().toISOString() })
    localStorage.setItem('bcovered_quotes', JSON.stringify(saved))
    setChosen({ offer, ref })
  }

  if (preselected === 'business') return <Navigate to="/business/risk-review" replace />

  if (chosen) {
    return (
      <section className="container-x max-w-2xl py-20">
        <div className="card animate-rise p-10 text-center">
          <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-500">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h1 className="font-display text-3xl font-bold text-brand-900">You’re almost covered, {contact.name.split(' ')[0]}!</h1>
          <p className="mt-3 text-ink/70">
            An adviser will call you on <strong>{contact.phone}</strong> within one business hour to finalise your{' '}
            {chosen.offer.insurer} {product.name.toLowerCase()} policy.
          </p>
          <dl className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-4 rounded-2xl bg-sand p-5 text-left text-sm">
            <dt className="text-ink/60">Reference</dt>
            <dd className="font-mono font-semibold text-brand-900">{chosen.ref}</dd>
            <dt className="text-ink/60">Insurer</dt>
            <dd className="font-semibold text-brand-900">{chosen.offer.insurer}</dd>
            <dt className="text-ink/60">Monthly premium</dt>
            <dd className="font-semibold text-brand-900">{rand(chosen.offer.monthly)}</dd>
            <dt className="text-ink/60">Basic excess</dt>
            <dd className="font-semibold text-brand-900">{rand(chosen.offer.excess)}</dd>
          </dl>
          <p className="mt-6 text-xs text-ink/50">A copy has been sent to {contact.email} (demo – no email is actually sent).</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className="btn-dark">Back to home</Link>
            <button
              className="btn-ghost"
              onClick={() => {
                setChosen(null)
                setStep(0)
              }}
            >
              Quote something else
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="container-x max-w-4xl py-12 lg:py-16">
      <div className="mb-8 text-center">
        <p className="eyebrow mb-2">Free quote · 2 minutes</p>
        <h1 className="font-display text-4xl font-bold text-brand-900">Compare {step > 0 ? product.name.toLowerCase() : 'insurance'} quotes</h1>
      </div>

      <div className="card mb-6 p-4 sm:p-5">
        <Stepper steps={STEPS} current={step} />
      </div>

      {step === 0 && (
        <div className="card animate-rise p-6 sm:p-8">
          <h2 className="mb-1 text-xl font-semibold text-brand-900">What would you like to insure?</h2>
          <p className="mb-6 text-sm text-ink/60">You can add more items with your adviser later.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup">
            {personalProducts.map((p) => {
              const active = quote.product === p.slug
              return (
                <button
                  key={p.slug}
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectProduct(p.slug)}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
                    active ? 'border-brand-500 bg-brand-50' : 'border-brand-800/10 hover:border-brand-500/40'
                  }`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-700'}`}>
                    <p.icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-brand-900">{p.name}</span>
                    <span className="block text-xs text-ink/60">{p.short}</span>
                  </span>
                </button>
              )
            })}
            <Link
              to="/business/risk-review"
              className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-brand-800/15 p-4 text-left transition hover:border-brand-500/40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-900 text-gold-300">
                <Building2 className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-brand-900">Business insurance</span>
                <span className="block text-xs text-ink/60">Start a business risk review instead</span>
              </span>
            </Link>
          </div>
          <div className="mt-8 flex justify-end">
            <button onClick={() => next()} className="btn-primary">Continue <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {step === 1 && (
        <form onSubmit={next} noValidate className="card animate-rise p-6 sm:p-8">
          <h2 className="mb-1 text-xl font-semibold text-brand-900">Tell us about your {product.name.replace(' Insurance', '').toLowerCase()}</h2>
          <p className="mb-6 text-sm text-ink/60">These details help insurers price your risk accurately.</p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="value" className="field-label">{valueLabel[quote.product]}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink/50">R</span>
                <input
                  id="value"
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  step={1000}
                  className="field pl-8"
                  value={quote.value || ''}
                  onChange={(e) => setQuote({ ...quote, value: Number(e.target.value) })}
                  aria-invalid={!!errors.value}
                />
              </div>
              {errors.value && <p className="field-error">{errors.value}</p>}
            </div>

            {isVehicle && (
              <div>
                <label htmlFor="age" className="field-label">Regular driver’s age</label>
                <input
                  id="age"
                  type="number"
                  className="field"
                  value={quote.age || ''}
                  onChange={(e) => setQuote({ ...quote, age: Number(e.target.value) })}
                  aria-invalid={!!errors.age}
                />
                {errors.age && <p className="field-error">{errors.age}</p>}
              </div>
            )}

            <div>
              <label htmlFor="province" className="field-label">Province</label>
              <select
                id="province"
                className="field"
                value={quote.province}
                onChange={(e) => setQuote({ ...quote, province: e.target.value })}
              >
                {provinces.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="claims" className="field-label">Claims in the last 3 years</label>
              <select
                id="claims"
                className="field"
                value={quote.claimsLast3Years}
                onChange={(e) => setQuote({ ...quote, claimsLast3Years: Number(e.target.value) })}
              >
                {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 3 ? '3 or more' : n}</option>)}
              </select>
            </div>

            <div className={isVehicle ? '' : 'sm:col-span-2'}>
              <span className="field-label">Preferred excess</span>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'standard', 'high'] as const).map((x) => (
                  <button
                    type="button"
                    key={x}
                    aria-pressed={quote.excess === x}
                    onClick={() => setQuote({ ...quote, excess: x })}
                    className={`cursor-pointer rounded-xl border px-3 py-3 text-sm font-medium capitalize transition ${
                      quote.excess === x ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-brand-800/15 text-ink/70 hover:border-brand-500/40'
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink/50">Higher excess = lower monthly premium.</p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-800/10 bg-sand p-4 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 accent-brand-500"
                checked={quote.security}
                onChange={(e) => setQuote({ ...quote, security: e.target.checked })}
              />
              <span className="text-sm">
                <span className="font-medium text-brand-900">
                  {isVehicle ? 'Parked in a locked garage or secure complex overnight' : 'Armed response / alarm / burglar bars installed'}
                </span>
                <span className="block text-ink/60">Security measures can reduce your premium by up to 8%.</span>
              </span>
            </label>
          </div>

          <div className="mt-8 flex justify-between">
            <button type="button" onClick={() => setStep(0)} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back</button>
            <button type="submit" className="btn-primary">Continue <ArrowRight className="h-4 w-4" /></button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={next} noValidate className="card animate-rise p-6 sm:p-8">
          <h2 className="mb-1 text-xl font-semibold text-brand-900">Where should we send your quotes?</h2>
          <p className="mb-6 text-sm text-ink/60">An adviser may contact you to confirm details. We never sell your information.</p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="field-label">Full name</label>
              <input id="name" className="field" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-invalid={!!errors.name} />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="email" className="field-label">Email</label>
              <input id="email" type="email" autoComplete="email" className="field" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-invalid={!!errors.email} />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="phone" className="field-label">Mobile number</label>
              <input id="phone" type="tel" autoComplete="tel" placeholder="082 123 4567" className="field" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={!!errors.phone} />
              {errors.phone && <p className="field-error">{errors.phone}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink/70">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-500" checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} />
                I consent to BCovered processing my personal information in line with POPIA to obtain insurance quotes on my behalf.
              </label>
              {errors.consent && <p className="field-error">{errors.consent}</p>}
            </div>
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs text-ink/50"><Lock className="h-3.5 w-3.5" /> Your details are encrypted and handled confidentially.</p>

          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="btn-ghost" disabled={loading}><ArrowLeft className="h-4 w-4" /> Back</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Comparing insurers…</> : <>See my quotes <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="animate-rise space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold text-brand-900">{offers.length} quotes found</h2>
              <p className="text-sm text-ink/60">
                {product.name} · {rand(quote.value)} · {quote.province} · {quote.excess} excess
              </p>
            </div>
            <button onClick={() => setStep(1)} className="text-sm font-semibold text-brand-600 underline">Edit details</button>
          </div>

          {offers.map((o) => (
            <div
              key={o.insurer}
              className={`card relative grid items-center gap-5 p-6 sm:grid-cols-[1.3fr_1fr_auto] ${o.recommended ? 'border-2 border-gold-400 shadow-lg' : ''}`}
            >
              {o.recommended && (
                <span className="absolute -top-3 left-6 rounded-full bg-gold-400 px-3 py-1 text-xs font-bold text-brand-900">
                  Adviser’s pick – best value
                </span>
              )}
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-800 font-display text-lg font-bold text-gold-400">
                    {o.insurer[0]}
                  </span>
                  <div>
                    <p className="font-semibold text-brand-900">{o.insurer}</p>
                    <p className="flex items-center gap-1 text-xs text-ink/60">
                      <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" /> {o.rating.toFixed(1)} claims rating
                    </p>
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {o.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> {h}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-6 sm:block sm:space-y-1">
                <p>
                  <span className="font-display text-3xl font-bold text-brand-900">{rand(o.monthly)}</span>
                  <span className="text-sm text-ink/60"> /month</span>
                </p>
                <p className="text-sm text-ink/60">Excess from {rand(o.excess)}</p>
              </div>
              <button onClick={() => choose(o)} className={o.recommended ? 'btn-primary' : 'btn-dark'}>
                Select <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ))}

          <p className="pt-2 text-center text-xs text-ink/50">
            Indicative premiums only, subject to underwriting and inspection. Demo pricing – not a real offer of insurance.
          </p>
        </div>
      )}
    </section>
  )
}
