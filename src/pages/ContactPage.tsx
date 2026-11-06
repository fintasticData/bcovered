import { useState, type FormEvent } from 'react'
import { CheckCircle2, Clock, Loader2, Mail, MapPin, Phone } from 'lucide-react'
import { products } from '../data/products'

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', topic: 'New quote', time: 'Morning', message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Please enter your name.'
    if (!/^(\+27|0)\d{9}$/.test(form.phone.replace(/\s/g, ''))) errs.phone = 'Use a SA number, e.g. 082 123 4567.'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Please enter a valid email.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setState('sending')
    setTimeout(() => setState('sent'), 1000)
  }

  return (
    <section className="container-x grid grid-cols-1 gap-10 py-16 lg:grid-cols-[1fr_1.3fr] lg:py-20">
      <div className="animate-rise space-y-8">
        <div>
          <p className="eyebrow mb-2">Contact</p>
          <h1 className="font-display text-5xl font-bold text-brand-900">Talk to a real person</h1>
          <p className="mt-4 text-lg text-ink/70">Request a call back and a qualified adviser will be in touch – usually within the hour.</p>
        </div>
        <ul className="space-y-5">
          {[
            { icon: Phone, title: 'Call us', body: '0861 268 373 (0861 COVERED)' },
            { icon: Mail, title: 'Email', body: 'hello@bcovered.demo' },
            { icon: MapPin, title: 'Visit', body: '12 Demo Lane, Sandton, Johannesburg, 2196' },
            { icon: Clock, title: 'Office hours', body: 'Mon–Fri 08:00–17:00 · Sat 09:00–12:00 · Claims assist 24/7' },
          ].map((c) => (
            <li key={c.title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><c.icon className="h-5 w-5" /></span>
              <div>
                <p className="font-semibold text-brand-900">{c.title}</p>
                <p className="text-sm text-ink/60">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {state === 'sent' ? (
        <div className="card flex flex-col items-center justify-center p-10 text-center animate-rise">
          <CheckCircle2 className="h-14 w-14 text-brand-500" />
          <h2 className="mt-4 font-display text-3xl font-bold text-brand-900">Thanks, {form.name.split(' ')[0]}!</h2>
          <p className="mt-2 text-ink/70">We’ll call you on {form.phone} in the {form.time.toLowerCase()}.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="card grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 sm:p-8">
          <h2 className="text-xl font-semibold text-brand-900 sm:col-span-2">Request a call back</h2>
          <div className="sm:col-span-2">
            <label htmlFor="n" className="field-label">Full name</label>
            <input id="n" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="p" className="field-label">Mobile number</label>
            <input id="p" type="tel" className="field" placeholder="082 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={!!errors.phone} />
            {errors.phone && <p className="field-error">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="e" className="field-label">Email <span className="font-normal text-ink/40">(optional)</span></label>
            <input id="e" type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email} />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="t" className="field-label">I need help with</label>
            <select id="t" className="field" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
              <option>New quote</option>
              {products.map((p) => <option key={p.slug}>{p.name}</option>)}
              <option>An existing claim</option>
              <option>Policy changes</option>
            </select>
          </div>
          <div>
            <label htmlFor="tm" className="field-label">Best time to call</label>
            <select id="tm" className="field" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}>
              <option>Morning</option>
              <option>Afternoon</option>
              <option>Evening</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="m" className="field-label">Message <span className="font-normal text-ink/40">(optional)</span></label>
            <textarea id="m" rows={4} className="field resize-y" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={state === 'sending'}>
              {state === 'sending' ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Call me back'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
