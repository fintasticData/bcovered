import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useExceptions, useResolveException, useUpdateExceptions } from '@/api/hooks'
import type { ExceptionRow } from '@/api/client'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Filters, Page, Section, Stat, Table, Td, zar } from '../shared/ui'

type View = 'open' | 'all'
type Group = 'employer' | 'fund' | 'portfolio' | 'category'
const RESOLUTIONS = ['corrected_at_source', 'correction_schedule', 'payment_received', 'explained', 'false_positive', 'write_off'] as const

export default function ExceptionsPage() {
  const [params] = useSearchParams()
  const [view, setView] = useState<View>('open')
  const [group, setGroup] = useState<Group>('employer')
  const { data, isLoading, error } = useExceptions(view === 'open')
  const update = useUpdateExceptions()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const employer = params.get('employer')
  const rows = useMemo(() => (data ?? []).filter((r) => !employer || r.exception.customer_id === employer), [data, employer])
  const groups = useMemo(() => {
    const key = (r: ExceptionRow) => (group === 'employer' ? (r.customer ?? 'No employer') : group === 'fund' ? (r.fund ?? 'No fund') : group === 'portfolio' ? (r.portfolio ?? 'No portfolio') : humanise(r.exception.category))
    const m = new Map<string, { count: number; high: number; amount: number }>()
    rows.forEach((r) => {
      const g = m.get(key(r)) ?? { count: 0, high: 0, amount: 0 }
      g.count++
      if (['high', 'critical'].includes(r.exception.severity)) g.high++
      g.amount += Math.abs(r.exception.amount ?? 0)
      m.set(key(r), g)
    })
    return [...m.entries()].sort((a, b) => b[1].high - a[1].high || b[1].amount - a[1].amount)
  }, [rows, group])
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const total = rows.reduce((s, r) => s + Math.abs(r.exception.amount ?? 0), 0)

  return (
    <Page wide>
      <PageHeader
        title="Financial exceptions"
        description="Differences found by reconciliations: classified, quantified, assigned and tracked to resolution. Russ prepares; people resolve. Write-offs need a second person’s approval."
        actions={<Filters value={view} onChange={setView} options={[{ id: 'open', label: 'Open' }, { id: 'all', label: 'All' }]} />}
      />
      {employer && (
        <p className="text-xs text-navy-600">
          Filtered to one employer.{' '}
          <Link to="/broker/controls/exceptions" className="font-semibold text-brand-600">
            Show all
          </Link>
        </p>
      )}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !rows.length && <EmptyState title="No exceptions in this view" />}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Exceptions" value={rows.length} />
            <Stat label="High or critical" value={rows.filter((r) => ['high', 'critical'].includes(r.exception.severity)).length} tone="danger" />
            <Stat label="Gross amount" value={zar(total, true)} basis="calculated" />
            <Stat label="Older than 30 days" value={rows.filter((r) => r.age_days > 30).length} />
          </div>
          <Section title="By area" actions={<Filters value={group} onChange={setGroup} options={[{ id: 'employer', label: 'Employer' }, { id: 'fund', label: 'Fund' }, { id: 'portfolio', label: 'Portfolio' }, { id: 'category', label: 'Category' }]} />}>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {groups.map(([name, g]) => (
                <div key={name} className="rounded-xl border border-navy-800/10 p-3">
                  <p className="text-sm font-semibold text-navy-900">{name}</p>
                  <p className="text-xs text-navy-600">
                    {g.count} open · {g.high} high · {zar(g.amount, true)}
                  </p>
                </div>
              ))}
            </div>
          </Section>
          <Section
            title="Exceptions"
            actions={
              <>
                <Button size="sm" variant="outline" disabled={!selected.size || update.isPending} onClick={() => update.mutate({ exception_ids: [...selected], assign_to_me: true }, { onSuccess: () => setSelected(new Set()) })}>
                  Assign {selected.size || ''} to me
                </Button>
                <Button size="sm" variant="outline" disabled={!selected.size || update.isPending} onClick={() => update.mutate({ exception_ids: [...selected], status: 'awaiting_third_party' }, { onSuccess: () => setSelected(new Set()) })}>
                  Awaiting third party
                </Button>
              </>
            }
          >
            <Table head={['', 'Exception', 'Area', 'Amount', 'Severity', 'Status', 'Owner', 'Resolve']} minWidth={1150}>
              {rows.map((r) => (
                <ExceptionTr key={r.exception.id} row={r} checked={selected.has(r.exception.id)} onToggle={() => toggle(r.exception.id)} />
              ))}
            </Table>
          </Section>
        </>
      )}
    </Page>
  )
}

function ExceptionTr({ row, checked, onToggle }: { row: ExceptionRow; checked: boolean; onToggle: () => void }) {
  const resolve = useResolveException()
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>('corrected_at_source')
  const [note, setNote] = useState('')
  const e = row.exception
  const open = ['open', 'investigating', 'awaiting_third_party'].includes(e.status)
  return (
    <tr className="align-top hover:bg-mist/60">
      <Td>{open && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${e.title}`} />}</Td>
      <Td>
        <p className="font-medium text-navy-900">{e.title}</p>
        <p className="text-[11px] text-navy-500">
          {humanise(e.category)} · {row.age_days} days ·{' '}
          {e.run_id && (
            <Link to={`/broker/controls/reconciliations/${e.run_id}`} className="font-semibold text-brand-600">
              reconciliation
            </Link>
          )}
        </p>
        {row.resolutions.map((x) => (
          <p key={x.id} className="text-[11px] text-emerald-700">
            {humanise(x.resolution)}: {x.note}
          </p>
        ))}
      </Td>
      <Td className="text-xs">{row.customer ?? row.portfolio ?? row.fund ?? '–'}</Td>
      <Td className="font-semibold">{zar(e.amount, true)}</Td>
      <Td>
        <span className={e.severity === 'high' || e.severity === 'critical' ? 'text-xs font-semibold text-red-700' : 'text-xs text-navy-700'}>{humanise(e.severity)}</span>
      </Td>
      <Td>
        <StatusBadge status={e.status} />
      </Td>
      <Td className="text-xs">{row.assignee ?? '–'}</Td>
      <Td>
        {open ? (
          <div className="flex min-w-[240px] flex-col gap-1">
            <select value={resolution} onChange={(ev) => setResolution(ev.target.value as typeof resolution)} className="field py-1 text-xs" aria-label="Resolution">
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {humanise(r)}
                  {r === 'write_off' ? ' (needs approval)' : ''}
                </option>
              ))}
            </select>
            <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Reason (required)" className="field py-1 text-xs" />
            <Button size="sm" variant="outline" disabled={note.trim().length < 5 || resolve.isPending} onClick={() => resolve.mutate({ exception_id: e.id, resolution, note })}>
              {resolution === 'write_off' ? 'Request write-off' : 'Resolve'}
            </Button>
            {resolve.data?.approval_id && <span className="text-[11px] text-amber-700">Write-off sent to Approvals</span>}
            {resolve.error && <span className="text-[11px] text-red-600">{resolve.error.message}</span>}
          </div>
        ) : (
          '–'
        )}
      </Td>
    </tr>
  )
}
