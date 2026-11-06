import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ExternalLink, Loader2, MessageSquareWarning, ShieldCheck, X } from 'lucide-react'
import type { ApprovalView } from '@/api/client'
import { useDecideApproval } from '@/api/hooks'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { describeVehicle, formatMotorField } from '@/server/domain/motor'
import { rand } from '@/lib/quote'
import { formatDateTime } from '@/lib/utils'

type Decision = 'approved' | 'rejected' | 'changes_requested'

export function ApprovalCard({ view, compact = false }: { view: ApprovalView; compact?: boolean }) {
  const { approval, quote, customer, job, submission } = view
  const pack = submission?.submission.pack
  const stale = submission ? !submission.current_pack_matches : false
  const decide = useDecideApproval()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const pending = approval.status === 'pending'
  const vehicle = quote?.quote.risk_summary.vehicle ?? {}
  const proposal = quote?.quote.proposal

  const submit = (decision: Decision) => {
    if (decision !== 'approved' && !note.trim()) {
      setNoteError('Add a note so the agents and the customer file record why.')
      return
    }
    setNoteError(null)
    decide.mutate({ approval_id: approval.id, decision, note: note.trim() || undefined, payload_hash: approval.payload_hash })
  }

  return (
    <article className="panel overflow-hidden" aria-label={approval.summary}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-800/10 bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{humanise(approval.approval_type)}</p>
          <h3 className="mt-0.5 text-base font-semibold text-navy-900">{approval.summary}</h3>
          <p className="mt-0.5 text-xs text-navy-600">
            Requested by {view.requested_by_label} · {formatDateTime(approval.created_at)}
            {customer && ` · ${customer.full_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SimulatedBadge label={submission ? 'Not sent to any insurer' : 'Simulated'} />
          <StatusBadge status={approval.status} />
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        {submission && pack && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-navy-800/10 bg-mist p-3">
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Current</p>
                <p className="mt-1 text-sm text-navy-800">
                  {approval.status === 'approved'
                    ? 'Approved. The pack is marked ready for market; no insurer has been contacted.'
                    : 'Draft pack held by the Approval Engine. No insurer has been contacted.'}
                </p>
              </div>
              <div className="rounded-xl border border-brand-500/30 bg-brand-50/60 p-3">
                <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Suggested</p>
                <p className="mt-1 text-sm text-navy-800">
                  Mark the {pack.sections.length}-section pack for {submission.business_name} as ready for market approach, and tell the customer
                  which documents are still outstanding.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat
                label="Sections"
                value={`${pack.sections.filter((s) => s.status === 'included').length} included · ${pack.sections.filter((s) => s.status === 'proposed').length} undecided`}
              />
              <Stat label="High advisory priority" value={String(pack.exposures.filter((e) => e.priority === 'high').length)} />
              <Stat label="Completeness" value={`${submission.submission.completeness}%`} />
            </div>
            {!compact && pack.broker_summary && (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Broker Copilot summary</p>
                <p className="mt-1 text-sm leading-relaxed text-navy-800">{pack.broker_summary}</p>
              </div>
            )}
            {stale && pending && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                The pack changed after this request was raised. Re-request approval from the submission editor so you approve what you see.
              </p>
            )}
          </>
        )}
        {quote && (
          <p className="text-sm text-navy-800">
            <strong>{describeVehicle(vehicle)}</strong> · {formatMotorField('value', vehicle)} · {formatMotorField('cover_type', vehicle)} ·{' '}
            {formatMotorField('usage', vehicle)} use · {formatMotorField('parking', vehicle)}
          </p>
        )}

        {quote && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-navy-800/10 bg-mist p-3">
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Current</p>
            <p className="mt-1 text-sm text-navy-800">
              {approval.status === 'approved'
                ? `Released to ${customer?.full_name ?? 'the customer'}’s portal after approval.`
                : pending
                  ? 'Comparison held by the Approval Engine. The customer cannot see it.'
                  : 'Not released. The customer cannot see this comparison.'}
            </p>
          </div>
          <div className="rounded-xl border border-brand-500/30 bg-brand-50/60 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Suggested</p>
            <p className="mt-1 text-sm text-navy-800">
              Release {proposal?.options.length ?? 0} simulated options to {customer?.full_name ?? 'the customer'}’s portal with an in-app
              notice. The email stays a preview-only draft.
            </p>
          </div>
        </div>
        )}

        {proposal && (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {quote?.options.map((o) => (
                <div key={o.id} className="rounded-xl border border-navy-800/10 p-3">
                  <p className="text-[11px] font-semibold text-navy-500">{o.option_label} · {o.insurer.name}</p>
                  <p className="text-lg font-semibold text-navy-900">{rand(o.monthly_premium)}<span className="text-xs font-normal text-navy-600"> pm</span></p>
                  <p className="text-xs text-navy-600">Excess {rand(o.excess)}</p>
                </div>
              ))}
            </div>
            {!compact && (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Broker Copilot summary</p>
                <p className="mt-1 text-sm leading-relaxed text-navy-800">{proposal.broker_summary}</p>
              </div>
            )}
          </>
        )}

        <div>
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Risk indicators</p>
          {approval.risk_flags.length ? (
            <ul className="mt-1 space-y-1">
              {approval.risk_flags.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> {submission ? 'No high advisory priority exposures' : 'No referral triggers found by the Risk Agent'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {submission && (
            <>
              <Link to={`/broker/commercial/submissions/${submission.submission.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
                Open submission editor <ExternalLink className="h-3 w-3" />
              </Link>
              <Link to={`/broker/commercial/clients/${submission.profile_id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
                Client and Risk Twin <ExternalLink className="h-3 w-3" />
              </Link>
            </>
          )}
          {quote && (
            <Link to={`/broker/quotes/${quote.quote.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
              Preview full comparison <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {job && (
            <Link to={`/broker/jobs/${job.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
              Agent job and tool calls <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {quote?.lead && (
            <Link to={`/broker/leads/${quote.lead.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600">
              Lead record <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <span className="text-navy-500/80" title="The approval is pinned to this exact payload. Any change needs a fresh approval.">
            Payload hash {approval.payload_hash.slice(0, 10)}
          </span>
        </div>
      </div>

      {pending ? (
        <footer className="space-y-3 border-t border-navy-800/10 bg-mist/60 px-5 py-4">
          <label className="block">
            <span className="field-label text-xs">Decision note (required to reject or request changes)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="field py-2"
              placeholder={submission ? 'e.g. Add the landlord liability limit before we approach insurers' : 'e.g. Mention the courtesy car difference in the summary'}
            />
          </label>
          {(noteError || decide.error) && <p className="text-xs font-medium text-red-600">{noteError ?? decide.error?.message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={() => submit('approved')} disabled={decide.isPending || stale}>
              {decide.isPending ? <Loader2 className="animate-spin" /> : <Check />} {submission ? 'Approve pack' : 'Approve and release'}
            </Button>
            <Button variant="outline" onClick={() => submit('changes_requested')} disabled={decide.isPending}>
              <MessageSquareWarning /> Request changes
            </Button>
            <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => submit('rejected')} disabled={decide.isPending}>
              <X /> Reject
            </Button>
          </div>
          <p className="text-[11px] text-navy-600">
            {submission
              ? 'Your decision is recorded with your identity and time. Approving marks the pack ready for market; it does not send anything to an insurer.'
              : 'Your decision is recorded with your identity and time. The release tool re-checks this approval and the payload hash before anything reaches the customer.'}
          </p>
        </footer>
      ) : (
        <footer className="border-t border-navy-800/10 bg-mist/60 px-5 py-3 text-xs text-navy-700">
          {humanise(approval.status)} {approval.decided_at && `on ${formatDateTime(approval.decided_at)}`}
          {approval.decision_note && ` · “${approval.decision_note}”`}
        </footer>
      )}
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-navy-800/10 p-3">
      <p className="text-[11px] font-semibold text-navy-500">{label}</p>
      <p className="text-lg font-semibold text-navy-900">{value}</p>
    </div>
  )
}
