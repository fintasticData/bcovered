import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, ClipboardCheck, FileCheck2, Sparkles, Upload, Users } from 'lucide-react'
import { useMe, useStartApplication } from '@/api/hooks'
import { NotAuthorisation } from '@/onboarding/ui'
import { BROKERAGE_TYPES } from '@/server/onboarding/config'
import type { BrokerageType } from '@/server/db/onboardingSchema'
import { AuthForm } from '../auth/SignInPage'

const STEPS = [
  { icon: Building2, title: 'Tell us about your brokerage', body: 'Organisation, FSP details, team and the product modules you want. Drafts save as you go.' },
  { icon: Upload, title: 'Upload supporting documents', body: 'Russ reads labelled details from your documents and suggests values; you confirm each one.' },
  { icon: ClipboardCheck, title: 'B-Covered reviews', body: 'A reviewer checks each item, asks for anything missing and approves your application.' },
  { icon: FileCheck2, title: 'Activate and start', body: 'Activation is a separate step. Then import your client book and enable insurers one by one.' },
]

export default function JoinPage() {
  const { data: me } = useMe()
  const start = useStartApplication()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState<BrokerageType | ''>('')
  const signedIn = Boolean(me)
  const isCustomer = me?.role === 'customer'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    start.mutate({ brokerage_name: name, brokerage_type: type || null }, { onSuccess: () => navigate('/onboarding') })
  }

  return (
    <div className="container-x py-12">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="eyebrow">For independent brokerages</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-brand-900 sm:text-5xl">Join B-Covered as a broker</h1>
          <p className="mt-4 max-w-xl text-lg text-ink/70">
            Bring your brokerage, your team and your existing client book onto one platform, with Russ helping you set up and run it.
            Each brokerage gets its own private workspace.
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
          <NotAuthorisation className="mt-8 max-w-xl" />
          <p className="mt-4 flex items-center gap-2 text-sm text-ink/70">
            <Users className="h-4 w-4 text-brand-600" /> Invited by B-Covered? Open the link in your invitation email instead.
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900">
            <Sparkles className="h-5 w-5 text-gold-500" /> Start your application
          </h2>
          {!signedIn ? (
            <>
              <p className="mt-1 mb-5 text-sm text-ink/70">Create an account first. You can leave at any point and resume later.</p>
              <AuthForm defaultMode="sign_up" onDone={() => undefined} />
            </>
          ) : isCustomer ? (
            <p className="mt-3 text-sm text-ink/70">You are signed in with a customer portal identity. Switch to “Public visitor” or sign out to apply as a brokerage.</p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <p className="text-sm text-ink/70">
                Signed in as <strong>{me?.full_name}</strong>. If you already started an application, we’ll take you back to it.
              </p>
              <div>
                <label htmlFor="join-name" className="field-label">Brokerage trading name</label>
                <input id="join-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="join-type" className="field-label">Brokerage type</label>
                <select id="join-type" className="field" value={type} onChange={(e) => setType(e.target.value as BrokerageType | '')}>
                  <option value="">Choose later</option>
                  {BROKERAGE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink/60">The documents we ask for depend on your type and the product modules you choose.</p>
              </div>
              {start.error && <p className="field-error" role="alert">{start.error.message}</p>}
              <button type="submit" className="btn-primary w-full" disabled={start.isPending}>
                Start or resume application <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-center text-xs text-ink/50">
                Submitting an application does not give production access. <Link to="/help" className="underline">How onboarding works</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
