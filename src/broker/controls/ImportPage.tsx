import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useImport, useRequestCommit } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Filters, Notice, Page, Section, Stat, Table, Td } from '../shared/ui'

type RowFilter = 'all' | 'issues' | 'new' | 'duplicate'

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : typeof v === 'number' ? v.toLocaleString('en-ZA', { maximumFractionDigits: 2 }) : String(v))

export default function ImportPage() {
  const { batchId } = useParams()
  const { data, isLoading, error } = useImport(batchId)
  const commit = useRequestCommit()
  const [filter, setFilter] = useState<RowFilter>('issues')
  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter((r) =>
        filter === 'issues' ? r.validation_errors.length > 0 || !['matched'].includes(r.match_status) : filter === 'new' ? r.match_status === 'new' : filter === 'duplicate' ? r.match_status === 'duplicate' : true,
      ),
    [data, filter],
  )
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const { batch } = data
  const count = (s: string) => data.rows.filter((r) => r.match_status === s).length
  const pending = data.approvals.find((a) => a.status === 'pending')
  const columns = Object.keys(data.rows[0]?.normalised ?? {}).filter((c) => c !== 'period')

  return (
    <Page wide>
      <PageHeader
        title={batch.file_name ?? 'Import'}
        description={
          <>
            {data.dataset_label} · {data.customer ?? data.source.name} · {batch.reporting_period?.slice(0, 7) ?? 'no period'} · imported {formatDateTime(batch.created_at)}
            {data.uploaded_by && ` by ${data.uploaded_by}`}
            {batch.is_demo_fixture && ' · synthetic demo file'}
          </>
        }
        actions={<StatusBadge status={batch.status} />}
      />
      {data.supersedes && (
        <Notice>
          Supersedes{' '}
          <Link to={`/broker/controls/imports/${data.supersedes.id}`} className="font-semibold underline">
            {data.supersedes.file_name}
          </Link>{' '}
          for the same period. When this batch is committed the earlier one is marked superseded, so nothing is counted twice.
        </Notice>
      )}
      {data.superseded_by && <Notice tone="warning">A newer file for this period supersedes this batch.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Rows" value={batch.row_count} />
        <Stat label="Validation errors" value={batch.error_count ?? '–'} tone={batch.error_count ? 'danger' : undefined} />
        <Stat label="Matched" value={count('matched')} />
        <Stat label="Probable" value={count('probable')} tone={count('probable') ? 'warning' : undefined} />
        <Stat label="New" value={count('new')} />
        <Stat label="Duplicates" value={count('duplicate')} tone={count('duplicate') ? 'warning' : undefined} />
      </div>

      {data.changes.length > 0 && (
        <Section
          title={`Member changes this payroll would make (${data.changes.length})`}
          actions={
            pending ? (
              <Button size="sm" variant="accent" asChild>
                <Link to="/broker/approvals">Open the approval</Link>
              </Button>
            ) : (
              <Button size="sm" variant="accent" disabled={commit.isPending} onClick={() => commit.mutate(batch.id)}>
                Request approval to commit
              </Button>
            )
          }
        >
          {commit.error && <p className="mb-2 text-xs text-red-600">{commit.error.message}</p>}
          <Table head={['Change', 'Member', 'Current', 'Suggested']} minWidth={760}>
            {data.changes.map((c, i) => (
              <tr key={i}>
                <Td>
                  <Badge tone={c.kind === 'leaver' ? 'warning' : c.kind === 'joiner' ? 'success' : 'info'}>{humanise(c.kind)}</Badge>
                </Td>
                <Td>
                  {c.person_id ? (
                    <Link to={`/broker/people/${c.person_id}`} className="font-medium text-brand-600">
                      {c.label}
                    </Link>
                  ) : (
                    c.label
                  )}
                  <p className="text-[11px] text-navy-500">{c.employee_number}</p>
                </Td>
                <Td className="text-xs">{c.current ? Object.entries(c.current).map(([k, v]) => `${humanise(k)}: ${show(v)}`).join(' · ') : '–'}</Td>
                <Td className="text-xs font-medium text-navy-900">{c.suggested ? Object.entries(c.suggested).map(([k, v]) => `${humanise(k)}: ${show(v)}`).join(' · ') : '–'}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-[11px] text-navy-500">Approving applies these changes with effective dates and records each one as a member movement. Nothing is sent to the insurer or administrator.</p>
        </Section>
      )}

      <Section title="Rows" actions={<Filters value={filter} onChange={setFilter} options={[{ id: 'issues', label: 'Needs attention' }, { id: 'new', label: 'New' }, { id: 'duplicate', label: 'Duplicates' }, { id: 'all', label: 'All' }]} />}>
        <Table head={['#', ...columns.map(humanise), 'Match', 'Validation']} minWidth={1100}>
          {rows.slice(0, 300).map((r) => (
            <tr key={r.id}>
              <Td className="text-xs text-navy-500">{r.row_number}</Td>
              {columns.map((c) => (
                <Td key={c} className="text-xs">
                  {c === 'id_number' ? `•••• ${String(r.normalised?.[c] ?? '').slice(-4)}` : show(r.normalised?.[c])}
                </Td>
              ))}
              <Td className="text-xs">
                <StatusBadge status={r.match_status} />
                {r.match_basis && <p className="mt-0.5 text-[11px] text-navy-500">{r.match_basis}</p>}
              </Td>
              <Td className="text-xs text-red-700">{r.validation_errors.join('; ') || <span className="text-emerald-700">OK</span>}</Td>
            </tr>
          ))}
        </Table>
        {!rows.length && <p className="text-sm text-navy-500">No rows in this view.</p>}
      </Section>

      {data.evidence.length > 0 && (
        <Section title="Evidence (append-only)">
          <ul className="space-y-1 text-xs text-navy-700">
            {data.evidence.map((e) => (
              <li key={e.id}>
                {humanise(e.kind)} · {e.description} · hash {e.sha256.slice(0, 12)} · {formatDateTime(e.created_at)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  )
}
