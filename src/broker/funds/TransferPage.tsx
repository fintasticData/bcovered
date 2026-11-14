import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Scale } from 'lucide-react'
import { useAdvanceTransfer, useRecordAllocation, useReconcileTransfer, useTransfer } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TRANSFER_STAGES } from '@/server/db/benefitsSchema'
import { cn, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Notice, Page, Section, Stat, Table, Td, zar } from '../shared/ui'

export default function TransferPage() {
  const { transferId } = useParams()
  const { data, isLoading, error } = useTransfer(transferId)
  const reconcile = useReconcileTransfer()
  const advance = useAdvanceTransfer()
  const record = useRecordAllocation()
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const t = data.transfer
  const idx = TRANSFER_STAGES.indexOf(t.stage)
  const received = data.member_rows.reduce((s, m) => s + (m.value_received ?? 0), 0)

  return (
    <Page wide>
      <PageHeader
        title={`${t.transfer_type === 'section_14' ? 'Section 14 transfer' : 'Transfer'}: ${data.from} → ${data.to}`}
        description={`${data.employer ?? 'No employer'} · effective ${t.effective_date} · ${data.members} members`}
        actions={<StatusBadge status={t.status} />}
      />
      {t.transfer_type === 'section_14' && <Notice>Section 14 transfers follow their own legal procedure. B-Covered records each milestone and its evidence; the funds, administrators and the regulator perform and approve the transfer.</Notice>}

      <ol className="grid grid-cols-3 gap-2 md:grid-cols-9" aria-label="Transfer stages">
        {TRANSFER_STAGES.map((s, i) => {
          const done = t.milestones.find((m) => m.stage === s)
          return (
            <li key={s} className={cn('rounded-xl border p-2 text-xs', done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : i === idx && t.status === 'open' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-800/10 text-navy-500')}>
              <p className="flex items-center gap-1 font-semibold">
                {done && <Check className="h-3 w-3" />} {humanise(s)}
              </p>
              {done && <p className="mt-0.5 text-[10px]">{formatDateTime(done.completed_at)}</p>}
            </li>
          )
        })}
      </ol>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Transfer value (transferor)" value={zar(data.value_reported)} basis="reported" />
        <Stat label="Allocated (transferee)" value={zar(received)} basis="reported" />
        <Stat label="Members reconciled" value={`${data.reconciled}/${data.members}`} tone={data.reconciled < data.members ? 'warning' : undefined} />
        <Stat label="Open exceptions" value={data.exceptions.length} tone={data.exceptions.length ? 'danger' : undefined} />
      </div>

      {t.status === 'open' && (
        <Section title={`Complete the “${humanise(t.stage)}” stage`}>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="min-w-[16rem] flex-1">
              <span className="field-label text-xs">Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="field" />
            </label>
            <label className="min-w-[16rem] flex-1">
              <span className="field-label text-xs">Evidence reference {['obtain_approvals', 'submit'].includes(t.stage) && '(required)'}</span>
              <input value={evidence} onChange={(e) => setEvidence(e.target.value)} className="field" placeholder="e.g. approval or submission reference" />
            </label>
            <Button size="sm" variant="accent" disabled={advance.isPending} onClick={() => advance.mutate({ transfer_id: t.id, note: note || null, evidence_ref: evidence || null }, { onSuccess: () => { setNote(''); setEvidence('') } })}>
              Complete stage
            </Button>
          </div>
          {advance.error && <p className="mt-2 text-xs text-red-600">{advance.error.message}</p>}
        </Section>
      )}

      <Section
        title="Members"
        actions={
          <>
            <Button size="sm" variant="outline" disabled={reconcile.isPending} onClick={() => reconcile.mutate(t.id)}>
              <Scale /> Reconcile values
            </Button>
            {data.last_run && (
              <Link to={`/broker/controls/reconciliations/${data.last_run.id}`} className="text-xs font-semibold text-brand-600">
                Last reconciliation
              </Link>
            )}
          </>
        }
      >
        <Table head={['Member', 'Vested', 'Savings', 'Retirement', 'Transfer value', 'Allocated', 'Status', 'Record allocation']} minWidth={1100}>
          {data.member_rows.map((m) => (
            <tr key={m.id}>
              <Td>
                <Link to={`/broker/people/${m.person_id}`} className="font-medium text-brand-600">
                  {m.name}
                </Link>
              </Td>
              <Td>{zar(m.vested_component)}</Td>
              <Td>{zar(m.savings_component)}</Td>
              <Td>{zar(m.retirement_component)}</Td>
              <Td>{zar(m.transfer_value_reported, true)}</Td>
              <Td className={m.status === 'difference' ? 'font-semibold text-red-700' : ''}>{zar(m.value_received, true)}</Td>
              <Td>
                <Badge tone={m.status === 'reconciled' ? 'success' : m.status === 'difference' ? 'danger' : 'warning'}>{humanise(m.status)}</Badge>
              </Td>
              <Td>
                {m.status !== 'reconciled' && t.status === 'open' && (
                  <div className="flex gap-1">
                    <input value={values[m.id] ?? ''} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} className="field w-32 py-1 text-xs" inputMode="decimal" placeholder="Confirmed value" />
                    <Button size="sm" variant="ghost" disabled={!values[m.id]} onClick={() => record.mutate({ transfer_member_id: m.id, value_received: Number(values[m.id]) })}>
                      Save
                    </Button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-navy-500">
          Values and two-pot components as reported by the administrators <BasisBadge basis="reported" />
        </p>
      </Section>

      <Section title="Milestones and evidence">
        <ul className="space-y-1 text-sm">
          {t.milestones.map((m) => (
            <li key={m.stage + m.completed_at} className="flex flex-wrap justify-between gap-2">
              <span>
                <strong>{humanise(m.stage)}</strong> · {m.note ?? ''} {m.evidence_ref && <span className="text-xs text-navy-600">· {m.evidence_ref}</span>}
              </span>
              <span className="text-xs text-navy-500">
                {m.by} · {formatDateTime(m.completed_at)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  )
}
