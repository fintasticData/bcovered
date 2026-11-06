import { useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Circle, FileUp, Loader2, PhoneCall, Search, Upload } from 'lucide-react'
import { reference } from '../lib/quote'

const claimTypes = [
  'Motor accident',
  'Vehicle theft / hijacking',
  'Burglary / theft at home',
  'Water damage (burst geyser/pipe)',
  'Storm / hail damage',
  'Power surge',
  'Lost or damaged valuables',
  'Business interruption',
]

interface Claim {
  ref: string
  policy: string
  type: string
  date: string
  description: string
  name: string
  phone: string
  files: string[]
  at: string
}

const STORE = 'bcovered_claims'
const loadClaims = (): Claim[] => JSON.parse(localStorage.getItem(STORE) ?? '[]')

const stages = ['Claim received', 'Assessor appointed', 'Assessment complete', 'Settlement approved', 'Paid']

function stageFor(claim?: Claim) {
  if (!claim) return 2
  const hours = (Date.now() - new Date(claim.at).getTime()) / 36e5
  return Math.min(4, Math.floor(hours / 24))
}

export default function ClaimsPage() {
  const [tab, setTab] = useState<'log' | 'track'>('log')
  const [form, setForm] = useState({ policy: '', type: claimTypes[0], date: '', description: '', name: '', phone: '' })
  const [files, setFiles] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<Claim | null>(null)

  const [trackRef, setTrackRef] = useState('')
  const [tracked, setTracked] = useState<{ ref: string; claim?: Claim } | null>(null)
  const [trackError, setTrackError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!/^[A-Z]{2,3}-?\d{4,}$/i.test(form.policy.trim())) errs.policy = 'Enter a policy number like BC-123456.'
    if (!form.date) errs.date = 'When did the incident happen?'
    else if (new Date(form.date) > new Date()) errs.date = 'The date can’t be in the future.'
    if (form.description.trim().length < 20) errs.description = 'Please describe what happened (at least 20 characters).'
    if (form.name.trim().length < 2) errs.name = 'Please enter your name.'
    if (!/^(\+27|0)\d{9}$/.test(form.phone.replace(/\s/g, ''))) errs.phone = 'Use a SA number, e.g. 082 123 4567.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    setTimeout(() => {
      const claim: Claim = { ...form, ref: reference('CL'), files, at: new Date().toISOString() }
      localStorage.setItem(STORE, JSON.stringify([...loadClaims(), claim]))
      setSubmitting(false)
      setSubmitted(claim)
    }, 1200)
  }

  const track = (e: FormEvent) => {
    e.preventDefault()
    const ref = trackRef.trim().toUpperCase()
    if (!ref) return setTrackError('Enter your claim reference.')
    setTrackError('')
    setTracked({ ref, claim: loadClaims().find((c) => c.ref === ref) })
  }

  return (
    <>
      <section className="bg-brand-800 py-16 text-white">
        <div className="container-x grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow mb-2 text-gold-400!">Claims</p>
            <h1 className="font-display text-5xl font-bold">We’re on your side when it counts</h1>
            <p className="mt-4 max-w-xl text-brand-100/75">
              Log a new claim online in minutes or track an existing one. Your dedicated claims handler will keep you updated every step of the way.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-gold-300"><AlertTriangle className="h-4 w-4" /> Emergency?</p>
            <p className="mt-2 text-sm text-brand-100/75">For accidents, hijackings or break-ins, call our 24/7 assist line first.</p>
            <a href="tel:0861268373" className="btn-primary mt-4"><PhoneCall className="h-4 w-4" /> 0861 268 373</a>
          </div>
        </div>
      </section>

      <section className="container-x max-w-3xl py-12">
        <div className="mb-6 inline-flex rounded-full border border-brand-800/10 bg-white p-1" role="tablist">
          {(['log', 'track'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition ${tab === t ? 'bg-brand-800 text-white' : 'text-ink/60 hover:text-brand-800'}`}
            >
              {t === 'log' ? 'Log a claim' : 'Track a claim'}
            </button>
          ))}
        </div>

        {tab === 'log' && submitted && (
          <div className="card animate-rise p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-brand-500" />
            <h2 className="mt-4 font-display text-3xl font-bold text-brand-900">Claim submitted</h2>
            <p className="mt-2 text-ink/70">Your claims handler will contact you within 4 business hours.</p>
            <p className="mt-6 inline-block rounded-2xl bg-sand px-6 py-3 font-mono text-lg font-bold text-brand-800">{submitted.ref}</p>
            <p className="mt-2 text-xs text-ink/50">Keep this reference to track your claim.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                className="btn-dark"
                onClick={() => {
                  setTab('track')
                  setTrackRef(submitted.ref)
                  setTracked({ ref: submitted.ref, claim: submitted })
                }}
              >
                Track this claim
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setSubmitted(null)
                  setForm({ policy: '', type: claimTypes[0], date: '', description: '', name: '', phone: '' })
                  setFiles([])
                }}
              >
                Log another claim
              </button>
            </div>
          </div>
        )}

        {tab === 'log' && !submitted && (
          <form onSubmit={submit} noValidate className="card animate-rise grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 sm:p-8">
            <div>
              <label htmlFor="policy" className="field-label">Policy number</label>
              <input id="policy" placeholder="BC-123456" className="field" value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value })} aria-invalid={!!errors.policy} />
              {errors.policy && <p className="field-error">{errors.policy}</p>}
            </div>
            <div>
              <label htmlFor="date" className="field-label">Date of incident</label>
              <input id="date" type="date" className="field" value={form.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-invalid={!!errors.date} />
              {errors.date && <p className="field-error">{errors.date}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="type" className="field-label">Type of claim</label>
              <select id="type" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {claimTypes.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="desc" className="field-label">What happened?</label>
              <textarea id="desc" rows={4} className="field resize-y" placeholder="Describe the incident, including where it happened and any police case number." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-invalid={!!errors.description} />
              {errors.description && <p className="field-error">{errors.description}</p>}
            </div>
            <div className="sm:col-span-2">
              <span className="field-label">Photos & documents (optional)</span>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-800/15 bg-sand p-6 text-center transition hover:border-brand-500/50">
                <Upload className="h-6 w-6 text-brand-500" />
                <span className="text-sm font-medium text-brand-900">Click to upload</span>
                <span className="text-xs text-ink/50">Photos, quotes, police reports – up to 10 files</span>
                <input type="file" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10).map((f) => f.name))} />
              </label>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {files.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-ink/70"><FileUp className="h-4 w-4 text-brand-500" /> {f}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label htmlFor="cname" className="field-label">Your name</label>
              <input id="cname" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="cphone" className="field-label">Contact number</label>
              <input id="cphone" type="tel" className="field" placeholder="082 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={!!errors.phone} />
              {errors.phone && <p className="field-error">{errors.phone}</p>}
            </div>
            <div className="flex justify-end sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit claim'}
              </button>
            </div>
          </form>
        )}

        {tab === 'track' && (
          <div className="card animate-rise p-6 sm:p-8">
            <form onSubmit={track} className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="ref" className="sr-only">Claim reference</label>
                <input id="ref" className="field" placeholder="Claim reference, e.g. CL-ABC123" value={trackRef} onChange={(e) => setTrackRef(e.target.value)} />
                {trackError && <p className="field-error">{trackError}</p>}
              </div>
              <button type="submit" className="btn-dark"><Search className="h-4 w-4" /> Track</button>
            </form>

            {tracked && (
              <div className="mt-8">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-bold text-brand-900">{tracked.ref}</p>
                    <p className="text-sm text-ink/60">{tracked.claim ? tracked.claim.type : 'Sample claim (demo data)'}</p>
                  </div>
                  <span className="rounded-full bg-gold-300/40 px-3 py-1 text-xs font-semibold text-brand-900">
                    {stages[stageFor(tracked.claim)]}
                  </span>
                </div>
                <ol className="space-y-0">
                  {stages.map((s, i) => {
                    const current = stageFor(tracked.claim)
                    const done = i <= current
                    return (
                      <li key={s} className="relative flex gap-4 pb-6 last:pb-0">
                        {i < stages.length - 1 && (
                          <span className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5 ${i < current ? 'bg-brand-500' : 'bg-brand-800/10'}`} />
                        )}
                        {done ? <CheckCircle2 className="h-6 w-6 shrink-0 text-brand-500" /> : <Circle className="h-6 w-6 shrink-0 text-ink/20" />}
                        <div>
                          <p className={`font-medium ${done ? 'text-brand-900' : 'text-ink/40'}`}>{s}</p>
                          {i === current && <p className="text-sm text-ink/60">Your handler, Lerato K., is managing this step.</p>}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
