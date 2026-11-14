import { Link } from 'react-router-dom'
import { Database, Loader2 } from 'lucide-react'
import { useLoadCompletedSubmissions, useSubmissions } from '@/api/hooks'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice } from './RiskTwinsPage'

export default function SubmissionsPage() {
  const { data, isLoading, error } = useSubmissions()
  const load = useLoadCompletedSubmissions()
  const loadButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => load.mutate()}
      disabled={load.isPending}
      title="Runs three fictional businesses through the full review: Risk Twin, draft pack, broker decisions, approval and ready for market. Loading again adds nothing; Demo Studio reset removes them."
    >
      {load.isPending ? <Loader2 className="animate-spin" /> : <Database />} {load.isPending ? 'Agents preparing packs…' : 'Load completed demo submissions'}
    </Button>
  )
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Underwriting submissions"
        description="Draft insurer-ready packs prepared by the Commercial Underwriting Agent. Every pack needs broker approval, and nothing is sent to an insurer from this demo."
        actions={loadButton}
      />
      {load.data && (
        <Notice onClose={() => load.reset()}>
          {load.data.completed
            ? `${load.data.completed} submission pack${load.data.completed === 1 ? '' : 's'} prepared, approved by you and marked ready for market. Nothing was sent to an insurer.`
            : 'The completed demo submissions are already loaded. Nothing was added.'}
          {load.data.failed.map((f) => (
            <span key={f.business_name} className="mt-1 block text-red-700">
              {f.business_name}: {f.reason}
            </span>
          ))}
        </Notice>
      )}
      {load.error && <ErrorState message={load.error.message} />}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data?.length === 0 && (
        <EmptyState title="No submission packs yet">
          Ask Russ to review a business, or load three completed demo packs.
          <div className="mt-3 flex justify-center">{loadButton}</div>
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {data.map((r) => (
            <li key={r.submission.id}>
              <Link to={`/broker/commercial/submissions/${r.submission.id}`} className="panel block p-4 active:bg-mist">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium text-navy-900">{r.business_name}</span>
                  <StatusBadge status={r.submission.status} />
                </div>
                <p className="mt-1 text-xs text-navy-600">
                  {r.industry_name} · {r.section_count} sections {r.pending_approval && '· approval pending'}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
                  <div className="h-full bg-brand-500" style={{ width: `${r.submission.completeness}%` }} />
                </div>
                <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-navy-600">
                  {r.submission.completeness}% complete <SimulatedBadge label="Not sent" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && data.length > 0 && (
        <div className="panel scroll-area hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Sections</th>
                <th className="px-4 py-3">Completeness</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {data.map((r) => (
                <tr key={r.submission.id}>
                  <td className="px-4 py-3">
                    <Link to={`/broker/commercial/submissions/${r.submission.id}`} className="font-medium text-navy-900 hover:text-brand-600">
                      {r.business_name}
                    </Link>
                    <p className="text-[11px] text-navy-500">{r.industry_name}</p>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{r.section_count}</td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-navy-100">
                      <div className="h-full bg-brand-500" style={{ width: `${r.submission.completeness}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-navy-600">{r.submission.completeness}%</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.submission.status} />
                      <SimulatedBadge label="Not sent" />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-navy-600">{formatDateTime(r.submission.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
