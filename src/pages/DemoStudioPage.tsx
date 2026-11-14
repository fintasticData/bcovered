import { useNavigate } from 'react-router-dom'
import { Bot, Building2, Database, FlaskConical, Handshake, Loader2, Play, RotateCcw, ShieldAlert, Target, Users } from 'lucide-react'
import { session } from '@/api/client'
import { useIdentities, usePlatform, useResetDemo } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { OB } from '@/server/db/onboardingSeed'
import { BROKER_ONBOARDING, DEMO_BUSINESS_SUMMARIES, NEW_MOTOR_LEAD, PLANNED_COMMERCIAL_SCENARIOS, PLANNED_SCENARIOS, RESTAURANT_GROUP, type DemoScenario } from '@/server/demo/scenarios'
import { OnboardingDemo } from './demo/OnboardingDemo'

export default function DemoStudioPage() {
  const navigate = useNavigate()
  const reset = useResetDemo()
  const { data: platform } = usePlatform()
  const { data: identities = [] } = useIdentities()
  const broker = identities.find((i) => i.role === 'broker')

  const asVisitor = (to: string) => {
    session.set(null)
    navigate(to)
  }

  const asBroker = (to: string) => {
    if (!broker?.user_id) return
    session.set(broker.user_id)
    navigate(to)
  }

  const doReset = () => {
    if (window.confirm('Reset all demo data to the original synthetic fixtures? Conversations, jobs and approvals will be cleared.')) {
      reset.mutate()
    }
  }

  return (
    <div className="bg-mist">
      <div className="container-x py-10">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow mb-1 flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Demo Studio
            </p>
            <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">Guided demonstrations</h1>
            <p className="mt-2 max-w-2xl text-sm text-navy-600">
              Reproducible scenarios on synthetic data. Every scenario is started by hand; nothing runs on a schedule. All people, businesses and
              insurers are fictional.
            </p>
          </div>
          <Button variant="outline" onClick={doReset} disabled={reset.isPending}>
            {reset.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset demo data
          </Button>
        </div>
        {reset.isSuccess && <p className="mt-3 text-sm font-medium text-emerald-700">Demo data restored to the original fixtures.</p>}

        <h2 className="mt-8 mb-3 text-sm font-semibold text-navy-900">Personal insurance</h2>
        <ScenarioCard
          s={NEW_MOTOR_LEAD}
          badge={String(NEW_MOTOR_LEAD.number)}
          onStart={() => asVisitor(`/assist?scenario=${NEW_MOTOR_LEAD.id}`)}
          secondary={{ label: 'Open broker approvals', onClick: () => asBroker('/broker/approvals'), disabled: !broker }}
          steps={['Start the scenario and press Play.', 'Switch to Thabo Nkosi (broker) and approve in Approvals.', 'Switch to Sarah Jacobs and open her portal.']}
        />

        <section className="mt-6">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-navy-500 uppercase">Planned personal scenarios</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PLANNED_SCENARIOS.map((p) => (
              <div key={p.number} className="panel p-5 opacity-80">
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Scenario {p.number} · later phase</p>
                <h4 className="mt-1 font-semibold text-navy-900">{p.title}</h4>
                <p className="mt-1 text-xs text-navy-600">{p.summary}</p>
              </div>
            ))}
          </div>
        </section>

        <h2 className="mt-10 mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Building2 className="h-4 w-4 text-brand-500" /> Commercial insurance
        </h2>
        <ScenarioCard
          s={RESTAURANT_GROUP}
          badge={RESTAURANT_GROUP.code ?? 'A'}
          onStart={() => asVisitor(`/business/risk-review?scenario=${RESTAURANT_GROUP.id}`)}
          secondary={{ label: 'Open Russ · Commercial', onClick: () => asBroker('/broker/workspace?lens=commercial'), disabled: !broker }}
          steps={[
            'Start the scenario and press Play. The fictional owner describes the business.',
            'Switch to Thabo Nkosi (broker). Open Submissions, review the pack and apply the suggested sections, then approve.',
            'Switch to Nomsa Dlamini and open the business portal to see the risk profile and document requests.',
            'Optional: in the commercial workspace, ask “Review Ubuntu Foods and identify outstanding insurance questions”.',
          ]}
        />

        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Risk Twin demo businesses (synthetic)</h3>
            <Button size="sm" variant="outline" onClick={() => asBroker('/broker/commercial/risk-twins')} disabled={!broker}>
              Open Risk Twins as broker
            </Button>
          </div>
          <p className="mb-3 text-xs text-navy-600">
            Added with “Load demo businesses” on the Risk Twins page. Fixed records, so loading again adds nothing; Reset removes them.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DEMO_BUSINESS_SUMMARIES.map((b) => (
              <div key={b.name} className="panel p-5">
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{b.industry}</p>
                <h4 className="mt-1 font-semibold text-navy-900">{b.name}</h4>
                <p className="mt-1 text-xs text-navy-600">{b.summary}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-navy-500 uppercase">Planned commercial scenarios</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PLANNED_COMMERCIAL_SCENARIOS.map((p) => (
              <div key={p.code} className="panel p-5 opacity-80">
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Scenario {p.code} · later phase</p>
                <h4 className="mt-1 font-semibold text-navy-900">{p.title}</h4>
                <p className="mt-1 text-xs text-navy-600">{p.summary}</p>
              </div>
            ))}
          </div>
        </section>

        <h2 className="mt-10 mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Handshake className="h-4 w-4 text-brand-500" /> Broker onboarding and brokerage workspaces
        </h2>
        <ScenarioCard
          s={BROKER_ONBOARDING}
          badge={BROKER_ONBOARDING.code ?? 'O'}
          startLabel="Start as reviewer"
          onStart={() => {
            session.set(OB.users.reviewer)
            navigate(`/platform/onboarding/${OB.applications.highveld}`)
          }}
          secondary={{
            label: 'Open as Kagiso (Highveld)',
            onClick: () => {
              session.set(OB.users.highveldOwner)
              navigate('/onboarding')
            },
            disabled: false,
          }}
          steps={[
            'As Pieter Botha: Start review, request a correction on the PI schedule with feedback and an internal note, then Request information.',
            'As Kagiso Molefe: read the feedback in Russ’s Review tab, use a sample PI schedule under Documents, then resubmit from Readiness.',
            'As Pieter: Start review, accept every item, Approve application, then Activate workspace as a separate step.',
            'As Kagiso: open the broker workspace to see the first-use home. Quoting stays blocked until an insurer is enabled.',
          ]}
        />
        <div className="mt-6">
          <OnboardingDemo />
        </div>

        {platform && (
          <section className="panel mt-8 grid grid-cols-1 gap-6 p-6 md:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">AI adapter</h3>
              <p className="mt-1 text-sm font-medium text-navy-900">{platform.adapter.label}</p>
              {platform.adapters
                .filter((a) => !a.available)
                .map((a) => (
                  <p key={a.id} className="mt-1 text-xs text-navy-600">
                    {a.label}: {a.reason}
                  </p>
                ))}
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Typed tools</h3>
              <p className="mt-1 text-sm font-medium text-navy-900">{platform.tools.length} registered</p>
              <p className="mt-1 text-xs text-navy-600">{platform.tools.map((t) => t.name).join(', ')}</p>
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-navy-500 uppercase">
                <ShieldAlert className="h-3.5 w-3.5" /> Licence status
              </h3>
              <p className="mt-1 text-sm font-medium text-navy-900">{platform.licence_configured ? 'Verified FSP licence configured' : 'Not configured'}</p>
              <p className="mt-1 text-xs text-navy-600">
                {platform.organisation.name} is a fictional demo brokerage and does not represent itself as a licensed financial services
                provider.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ScenarioCard({
  s,
  badge,
  onStart,
  startLabel = 'Start scenario',
  secondary,
  steps,
}: {
  s: DemoScenario
  badge: string
  onStart: () => void
  startLabel?: string
  secondary: { label: string; onClick: () => void; disabled: boolean }
  steps: string[]
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-navy-800/10 bg-white p-6 md:flex-row md:items-center">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500 font-display text-xl font-bold text-white">{badge}</span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-navy-900">{s.title}</h3>
          <p className="text-sm text-navy-600">{s.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" size="lg" onClick={onStart}>
            <Play /> {startLabel}
          </Button>
          <Button variant="outline" size="lg" onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
        <Block icon={Target} title="Initial conditions" items={s.initial_conditions} />
        <Block icon={Bot} title="Agents involved" items={s.agents} />
        <Block icon={Database} title="Database effects" items={s.database_effects} />
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">
            <Users className="h-3.5 w-3.5" /> Final deliverable
          </h4>
          <p className="mt-2 text-sm text-navy-800">{s.deliverable}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-navy-600">
            {steps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function Block({ icon: Icon, title, items }: { icon: typeof Target; title: string; items: string[] }) {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h4>
      <ul className="mt-2 space-y-1.5 text-sm text-navy-800">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" /> {i}
          </li>
        ))}
      </ul>
    </div>
  )
}
