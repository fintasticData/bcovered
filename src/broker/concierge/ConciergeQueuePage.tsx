import { Link, useSearchParams } from 'react-router-dom'
import { STATUS_LABEL, useConciergeBrokerQueue } from '@/api/concierge'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page } from '../shared/ui'
import { StatusBadge } from '@/components/StatusBadge'

export default function ConciergeQueuePage() {
  const [params] = useSearchParams()
  const personId = params.get('personId')
  const queue = useConciergeBrokerQueue(personId)

  return (
    <Page>
      <PageHeader
        title="Concierge requests"
        description="One queue across VIP Concierge customers. Assign, request information, allocate service providers, refer to a pilot partner, and record outcomes."
        actions={
          <Link to="/broker/concierge/providers" className="text-sm font-semibold text-brand-700 underline">
            Service providers
          </Link>
        }
      />
      {personId && (
        <p className="mb-3 text-xs font-semibold text-navy-600">
          Filtered to this customer · <Link to="/broker/concierge" className="text-brand-700 underline">Clear filter</Link>
        </p>
      )}
      {queue.isLoading && <LoadingState label="Loading Concierge queue…" />}
      {queue.error && <ErrorState message={queue.error.message} />}
      {queue.data && (
        <div className="overflow-x-auto rounded-2xl border border-navy-800/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-navy-800/10 bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Next action</th>
                <th className="px-3 py-2">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {(queue.data.rows ?? []).map((row) => (
                <tr key={row.id} className="border-b border-navy-800/5 hover:bg-navy-50/50">
                  <td className="px-3 py-2.5">
                    <Link to={`/broker/concierge/${row.id}`} className="font-semibold text-brand-700 underline">
                      {row.reference}
                    </Link>
                    <p className="text-xs text-navy-600">{row.title}</p>
                    <StatusBadge status={row.status} />
                    <span className="sr-only">{STATUS_LABEL[row.status]}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link to={`/broker/customers/people/${row.person_id}`} className="font-medium text-navy-900 underline">
                      {row.customer_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-navy-800">{row.owner_name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-navy-800">{row.servicing_partner ?? '—'}</td>
                  <td className="px-3 py-2.5 text-navy-700">{Math.round(row.age_hours)}h</td>
                  <td className="px-3 py-2.5 text-navy-800">{row.next_action ?? '—'}</td>
                  <td className="px-3 py-2.5 text-navy-700">
                    {row.follow_up_at ? new Date(row.follow_up_at).toLocaleDateString('en-ZA') : '—'}
                  </td>
                </tr>
              ))}
              {(queue.data.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-navy-600">
                    No Concierge requests in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
