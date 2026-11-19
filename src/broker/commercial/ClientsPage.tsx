import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import { useCommercialClients } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { AddBusinessDialog } from '../customers/AddBusinessDialog'
import { lensPath } from '../russ/lenses'

export default function ClientsPage() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useCommercialClients()
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Business clients"
        description="Every commercial client with a structured business profile. Open one to see its Risk Twin, potential exposures and outstanding requests."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={lensPath('commercial')}>
                <Sparkles /> Ask Russ · Commercial
              </Link>
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus /> New business client
            </Button>
          </div>
        }
      />
      {open && (
        <AddBusinessDialog
          onClose={() => setOpen(false)}
          onCreated={(profileId) => {
            setOpen(false)
            navigate(`/broker/commercial/clients/${profileId}`)
          }}
        />
      )}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data?.length === 0 && (
        <EmptyState title="No business clients yet">
          Create one with <strong>New business client</strong>, ask Russ, or run the Restaurant Group scenario in Demo Studio.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {data.map((r) => (
            <li key={r.profile.id}>
              <Link to={`/broker/commercial/clients/${r.profile.id}`} className="panel block p-4 active:bg-mist">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium text-navy-900">{r.profile.trading_name ?? r.profile.registered_name}</span>
                  <StatusBadge status={r.profile.status} />
                </div>
                <p className="mt-1 text-xs text-navy-600">
                  {r.industry_name} · {r.location_count} location{r.location_count === 1 ? '' : 's'}
                </p>
                <p className="mt-2 text-[11px] text-navy-500">
                  {r.twin_version ? `${r.exposure_count} exposures (${r.high_priority_count} high)` : 'No Risk Twin yet'} ·{' '}
                  {r.submission ? `submission ${humanise(r.submission.status).toLowerCase()} ${r.submission.completeness}%` : 'no submission'} ·{' '}
                  {r.open_customer_tasks + r.open_broker_tasks} open requests
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && data.length > 0 && (
        <div className="panel scroll-area hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Locations</th>
                <th className="px-4 py-3">Exposures</th>
                <th className="px-4 py-3">Submission</th>
                <th className="px-4 py-3">Open requests</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {data.map((r) => (
                <tr key={r.profile.id} className="hover:bg-mist/60">
                  <td className="px-4 py-3">
                    <Link to={`/broker/commercial/clients/${r.profile.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.profile.trading_name ?? r.profile.registered_name}
                    </Link>
                    <p className="text-[11px] text-navy-500">Updated {formatDateTime(r.profile.updated_at)}</p>
                  </td>
                  <td className="px-4 py-3 text-navy-700">{r.industry_name}</td>
                  <td className="px-4 py-3 text-navy-700">{r.location_count}</td>
                  <td className="px-4 py-3 text-navy-700">
                    {r.twin_version ? (
                      <>
                        {r.exposure_count}
                        {r.high_priority_count > 0 && <span className="text-amber-700"> · {r.high_priority_count} high</span>}
                      </>
                    ) : (
                      <span className="text-navy-400">No twin</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-navy-700">
                    {r.submission ? (
                      <Link to={`/broker/commercial/submissions/${r.submission.id}`} className="text-brand-700 hover:underline">
                        {humanise(r.submission.status)} · {r.submission.completeness}%
                      </Link>
                    ) : (
                      <span className="text-navy-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-navy-700">{r.open_customer_tasks + r.open_broker_tasks}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.profile.status} />
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
