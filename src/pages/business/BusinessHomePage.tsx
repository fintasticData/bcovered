import { Link } from 'react-router-dom'
import { ArrowRight, Building2, ClipboardCheck, FileStack, Network, ShieldCheck, Sparkles, UserCheck } from 'lucide-react'
import { useIndustries } from '@/api/hooks'
import { AdviceNotice } from '@/components/commercial/badges'
import { BusinessSubnav } from './BusinessSubnav'

const STEPS = [
  { icon: Sparkles, title: 'Describe your business', body: 'Tell our Business Discovery Agent how you operate, in your own words. It only asks what your industry needs.' },
  { icon: Network, title: 'AI builds your Risk Twin', body: 'Premises, equipment, stock, revenue and suppliers become one connected picture of your business.' },
  { icon: ClipboardCheck, title: 'Agents identify exposures', body: 'Specialist agents flag potential exposures, missing information and the documents a broker will need.' },
  { icon: UserCheck, title: 'A broker coordinates cover', body: 'A licensed broker reviews everything, prepares the submission and approaches insurers. Nothing happens automatically.' },
]

const DIFFERENCES = [
  ['A household', 'A business entity or group'],
  ['Standard assets', 'Multiple locations and asset classes'],
  ['Short questionnaires', 'Industry-specific risk assessments'],
  ['Consumer comparisons', 'Underwriting and negotiated quotations'],
  ['One policy', 'A portfolio of sections and schedules'],
]

export default function BusinessHomePage() {
  const { data: industries = [] } = useIndustries()

  return (
    <>
      <BusinessSubnav />
      <section className="relative overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-gold-300/30 blur-3xl" aria-hidden />
        <div className="container-x relative grid grid-cols-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div className="animate-rise space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-800/10 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700">
              <Building2 className="h-4 w-4 text-brand-500" /> Commercial insurance · South Africa
            </span>
            <h1 className="font-display text-5xl leading-[1.05] font-bold tracking-tight text-navy-900 sm:text-6xl">
              Your Business. Your Risks.
              <br />
              <span className="text-brand-500">Better Protected.</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-ink/70">
              Business insurance made clearer. Intelligent risk assessments, coordinated insurance comparisons and expert brokerage support, all in
              one place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/business/risk-review" className="btn-primary">
                Start a business risk review <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/business/industries" className="btn-ghost">
                Explore industries
              </Link>
            </div>
            <AdviceNotice className="max-w-lg" />
          </div>

          <div className="card p-6 shadow-lg">
            <p className="eyebrow">Personal vs commercial</p>
            <h2 className="mt-1 text-lg font-semibold text-navy-900">Why business cover needs a different approach</h2>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                <tr>
                  <th className="pb-2">Personal insurance</th>
                  <th className="pb-2">Commercial insurance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {DIFFERENCES.map(([a, b]) => (
                  <tr key={a}>
                    <td className="py-2 pr-4 text-navy-600">{a}</td>
                    <td className="py-2 font-medium text-navy-900">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container-x">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-navy-900">From a conversation to a broker-ready submission</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-xs font-semibold text-brand-500">Step {i + 1}</p>
                <h3 className="font-semibold text-navy-900">{s.title}</h3>
                <p className="mt-1 text-sm text-ink/70">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">Industries</p>
              <h2 className="mt-1 font-display text-3xl font-bold text-navy-900">Questions shaped by what your business does</h2>
            </div>
            <Link to="/business/industries" className="text-sm font-semibold text-brand-600">
              All {industries.length} industries <ArrowRight className="inline h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {industries.slice(0, 8).map((t) => (
              <Link key={t.key} to={`/business/industries#${t.key}`} className="card p-4 transition hover:border-brand-500/40">
                <p className="font-semibold text-navy-900">{t.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-ink/60">{t.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-900 py-14 text-white">
        <div className="container-x grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_auto]">
          <div className="flex gap-4">
            <FileStack className="mt-1 h-8 w-8 shrink-0 text-gold-400" />
            <div>
              <h2 className="text-xl font-semibold">For brokers: understand every client, identify every exposure, coordinate every renewal.</h2>
              <p className="mt-1 text-sm text-brand-100">
                The commercial workspace turns discovery conversations into Risk Twins and draft submission packs, with licensed brokers in control
                of advice and placement.
              </p>
            </div>
          </div>
          <Link to="/demo" className="btn-primary">
            <ShieldCheck className="h-4 w-4" /> See it in Demo Studio
          </Link>
        </div>
      </section>
    </>
  )
}
