import { Link } from 'react-router-dom'
import { useApprovals, useEmployer, useExceptions, useJob, useReconciliation, useRunForJob } from '@/api/hooks'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import type { CopilotView } from '@/server/agents/copilotCommands'
import { ApprovalCard } from '../ApprovalCard'
import { MovementsPanel } from '../benefits/MovementsPanel'
import { ReconView } from '../controls/ReconciliationPage'
import { EmptyState } from '../PageHeader'
import { zar } from '../shared/ui'

type ControlsView = Extract<CopilotView, { kind: 'reconciliation' | 'exceptions' | 'movements' }>

export function ControlsResult({ view }: { view: ControlsView }) {
  if (view.kind === 'reconciliation') return view.run_id ? <RunResult runId={view.run_id} /> : <ReconResult jobId={view.job_id} />
  if (view.kind === 'movements') return <MovementsResult employerId={view.employer_id} jobId={view.job_id} />
  return <ExceptionsResult />
}

function JobProgress({ jobId }: { jobId: string | null }) {
  const { data } = useJob(jobId)
  const { data: pending = [] } = useApprovals(['pending'])
  if (!data) return null
  const approval = pending.find((a) => a.approval.job_id === jobId)
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-navy-800/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-navy-900">{data.job.title}</p>
          <StatusBadge status={data.job.status} />
        </div>
        <ExecutionPlan steps={data.steps} />
      </div>
      {approval && <ApprovalCard view={approval} />}
    </div>
  )
}

function ReconResult({ jobId }: { jobId: string | null }) {
  const { data: run } = useRunForJob(jobId)
  return (
    <div className="space-y-4">
      <JobProgress jobId={jobId} />
      {run && <ReconView data={run} compact />}
    </div>
  )
}

function RunResult({ runId }: { runId: string }) {
  const { data } = useReconciliation(runId)
  return data ? <ReconView data={data} compact /> : null
}

function MovementsResult({ employerId, jobId }: { employerId: string; jobId: string | null }) {
  const { data } = useEmployer(employerId)
  return (
    <div className="space-y-4">
      <JobProgress jobId={jobId} />
      {data && <MovementsPanel employerId={employerId} movements={data.movements} staff />}
    </div>
  )
}

function ExceptionsResult() {
  const { data = [] } = useExceptions(true)
  if (!data.length) return <EmptyState title="No open financial exceptions" />
  return (
    <ul className="divide-y divide-navy-800/5">
      {data.slice(0, 15).map((r) => (
        <li key={r.exception.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-navy-900">{r.exception.title}</p>
            <p className="text-xs text-navy-600">
              {r.customer ?? r.portfolio ?? r.fund ?? '–'} · {humanise(r.exception.category)} · {zar(r.exception.amount, true)}
            </p>
          </div>
          <span className={r.exception.severity === 'high' ? 'text-xs font-semibold text-red-700' : 'text-xs text-navy-600'}>{humanise(r.exception.severity)}</span>
        </li>
      ))}
      <li className="pt-3">
        <Link to="/broker/controls/exceptions" className="text-xs font-semibold text-brand-600">
          Open the exceptions dashboard ({data.length})
        </Link>
      </li>
    </ul>
  )
}
