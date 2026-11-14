import { Link } from 'react-router-dom'
import { ArrowRight, Calculator, FileUp, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useBrokerageHome, useMe } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { MODULE_LABEL } from '@/server/onboarding/config'
import { OriginBadge } from '@/onboarding/ui'
import { cn } from '@/lib/utils'

function Counts({ label, counts }: { label: string; counts: { demo: number; imported: number; live: number } }) {
  const total = counts.demo + counts.imported + counts.live
  return (
    <div className="rounded-xl border border-navy-800/10 bg-white p-3">
      <p className="text-[11px] font-semibold text-navy-500">{label}</p>
      <p className="text-lg font-semibold text-navy-900">{total}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {(['imported', 'live', 'demo'] as const)
          .filter((k) => counts[k] > 0)
          .map((k) => (
            <span key={k} className="flex items-center gap-1 text-[11px] text-navy-700">
              <OriginBadge origin={k} /> {counts[k]}
            </span>
          ))}
      </div>
    </div>
  )
}

/** First-use home for an activated brokerage: setup progress, team, records by origin, quotation access and next steps. */
export function BrokerageHomePanel() {
  const { data: me } = useMe()
  const { data: home } = useBrokerageHome(Boolean(me?.member_role) && me?.organisation?.lifecycle_status === 'active')
  if (!home) return null
  const enabled = home.quotation.filter((q) => q.status === 'enabled')
  const actions = [
    { label: 'Add a client', to: '/broker/workspace', icon: UserPlus, show: home.capabilities.includes('operate') },
    { label: 'Obtain a quote', to: enabled.length ? '/broker/leads' : '/broker/settings/insurers', icon: Calculator, show: home.capabilities.includes('operate') },
    { label: 'Import more records', to: '/broker/imports/client-book', icon: FileUp, show: home.capabilities.includes('import_clients') },
    { label: 'Manage team', to: '/broker/settings/team', icon: Users, show: true },
  ].filter((a) => a.show)

  return (
    <section className="panel mb-6 p-5" aria-label="Brokerage home">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900">{home.organisation.name}</h2>
          <p className="flex flex-wrap items-center gap-2 text-xs text-navy-600">
            <StatusBadge status={home.organisation.lifecycle_status} />
            {home.setup.total > 0 ? `Setup ${home.setup.done} of ${home.setup.total} items accepted` : 'Set up before guided onboarding existed'}
            {home.organisation.is_demo && <OriginBadge origin="demo" />}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link key={a.label} to={a.to} className="inline-flex items-center gap-1.5 rounded-xl border border-navy-800/15 bg-white px-3 py-2 text-xs font-semibold text-navy-800 hover:border-brand-500">
              <a.icon className="h-3.5 w-3.5" /> {a.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-navy-800/10 bg-white p-3">
          <p className="text-[11px] font-semibold text-navy-500">Team</p>
          <p className="text-lg font-semibold text-navy-900">{home.team.active} active</p>
          <p className="text-[11px] text-navy-600">
            {home.team.by_role.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(' · ')}
            {home.team.pending_invitations > 0 && ` · ${home.team.pending_invitations} invited`}
          </p>
        </div>
        <Counts label="Clients" counts={home.clients} />
        <Counts label="Policies" counts={home.policies} />
        <div className="rounded-xl border border-navy-800/10 bg-white p-3">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-navy-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Quotation products enabled
          </p>
          {enabled.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-navy-800">
              {enabled.map((q) => (
                <li key={`${q.insurer}-${q.module}`}>
                  {q.insurer} · {MODULE_LABEL[q.module]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-amber-800">None yet. Quoting is blocked until an insurer is enabled.</p>
          )}
          <p className="mt-1 text-[11px] text-navy-500">Simulated demo adapter, not live insurer integrations.</p>
        </div>
      </div>

      {home.tasks.length > 0 && (
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {home.tasks.map((t) => (
            <li key={t.key}>
              <Link to={t.to} className={cn('group flex items-center justify-between gap-2 rounded-xl border p-3', t.tone === 'warning' ? 'border-amber-200 bg-amber-50/60' : 'border-navy-800/10 bg-mist/60')}>
                <span>
                  <span className="block text-sm font-medium text-navy-900">{t.label}</span>
                  <span className="block text-[11px] text-navy-600">{t.detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-navy-400 group-hover:text-brand-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
