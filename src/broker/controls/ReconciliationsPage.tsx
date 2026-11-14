import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useEmployers, useReconciliations, useStartContributionRecon } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, RowLink, Section, Table, Td, zar } from '../shared/ui'

export default function ReconciliationsPage() {
  const { data, isLoading, error } = useReconciliations()
  const { data: employers = [] } = useEmployers()
  const start = useStartContributionRecon()
  const navigate = useNavigate()
  const [employer, setEmployer] = useState('')
  const [period, setPeriod] = useState('2026-10')

  return (
    <Page>
      <PageHeader title="Reconciliations" description="Every run keeps its definition, inputs, totals and items. A rerun for the same scope and period supersedes the previous run; exceptions are deduplicated." />
      <Section title="Run a contribution reconciliation">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="field-label text-xs">Employer</span>
            <select value={employer} onChange={(e) => setEmployer(e.target.value)} className="field">
              <option value="">Choose an employer</option>
              {employers
                .filter((e) => e.funds > 0)
                .map((e) => (
                  <option key={e.customer.id} value={e.customer.id}>
                    {e.customer.full_name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className="field-label text-xs">Period</span>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="field" />
          </label>
          <Button
            size="sm"
            variant="accent"
            disabled={!employer || start.isPending}
            onClick={() => start.mutate({ employer_customer_id: employer, reporting_period: `${period}-01` }, { onSuccess: (r) => navigate(`/broker/jobs/${r.job_id}`) })}
          >
            <Play /> Start
          </Button>
          {start.error && <span className="text-xs text-red-600">{start.error.message}</span>}
        </div>
      </Section>
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No reconciliations yet">Ask Russ to reconcile the October payroll, or start one above.</EmptyState>}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['Reconciliation', 'Scope', 'Period', 'Left total', 'Right total', 'Difference', 'Open exceptions', 'Status']} minWidth={1000}>
            {data.map((r) => (
              <tr key={r.run.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/controls/reconciliations/${r.run.id}`}>{r.definition.name}</RowLink>
                  <p className="text-[11px] text-navy-500">{formatDateTime(r.run.created_at)}</p>
                </Td>
                <Td>{r.customer ?? '–'}</Td>
                <Td>{r.run.reporting_period.slice(0, 7)}</Td>
                <Td>{zar(r.run.left_total, true)}</Td>
                <Td>{zar(r.run.right_total, true)}</Td>
                <Td className={r.run.difference_total ? 'font-semibold text-red-700' : ''}>{zar(r.run.difference_total, true)}</Td>
                <Td>{r.open_exceptions}</Td>
                <Td>
                  <StatusBadge status={r.run.status} />
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
