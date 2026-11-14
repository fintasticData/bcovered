import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FilePlus2 } from 'lucide-react'
import { useBuildPack, useGovernance, useIssuePack, usePack, useRecordGovernanceItem, useUpdateGovernanceItem } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GovernanceItem } from '@/server/db/specialistSchema'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Notice, Page, Section } from '../shared/ui'

export default function GovernancePage() {
  const { data, isLoading, error } = useGovernance()
  const build = useBuildPack()
  const update = useUpdateGovernanceItem()
  const navigate = useNavigate()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  return (
    <Page>
      <PageHeader title="Governance & trustee reporting" description="Meeting packs, risk registers, action items and recorded decisions. B-Covered prepares and records; trustees and committees decide." />
      <Notice>Reporting and oversight only. Recording a decision names the body that took it; it does not transfer any trustee responsibility to B-Covered.</Notice>
      {data.funds.map((f) => (
        <Section
          key={f.id}
          title={f.name}
          actions={
            <Button size="sm" variant="accent" disabled={build.isPending} onClick={() => build.mutate({ fund_id: f.id, period_end: new Date().toISOString().slice(0, 10) }, { onSuccess: (p) => navigate(`/broker/governance/packs/${p.id}`) })}>
              <FilePlus2 /> Prepare trustee pack
            </Button>
          }
        >
          {f.packs.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {f.packs.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link to={`/broker/governance/packs/${p.id}`} className="font-medium text-brand-600">
                    Trustee pack to {formatDate(p.period_end)}
                  </Link>
                  <StatusBadge status={p.status === 'issued' ? 'completed' : 'draft'} />
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-navy-800/5 text-sm">
            {f.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p>
                    <Badge tone={i.kind === 'risk' ? 'warning' : i.kind === 'decision' || i.kind === 'resolution' ? 'accent' : 'neutral'}>{humanise(i.kind)}</Badge> <span className="font-medium text-navy-900">{i.title}</span>
                  </p>
                  {i.detail && <p className="text-xs text-navy-600">{i.detail}</p>}
                  <p className="text-[11px] text-navy-500">
                    {i.owner && `Owner ${i.owner} · `}
                    {i.due_date && `Due ${formatDate(i.due_date)} · `}
                    {i.decided_by_trustees && `Decided by: ${i.decided_by_trustees}`}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <StatusBadge status={i.status === 'done' ? 'completed' : i.status} />
                  {i.status === 'open' && (
                    <Button size="sm" variant="ghost" onClick={() => update.mutate({ item_id: i.id, status: 'done' })}>
                      Mark done
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <NewItem fundId={f.id} />
        </Section>
      ))}
    </Page>
  )
}

function NewItem({ fundId }: { fundId: string }) {
  const record = useRecordGovernanceItem()
  const [form, setForm] = useState({ kind: 'action_item' as GovernanceItem['kind'], title: '', owner: '', due: '', decidedBy: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    record.mutate(
      { fund_id: fundId, kind: form.kind, title: form.title, owner: form.owner || null, due_date: form.due || null, decided_by_trustees: form.decidedBy || null },
      { onSuccess: () => setForm({ ...form, title: '', owner: '', due: '', decidedBy: '' }) },
    )
  }
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-2 border-t border-navy-800/5 pt-3 text-xs md:grid-cols-6">
      <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as GovernanceItem['kind'] })} className="field py-1.5" aria-label="Kind">
        {['meeting', 'resolution', 'action_item', 'risk', 'decision'].map((k) => (
          <option key={k} value={k}>
            {humanise(k)}
          </option>
        ))}
      </select>
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="field py-1.5 md:col-span-2" required />
      <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Owner" className="field py-1.5" />
      {['decision', 'resolution'].includes(form.kind) ? (
        <input value={form.decidedBy} onChange={(e) => setForm({ ...form, decidedBy: e.target.value })} placeholder="Deciding body and date" className="field py-1.5" required />
      ) : (
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="field py-1.5" aria-label="Due date" />
      )}
      <Button type="submit" size="sm" variant="outline" disabled={record.isPending}>
        Record
      </Button>
      {record.error && <p className="text-red-600 md:col-span-6">{record.error.message}</p>}
    </form>
  )
}

export function PackPage() {
  const { packId } = useParams()
  const { data, isLoading, error } = usePack(packId)
  const issue = useIssuePack()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const { pack } = data
  return (
    <Page>
      <PageHeader
        title={`Trustee pack: ${data.fund}`}
        description={`Period to ${formatDate(pack.period_end)} · prepared by ${pack.prepared_by_agent === 'russ' ? 'Russ' : pack.prepared_by_agent} · ${pack.status === 'issued' ? `issued by ${data.issued_by} on ${formatDateTime(pack.issued_at)}` : 'draft, not issued'}`}
        actions={
          pack.status === 'draft' && (
            <Button size="sm" variant="accent" disabled={issue.isPending} onClick={() => issue.mutate(pack.id)}>
              Issue to the board
            </Button>
          )
        }
      />
      {issue.error && <ErrorState message={issue.error.message} />}
      {pack.status === 'draft' && <Notice tone="warning">Draft. Review every section before issuing; issuing records the pack as evidence.</Notice>}
      {pack.sections.map((s) => (
        <Section key={s.key} title={s.title} actions={<BasisBadge basis={s.basis === 'mixed' ? 'reported' : s.basis} />}>
          {s.lines.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-navy-800">
              {s.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-navy-500">Nothing to report.</p>
          )}
          {s.basis === 'mixed' && <p className="mt-2 text-[11px] text-navy-500">Mixed: B-Covered’s own status alongside the administrator’s or insurer’s reported position.</p>}
        </Section>
      ))}
    </Page>
  )
}
