import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Clock,
  HandCoins,
  Headphones,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react'
import { insurers, products, type ProductSlug } from '../data/products'
import { rand } from '../lib/quote'

const steps = [
  { title: 'Tell Ava what you need', body: 'Describe it in your own words. Ava asks only for what’s missing and asks consent first.' },
  { title: 'Agents do the work', body: 'Specialist AI agents create your profile, check the risk details and compare options from our panel.' },
  { title: 'A broker approves', body: 'A licensed broker reviews every comparison before it reaches you. Nothing is released automatically.' },
  { title: 'You compare clearly', body: 'Side-by-side options appear in your portal, with excesses, benefits and conditions explained.' },
]

const reasons = [
  { icon: Scale, title: 'Independent advice', body: 'We work for you, not the insurer – so our advice is unbiased.' },
  { icon: HandCoins, title: 'Save up to 25%', body: 'Comparing 8+ insurers means you rarely overpay for cover.' },
  { icon: Headphones, title: 'Claims champions', body: 'A dedicated claims team negotiates on your behalf.' },
  { icon: Clock, title: 'Annual reviews', body: 'We re-shop your cover each year to keep it competitive.' },
]

const testimonials = [
  { name: 'Thandi M.', place: 'Pretoria', quote: 'My geyser burst on a Sunday. BCovered had an assessor out by Monday and the claim was paid within a week.' },
  { name: 'Johan v.d. Merwe', place: 'Stellenbosch', quote: 'Moved my car and home cover over and saved R870 a month without losing any benefits.' },
  { name: 'Priya N.', place: 'Durban', quote: 'Finally a broker who explains the fine print. I actually understand my policy now.' },
]

const faqs = [
  { q: 'Does using a broker cost more?', a: 'No. Brokers are paid a regulated commission by the insurer, which is already built into the premium. You pay the same – often less – with expert advice included.' },
  { q: 'What is short-term insurance?', a: 'Short-term (non-life) insurance covers your possessions and liabilities – cars, homes, contents, businesses and valuables – usually on a monthly or annual basis.' },
  { q: 'How quickly can I be covered?', a: 'Most policies can be activated the same day once you accept a quote and complete any required inspections.' },
  { q: 'Will you help me if I need to claim?', a: 'Absolutely. Our claims team handles the process end-to-end and negotiates with the insurer to make sure you are treated fairly.' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const [pick, setPick] = useState<ProductSlug>('car')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-gold-300/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-brand-200/40 blur-3xl" aria-hidden />

        <div className="container-x relative grid grid-cols-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="animate-rise space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-800/10 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700">
              <BadgeCheck className="h-4 w-4 text-brand-500" /> Independent brokerage · AI agents · human approval
            </span>
            <h1 className="font-display text-5xl leading-[1.05] font-bold tracking-tight text-navy-900 sm:text-6xl">
              Insurance that works for you.
              <br />
              <span className="text-brand-500">Intelligence that works behind the scenes.</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-ink/70">
              Compare cover, manage policies and get help when it matters – with intelligent assistance and experienced brokers.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/assist" className="btn-primary">
                Find My Cover <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className="btn-ghost">See How It Works</a>
            </div>

            <div className="card max-w-xl p-3 shadow-lg">
              <p className="px-2 pb-2 pt-1 text-sm font-medium text-ink/70">What would you like to insure?</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {products.map((p) => (
                  <button
                    key={p.slug}
                    onClick={() => setPick(p.slug)}
                    aria-pressed={pick === p.slug}
                    className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition ${
                      pick === p.slug
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-transparent text-ink/60 hover:bg-brand-50/60'
                    }`}
                  >
                    <p.icon className="h-5 w-5" />
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => navigate(pick === 'car' ? '/assist' : `/quote?product=${pick}`)}
                className="btn-dark mt-3 w-full"
              >
                {pick === 'car' ? 'Start with Ava' : 'Compare quotes'} <ArrowRight className="h-4 w-4" />
              </button>
              <p className="px-2 pt-2 text-center text-[11px] text-ink/50">
                Motor runs through Ava’s AI-assisted assessment in this demo; other cover uses the quote form.
              </p>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <img
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1100&q=70"
              alt="An adviser helping a client"
              className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-2xl"
            />
            <div className="card absolute -left-10 bottom-10 w-72 space-y-2.5 p-4 shadow-xl animate-rise">
              <p className="flex items-center gap-2 text-xs font-semibold text-navy-900">
                <Sparkles className="h-4 w-4 text-brand-500" /> Agent activity
              </p>
              {['Lead Agent · Customer profile created', 'Risk Agent · Risk assessment completed', 'Quote Agent · 3 simulated options prepared'].map((t) => (
                <p key={t} className="flex items-center gap-2 text-xs text-ink/70">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> {t}
                </p>
              ))}
              <p className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <Clock className="h-3.5 w-3.5 shrink-0" /> Approval Engine · Waiting for broker approval
              </p>
            </div>
            <div className="card absolute -right-4 top-10 p-4 shadow-xl">
              <p className="text-xs text-ink/60">Example simulated option</p>
              <p className="font-display text-xl font-bold text-brand-800">{rand(1090)} / month</p>
              <p className="text-[11px] text-ink/50">Illustrative demo figure</p>
            </div>
          </div>
        </div>
      </section>

      {/* Insurer strip */}
      <section className="border-y border-brand-800/10 bg-white py-8">
        <div className="container-x">
          <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">
            We compare cover from
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {insurers.map((i) => (
              <span key={i} className="font-display text-lg font-semibold text-ink/35">{i}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="container-x py-20">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow mb-2">Our cover</p>
            <h2 className="font-display text-4xl font-bold text-brand-900">Insurance for everything that matters</h2>
          </div>
          <Link to="/quote" className="btn-ghost self-start md:self-auto">Start a quote <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Link
              key={p.slug}
              to={`/insurance/${p.slug}`}
              className="card group flex flex-col p-7 transition hover:-translate-y-1 hover:shadow-xl"
            >
              <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-gold-400 group-hover:text-brand-900">
                <p.icon className="h-6 w-6" />
              </span>
              <h3 className="text-lg font-semibold text-brand-900">{p.name}</h3>
              <p className="mt-1 flex-1 text-sm text-ink/60">{p.short}</p>
              <div className="mt-6 flex items-center justify-between border-t border-brand-800/10 pt-4">
                <span className="text-sm text-ink/60">From <strong className="text-brand-800">{rand(p.fromPrice)}</strong> pm</span>
                <ArrowRight className="h-4 w-4 text-brand-500 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 bg-navy-800 py-20 text-white">
        <div className="container-x">
          <p className="eyebrow mb-2 text-brand-200!">How it works</p>
          <h2 className="mb-4 max-w-2xl font-display text-4xl font-bold">One conversation starts the whole brokerage</h2>
          <p className="mb-12 max-w-2xl text-sm text-navy-100/80">
            Agents do the administration. Licensed brokers make the decisions. Every step is recorded and visible.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-3xl border border-white/10 bg-white/5 p-7">
                <span className="font-display text-5xl font-bold text-brand-200">0{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-100/70">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="container-x grid grid-cols-1 gap-12 py-20 lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Why a broker?</p>
          <h2 className="font-display text-4xl font-bold text-brand-900">One adviser. Every insurer. Zero bias.</h2>
          <p className="mt-4 max-w-md text-ink/70">
            Going direct means you only see one insurer’s price. With BCovered you get a qualified adviser who compares the market and stays with you for the life of your policy.
          </p>
          <Link to="/about" className="btn-dark mt-8">Meet the team</Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {reasons.map((r) => (
            <div key={r.title} className="card p-6">
              <r.icon className="h-7 w-7 text-brand-500" />
              <h3 className="mt-4 font-semibold text-brand-900">{r.title}</h3>
              <p className="mt-1 text-sm text-ink/60">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white py-20">
        <div className="container-x">
          <p className="eyebrow mb-2 text-center">Client stories</p>
          <h2 className="text-center font-display text-4xl font-bold text-brand-900">What clients could say</h2>
          <p className="mb-12 mt-2 text-center text-xs font-semibold tracking-wide text-ink/50 uppercase">Fictional demo examples, not real reviews</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure key={t.name} className="rounded-3xl bg-sand p-7">
                <div className="mb-4 flex text-gold-500">
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                </div>
                <blockquote className="leading-relaxed text-ink/80">“{t.quote}”</blockquote>
                <figcaption className="mt-5 text-sm">
                  <strong className="text-brand-900">{t.name}</strong>
                  <span className="text-ink/50"> · {t.place}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-x grid grid-cols-1 gap-12 py-20 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow mb-2">FAQ</p>
          <h2 className="font-display text-4xl font-bold text-brand-900">Questions, answered</h2>
          <p className="mt-4 text-ink/70">Can’t find what you’re looking for? <Link to="/contact" className="font-semibold text-brand-600 underline">Talk to an adviser</Link>.</p>
        </div>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={f.q} className="card overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
                className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left font-semibold text-brand-900"
              >
                {f.q}
                <ChevronDown className={`h-5 w-5 shrink-0 text-brand-500 transition ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <p className="px-5 pb-5 text-sm leading-relaxed text-ink/70">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-x pb-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-gold-400 px-8 py-14 text-center sm:px-16">
          <h2 className="font-display text-4xl font-bold text-brand-900">Ready to see how it works?</h2>
          <p className="mx-auto mt-3 max-w-lg text-brand-900/70">Start a conversation with Ava, or run a guided scenario in Demo Studio.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/assist" className="btn-dark">Find My Cover <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/demo" className="btn border border-brand-900/20 text-brand-900 hover:bg-white/30">Open Demo Studio</Link>
            <Link to="/contact" className="btn border border-brand-900/20 text-brand-900 hover:bg-white/30">Request a call back</Link>
          </div>
        </div>
      </section>
    </>
  )
}
