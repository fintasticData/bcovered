import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  Clock,
  HandCoins,
  Headphones,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  User,
} from 'lucide-react'
import { insurers, personalProducts, type ProductSlug } from '../data/products'
import { BUSINESS_COVER_AREAS, BUSINESS_INDUSTRIES, coverAreaHref, industryHref } from '../data/business'
import { rand } from '../lib/quote'

type Segment = 'personal' | 'business'

const SEGMENTS = [
  { key: 'personal' as const, label: 'Personal', hint: 'you and your family', icon: User },
  { key: 'business' as const, label: 'Business', hint: 'your company', icon: Building2 },
]

const HERO_INDUSTRIES = BUSINESS_INDUSTRIES.filter((i) =>
  ['restaurants_hospitality', 'retail', 'manufacturing', 'construction', 'transport_logistics', 'professional_services', 'agriculture'].includes(i.key),
)

const CATEGORY_CARDS = [
  {
    to: '/#personal',
    icon: User,
    eyebrow: 'Personal insurance',
    title: 'For people',
    body: 'Your car, home, contents, motorbike and the valuables you carry, compared across our insurer panel.',
    chips: personalProducts.map((p) => p.label),
    cta: 'Explore personal cover',
    image: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=70',
    overlay: 'bg-gradient-to-t from-brand-900/95 via-brand-900/70 to-brand-900/20',
  },
  {
    to: '/business',
    icon: Building2,
    eyebrow: 'Business insurance',
    title: 'For businesses',
    body: 'Property, interruption, liability, fleets, cyber and specialist cover for 14 industries, with a broker coordinating every section.',
    chips: ['Sole traders', 'SMEs', 'Multi-site groups', '14 industries', '25 cover sections'],
    cta: 'Explore business cover',
    image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=70',
    overlay: 'bg-gradient-to-t from-navy-900/95 via-navy-900/70 to-navy-900/20',
  },
]

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
  const [segment, setSegment] = useState<Segment>('personal')
  const [pick, setPick] = useState<ProductSlug>('car')
  const [industry, setIndustry] = useState(HERO_INDUSTRIES[0].key)
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
              Cover for you, your family and your business. Compare options, manage policies and get help when it matters – with intelligent
              assistance and experienced brokers.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/assist" className="btn-primary">
                Find My Cover <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className="btn-ghost">See How It Works</a>
            </div>

            <div className="card max-w-xl p-3 shadow-lg">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-sand p-1" role="tablist" aria-label="Who is the cover for?">
                {SEGMENTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={segment === s.key}
                    onClick={() => setSegment(s.key)}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      segment === s.key ? 'bg-white text-brand-900 shadow-sm' : 'text-ink/60 hover:text-brand-800'
                    }`}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                    <span className="hidden text-[11px] font-normal text-ink/50 sm:inline">· {s.hint}</span>
                  </button>
                ))}
              </div>

              {segment === 'personal' ? (
                <>
                  <p className="px-2 pb-2 pt-3 text-sm font-medium text-ink/70">What would you like to insure?</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {personalProducts.map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => setPick(p.slug)}
                        aria-pressed={pick === p.slug}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition ${
                          pick === p.slug ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-transparent text-ink/60 hover:bg-brand-50/60'
                        }`}
                      >
                        <p.icon className="h-5 w-5" />
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => navigate(pick === 'car' ? '/assist' : `/quote?product=${pick}`)} className="btn-dark mt-3 w-full">
                    {pick === 'car' ? 'Start with Ava' : 'Compare quotes'} <ArrowRight className="h-4 w-4" />
                  </button>
                  <p className="px-2 pt-2 text-center text-[11px] text-ink/50">
                    Motor runs through an AI-assisted assessment in this demo; other personal cover uses the quote form.
                  </p>
                </>
              ) : (
                <>
                  <p className="px-2 pb-2 pt-3 text-sm font-medium text-ink/70">What kind of business do you run?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {HERO_INDUSTRIES.map((i) => (
                      <button
                        key={i.key}
                        type="button"
                        onClick={() => setIndustry(i.key)}
                        aria-pressed={industry === i.key}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-center text-[11px] leading-tight font-medium transition sm:text-xs ${
                          industry === i.key ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-transparent text-ink/60 hover:bg-brand-50/60'
                        }`}
                      >
                        <i.icon className="h-5 w-5" />
                        {i.short}
                      </button>
                    ))}
                    <Link
                      to="/business/industries"
                      className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-brand-800/20 px-1 py-3 text-center text-[11px] leading-tight font-medium text-ink/60 transition hover:bg-brand-50/60 sm:text-xs"
                    >
                      <Building2 className="h-5 w-5" />
                      {BUSINESS_INDUSTRIES.length - HERO_INDUSTRIES.length} more
                    </Link>
                  </div>
                  <button onClick={() => navigate('/business/risk-review')} className="btn-dark mt-3 w-full">
                    Start a business risk review <ArrowRight className="h-4 w-4" />
                  </button>
                  <p className="px-2 pt-2 text-center text-[11px] text-ink/50">
                    <Link to={industryHref(industry)} className="font-semibold text-brand-600 hover:underline">
                      See what a broker looks at for {BUSINESS_INDUSTRIES.find((i) => i.key === industry)?.label.toLowerCase()}
                    </Link>
                    {' · '}from sole traders to multi-site groups
                  </p>
                </>
              )}
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

      {/* Two categories */}
      <section className="container-x pt-20">
        <p className="eyebrow mb-2">Our cover</p>
        <h2 className="max-w-2xl font-display text-4xl font-bold text-brand-900">Insurance for people and for businesses</h2>
        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {CATEGORY_CARDS.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className={`group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[2rem] p-7 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl sm:p-9`}
            >
              <img src={c.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <div className={`absolute inset-0 ${c.overlay}`} aria-hidden />
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                  <c.icon className="h-4 w-4" /> {c.eyebrow}
                </span>
                <h3 className="mt-3 font-display text-3xl font-bold">{c.title}</h3>
                <p className="mt-2 max-w-md text-sm text-white/80">{c.body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.chips.map((chip) => (
                    <span key={chip} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur">{chip}</span>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-300">
                  {c.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Personal products */}
      <section id="personal" className="container-x scroll-mt-24 py-16">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow mb-2 flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Personal</p>
            <h2 className="font-display text-3xl font-bold text-brand-900">For you, your family and your home</h2>
          </div>
          <Link to="/quote" className="btn-ghost self-start md:self-auto">Start a quote <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {personalProducts.map((p) => (
            <Link
              key={p.slug}
              to={`/insurance/${p.slug}`}
              className="card group flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-xl"
            >
              <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-gold-400 group-hover:text-brand-900">
                <p.icon className="h-6 w-6" />
              </span>
              <h3 className="text-base font-semibold text-brand-900">{p.name}</h3>
              <p className="mt-1 flex-1 text-sm text-ink/60">{p.short}</p>
              <div className="mt-5 flex items-center justify-between border-t border-brand-800/10 pt-4">
                <span className="text-sm text-ink/60">From <strong className="text-brand-800">{rand(p.fromPrice)}</strong> pm</span>
                <ArrowRight className="h-4 w-4 text-brand-500 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Business */}
      <section className="bg-brand-900 py-16 text-white">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="eyebrow mb-2 flex items-center gap-1.5 text-gold-300!"><Building2 className="h-3.5 w-3.5" /> Business</p>
              <h2 className="max-w-2xl font-display text-3xl font-bold">Every business is different. Your cover should be too.</h2>
              <p className="mt-2 max-w-2xl text-sm text-brand-100/80">
                From a sole trader to a multi-site group: premises, fleets, stock, staff, contracts and liabilities. Agents map how you operate into a
                Risk Twin, and a licensed broker coordinates cover across insurers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/business/risk-review" className="btn-primary">Start a business risk review <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/business" className="btn border border-white/20 text-white hover:bg-white/10">Explore business insurance</Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <h3 className="mb-3 text-xs font-semibold tracking-[0.18em] text-brand-200 uppercase">Industries we cover</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {BUSINESS_INDUSTRIES.map((i) => (
                  <Link
                    key={i.key}
                    to={industryHref(i.key)}
                    className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm transition hover:border-gold-400/60 hover:bg-white/10"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-gold-300">
                      <i.icon className="h-4 w-4" />
                    </span>
                    <span className="leading-tight font-medium">{i.label}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-semibold tracking-[0.18em] text-brand-200 uppercase">Cover areas</h3>
              <ul className="space-y-2">
                {BUSINESS_COVER_AREAS.map((c) => (
                  <li key={c.group}>
                    <Link
                      to={coverAreaHref(c.group)}
                      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-gold-400/60 hover:bg-white/10"
                    >
                      <c.icon className="h-5 w-5 shrink-0 text-gold-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{c.title}</span>
                        <span className="block text-xs text-brand-100/70">{c.short}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-brand-200 transition group-hover:translate-x-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
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
