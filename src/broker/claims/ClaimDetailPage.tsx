import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import { newKey, policyClaimsApi, useClaimDetail, usePolicyClaimsMutation } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { CUSTOMER_CLAIM_STATUS } from '@/broker/claims/claimLabels'
import { RussCaseActions } from '@/broker/policies/RussCaseActions'

export default function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>()
  const { data, isLoading, error, refetch } = useClaimDetail(claimId)
  const transition = usePolicyClaimsMutation(policyClaimsApi.transitionClaim)
  const submitInsurer = usePolicyClaimsMutation(policyClaimsApi.recordClaimSubmission)
  const decision = usePolicyClaimsMutation(policyClaimsApi.recordClaimDecision)
  const [note, setNote] = useState('')
  const [submission, setSubmission] = useState({ channel: 'email', insurer_reference: '', submitted_at: '' })
  const [decForm, setDecForm] = useState({ decision: 'approved', source: 'insurer_email', settlement_amount: '', closure_reason: '' })

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Claim not found'} /></div>

  const run = (to: string) => transition.mutate({ claim_id: data.id, to_status: to, note: note || null, key: newKey() }, { onSuccess: () => { setNote(''); void refetch() } })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submitInsurer.mutate(
      {
        claim_id: data.id,
        channel: submission.channel,
        insurer_reference: submission.insurer_reference || null,
        submitted_at: submission.submitted_at ? new Date(submission.submitted_at).toISOString() : new Date().toISOString(),
        key: newKey(),
      },
      { onSuccess: () => void refetch() },
    )
  }

  const onDecision = (e: FormEvent) => {
    e.preventDefault()
    decision.mutate(
      {
        claim_id: data.id,
        decision: decForm.decision,
        decision_source: decForm.source,
        settlement_amount: decForm.settlement_amount ? Number(decForm.settlement_amount) : null,
        closure_reason: decForm.closure_reason || null,
        key: newKey(),
      },
      { onSuccess: () => void refetch() },
    )
  }

  return (
    <Page>
      <PageHeader
        title={data.reference}
        description={`${data.customer_name} · ${data.client_number} · ${CUSTOMER_CLAIM_STATUS[data.status] ?? data.status}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${data.person_id}?rtab=claims`}><ArrowLeft /> Client</Link>
            </Button>
            {data.policy_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/policies/${data.policy_id}`}>Policy{data.policy_version_id ? ' (as-of version)' : ''}</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        {data.version_review_needed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">Policy version review</span>}
        <span className="text-xs text-navy-600">Next: {data.next_action ?? '—'}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel space-y-3 p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Incident</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-[11px] font-semibold text-navy-500 uppercase">Type</dt><dd className="capitalize">{data.incident_type.replace(/_/g, ' ')}</dd></div>
            <div><dt className="text-[11px] font-semibold text-navy-500 uppercase">When</dt><dd>{data.incident_at ? new Date(data.incident_at).toLocaleString() : '—'}{data.incident_time_unknown ? ' (time unknown)' : ''}</dd></div>
          </dl>
          <p className="text-sm text-navy-800">{data.description}</p>
          {data.version_review_reason && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{data.version_review_reason}</p>}

          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Affected items</h3>
          <ul className="space-y-1 text-sm">
            {(data.affected_items ?? []).map((i) => (
              <li key={i.id}>{i.display_label} <span className="text-xs text-navy-500">({i.item_type})</span></li>
            ))}
          </ul>

          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Evidence</h3>
          <ul className="space-y-1 text-sm">
            {(data.evidence ?? []).map((e) => (
              <li key={e.id} className="flex justify-between gap-2 rounded-lg border border-navy-800/10 px-2 py-1.5">
                <span>{e.label}</span>
                <span className={e.status === 'received' ? 'text-emerald-700' : 'text-amber-700'}>{e.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-4">
          <section className="panel space-y-2 p-4">
            <h2 className="text-sm font-semibold">Insurer</h2>
            <p className="text-sm">{data.insurer_name ?? '—'}</p>
            <p className="font-mono text-xs">Ref: {data.insurer_reference ?? '—'}</p>
            <p className="text-xs text-navy-600">Submitted: {data.submitted_at ? new Date(data.submitted_at).toLocaleString() : 'Not yet'}</p>
            {data.decision && <p className="text-xs">Decision: {data.decision} ({data.decision_source})</p>}
            {data.settlement_amount != null && <p className="text-xs">Settlement: R {Number(data.settlement_amount).toLocaleString()}</p>}
          </section>

          <section className="panel space-y-2 p-4">
            <h2 className="text-sm font-semibold">Workflow</h2>
            <textarea className="w-full rounded-lg border border-navy-800/15 p-2 text-xs" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
            <div className="flex flex-wrap gap-1.5">
              {data.status === 'reported' && <Button size="sm" onClick={() => run('in_review')}>Start review</Button>}
              {['reported', 'in_review'].includes(data.status) && <Button size="sm" variant="outline" onClick={() => run('awaiting_evidence')}>Awaiting evidence</Button>}
              {['in_review', 'awaiting_evidence'].includes(data.status) && <Button size="sm" onClick={() => run('submitted_to_insurer')}>Mark ready to submit</Button>}
              {['submitted_to_insurer', 'under_assessment'].includes(data.status) && <Button size="sm" variant="outline" onClick={() => run('awaiting_insurer_update')}>Awaiting insurer</Button>}
              {data.status === 'awaiting_insurer_update' && <Button size="sm" onClick={() => run('under_assessment')}>Under assessment</Button>}
            </div>
          </section>

          {['in_review', 'awaiting_evidence', 'submitted_to_insurer'].includes(data.status) && !data.submitted_at && (
            <form className="panel space-y-2 p-4" onSubmit={onSubmit}>
              <h2 className="text-sm font-semibold">Manual insurer submission</h2>
              <select className="w-full rounded-lg border p-2 text-sm" value={submission.channel} onChange={(e) => setSubmission({ ...submission, channel: e.target.value })}>
                <option value="email">Email</option>
                <option value="portal">Portal</option>
                <option value="phone">Phone</option>
              </select>
              <input className="w-full rounded-lg border p-2 text-sm" placeholder="Insurer reference (when received)" value={submission.insurer_reference} onChange={(e) => setSubmission({ ...submission, insurer_reference: e.target.value })} />
              <input type="datetime-local" className="w-full rounded-lg border p-2 text-sm" value={submission.submitted_at} onChange={(e) => setSubmission({ ...submission, submitted_at: e.target.value })} />
              <Button type="submit" size="sm" variant="accent" disabled={submitInsurer.isPending}>Record submission</Button>
            </form>
          )}

          {['submitted_to_insurer', 'under_assessment', 'awaiting_insurer_update', 'decision_received'].includes(data.status) && (
            <form className="panel space-y-2 p-4" onSubmit={onDecision}>
              <h2 className="text-sm font-semibold">Decision / close</h2>
              <select className="w-full rounded-lg border p-2 text-sm" value={decForm.decision} onChange={(e) => setDecForm({ ...decForm, decision: e.target.value })}>
                <option value="approved">Approved</option>
                <option value="partial">Partial</option>
                <option value="declined">Declined</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
              <select className="w-full rounded-lg border p-2 text-sm" value={decForm.source} onChange={(e) => setDecForm({ ...decForm, source: e.target.value })}>
                <option value="insurer_email">Insurer email</option>
                <option value="insurer_portal">Insurer portal</option>
                <option value="authorised_party">Authorised party</option>
              </select>
              <input className="w-full rounded-lg border p-2 text-sm" placeholder="Settlement amount" value={decForm.settlement_amount} onChange={(e) => setDecForm({ ...decForm, settlement_amount: e.target.value })} />
              <input className="w-full rounded-lg border p-2 text-sm" placeholder="Closure reason" value={decForm.closure_reason} onChange={(e) => setDecForm({ ...decForm, closure_reason: e.target.value })} />
              <Button type="submit" size="sm" variant="accent" disabled={decision.isPending}>Record decision & close</Button>
            </form>
          )}
        </aside>
      </div>

      <div className="mt-4">
        <RussCaseActions claimId={data.id} onChanged={() => void refetch()} />
      </div>

      <section className="panel mt-4 space-y-2 p-4">
        <h2 className="text-sm font-semibold">Activity timeline</h2>
        <ul className="space-y-2 text-xs">
          {(data.events ?? []).map((ev) => (
            <li key={ev.id} className="rounded-lg border border-navy-800/10 px-3 py-2">
              <span className="font-semibold">{ev.event_type}</span>
              {ev.from_status && <> · {ev.from_status} → {ev.to_status}</>}
              <span className="text-navy-500"> · {new Date(ev.created_at).toLocaleString()}</span>
              {ev.visibility === 'internal' && <span className="ml-1 text-amber-800">internal</span>}
              {ev.note && <p className="mt-1">{ev.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
