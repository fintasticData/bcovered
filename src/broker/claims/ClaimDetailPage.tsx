import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ListTodo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page, zar } from '../shared/ui'
import { newKey, policyClaimsApi, useClaimDetail, usePolicyClaimsMutation } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { CUSTOMER_CLAIM_STATUS } from '@/broker/claims/claimLabels'
import {
  claimHeadline,
  claimItemCardTitle,
  claimProviderCardTitle,
  claimQuotesUnlocked,
  collectClaimQuoteLines,
  primaryProviderFromJobs,
} from '@/broker/claims/claimServiceQuotes'
import { RussCaseActions } from '@/broker/policies/RussCaseActions'
import { PolicyTasksSlideout } from '@/broker/policies/PolicyTasksSlideout'
import { ClaimEvidencePanel } from '@/broker/claims/ClaimEvidencePanel'
import { DemoSampleBadge } from '../quotes/shared'
import { useDataCategory } from '@/lib/supabase/category'
import {
  ActiveStepClaimView,
  buildClaimTimelineSteps,
  useLayoutView,
  ViewModeToggle,
  withBookedSlot,
} from '@/fintastic-ux'

export default function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>()
  const category = useDataCategory()
  const { data, isLoading, error, refetch } = useClaimDetail(claimId)
  const transition = usePolicyClaimsMutation(policyClaimsApi.transitionClaim)
  const acknowledge = usePolicyClaimsMutation(policyClaimsApi.acknowledgeClaimAlert)
  const submitInsurer = usePolicyClaimsMutation(policyClaimsApi.recordClaimSubmission)
  const decision = usePolicyClaimsMutation(policyClaimsApi.recordClaimDecision)
  const recordTxn = usePolicyClaimsMutation(policyClaimsApi.recordClaimTransaction)
  const [note, setNote] = useState('')
  const [tasksOpen, setTasksOpen] = useState(false)
  const [submission, setSubmission] = useState({ channel: 'email', insurer_reference: '', submitted_at: '' })
  const [decForm, setDecForm] = useState({ decision: 'approved', source: 'insurer_email', settlement_amount: '', closure_reason: '' })
  const [payForm, setPayForm] = useState({ txn_type: 'payment', amount: '', payee: '', reference: '', txn_date: new Date().toISOString().slice(0, 10) })
  const { view, setView, isFintastic } = useLayoutView('fintastic')
  const [bookingNote, setBookingNote] = useState<string | null>(null)
  const [bookedSlot, setBookedSlot] = useState<string | null>(null)

  const quotesUnlocked = claimQuotesUnlocked({
    status: data?.status,
    decision: data?.decision,
    quotes_unlocked: data?.quotes_unlocked,
  })
  const serviceJobs = data?.service_jobs ?? []
  const quoteLines = useMemo(() => collectClaimQuoteLines(serviceJobs), [serviceJobs])
  const primaryProvider = useMemo(() => primaryProviderFromJobs(serviceJobs), [serviceJobs])

  const fintasticSteps = useMemo(() => {
    if (!data) return []
    return withBookedSlot(
      buildClaimTimelineSteps({
        status: data.status,
        incidentAt: data.incident_at,
        nextAction: data.next_action,
        booked: Boolean(bookedSlot),
        incidentType: data.incident_type,
        quotesUnlocked,
        hasQuotes: quoteLines.length > 0,
      }),
      bookedSlot,
    )
  }, [data, bookedSlot, quotesUnlocked, quoteLines.length])

  const quotesHref = data
    ? `/broker/concierge/providers?claimId=${data.id}&personId=${data.person_id}&job=1`
    : '/broker/concierge/providers'

  useEffect(() => {
    if (!claimId || !data) return
    acknowledge.mutate(claimId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- acknowledge once when claim detail loads
  }, [claimId, data?.id])

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
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {data.customer_name} · {data.client_number} · {CUSTOMER_CLAIM_STATUS[data.status] ?? data.status}
            {category === 'sample' && <DemoSampleBadge />}
          </span>
        }
        actions={
          <>
            <ViewModeToggle view={view} onChange={setView} />
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${data.person_id}?rtab=claims`}><ArrowLeft /> Client</Link>
            </Button>
            {data.policy_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/policies/${data.policy_id}`}>Policy{data.policy_version_id ? ' (as-of version)' : ''}</Link>
              </Button>
            )}
            <Button size="sm" variant="outline" type="button" onClick={() => setTasksOpen(true)}>
              <ListTodo /> Tasks
            </Button>
            {quotesUnlocked ? (
              <Button size="sm" variant="accent" asChild>
                <Link to={quotesHref}>Get repair quotes</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/concierge/providers?personId=${data.person_id}`}>Service providers</Link>
              </Button>
            )}
          </>
        }
      />

      <PolicyTasksSlideout
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        personId={data.person_id}
        policyId={data.policy_id}
        claimId={data.id}
      />

      {bookingNote && (
        <p className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900" role="status">
          {bookingNote}
        </p>
      )}

      {isFintastic && (
        <div className="mb-6">
          <ActiveStepClaimView
            role="broker"
            headline={claimHeadline({
              incidentType: data.incident_type,
              statusLabel: CUSTOMER_CLAIM_STATUS[data.status] ?? data.status,
              reference: data.reference,
            })}
            subhead={`Hi ${data.customer_name?.split(' ')[0] ?? 'there'}, here’s the latest on ${data.reference} and what to do next.`}
            steps={fintasticSteps}
            proposedSlotLabel={
              quotesUnlocked
                ? primaryProvider
                  ? `${primaryProvider.name} — compare quotes or confirm a booking.`
                  : 'Insurer accepted — get repair quotes from service providers.'
                : 'Waiting for insurer acceptance before repair quotes open.'
            }
            bookedSlotLabel={bookedSlot}
            onConfirm={
              quotesUnlocked
                ? (slot) => {
                    setBookedSlot(slot)
                    setBookingNote(`Booking confirmed for ${slot} (demo — Concierge allocate still available).`)
                  }
                : undefined
            }
            onChooseOther={() => setBookingNote('Pick another slot below, then confirm.')}
            vehicleCard={{
              title: claimItemCardTitle(data.incident_type),
              lines: [
                ...(data.affected_items ?? []).slice(0, 2).map((i) => i.display_label),
                data.customer_name,
                data.client_number,
                data.reference,
              ].filter(Boolean) as string[],
            }}
            repairerCard={
              quotesUnlocked
                ? {
                    title: claimProviderCardTitle(data.incident_type),
                    badge: primaryProvider ? 'Quote on file' : 'Ready for quotes',
                    lines: primaryProvider
                      ? primaryProvider.lines
                      : ['No providers allocated yet', 'Use Get repair quotes', data.next_action ?? 'Seeking providers'].filter(
                          Boolean,
                        ) as string[],
                  }
                : {
                    title: claimProviderCardTitle(data.incident_type),
                    badge: 'Waiting for insurer',
                    lines: ['Service providers unlock after insurer acceptance', data.next_action ?? 'Awaiting decision'].filter(
                      Boolean,
                    ) as string[],
                  }
            }
            documents={(data.evidence ?? []).slice(0, 5).map((e) => ({
              name: e.label,
              meta: e.status,
            }))}
            roleActions={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/broker/customers/people/${data.person_id}?rtab=claims`}>Client</Link>
                </Button>
                <Button size="sm" variant="outline" type="button" onClick={() => setTasksOpen(true)}>
                  <ListTodo /> Tasks
                </Button>
                {quotesUnlocked ? (
                  <Button size="sm" variant="accent" asChild>
                    <Link to={quotesHref}>Get repair quotes</Link>
                  </Button>
                ) : null}
              </div>
            }
          />
          {quotesUnlocked && quoteLines.length > 0 && (
            <div className="mt-3 rounded-xl border border-navy-800/10 bg-white p-3">
              <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Quotes on this claim</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {quoteLines.map((q, i) => (
                  <li key={`${q.providerName}-${q.tradeLabel}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-navy-900">
                      {q.providerName}
                      <span className="ml-1.5 text-xs font-normal text-navy-500">{q.tradeLabel}</span>
                    </span>
                    <span className="text-xs text-navy-700">
                      {q.feeZar != null ? zar(Number(q.feeZar), true) : '—'} · {q.status}
                      {q.isCurrent ? ' · current' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        {data.version_review_needed && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
            Schedule review required
          </span>
        )}
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

          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Affected cover</h3>
          <div className="mb-2 rounded-lg border border-navy-800/10 bg-navy-50/50 px-3 py-2 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">As of loss date</p>
            <p className="mt-0.5 text-navy-900">
              Excess:{' '}
              {data.version_review_needed || data.as_of_excess == null
                ? <span className="font-semibold text-amber-900">Unresolved</span>
                : <span className="font-semibold">{zar(Number(data.as_of_excess), true)}</span>}
            </p>
            {data.policy_id && (
              <Link
                className="mt-1 inline-block text-xs font-semibold text-brand-700 underline"
                to={`/broker/policies/${data.policy_id}?tab=schedule`}
              >
                Open applicable schedule
                {data.schedule_effective_at
                  ? ` (from ${new Date(data.schedule_effective_at).toLocaleDateString()})`
                  : ''}
              </Link>
            )}
          </div>
          <ul className="space-y-1 text-sm">
            {(data.affected_items ?? []).map((i) => (
              <li key={i.id} className="rounded-lg border border-navy-800/10 px-2 py-1.5">
                {i.display_label}{' '}
                <span className="text-xs text-navy-500">
                  ({i.section_code ?? i.item_type}
                  {i.policy_version_id ? ' · schedule version linked' : ''})
                </span>
              </li>
            ))}
            {(data.affected_items ?? []).length === 0 && (
              <li className="text-xs text-navy-500">No affected items recorded yet.</li>
            )}
          </ul>

          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Settlement</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[10px] font-semibold text-navy-500 uppercase">Approved</dt>
              <dd>{zar(Number(data.approved_settlement ?? data.settlement_amount ?? 0), true)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-navy-500 uppercase">Paid</dt>
              <dd>{zar(Number(data.confirmed_payments ?? 0), true)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-navy-500 uppercase">Outstanding</dt>
              <dd className="font-semibold">{zar(Number(data.outstanding ?? 0), true)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-navy-500 uppercase">Recoveries</dt>
              <dd>{zar(Number(data.recoveries ?? 0), true)}</dd>
            </div>
          </dl>
          <ul className="space-y-1 text-xs">
            {(data.settlement_transactions ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 rounded border border-navy-800/10 px-2 py-1">
                <span className="capitalize">{t.txn_type}{t.payee ? ` · ${t.payee}` : ''}</span>
                <span>{zar(Number(t.amount), true)} · {t.txn_date} · {t.status}</span>
              </li>
            ))}
          </ul>
          {data.settlement_amount != null && (
            <form
              className="mt-2 grid gap-2 rounded-lg border border-navy-800/15 bg-navy-50/40 p-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!payForm.amount) return
                recordTxn.mutate(
                  {
                    claim_id: data.id,
                    txn_type: payForm.txn_type,
                    amount: Number(payForm.amount),
                    txn_date: payForm.txn_date,
                    payee: payForm.payee || null,
                    reference: payForm.reference || null,
                    key: newKey(),
                  },
                  { onSuccess: () => { setPayForm({ ...payForm, amount: '', reference: '' }); void refetch() } },
                )
              }}
            >
              <h4 className="sm:col-span-2 text-xs font-semibold text-navy-800">Record settlement entry</h4>
              <select className="rounded-lg border p-2 text-sm" value={payForm.txn_type} onChange={(e) => setPayForm({ ...payForm, txn_type: e.target.value })}>
                <option value="payment">Payment</option>
                <option value="reversal">Reversal</option>
                <option value="recovery">Recovery</option>
              </select>
              <input className="rounded-lg border p-2 text-sm" placeholder="Amount" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              <input className="rounded-lg border p-2 text-sm" placeholder="Payee" value={payForm.payee} onChange={(e) => setPayForm({ ...payForm, payee: e.target.value })} />
              <input className="rounded-lg border p-2 text-sm" placeholder="Reference" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
              <input type="date" className="rounded-lg border p-2 text-sm" value={payForm.txn_date} onChange={(e) => setPayForm({ ...payForm, txn_date: e.target.value })} />
              <Button type="submit" size="sm" variant="accent" disabled={recordTxn.isPending || !payForm.amount}>Save entry</Button>
            </form>
          )}

          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Evidence</h3>
          <ClaimEvidencePanel
            claimId={data.id}
            evidence={data.evidence ?? []}
            onChanged={() => void refetch()}
          />
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
