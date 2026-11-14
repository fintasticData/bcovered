import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useFranchiseEnquiries, type EnquiryStatusFilter } from '@/copilot/franchiseApi'
import type { DataCategory } from '@/lib/supabase/category'
import { EmptyState, LoadingState } from '../PageHeader'
import { ErrorText, MemberLabel, dateTime, inputClass, shortDate } from '../book/bits'
import { Chips, EnquiryStageBadge } from './shared'

type StatusChip = EnquiryStatusFilter | 'all'

/** Franchise enquiries in the workspace category, newest first. Opening a row goes to the client record to log the call and set the follow-up. */
export function EnquiriesTab({ category, status, outletId, outletLabel, from, to, onStatus, onClearOutlet, onClearDates }: {
  category: DataCategory
  status: EnquiryStatusFilter | null
  outletId: string | null
  outletLabel: string | null
  from: string | null
  to: string | null
  onStatus: (s: EnquiryStatusFilter | null) => void
  onClearOutlet: () => void
  onClearDates: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const q = useFranchiseEnquiries(category, { status, outlet_id: outletId, from, to, query: query.trim() || null })
  const t = q.data?.totals
  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips<StatusChip>
          label="Enquiry progress"
          value={status ?? 'all'}
          onChange={(v) => onStatus(v === 'all' ? null : v)}
          options={[
            { id: 'all', label: 'All', count: t?.received },
            { id: 'uncontacted', label: 'Not contacted', count: t?.uncontacted },
            { id: 'contacted', label: 'Contacted', count: t?.contacted },
            { id: 'offered', label: 'Offer sent', count: t?.offered },
            { id: 'sold', label: 'Sold', count: t?.sold },
          ]}
        />
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search franchise enquiries</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-navy-400" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, EN- or CL- number" className={`${inputClass} pl-8`} />
        </label>
      </div>
      {(outletId || from || to) && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-navy-600">
          {outletId && (
            <span>
              Filtered to <strong>{outletLabel ?? 'one outlet'}</strong>.{' '}
              <button type="button" className="cursor-pointer font-semibold text-brand-700 hover:underline" onClick={onClearOutlet}>Show all outlets</button>
            </span>
          )}
          {(from || to) && (
            <span>
              Received {from ? shortDate(from) : 'any time'} to {to ? shortDate(to) : 'today'}.{' '}
              <button type="button" className="cursor-pointer font-semibold text-brand-700 hover:underline" onClick={onClearDates}>Any date</button>
            </span>
          )}
        </p>
      )}
      {q.isLoading ? <LoadingState label="Loading franchise enquiries…" /> : q.error ? <ErrorText error={q.error} /> : !q.data!.rows.length ? (
        <EmptyState title={status === 'uncontacted' ? 'Every franchise enquiry has been contacted' : 'No franchise enquiries here'}>
          Enquiries arrive here when a customer uses an outlet’s link, QR code or code, or an outlet captures a request for contact.
        </EmptyState>
      ) : (
        <>
        <ul className="space-y-2 @3xl:hidden" aria-label="Franchise enquiries">
          {q.data!.rows.map((r) => (
            <li key={r.id}>
              <a href={r.open_path} onClick={(e) => { e.preventDefault(); navigate(r.open_path) }}
                className="block rounded-xl border border-navy-800/10 bg-white p-3 text-sm active:bg-brand-50/60">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-navy-900">{r.name}</span>
                    <span className="block font-mono text-[11px] text-navy-500">{r.reference} · {r.client?.client_number ?? r.phone ?? r.email ?? '–'}</span>
                  </span>
                  <EnquiryStageBadge stage={r.stage} />
                </span>
                <span className="mt-1.5 block text-xs text-navy-700">
                  {r.outlet.label}<span className="text-navy-500"> · {r.referred_by ? `referred by ${r.referred_by.name}` : 'outlet code'} · {dateTime(r.received_at)}</span>
                </span>
                {r.match_status === 'possible_match' && <span className="block text-[11px] font-semibold text-amber-700">Confirm the match in My workspace</span>}
                <span className="mt-2 grid grid-cols-2 gap-2 border-t border-navy-800/5 pt-2 text-xs">
                  <span className="min-w-0"><span className="block text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Handling</span><MemberLabel member={r.handler} /></span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Next follow-up</span>
                    {r.next_follow_up ? <span className="block truncate text-navy-700">{shortDate(r.next_follow_up.due_date)} · {r.next_follow_up.title}</span> : <span className="text-navy-400">–</span>}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-navy-800/10 @3xl:block">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2">Outlet</th>
                <th className="px-3 py-2">Client or contact</th>
                <th className="px-3 py-2">Handling</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Next follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {q.data!.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => navigate(r.open_path)}>
                  <td className="px-3 py-2.5">
                    <span className="block font-mono text-xs font-semibold text-navy-900">{r.reference}</span>
                    <span className="block text-[11px] text-navy-500">{dateTime(r.received_at)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-navy-900">{r.outlet.label}</span>
                    <span className="block text-[11px] text-navy-500">{r.referred_by ? `Referred by ${r.referred_by.name}` : 'Outlet code'}{r.outlet.area ? ` · ${r.outlet.area}` : ''}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <a href={r.open_path} onClick={(e) => { e.preventDefault(); navigate(r.open_path) }} className="block font-medium text-navy-900 hover:underline">{r.name}</a>
                    <span className="block font-mono text-[11px] text-navy-500">{r.client?.client_number ?? r.phone ?? r.email ?? '–'}</span>
                    {r.match_status === 'possible_match' && <span className="block text-[11px] font-semibold text-amber-700">Confirm the match in My workspace</span>}
                  </td>
                  <td className="px-3 py-2.5"><MemberLabel member={r.handler} /></td>
                  <td className="px-3 py-2.5"><EnquiryStageBadge stage={r.stage} /></td>
                  <td className="px-3 py-2.5 text-xs text-navy-700">{r.next_follow_up ? <>{r.next_follow_up.title}<span className="block text-[11px] text-navy-500">{shortDate(r.next_follow_up.due_date)}</span></> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
