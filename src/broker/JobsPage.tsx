import { Link } from 'react-router-dom'
import { useJobs } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { agentLabel } from '@/server/agents/catalog'
import { JobControls } from './JobControls'
import { EmptyState, ErrorState, LoadingState, PageHeader } from './PageHeader'

export default function JobsPage() {
  const { data: jobs, isLoading, error } = useJobs()

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Tasks & Jobs"
        description="Every agent workflow is a durable job with steps, tool calls and an audit trail. Jobs start on demand only; nothing recurs automatically."
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {jobs?.length === 0 && <EmptyState title="No jobs yet">Run Scenario 1 in Demo Studio or ask the Copilot to create a comparison.</EmptyState>}
      {jobs && jobs.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {jobs.map((j) => (
            <li key={j.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/broker/jobs/${j.id}`} className="min-w-0 font-medium text-navy-900">
                  {j.title}
                </Link>
                <StatusBadge status={j.status} />
              </div>
              <p className="mt-1 text-xs text-navy-600">
                {j.customer_name ?? 'No customer yet'} · {formatDateTime(j.created_at)}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
                <div className="h-full bg-brand-500" style={{ width: `${(j.steps_done / Math.max(1, j.steps_total)) * 100}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-navy-600">
                {j.steps_done}/{j.steps_total} {j.current_step && `· ${j.current_step}`}
              </p>
              <div className="mt-3">
                <JobControls job={j} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {jobs && jobs.length > 0 && (
        <div className="panel scroll-area hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {jobs.map((j) => (
                <tr key={j.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link to={`/broker/jobs/${j.id}`} className="font-medium text-navy-900 hover:text-brand-600">
                      {j.title}
                    </Link>
                    <p className="text-[11px] text-navy-500">
                      {agentLabel(j.agent)} · {j.id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{j.customer_name ?? '–'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-navy-100">
                      <div className="h-full bg-brand-500" style={{ width: `${(j.steps_done / Math.max(1, j.steps_total)) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-navy-600">
                      {j.steps_done}/{j.steps_total} {j.current_step && `· ${j.current_step}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-navy-600">{formatDateTime(j.created_at)}</td>
                  <td className="px-4 py-3">
                    <JobControls job={j} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
