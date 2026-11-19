import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, HelpCircle, ShieldCheck } from 'lucide-react'
import { useCloseLead, useLead } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { MOTOR_FIELDS, formatMotorField } from '@/server/domain/motor'
import { LEAD_PIPELINE_STAGES } from '@/server/db/schema'
import { formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from './PageHeader'
import { LeadProgressBar } from './leads/LeadProgressBar'
import { QuoteRequestPanel } from './leads/QuoteRequestPanel'
import { ResearchEvidence } from './leads/ResearchEvidence'

export default function LeadDetailPage() {
  const { leadId } = useParams()
  const { data, isLoading, error } = useLead(leadId)
  const closeLead = useCloseLead()
  const [closeOpen, setCloseOpen] = useState(false)
  const [reason, setReason] = useState('Declined')
  const [closeError, setCloseError] = useState<string | null>(null)

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Lead not found'} /></div>
  const { lead, customer } = data
  const v = lead.qualification.vehicle
  const risk = lead.qualification.risk
  const kind = customer.customer_type === 'commercial' ? 'Business' : 'Person'
  const cover = lead.product_category ? humanise(lead.product_category) : 'No cover yet'

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <Link to="/broker/leads" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> All leads
      </Link>
      <PageHeader
        title={customer.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-navy-600">{kind}</span>
            <span className="text-navy-400">·</span>
            <span className="text-xs text-navy-700">{cover}</span>
            <span className="text-navy-400">·</span>
            <span className="text-xs text-navy-700">{humanise(lead.source)}</span>
            <span className="text-navy-400">·</span>
            <span className="text-xs text-navy-700">created {formatDateTime(lead.created_at)}</span>
            {customer.is_synthetic && <span className="rounded bg-navy-50 px-1.5 text-[11px] font-semibold text-navy-600">Synthetic record</span>}
            <Link to="/broker/customers" className="font-semibold text-brand-700 hover:underline">
              Open in Customer Area
            </Link>
          </span>
        }
        actions={
          lead.status !== 'closed' && lead.status !== 'live' ? (
            <Button size="sm" variant="outline" onClick={() => setCloseOpen((o) => !o)}>
              Close opportunity
            </Button>
          ) : undefined
        }
      />

      <section className="panel mb-6 p-4">
        <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Opportunity progress</p>
        <div className="mt-2">
          <LeadProgressBar status={lead.status} closedReason={lead.closed_reason} closedAtStage={lead.closed_at_stage} />
        </div>
        {lead.status === 'closed' && (
          <p className="mt-2 text-sm text-navy-700">
            Closed{lead.closed_at ? ` ${formatDateTime(lead.closed_at)}` : ''}: {lead.closed_reason ?? 'No reason recorded'}
            {lead.closed_at_stage ? ` (stopped at ${humanise(lead.closed_at_stage)})` : ''}
          </p>
        )}
        {closeOpen && lead.status !== 'closed' && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 border-t border-navy-800/10 pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason.trim()) return
              setCloseError(null)
              closeLead.mutate(
                {
                  lead_id: lead.id,
                  reason: reason.trim(),
                  closed_at_stage: LEAD_PIPELINE_STAGES.includes(lead.status as (typeof LEAD_PIPELINE_STAGES)[number])
                    ? (lead.status as (typeof LEAD_PIPELINE_STAGES)[number])
                    : 'lead',
                },
                {
                  onSuccess: () => setCloseOpen(false),
                  onError: (err) => setCloseError((err as Error).message),
                },
              )
            }}
          >
            <label className="min-w-[12rem] flex-1 text-xs font-medium text-navy-700">
              Reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="field mt-1" required />
            </label>
            <Button type="submit" size="sm" disabled={closeLead.isPending || !reason.trim()}>
              Confirm close
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            {closeError && <p className="w-full text-xs text-red-700">{closeError}</p>}
          </form>
        )}
      </section>

      {data.sibling_opportunities.length > 1 && (
        <section className="panel mb-6 p-4">
          <h2 className="text-sm font-semibold text-navy-900">Opportunities for this {kind.toLowerCase()}</h2>
          <p className="mt-0.5 text-xs text-navy-600">Each cover has its own progress. Opening a row keeps you on the same person or business.</p>
          <ul className="mt-3 space-y-2">
            {data.sibling_opportunities.map((o) => {
              const active = o.id === lead.id
              return (
                <li key={o.id}>
                  <Link
                    to={`/broker/leads/${o.id}`}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${active ? 'border-brand-500/50 bg-brand-50/40' : 'border-navy-800/10 hover:border-brand-500/40'}`}
                  >
                    <span className="text-sm font-medium text-navy-900">{o.product_category ? humanise(o.product_category) : 'No cover yet'}</span>
                    <LeadProgressBar status={o.status} closedReason={o.closed_reason} closedAtStage={o.closed_at_stage} compact />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <ResearchEvidence data={data} />
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Qualification</h2>
            {lead.qualification.summary && <p className="mt-1 text-sm text-navy-700">{lead.qualification.summary}</p>}
            {v ? (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
                {MOTOR_FIELDS.map((f) => (
                  <div key={f.key}>
                    <dt className="text-[11px] text-navy-500">{f.label}</dt>
                    <dd className="font-medium text-navy-900">{formatMotorField(f.key, v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-xs text-navy-600">
                {lead.product_category ? 'Captured details are in the summary and missing-information list.' : 'No cover chosen yet. Add a cover when they ask, then start a quote from this opportunity.'}
              </p>
            )}
            {lead.missing_info.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">Missing information</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
                  {lead.missing_info.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
          </section>

          {!(data.prospect && !risk) && (
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Risk Agent notes for broker review</h2>
            <p className="text-[11px] text-navy-500">Pre-assessment only. Underwriting decisions stay with the insurer.</p>
            {risk ? (
              <div className="mt-3 space-y-3 text-sm">
                {risk.referral_triggers.map((r) => (
                  <p key={r} className="flex items-start gap-2 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {r}</p>
                ))}
                {risk.notes.map((n) => (
                  <p key={n} className="flex items-start gap-2 text-navy-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {n}</p>
                ))}
                {[...risk.coverage_gaps, ...risk.clarification_questions].map((q) => (
                  <p key={q} className="flex items-start gap-2 text-navy-700"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> {q}</p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-navy-600">No risk assessment yet. Ask the Copilot to create a comparison to run one.</p>
            )}
          </section>
          )}

          {data.messages.length > 0 && (
            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Ava conversation</h2>
              <ul className="scroll-area mt-3 max-h-96 space-y-2">
                {data.messages.map((m) => (
                  <li key={m.id} className={`rounded-xl px-3 py-2 text-xs ${m.role === 'user' ? 'ml-10 bg-navy-800 text-white' : 'mr-10 bg-mist text-navy-800'}`}>
                    <span className="whitespace-pre-line">{m.content}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">{kind}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Email', customer.email],
                ['Phone', customer.phone],
                ['Region', customer.region],
                ['Status', humanise(customer.status)],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-navy-500">{k}</dt>
                  <dd className="text-right font-medium text-navy-900">{val ?? '–'}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-4 text-xs font-semibold text-navy-700">Consent (POPIA)</h3>
            <ul className="mt-1 space-y-1 text-xs text-navy-700">
              {data.consents.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{humanise(c.purpose)}</span>
                  <span className={c.granted ? 'text-emerald-700' : 'text-navy-500'}>
                    {c.granted ? 'Granted' : 'Not granted'} · {c.notice_version}
                  </span>
                </li>
              ))}
              {data.consents.length === 0 && <li className="text-navy-500">No consents recorded yet.</li>}
            </ul>
          </section>

          <QuoteRequestPanel data={data} />

          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-navy-900">Agent jobs</h2>
            {data.jobs.length === 0 ? (
              <p className="mt-2 text-xs text-navy-600">No jobs for this lead.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.jobs.map((j) => (
                  <li key={j.id}>
                    <Link to={`/broker/jobs/${j.id}`} className="flex items-center justify-between rounded-xl border border-navy-800/10 p-3 hover:border-brand-500/40">
                      <span className="text-xs text-navy-800">{j.title}</span>
                      <StatusBadge status={j.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
