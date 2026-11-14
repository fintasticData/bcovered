import { useNavigate } from 'react-router-dom'
import { ArrowRight, Download, FileText, Loader2, MailOpen, Plus, UserPlus, UserRound } from 'lucide-react'
import { session } from '@/api/client'
import { useLoadOnboardingSamples, useOnboardingSampleFiles } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { DEMO_INVITE_EMAIL, DEMO_INVITE_TOKEN, OB } from '@/server/db/onboardingSeed'
import { SAMPLE_BROKERAGES } from '@/server/demo/onboardingSamples'
import { MODULE_LABEL } from '@/server/onboarding/config'
import { downloadText } from '@/onboarding/ui'

const U = OB.users

const PERSONAS: Array<{ group: string; status: string; people: Array<{ id: string; name: string; role: string; does: string; to: string }> }> = [
  {
    group: 'B-Covered platform',
    status: 'active',
    people: [
      { id: U.reviewer, name: 'Pieter Botha', role: 'Onboarding reviewer', does: 'Reviews applications, requests corrections, approves and activates', to: '/platform/onboarding' },
      { id: U.platformAdmin, name: 'Nomvula Khoza', role: 'Platform administrator', does: 'Invites brokerage owners, suspends and reinstates brokerages', to: '/platform/brokerages' },
    ],
  },
  {
    group: 'Highveld Advisory',
    status: 'submitted',
    people: [
      { id: U.highveldOwner, name: 'Kagiso Molefe', role: 'Brokerage owner', does: 'Guided setup with Russ; corrects and resubmits', to: '/onboarding' },
      { id: U.highveldRep, name: 'Neo Sebego', role: 'Representative', does: 'Sees the setup; cannot submit', to: '/onboarding' },
    ],
  },
  {
    group: 'Acacia Cover Brokers',
    status: 'active',
    people: [
      { id: U.acaciaOwner, name: 'Anele Mahlangu', role: 'Brokerage owner', does: 'Imports the client book, manages team and insurer access', to: '/broker/imports/client-book' },
      { id: U.acaciaRep, name: 'Ruan Pretorius', role: 'Representative', does: 'Works leads and quotes with enabled insurers', to: '/broker/leads' },
      { id: U.acaciaReadOnly, name: 'Fatima Essop', role: 'Read-only user', does: 'Reads everything, changes nothing', to: '/broker/settings/team' },
      { id: U.sharedRep, name: 'Sam Pillay', role: 'Representative in two brokerages', does: 'Switches explicitly between Acacia and Coastline', to: '/broker' },
    ],
  },
  {
    group: 'Coastline Risk Partners',
    status: 'active',
    people: [
      { id: U.coastlineOwner, name: 'Thandiwe Zulu', role: 'Brokerage owner', does: 'Personal lines and individual life', to: '/broker' },
      { id: U.coastlineCompliance, name: 'Grace Mokoena', role: 'Compliance reviewer', does: 'Read access for oversight', to: '/broker/settings/team' },
      { id: U.coastlineOps, name: 'Sipho Khumalo', role: 'Operations administrator', does: 'Runs imports; cannot manage the team', to: '/broker/imports/client-book' },
    ],
  },
]

export function OnboardingDemo() {
  const navigate = useNavigate()
  const load = useLoadOnboardingSamples()
  const { data: files = [] } = useOnboardingSampleFiles()

  const openAs = (userId: string | null, to: string) => {
    session.set(userId)
    navigate(to)
  }

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <h3 className="text-sm font-semibold text-navy-900">Open as a demo person</h3>
        <p className="mt-1 text-xs text-navy-600">Each button switches identity and opens that person’s screen. Data is scoped to their brokerage by the service layer.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PERSONAS.map((g) => (
            <div key={g.group} className="rounded-xl border border-navy-800/10 bg-mist/60 p-3">
              <p className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-navy-800">
                {g.group} <StatusBadge status={g.status} />
              </p>
              <ul className="space-y-2">
                {g.people.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => openAs(p.id, p.to)} className="group flex w-full cursor-pointer items-start gap-2 rounded-lg bg-white p-2 text-left ring-1 ring-navy-800/10 hover:ring-brand-500">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-navy-900">{p.name}</span>
                        <span className="block text-[11px] text-navy-600">
                          {p.role} · {p.does}
                        </span>
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-navy-300 group-hover:text-brand-500" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => openAs(null, `/brokers/invite/${DEMO_INVITE_TOKEN}`)} className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-800/10 bg-white p-3 text-left hover:border-brand-500">
            <MailOpen className="mt-0.5 h-5 w-5 text-brand-600" />
            <span>
              <span className="block text-sm font-semibold text-navy-900">Accept the Umhlanga Brokers owner invitation</span>
              <span className="block text-xs text-navy-600">
                Create an account with <strong>{DEMO_INVITE_EMAIL}</strong> (any 8+ character password). The link works once and expires in 7 days.
              </span>
            </span>
          </button>
          <button type="button" onClick={() => openAs(null, '/brokers/join')} className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-800/10 bg-white p-3 text-left hover:border-brand-500">
            <UserPlus className="mt-0.5 h-5 w-5 text-brand-600" />
            <span>
              <span className="block text-sm font-semibold text-navy-900">Apply as a new brokerage</span>
              <span className="block text-xs text-navy-600">Public “Join as a broker” page: create an account, start an application, leave and resume.</span>
            </span>
          </button>
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-navy-900">Sample applications at every stage</h3>
            <p className="mt-1 max-w-2xl text-xs text-navy-600">
              Adds five more fictional brokerages to the onboarding queue, each with its owner, team, documents, checklist decisions and history. Fixed records: loading again adds
              nothing, and Reset demo data removes them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={() => load.mutate(undefined)} disabled={load.isPending}>
              {load.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Load sample applications
            </Button>
            <Button variant="outline" onClick={() => openAs(U.reviewer, '/platform/onboarding')}>
              Open queue as Pieter
            </Button>
          </div>
        </div>
        {load.data && (
          <p className="mt-3 text-sm font-medium text-emerald-700">
            {load.data.added ? `${load.data.added} sample brokerage(s) added.` : 'The sample brokerages are already loaded.'}
          </p>
        )}
        {load.error && <p className="mt-3 text-sm text-red-600">{load.error.message}</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {SAMPLE_BROKERAGES.map((b) => (
            <div key={b.key} className="rounded-xl border border-navy-800/10 bg-white p-3">
              <StatusBadge status={b.status} />
              <h4 className="mt-2 text-sm font-semibold text-navy-900">{b.name}</h4>
              <p className="text-[11px] text-navy-500">
                {b.owner.name} · {b.modules.map((m) => MODULE_LABEL[m]).join(', ')}
              </p>
              <p className="mt-1 text-xs text-navy-600">{b.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <h3 className="text-sm font-semibold text-navy-900">Sample files</h3>
        <p className="mt-1 text-xs text-navy-600">Download, then upload in the client-book import or the onboarding Documents section. All content is fictional.</p>
        <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {files.map((f) => (
            <li key={f.file_name}>
              <button type="button" onClick={() => downloadText(f.file_name, f.content, f.mime)} className="flex w-full cursor-pointer items-start gap-2 rounded-xl border border-navy-800/10 bg-white p-3 text-left hover:border-brand-500">
                {f.mime === 'text/csv' ? <Download className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-navy-900">{f.label}</span>
                  <span className="block text-[11px] text-navy-600">{f.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
