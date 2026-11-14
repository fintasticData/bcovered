import { useMemo, useState } from 'react'
import { useOnboardingQueue } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { MODULE_LABEL } from '@/server/onboarding/config'
import { ErrorState, LoadingState, PageHeader } from '@/broker/PageHeader'
import { Filters, Page, RowLink, Table, Td } from '@/broker/shared/ui'

type Filter = 'open' | 'submitted' | 'under_review' | 'information_required' | 'approved' | 'draft' | 'closed'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'open', label: 'Needs B-Covered' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under review' },
  { id: 'information_required', label: 'Information required' },
  { id: 'approved', label: 'Approved, not active' },
  { id: 'draft', label: 'Drafts' },
  { id: 'closed', label: 'Active and closed' },
]

const MATCH: Record<Filter, string[]> = {
  open: ['submitted', 'under_review', 'approved'],
  submitted: ['submitted'],
  under_review: ['under_review'],
  information_required: ['information_required'],
  approved: ['approved'],
  draft: ['draft'],
  closed: ['active', 'suspended', 'declined', 'withdrawn'],
}

export default function QueuePage() {
  const { data = [], isLoading, error } = useOnboardingQueue()
  const [filter, setFilter] = useState<Filter>('open')
  const rows = useMemo(() => data.filter((r) => MATCH[filter].includes(r.status)), [data, filter])
  return (
    <Page wide>
      <PageHeader title="Onboarding queue" description="Brokerage applications and invitations. Approval and activation are separate decisions; neither is regulatory authorisation." />
      <Filters value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, label: `${f.label} (${data.filter((r) => MATCH[f.id].includes(r.status)).length})` }))} />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : (
        <div className="panel overflow-hidden">
          <Table head={['Brokerage', 'Owner', 'Submitted', 'Status', 'Outstanding', 'Reviewer']} minWidth={900}>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-navy-600">
                  Nothing in this view.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.application_id}>
                <Td>
                  <RowLink to={`/platform/onboarding/${r.application_id}`}>{r.brokerage}</RowLink>
                  <span className="block text-[11px] text-navy-500">
                    {r.route === 'invitation' ? 'Invited' : 'Applied'} · {r.modules.map((m) => MODULE_LABEL[m]).join(', ') || 'no modules yet'}
                  </span>
                </Td>
                <Td>
                  {r.owner ? (
                    <>
                      {r.owner.name}
                      <span className="block text-[11px] text-navy-500">{r.owner.email}</span>
                    </>
                  ) : (
                    '–'
                  )}
                </Td>
                <Td>{r.submitted_at ? formatDateTime(r.submitted_at) : <span className="text-navy-400">not submitted</span>}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td>
                  {r.required_done}/{r.required_total} done
                  {r.outstanding > 0 && <span className="block text-[11px] text-navy-600">{r.outstanding} outstanding</span>}
                  {r.attention > 0 && <span className="block text-[11px] text-amber-700">{r.attention} awaiting correction</span>}
                </Td>
                <Td>{r.assigned_reviewer ?? <span className="text-navy-400">unassigned</span>}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
