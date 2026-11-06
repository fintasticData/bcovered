import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeads } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from './PageHeader'

const FILTERS = [
  { id: 'open', label: 'Open', match: (s: string) => !['won', 'lost', 'proposal_released'].includes(s) },
  { id: 'released', label: 'Proposal released', match: (s: string) => s === 'proposal_released' },
  { id: 'all', label: 'All', match: () => true },
]

export default function LeadsPage() {
  const { data: leads, isLoading, error } = useLeads()
  const [filter, setFilter] = useState('open')
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!
    return (leads ?? []).filter((l) => f.match(l.status))
  }, [leads, filter])

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Leads"
        description="Enquiries captured by Ava, the web form and the Copilot. Agents keep these records current as they work."
        actions={FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f.id ? 'bg-navy-800 text-white' : 'bg-white text-navy-700 ring-1 ring-navy-800/10'}`}
          >
            {f.label}
          </button>
        ))}
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {leads && rows.length === 0 && <EmptyState title="No leads in this view" />}
      {rows.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {rows.map((l) => (
            <li key={l.id}>
              <Link to={`/broker/leads/${l.id}`} className="panel block p-4 active:bg-mist">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium text-navy-900">{l.customer_name}</span>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-navy-600">{l.qualification.summary}</p>
                <p className="mt-2 text-[11px] text-navy-500">
                  {humanise(l.product_category)} · {l.line} · {l.missing_info.length ? `${l.missing_info.length} missing` : 'complete'} · {formatDateTime(l.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="panel scroll-area hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Urgency</th>
                <th className="px-4 py-3">Missing info</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-mist/60">
                  <td className="px-4 py-3">
                    <Link to={`/broker/leads/${l.id}`} className="font-medium text-navy-900 hover:text-brand-600">
                      {l.customer_name}
                    </Link>
                    <p className="max-w-xs truncate text-[11px] text-navy-500">{l.qualification.summary}</p>
                  </td>
                  <td className="px-4 py-3 text-navy-700">
                    {humanise(l.product_category)} <span className="text-[11px] text-navy-500">· {l.line}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-xs text-navy-700">{l.urgency ? humanise(l.urgency) : '–'}</td>
                  <td className="px-4 py-3 text-xs text-navy-700">{l.missing_info.length ? l.missing_info.length : 'None'}</td>
                  <td className="px-4 py-3 text-xs text-navy-700">{humanise(l.source)}</td>
                  <td className="px-4 py-3 text-xs text-navy-600">{formatDateTime(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
