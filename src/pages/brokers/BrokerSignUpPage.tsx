import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, MailCheck, Share2, UserPlus, Users } from 'lucide-react'
import { signUpBroker } from '@/lib/supabase/accounts'
import { useSupabaseAuth } from '@/lib/supabase/client'

const STEPS = [
  { icon: UserPlus, title: 'Create your login and brokerage', body: 'Your workspace opens straight away with Sample records so you can run the full journey.' },
  { icon: Users, title: 'Invite sub-brokers and agents', body: 'Each person gets a private team invitation and their own customer referral link.' },
  { icon: Share2, title: 'Share, offer and sell', body: 'Referral enquiries land in the right person’s grid; offers, communications and sales stay on one client record.' },
]

export default function BrokerSignUpPage() {
  const navigate = useNavigate()
  const auth = useSupabaseAuth()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', brokerage_name: '', phone: '', service_area: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const valid = form.full_name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.password.length >= 8 && form.brokerage_name.trim().length >= 2

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await signUpBroker(form)
      if (res.status === 'needs_confirmation') setConfirm(true)
      else navigate('/broker/book', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-x py-12">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="eyebrow">Brokers, sub-brokers and agents</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-brand-900 sm:text-5xl">Open your B-Covered workspace</h1>
          <p className="mt-4 max-w-xl text-lg text-ink/70">
            Sign up, share your referral link with customers and follow every client from first enquiry to a recorded sale, with Russ doing the admin.
          </p>
          <ol className="mt-8 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                  <s.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-brand-900">
                    {i + 1}. {s.title}
                  </span>
                  <span className="block text-sm text-ink/70">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-xl rounded-2xl border border-ink/10 bg-sand/60 p-4 text-sm text-ink/70">
            Live clients, offers and sales unlock once B-Covered activates your brokerage. Until then everything you capture is clearly labelled <strong>Sample</strong>.
            Need the full licensed onboarding instead? <Link to="/brokers/join" className="font-semibold text-brand-600 underline">Apply as a brokerage</Link>.
          </p>
        </div>

        <div className="card p-8">
          {confirm ? (
            <div className="space-y-3 text-center">
              <MailCheck className="mx-auto h-10 w-10 text-brand-600" />
              <h2 className="text-xl font-semibold text-brand-900">Confirm your email</h2>
              <p className="text-sm text-ink/70">
                We sent a confirmation link to <strong>{form.email}</strong>. Open it, then sign in: your workspace <strong>{form.brokerage_name}</strong> is created on
                your first sign-in.
              </p>
              <Link to="/sign-in?next=/broker/book" className="btn-dark mt-2 inline-flex">
                Go to sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <h2 className="text-xl font-semibold text-brand-900">Create your broker account</h2>
              {auth.status === 'unconfigured' && <p className="field-error">This build has no Supabase connection, so accounts cannot be created.</p>}
              <div>
                <label htmlFor="su-name" className="field-label">Your full name</label>
                <input id="su-name" className="field" value={form.full_name} onChange={set('full_name')} autoComplete="name" required />
              </div>
              <div>
                <label htmlFor="su-brokerage" className="field-label">Brokerage name</label>
                <input id="su-brokerage" className="field" value={form.brokerage_name} onChange={set('brokerage_name')} autoComplete="organization" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="su-phone" className="field-label">Mobile (optional)</label>
                  <input id="su-phone" className="field" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
                </div>
                <div>
                  <label htmlFor="su-area" className="field-label">Service area (optional)</label>
                  <input id="su-area" className="field" value={form.service_area} onChange={set('service_area')} placeholder="e.g. Benoni" />
                </div>
              </div>
              <div>
                <label htmlFor="su-email" className="field-label">Work email</label>
                <input id="su-email" type="email" className="field" value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
              <div>
                <label htmlFor="su-password" className="field-label">Password</label>
                <input id="su-password" type="password" className="field" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} required />
                <p className="mt-1 text-xs text-ink/60">At least 8 characters.</p>
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
              <button type="submit" className="btn-dark w-full" disabled={!valid || busy || auth.status === 'unconfigured'}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create account and open my workspace
              </button>
              <p className="text-center text-xs text-ink/60">
                Already have an account? <Link to="/sign-in?next=/broker/book" className="font-semibold text-brand-600 underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
