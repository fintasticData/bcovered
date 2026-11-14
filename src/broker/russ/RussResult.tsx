import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useApprovals, useJob, useLifeCase, useLifePolicies, useLifeServicing } from '@/api/hooks'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { StatusBadge } from '@/components/StatusBadge'
import type { CopilotView } from '@/server/agents/copilotCommands'
import { ApprovalCard } from '../ApprovalCard'
import { EmptyState } from '../PageHeader'
import { BasisBadge, Stat, zar } from '../shared/ui'
import { ControlsResult } from './ControlsResult'

type RussView = Exclude<CopilotView, { kind: 'none' | 'job' | 'approvals' | 'leads' | 'jobs' | 'business' | 'businesses' | 'submissions' | 'twin' }>

export function RussResult({ view }: { view: CopilotView }) {
  const v = view as RussView
  switch (v.kind) {
    case 'life_case':
      return <LifeCaseResult customerId={v.customer_id} jobId={v.job_id} />
    case 'life_servicing':
      return <ServicingResult />
    case 'policies':
      return <PoliciesResult customerId={v.customer_id} />
    case 'links':
      return <LinksResult items={v.items} />
    case 'reconciliation':
    case 'exceptions':
    case 'movements':
      return <ControlsResult view={v} />
    default:
      return <EmptyState title="Nothing to show for this request" />
  }
}

function LifeCaseResult({ customerId, jobId }: { customerId: string; jobId: string | null }) {
  const { data } = useLifeCase(customerId, jobId)
  const { data: job } = useJob(data?.job?.id)
  const { data: pending = [] } = useApprovals(['pending'])
  if (!data) return null
  const approval = pending.find((a) => data.job && a.approval.job_id === data.job.id)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900">{data.customer.full_name}</p>
          {data.person && (
            <Link to={`/broker/people/${data.person.id}`} className="text-xs font-semibold text-brand-600">
              Person 360
            </Link>
          )}
        </div>
        {data.job && <StatusBadge status={data.job.status} />}
      </div>
      {data.needs && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {data.needs.needs.map((n) => (
            <Stat key={n.benefit_type_key} label={n.label} value={zar(n.shortfall)} hint={`Shortfall · required ${zar(n.required)}, existing ${zar(n.existing)}`} basis="calculated" tone={n.shortfall > 0 ? 'warning' : undefined} />
          ))}
        </div>
      )}
      {data.options.length > 0 && (
        <div className="rounded-xl border border-navy-800/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-navy-700">Options considered</p>
            <BasisBadge basis="simulated" />
          </div>
          <ul className="space-y-1 text-sm">
            {data.options.map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span className={data.roa?.recommended_option_id === o.id ? 'font-semibold text-navy-900' : 'text-navy-700'}>
                  {o.label} {data.roa?.recommended_option_id === o.id && '· recommended in the draft'}
                </span>
                <span className="text-navy-900">{zar(o.monthly_premium)} pm</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs">
        {data.roa && (
          <Link to={`/broker/life/advice/${data.roa.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
            Record of Advice ({data.roa.status.replace(/_/g, ' ')}) <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {data.policy && (
          <Link to={`/broker/life/policies/${data.policy.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
            Policy ({data.policy.status.replace(/_/g, ' ')}) <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      {job && (
        <div className="rounded-xl border border-navy-800/10 p-3">
          <ExecutionPlan steps={job.steps} />
          <Link to={`/broker/jobs/${job.job.id}`} className="text-xs font-semibold text-brand-600">
            {job.job.steps_done}/{job.job.steps_total} steps · open the job and tool calls
          </Link>
        </div>
      )}
      {approval && <ApprovalCard view={approval} />}
    </div>
  )
}

function ServicingResult() {
  const { data = [] } = useLifeServicing()
  if (!data.length) return <EmptyState title="No open servicing items" />
  return (
    <ul className="divide-y divide-navy-800/5">
      {data.slice(0, 20).map((i) => (
        <li key={i.task.id} className="py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {i.link ? (
                <Link to={i.link} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                  {i.task.title}
                </Link>
              ) : (
                <p className="text-sm font-medium text-navy-900">{i.task.title}</p>
              )}
              <p className="text-xs text-navy-600">{i.task.detail}</p>
            </div>
            <span className="shrink-0 text-[11px] text-navy-500">{i.agent}</span>
          </div>
        </li>
      ))}
      <li className="pt-3">
        <Link to="/broker/life/servicing" className="text-xs font-semibold text-brand-600">
          Open the servicing queue
        </Link>
      </li>
    </ul>
  )
}

function PoliciesResult({ customerId }: { customerId: string | null }) {
  const { data = [] } = useLifePolicies(customerId)
  if (!data.length) return <EmptyState title="No individual life policies yet" />
  return (
    <ul className="divide-y divide-navy-800/5">
      {data.map((r) => (
        <li key={r.policy.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <Link to={`/broker/life/policies/${r.policy.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
              {r.provider} {r.policy.policy_number ?? '(application)'}
            </Link>
            <p className="text-xs text-navy-600">
              {r.holder} · life cover {zar(r.cover)} · {r.beneficiaries ? `${r.beneficiaries} beneficiar${r.beneficiaries === 1 ? 'y' : 'ies'}` : 'no beneficiary'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-navy-700">{zar(r.policy.premium_amount)} pm</span>
            <StatusBadge status={r.policy.status} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function LinksResult({ items }: { items: Array<{ label: string; to: string; detail: string; badge?: string }> }) {
  if (!items.length) return <EmptyState title="Nothing matched" />
  return (
    <ul className="divide-y divide-navy-800/5">
      {items.map((i) => (
        <li key={`${i.to}-${i.label}`} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <Link to={i.to} className="text-sm font-medium text-navy-900 hover:text-brand-600">
              {i.label}
            </Link>
            <p className="text-xs text-navy-600">{i.detail}</p>
          </div>
          {i.badge && <StatusBadge status={i.badge} />}
        </li>
      ))}
    </ul>
  )
}
