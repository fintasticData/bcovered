import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useJob } from '@/api/hooks'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { JobControls } from './JobControls'
import { ErrorState, LoadingState, PageHeader } from './PageHeader'

export default function JobDetailPage() {
  const { jobId } = useParams()
  const { data, isLoading, error } = useJob(jobId)

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Job not found'} /></div>
  const { job } = data

  const facts: Array<[string, string]> = [
    ['Job ID', job.id],
    ['Workflow', job.workflow_type],
    ['Initiated by', job.initiated_by ? 'Broker' : 'Ava (customer conversation)'],
    ['Created', formatDateTime(job.created_at)],
    ['Started', formatDateTime(job.started_at)],
    ['Finished', formatDateTime(job.completed_at)],
    ['Attempts', String(job.attempt + 1)],
    ['Revision', String(job.revision)],
  ]

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <Link to="/broker/jobs" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> All jobs
      </Link>
      <PageHeader
        title={job.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} /> {data.customer?.full_name}
            {job.error && <span className="text-red-600">· {job.error.message}</span>}
          </span>
        }
        actions={<JobControls job={job} size="md" />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="panel min-w-0 p-5">
          <h2 className="mb-4 text-sm font-semibold text-navy-900">Execution steps</h2>
          <ExecutionPlan steps={data.steps} detailed />
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Job record</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {facts.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-navy-500">{k}</dt>
                  <dd className="truncate font-medium text-navy-900" title={v}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
              {job.lead_id && <Link to={`/broker/leads/${job.lead_id}`} className="text-brand-600">Lead</Link>}
              {job.quote_id && <Link to={`/broker/quotes/${job.quote_id}`} className="text-brand-600">Quote comparison</Link>}
              {data.approvals.length > 0 && <Link to="/broker/approvals" className="text-brand-600">Approvals ({data.approvals.length})</Link>}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Approval history</h2>
            {data.approvals.length === 0 ? (
              <p className="mt-2 text-xs text-navy-600">No approval requested yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.approvals.map((a) => (
                  <li key={a.id} className="rounded-lg bg-mist p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-navy-900">{a.summary}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-0.5 text-navy-600">
                      Raised {formatDateTime(a.created_at)}
                      {a.decided_at && ` · decided ${formatDateTime(a.decided_at)}`}
                      {a.decision_note && ` · “${a.decision_note}”`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Audit trail</h2>
            <ul className="scroll-area mt-3 max-h-80 space-y-1.5">
              {data.audit.map((e) => (
                <li key={e.id} className="flex gap-2 text-xs">
                  <code className="shrink-0 text-navy-500">{formatDateTime(e.created_at)}</code>
                  <span className="min-w-0 truncate">
                    <strong className="text-navy-800">{e.action}</strong>
                    <span className="text-navy-600"> · {e.actor_type} {e.actor_type === 'agent' ? e.actor_id : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="text-sm font-semibold text-navy-900">Inputs and outputs</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <pre className="scroll-area max-h-72 overflow-auto rounded-xl bg-navy-900 p-3 text-[11px] text-navy-100">{JSON.stringify(job.inputs, null, 2)}</pre>
          <pre className="scroll-area max-h-72 overflow-auto rounded-xl bg-navy-900 p-3 text-[11px] text-navy-100">
            {JSON.stringify(job.outputs ?? Object.fromEntries(data.steps.map((s) => [s.key, s.output])), null, 2)}
          </pre>
        </div>
      </section>
    </div>
  )
}
