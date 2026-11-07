import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { LEGAL_SECTIONS } from '@/data/legal'
import { PRIVACY_NOTICE_VERSION } from '@/server/llm/adapter'

export default function LegalPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <div className="bg-mist">
      <div className="container-x py-12">
        <p className="eyebrow mb-1 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Legal and compliance
        </p>
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">Demo disclosures</h1>
        <p className="mt-2 max-w-3xl text-sm text-navy-600">
          BCovered is a fictional brokerage on the InsureFlow AI demo platform. These notices show how the production platform would present
          its regulatory information. They are placeholders, not legal documents, and must be replaced after review by qualified South African
          legal and compliance advisers.
        </p>

        <nav className="scroll-x mt-6 flex gap-2" aria-label="Sections">
          {LEGAL_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 ring-1 ring-navy-800/10 hover:text-brand-700">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-6">
          <Section id="privacy" title="Privacy notice (POPIA)">
            <p>Version {PRIVACY_NOTICE_VERSION}. In this demo, everything you enter is stored only in your own browser and never leaves your device.</p>
            <ul>
              <li>We ask for consent before capturing any contact details, and record the notice version you agreed to.</li>
              <li>Information is used only to prepare the comparison or business risk review you asked for.</li>
              <li>Marketing consent is separate and optional, and declining it does not affect your request.</li>
              <li>You can clear all demo data at any time from Demo Studio using “Reset demo data”.</li>
            </ul>
          </Section>

          <Section id="complaints" title="Complaints">
            <p>In production, complaints would be acknowledged within two business days and resolved within the timelines set by applicable conduct rules, with escalation details for the relevant ombud.</p>
            <p>
              In this demo, use the <Link to="/contact">contact page</Link> to see how a complaint would be captured. Nothing is sent to a real
              person.
            </p>
          </Section>

          <Section id="conflicts" title="Conflict of interest policy">
            <p>
              A production brokerage would disclose how it is remunerated by insurers, any ownership links to product suppliers, and how it manages
              conflicts. The demo insurers (Protea Insure, Karoo Mutual and Baobab General) are fictional, and no commission is earned.
            </p>
          </Section>

          <Section id="fais" title="FAIS disclosures">
            <ul>
              <li>FSP licence: not configured. BCovered does not represent itself as an authorised financial services provider.</li>
              <li>AI assistants (Ava, the Business Discovery Agent and the Copilots) are not licensed advisers and do not give financial advice.</li>
              <li>Agents identify potential exposures and prepare simulated options; a licensed broker must approve any recommendation, record of advice or release.</li>
              <li>All quotations and submission packs are simulated. No cover is bound and nothing is sent to an insurer.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-28 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-navy-700 [&_a]:font-semibold [&_a]:text-brand-600 [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  )
}
