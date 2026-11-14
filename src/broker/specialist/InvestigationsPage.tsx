import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, FileText } from 'lucide-react'
import { useCloseInvestigation, useCompareRuns, useInvestigation, useInvestigationReport, useInvestigations, useOpenInvestigation, useRecordFinding, useSnapshot } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice, Page, Section } from '../shared/ui'

export default function InvestigationsPage() {
  const { data, isLoading, error } = useInvestigations()
  const open = useOpenInvestigation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', scope: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    open.mutate(form, { onSuccess: (i) => navigate(`/broker/investigations/${i.id}`) })
  }
  return (
    <Page>
      <PageHeader title="Forensic investigations" description="Read-only snapshots, historical comparisons and findings with a preserved chain of evidence. Findings are either supported by records or marked as hypotheses." />
      <Section title="Open an investigation">
        <form onSubmit={submit} className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="field" required />
          <input value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="Scope: datasets, period and question" className="field md:col-span-2" required />
          <Button type="submit" size="sm" variant="accent" disabled={open.isPending}>
            Open
          </Button>
        </form>
      </Section>
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No investigations yet" />}
      {data?.map((i) => (
        <Link key={i.id} to={`/broker/investigations/${i.id}`} className="panel flex items-center justify-between gap-3 p-4 hover:border-brand-500">
          <div>
            <p className="text-sm font-semibold text-navy-900">{i.title}</p>
            <p className="text-xs text-navy-600">
              {i.evidence} evidence items · {i.findings} findings · opened {formatDateTime(i.created_at)}
            </p>
          </div>
          <StatusBadge status={i.status} />
        </Link>
      ))}
    </Page>
  )
}

export function InvestigationPage() {
  const { investigationId } = useParams()
  const { data, isLoading, error } = useInvestigation(investigationId)
  const snapshot = useSnapshot()
  const finding = useRecordFinding()
  const report = useInvestigationReport()
  const close = useCloseInvestigation()
  const compare = useCompareRuns()
  const [snap, setSnap] = useState<{ dataset: 'reconciliation_run' | 'import_batch' | 'open_exceptions' | 'member_movements'; ref: string }>({ dataset: 'reconciliation_run', ref: '' })
  const [f, setF] = useState({ title: '', detail: '', basis: 'hypothesis' as 'record_supported' | 'hypothesis', evidence: [] as string[] })
  const [runs, setRuns] = useState({ a: '', b: '' })
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const inv = data.investigation
  const isOpen = inv.status === 'open'
  const refOptions = snap.dataset === 'reconciliation_run' ? data.runs : snap.dataset === 'import_batch' ? data.batches : []

  return (
    <Page>
      <PageHeader
        title={inv.title}
        description={inv.scope}
        actions={
          <>
            <Button size="sm" variant="outline" disabled={report.isPending} onClick={() => report.mutate(inv.id)}>
              <FileText /> Generate report
            </Button>
            {isOpen && (
              <Button size="sm" variant="ghost" onClick={() => close.mutate(inv.id)}>
                Close
              </Button>
            )}
            <StatusBadge status={inv.status} />
          </>
        }
      />
      <Notice>Evidence is append-only: snapshots are frozen copies with a content hash and cannot be edited or deleted. Russ may propose hypotheses; only a person records a finding as supported by records.</Notice>

      {isOpen && (
        <Section title="Capture a read-only snapshot">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <select value={snap.dataset} onChange={(e) => setSnap({ dataset: e.target.value as typeof snap.dataset, ref: '' })} className="field w-auto" aria-label="Dataset">
              {['reconciliation_run', 'import_batch', 'open_exceptions', 'member_movements'].map((d) => (
                <option key={d} value={d}>
                  {humanise(d)}
                </option>
              ))}
            </select>
            {refOptions.length > 0 && (
              <select value={snap.ref} onChange={(e) => setSnap({ ...snap, ref: e.target.value })} className="field min-w-[18rem] flex-1" aria-label="Record">
                <option value="">Choose</option>
                {refOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <Button size="sm" variant="accent" disabled={snapshot.isPending || (refOptions.length > 0 && !snap.ref)} onClick={() => snapshot.mutate({ investigation_id: inv.id, dataset: snap.dataset, ref_id: snap.ref || null })}>
              <Camera /> Snapshot
            </Button>
          </div>
          {snapshot.error && <p className="mt-2 text-xs text-red-600">{snapshot.error.message}</p>}
        </Section>
      )}

      <Section title={`Evidence (${data.evidence.length})`}>
        <ul className="space-y-1 text-sm">
          {data.evidence.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <Badge tone={e.kind === 'report' ? 'accent' : 'info'}>{humanise(e.kind)}</Badge> {e.description}
              </span>
              <span className="text-[11px] text-navy-500">
                hash {e.sha256.slice(0, 12)} · {formatDateTime(e.created_at)}
              </span>
            </li>
          ))}
          {!data.evidence.length && <li className="text-navy-500">No evidence captured yet.</li>}
        </ul>
      </Section>

      <Section title="Compare two reconciliation runs">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          {(['a', 'b'] as const).map((k) => (
            <select key={k} value={runs[k]} onChange={(e) => setRuns({ ...runs, [k]: e.target.value })} className="field min-w-[16rem] flex-1" aria-label={`Run ${k}`}>
              <option value="">{k === 'a' ? 'Earlier run' : 'Later run'}</option>
              {data.runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          ))}
          <Button size="sm" variant="outline" disabled={!runs.a || !runs.b || compare.isPending} onClick={() => compare.mutate({ run_a: runs.a, run_b: runs.b })}>
            Compare
          </Button>
        </div>
        {compare.data && (
          <ul className="mt-3 space-y-1 text-xs text-navy-700">
            {compare.data.length ? compare.data.map((c) => <li key={c.key}>{c.label}: {JSON.stringify(c.before)} → {JSON.stringify(c.after)}</li>) : <li>No item changed between the two runs.</li>}
          </ul>
        )}
      </Section>

      <Section title={`Findings (${data.findings.length})`}>
        <ul className="space-y-2 text-sm">
          {data.findings.map((x) => (
            <li key={x.id} className="rounded-xl border border-navy-800/10 p-3">
              <p>
                <Badge tone={x.basis === 'record_supported' ? 'success' : 'warning'}>{x.basis === 'record_supported' ? 'Supported by records' : 'Hypothesis'}</Badge> <span className="font-medium text-navy-900">{x.title}</span>
              </p>
              <p className="text-xs text-navy-700">{x.detail}</p>
              {x.evidence_ids.length > 0 && <p className="text-[11px] text-navy-500">Evidence: {x.evidence_ids.map((id) => data.evidence.find((e) => e.id === id)?.description ?? id).join('; ')}</p>}
            </li>
          ))}
        </ul>
        {isOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              finding.mutate({ investigation_id: inv.id, title: f.title, detail: f.detail, basis: f.basis, evidence_ids: f.evidence }, { onSuccess: () => setF({ title: '', detail: '', basis: 'hypothesis', evidence: [] }) })
            }}
            className="mt-3 space-y-2 border-t border-navy-800/5 pt-3 text-sm"
          >
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Finding" className="field" required />
            <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="Detail" rows={2} className="field py-2" required />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={f.basis === 'hypothesis'} onChange={() => setF({ ...f, basis: 'hypothesis' })} /> Hypothesis
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={f.basis === 'record_supported'} onChange={() => setF({ ...f, basis: 'record_supported' })} /> Supported by records
              </label>
              {f.basis === 'record_supported' &&
                data.evidence
                  .filter((e) => e.kind !== 'report')
                  .map((e) => (
                    <label key={e.id} className="flex items-center gap-1">
                      <input type="checkbox" checked={f.evidence.includes(e.id)} onChange={() => setF({ ...f, evidence: f.evidence.includes(e.id) ? f.evidence.filter((x) => x !== e.id) : [...f.evidence, e.id] })} /> {(e.description ?? e.kind).slice(0, 40)}
                    </label>
                  ))}
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={finding.isPending}>
              Record finding
            </Button>
            {finding.error && <p className="text-xs text-red-600">{finding.error.message}</p>}
          </form>
        )}
      </Section>

      {report.data && (
        <Section title="Investigation report">
          <pre className="max-h-96 overflow-auto rounded-xl bg-mist p-3 text-xs whitespace-pre-wrap text-navy-800">{report.data.text}</pre>
        </Section>
      )}
    </Page>
  )
}
