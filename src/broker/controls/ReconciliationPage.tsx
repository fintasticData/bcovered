import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useReconciliation } from '@/api/hooks'
import type { ReconDetail } from '@/api/client'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Filters, Notice, Page, Section, Stat, Table, Td, num, zar } from '../shared/ui'

type Outcome = 'problems' | 'matched' | 'all'

export default function ReconciliationPage() {
  const { runId } = useParams()
  const { data, isLoading, error } = useReconciliation(runId)
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  return (
    <Page wide>
      <ReconView data={data} />
    </Page>
  )
}

export function ReconView({ data, compact = false }: { data: ReconDetail; compact?: boolean }) {
  const [filter, setFilter] = useState<Outcome>('problems')
  const { run } = data
  const units = data.definition.key === 'admin_vs_manager_holdings'
  const fmt = (n: number | null, measure: string) => (measure === 'units' ? num(n, 4) : zar(n, true))
  const items = useMemo(
    () => data.items.filter((i) => (filter === 'problems' ? !['matched', 'within_tolerance'].includes(i.outcome) : filter === 'matched' ? ['matched', 'within_tolerance'].includes(i.outcome) : true)),
    [data.items, filter],
  )
  return (
    <div className="space-y-4">
      {!compact && (
        <PageHeader
          title={data.definition.name}
          description={
            <>
              {data.customer ?? 'Fund-level'} · {run.reporting_period.slice(0, 7)} · run {formatDateTime(run.created_at)} · definition v{data.definition.version}
            </>
          }
          actions={<StatusBadge status={run.status} />}
        />
      )}
      {run.status === 'superseded' && <Notice tone="warning">A newer run for the same scope and period supersedes this one.</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={data.left_label} value={units ? `${num(run.left_total)} combined` : zar(run.left_total, true)} basis={data.definition.key === 'payroll_vs_admin_contributions' || data.definition.key === 'fund_balance_rollforward' ? 'calculated' : 'reported'} />
        <Stat label={data.right_label} value={units ? `${num(run.right_total)} combined` : zar(run.right_total, true)} basis="reported" />
        <Stat label="Difference" value={units ? num(run.difference_total, 4) : zar(run.difference_total, true)} tone={run.difference_total ? 'danger' : undefined} />
        <Stat label="Outcome" value={`${run.matched_count} matched`} hint={`${run.difference_count} differences · ${run.left_only_count} left only · ${run.right_only_count} right only`} />
      </div>

      <Section title="Items" actions={<Filters value={filter} onChange={setFilter} options={[{ id: 'problems', label: 'Problems' }, { id: 'matched', label: 'Matched' }, { id: 'all', label: 'All' }]} />}>
        <Table head={['Member or key', 'Outcome', 'Field', data.left_label, data.right_label, 'Difference']} minWidth={820}>
          {items.slice(0, compact ? 12 : 400).map((i) => (
            <tr key={i.id}>
              <Td>
                {i.person_id ? (
                  <Link to={`/broker/people/${i.person_id}`} className="font-medium text-brand-600">
                    {i.label}
                  </Link>
                ) : (
                  i.label
                )}
              </Td>
              <Td>
                <StatusBadge status={i.outcome === 'difference' ? 'failed' : i.outcome === 'matched' ? 'completed' : i.outcome === 'duplicate' ? 'blocked' : 'awaiting_information'} className="mr-1" />
                <span className="text-xs text-navy-600">{humanise(i.outcome)}</span>
              </Td>
              <Td className="text-xs">{i.field ? humanise(i.field) : '–'}</Td>
              <Td>{fmt(i.left_value, i.measure)}</Td>
              <Td>{fmt(i.right_value, i.measure)}</Td>
              <Td className={i.difference ? 'font-semibold text-red-700' : ''}>{fmt(i.difference, i.measure)}</Td>
            </tr>
          ))}
        </Table>
        {compact && items.length > 12 && (
          <Link to={`/broker/controls/reconciliations/${run.id}`} className="mt-2 inline-block text-xs font-semibold text-brand-600">
            All {items.length} items
          </Link>
        )}
      </Section>

      {data.exceptions.length > 0 && (
        <Section title={`Exceptions (${data.exceptions.length})`} actions={<Link to="/broker/controls/exceptions" className="text-xs font-semibold text-brand-600">Exceptions dashboard</Link>}>
          <ul className="divide-y divide-navy-800/5 text-sm">
            {data.exceptions.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{e.title}</span>
                <span className="flex items-center gap-1.5">
                  <StatusBadge status={e.severity === 'high' || e.severity === 'critical' ? 'failed' : e.severity === 'medium' ? 'awaiting_information' : 'pending'} />
                  <span className="text-xs text-navy-600">{humanise(e.severity)}</span>
                  <StatusBadge status={e.status} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.correction && (
        <Section
          title="Correction schedule"
          actions={
            <>
              <StatusBadge status={data.correction.status} />
              {data.approvals.some((a) => a.status === 'pending') && (
                <Button size="sm" variant="accent" asChild>
                  <Link to="/broker/approvals">Open the approval</Link>
                </Button>
              )}
            </>
          }
        >
          <Table head={['Member', 'Expected', 'Reported', 'Difference', 'Action']} minWidth={820}>
            {data.correction.lines.map((l, i) => (
              <tr key={i}>
                <Td>
                  {l.member}
                  {l.employee_number && <p className="text-[11px] text-navy-500">{l.employee_number}</p>}
                </Td>
                <Td>{zar(l.expected, true)}</Td>
                <Td>{zar(l.reported, true)}</Td>
                <Td className="font-semibold">{zar(l.difference, true)}</Td>
                <Td className="text-xs">{l.action}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-navy-600">
            Net correction {zar(data.correction.total, true)}. Released schedules are previews for the administrator; B-Covered does not instruct payments.
          </p>
        </Section>
      )}

      {!compact && data.evidence.length > 0 && (
        <Section title="Evidence (append-only)">
          <ul className="space-y-1 text-xs text-navy-700">
            {data.evidence.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <BasisBadge basis={e.kind === 'calculation' ? 'calculated' : 'reported'} /> {e.description} · hash {e.sha256.slice(0, 12)} · {formatDateTime(e.created_at)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}