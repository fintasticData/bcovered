import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckSquare, ListChecks, Send, Sparkles, Users, UserSquare2 } from 'lucide-react'
import { useApprovals, useOverview } from '@/api/hooks'
import { humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from './PageHeader'
import { BrokerageHomePanel } from './home/BrokerageHomePanel'

export default function OverviewPage() {
  const { data, isLoading, error } = useOverview()
  const { data: pending = [] } = useApprovals(['pending'])

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load overview'} /></div>

  const kpis = [
    { label: 'Open leads', value: data.kpis.open_leads, icon: Users, to: '/broker/leads' },
    { label: 'Awaiting your approval', value: data.kpis.approvals_pending, icon: CheckSquare, to: '/broker/approvals', warn: data.kpis.approvals_pending > 0 },
    { label: 'Proposals released', value: data.kpis.proposals_released, icon: Send, to: '/broker/leads' },
    { label: 'Active agent jobs', value: data.kpis.active_jobs, icon: ListChecks, to: '/broker/jobs' },
    { label: 'Failed jobs', value: data.kpis.failed_jobs, icon: AlertTriangle, to: '/broker/jobs', warn: data.kpis.failed_jobs > 0 },
    { label: 'Customers and prospects', value: data.kpis.customers, icon: UserSquare2, to: '/broker/leads' },
  ]
  const maxLeads = Math.max(0, ...data.leads_by_status.map((d) => d.count))

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Overview"
        description="Live counts from the demo tables. Premium, commission and claims metrics arrive with policy data in Phase 3; nothing here is estimated."
        actions={
          <Button variant="accent" asChild>
            <Link to="/broker/workspace">
              <Sparkles /> Open Russ
            </Link>
          </Button>
        }
      />

      <BrokerageHomePanel />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="panel group flex items-center gap-4 p-5 transition hover:border-brand-500/40">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${k.warn ? 'bg-amber-50 text-amber-700' : 'bg-navy-50 text-navy-700'}`}>
              <k.icon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-2xl font-semibold text-navy-900">{k.value}</span>
              <span className="block text-xs text-navy-600">{k.label}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-navy-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel p-5">
          <h2 className="text-sm font-semibold text-navy-900">Lead pipeline</h2>
          <p className="text-xs text-navy-600">Leads by status, from the leads table</p>
          {maxLeads === 0 ? (
            <p className="mt-4 text-xs text-navy-600">No leads yet.</p>
          ) : (
            <ul className="mt-4 space-y-3" aria-label="Leads by status">
              {data.leads_by_status.map((d) => (
                <li key={d.status}>
                  <Link to="/broker/leads" className="group block">
                    <span className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-navy-800 group-hover:text-brand-600">{humanise(d.status)}</span>
                      <span className="font-semibold text-navy-900">{d.count}</span>
                    </span>
                    <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-navy-50">
                      <span
                        className="block h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${Math.max(4, (d.count / maxLeads) * 100)}%` }}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900">Needs your decision</h2>
            <Link to="/broker/approvals" className="text-xs font-semibold text-brand-600">All approvals</Link>
          </div>
          {pending.length === 0 ? (
            <p className="mt-3 text-xs text-navy-600">Nothing is waiting. Run Scenario 1 in Demo Studio, or ask the Copilot to create a comparison.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pending.slice(0, 5).map((a) => (
                <li key={a.approval.id}>
                  <Link to="/broker/approvals" className="block rounded-xl border border-amber-200 bg-amber-50/60 p-3 hover:border-amber-400">
                    <p className="text-sm font-medium text-navy-900">{a.approval.summary}</p>
                    <p className="text-[11px] text-navy-600">
                      {a.requested_by_label} · {formatDateTime(a.approval.created_at)}
                      {a.approval.risk_flags.length > 0 && ` · ${a.approval.risk_flags.length} risk flag(s)`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-6 text-sm font-semibold text-navy-900">Agent activity</h2>
          <ul className="mt-3 space-y-2.5">
            {data.activity.map((e) => (
              <li key={e.id} className="flex gap-2 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span className="min-w-0">
                  <span className="font-medium text-navy-900">{e.label}</span>
                  <span className="text-navy-600"> · {e.actor_id} · {formatDateTime(e.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
