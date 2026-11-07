import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import Logo from './Logo'
import { personalProducts } from '../data/products'
import { industryHref } from '../data/business'
import { LEGAL_SECTIONS } from '../data/legal'

export default function Footer() {
  return (
    <footer className="bg-brand-900 text-brand-100">
      <div className="container-x grid grid-cols-1 gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <Logo light />
          <p className="max-w-xs text-sm leading-relaxed text-brand-100/70">
            Independent short-term insurance brokers for people and businesses. We compare, advise and fight your corner at claim time.
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-white">Personal</h3>
          <ul className="space-y-2 text-sm">
            {personalProducts.map((p) => (
              <li key={p.slug}>
                <Link to={`/insurance/${p.slug}`} className="text-brand-100/70 hover:text-gold-300">{p.name}</Link>
              </li>
            ))}
            <li>
              <Link to="/assist" className="text-brand-100/70 hover:text-gold-300">Find my cover with Ava</Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-white">Business</h3>
          <ul className="space-y-2 text-sm">
            {[
              ['/business', 'Business insurance'],
              ['/business/industries', 'Industries we cover'],
              ['/business/cover', 'Cover areas'],
              ['/business/risk-review', 'Business risk review'],
              [industryHref('restaurants_hospitality'), 'Restaurants and hospitality'],
              [industryHref('manufacturing'), 'Manufacturing'],
              [industryHref('transport_logistics'), 'Transport and logistics'],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-brand-100/70 hover:text-gold-300">{label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-white">Company</h3>
          <ul className="space-y-2 text-sm">
            {[
              ['/quote', 'Quote form'],
              ['/claims', 'Log a claim'],
              ['/demo', 'Demo Studio'],
              ['/help', 'Help and capabilities'],
              ['/about', 'About us'],
              ['/contact', 'Contact'],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-brand-100/70 hover:text-gold-300">{label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold text-white">Get in touch</h3>
          <ul className="space-y-3 text-sm text-brand-100/70">
            <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-gold-400" /> 0861 268 373</li>
            <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-gold-400" /> hello@bcovered.demo</li>
            <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-gold-400" /> 12 Demo Lane, Sandton, Johannesburg</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-x space-y-3 py-6 text-xs text-brand-100/60">
          <p className="max-w-4xl leading-relaxed">
            <strong className="text-brand-100/80">Demo disclosure.</strong> BCovered is a fictional brokerage running on the InsureFlow AI
            demo platform. FSP licence: <strong className="text-brand-100/80">not configured</strong>; this site does not represent itself as
            a licensed financial services provider. All people, insurers, premiums and quotes are synthetic and simulated. Ava is an AI
            assistant, not a licensed adviser: regulated recommendations are reviewed and approved by a person, and no cover is bound
            online. Personal information is processed with consent under POPIA.
          </p>
          <div className="flex flex-col gap-2 text-brand-100/50 md:flex-row md:justify-between">
            <p>© {new Date().getFullYear()} BCovered – fictional demo on InsureFlow AI.</p>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-3 gap-y-1">
              {LEGAL_SECTIONS.map((s) => (
                <Link key={s.id} to={`/legal#${s.id}`} className="hover:text-gold-300">
                  {s.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
