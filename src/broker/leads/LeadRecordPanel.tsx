import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, HelpCircle, ShieldCheck } from 'lucide-react'
import { useBulkLeads, useCloseLead, useLead } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useTeam } from '@/copilot/salesApi'
import { MOTOR_FIELDS, formatMotorField } from '@/server/domain/motor'
import type { LeadStatus } from '@/server/db/schema'
import { LEAD_PIPELINE_STAGES } from '@/server/db/schema'
import type { LeadRow } from '@/server/api'
import { cn, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState } from '../PageHeader'
import { LeadProgressBar, StageChip } from './LeadProgressBar'
import { buildLeadContextMenu, isLeadOverdue } from './leadContextMenu'
import { QualificationPanel } from './QualificationPanel'
import { QuoteRequestPanel } from './QuoteRequestPanel'
import { ResearchEvidence } from './ResearchEvidence'
import { RowActionsButton, RowContextMenu, type ContextMenuState } from '../shared/RowContextMenu'

/** Full lead opportunity content — used in the Leads grid slide-out and (legacy) full page. */
export function LeadRecordPanel({
  leadId,
  embedded,
  onOpenLead,
}: {
  leadId: string
  /** When true (slide-out), trim outer chrome and stack sections for a narrow panel. */
  embedded?: boolean
  /** Sibling opportunity navigation (defaults to `/broker/leads/:id`). */
  onOpenLead?: (id: string) => void
}) {
  const navigate = useNavigate()
  const { data, isLoading, error } = useLead(leadId)
  const closeLead = useCloseLead()
  const bulk = useBulkLeads()
  const team = useTeam()
  const [rowMenu, setRowMenu] = useState<ContextMenuState>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reason, setReason] = useState('Declined')
  const [closeError, setCloseError] = useState<string | null>(null)
  const [researchOpen, setResearchOpen] = useState<boolean | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const asRow = useMemo((): LeadRow | null => {
    if (!data) return null
    const { lead, customer } = data
    return {
      ...lead,
      customer_name: customer.full_name,
      customer_type: customer.customer_type,
      customer_email: customer.email ?? null,
      customer_phone: customer.phone ?? null,
      latest_quote_id: data.quotes[0]?.id ?? null,
      prospect: data.prospect,
      match: data.matches[0] ?? null,
      run_ids: data.matches.map((m) => m.job_id),
      assigned_member_id: customer.assigned_member_id ?? null,
      open_tasks: 0,
      blocker: lead.next_action ?? null,
      person_id: data.person_id,
      business_profile_id: data.business_profile_id,
      customer_area_path: data.customer_area_path,
    }
  }, [data])

  const openLead = (id: string) => {
    if (onOpenLead) onOpenLead(id)
    else navigate(`/broker/leads/${id}`)
  }

  const menuItems = useMemo(() => {
    if (!asRow || !data) return []
    const { lead } = data
    return buildLeadContextMenu(asRow, {
      open: () => undefined,
      openCustomerArea: () => navigate(data.customer_area_path || '/broker/customers'),
      setStatus: (_l, status: LeadStatus) => {
        bulk.mutate(
          { lead_ids: [lead.id], action: 'status', status },
          {
            onSuccess: () => setNotice(`Status set to ${humanise(status)}`),
            onError: (e) => setNotice((e as Error).message),
          },
        )
      },
      setFollowUp: () => {
        const title = window.prompt('Follow-up', lead.next_action?.trim() || 'Call to introduce cover')
        if (!title?.trim()) return
        const due = window.prompt('Due date (YYYY-MM-DD), optional', lead.next_action_due_at?.slice(0, 10) ?? '')
        bulk.mutate(
          { lead_ids: [lead.id], action: 'follow_up', title: title.trim(), due_date: due?.trim() || null },
          {
            onSuccess: () => setNotice('Follow-up set'),
            onError: (e) => setNotice((e as Error).message),
          },
        )
      },
      assignOwner: () => {
        const members = team.data ?? []
        if (!members.length) {
          setNotice('No team members to assign.')
          return
        }
        const list = members.map((m, i) => `${i + 1}. ${m.name}`).join('\n')
        const pick = window.prompt(`Assign owner — enter number (or 0 for nobody):\n${list}`, '1')
        if (pick == null) return
        const n = Number(pick)
        const member_id = n === 0 ? null : members[n - 1]?.member_id ?? null
        if (n !== 0 && !member_id) {
          setNotice('Invalid owner choice.')
          return
        }
        bulk.mutate(
          { lead_ids: [lead.id], action: 'assign', member_id },
          {
            onSuccess: () => setNotice(member_id ? 'Owner assigned' : 'Unassigned'),
            onError: (e) => setNotice((e as Error).message),
          },
        )
      },
      close: () => setCloseOpen(true),
      askRuss: () => navigate(`/broker/workspace?copilot=russ&leadId=${lead.id}`),
    }).filter((i) => i.type === 'separator' || i.id !== 'open')
  }, [asRow, bulk, data, navigate, team.data])

  if (isLoading) return <LoadingState label="Opening lead…" />
  if (error || !data || !asRow) return <ErrorState message={error?.message ?? 'Lead not found'} />

  const { lead, customer } = data
  const v = lead.qualification.vehicle
  const risk = lead.qualification.risk
  const kind = customer.customer_type === 'commercial' ? 'Business' : 'Person'
  const cover = lead.product_category ? humanise(lead.product_category) : 'No cover yet'
  const qualificationStarted =
    Boolean(lead.qualification.confirmed_cover_need || lead.qualification.contact_person || (lead.activity?.length ?? 0) > 0) ||
    lead.status !== 'lead'
  const showResearchOpen = researchOpen ?? (Boolean(data.prospect) && !qualificationStarted)
  const overdue = isLeadOverdue(asRow)

  return (
    <div className={cn('min-w-0 space-y-4', !embedded && 'mx-auto max-w-7xl p-4 sm:p-6')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!embedded && (
            <h1 className="text-lg font-semibold text-navy-900">{customer.full_name}</h1>
          )}
          <p className="flex flex-wrap items-center gap-2 text-xs text-navy-700">
            <span className="font-medium text-navy-600">{kind}</span>
            <span className="text-navy-400">·</span>
            <span>{cover}</span>
            <span className="text-navy-400">·</span>
            <StageChip status={lead.status} closedReason={lead.closed_reason} closedAtStage={lead.closed_at_stage} overdue={overdue} className="text-xs" />
            {lead.next_action && (
              <>
                <span className="text-navy-400">·</span>
                <span className="text-navy-800">
                  Next: {lead.next_action}
                  {lead.next_action_due_at ? ` · due ${formatDateTime(lead.next_action_due_at)}` : ''}
                </span>
              </>
            )}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
            <Link to={data.customer_area_path || '/broker/customers'} className="text-brand-700 hover:underline">
              Open in Customer Area
            </Link>
            {data.person_id && (
              <Link to={`/broker/customers/people/${data.person_id}/your-page`} className="text-brand-700 hover:underline">
                Preview customer page
              </Link>
            )}
          </div>
        </div>
        <RowActionsButton items={menuItems} onOpen={setRowMenu} className="!ring-navy-800/15" />
      </header>

      {notice && <p className="text-xs font-medium text-navy-700">{notice}</p>}

      <section className="rounded-xl border border-navy-800/10 bg-white p-3 sm:p-4">
        <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Opportunity progress</p>
        <div className="mt-2 overflow-x-auto">
          <LeadProgressBar status={lead.status} closedReason={lead.closed_reason} closedAtStage={lead.closed_at_stage} overdue={overdue} />
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
        <details className="rounded-xl border border-navy-800/10 bg-white open:bg-navy-50/20" open={!embedded}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
            Opportunities for this {kind.toLowerCase()} ({data.sibling_opportunities.length})
          </summary>
          <ul className="space-y-2 px-3 pb-3">
            {data.sibling_opportunities.map((o) => {
              const active = o.id === lead.id
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => openLead(o.id)}
                    className={cn(
                      'flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-left',
                      active ? 'border-brand-500/50 bg-brand-50/40' : 'border-navy-800/10 hover:border-brand-500/40',
                    )}
                  >
                    <span className="text-sm font-medium text-navy-900">{o.product_category ? humanise(o.product_category) : 'No cover yet'}</span>
                    <LeadProgressBar status={o.status} closedReason={o.closed_reason} closedAtStage={o.closed_at_stage} compact />
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      <div className={cn('grid gap-4', embedded ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[1.3fr_1fr]')}>
        <div className="min-w-0 space-y-4">
          <QualificationPanel data={data} />

          {v && (
            <details className="rounded-xl border border-navy-800/10 bg-white" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
                Vehicle details
              </summary>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-3 pb-3 text-sm sm:grid-cols-3">
                {MOTOR_FIELDS.map((f) => (
                  <div key={f.key}>
                    <dt className="text-[11px] text-navy-500">{f.label}</dt>
                    <dd className="font-medium text-navy-900">{formatMotorField(f.key, v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {data.prospect && (
            <details
              className="rounded-xl border border-navy-800/10 bg-white"
              open={showResearchOpen}
              onToggle={(e) => setResearchOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer px-3 py-2 text-left select-none">
                <span className="block text-xs font-semibold tracking-wide text-navy-500 uppercase">Research</span>
                <span className="text-xs text-navy-600">Russ sources, excerpts and cover suggestions</span>
              </summary>
              <div className="px-3 pb-3">
                <ResearchEvidence data={data} />
              </div>
            </details>
          )}

          {!(data.prospect && !risk) && (
            <details className="rounded-xl border border-navy-800/10 bg-white" open={!embedded}>
              <summary className="cursor-pointer px-3 py-2 text-left select-none">
                <span className="block text-xs font-semibold tracking-wide text-navy-500 uppercase">Risk Agent notes</span>
                <span className="text-xs text-navy-600">Pre-assessment only. Underwriting stays with the insurer.</span>
              </summary>
              <div className="space-y-3 px-3 pb-3 text-sm">
                {risk ? (
                  <>
                    {risk.referral_triggers.map((r) => (
                      <p key={r} className="flex items-start gap-2 text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {r}
                      </p>
                    ))}
                    {risk.notes.map((n) => (
                      <p key={n} className="flex items-start gap-2 text-navy-700">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {n}
                      </p>
                    ))}
                    {[...risk.coverage_gaps, ...risk.clarification_questions].map((q) => (
                      <p key={q} className="flex items-start gap-2 text-navy-700">
                        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> {q}
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-navy-600">No risk assessment yet.</p>
                )}
              </div>
            </details>
          )}

          {data.messages.length > 0 && (
            <details className="rounded-xl border border-navy-800/10 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
                Ava conversation ({data.messages.length})
              </summary>
              <ul className="scroll-area max-h-72 space-y-2 px-3 pb-3">
                {data.messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'rounded-xl px-3 py-2 text-xs',
                      m.role === 'user' ? 'ml-6 bg-navy-800 text-white' : 'mr-6 bg-mist text-navy-800',
                    )}
                  >
                    <span className="whitespace-pre-line">{m.content}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-navy-800/10 bg-white p-3 sm:p-4">
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
                  <dd className="text-right font-medium break-all text-navy-900">{val ?? '–'}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-4 text-xs font-semibold text-navy-700">Consent (POPIA)</h3>
            <ul className="mt-1 space-y-1 text-xs text-navy-700">
              {data.consents.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
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

          <details className="rounded-xl border border-navy-800/10 bg-white" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
              Agent jobs ({data.jobs.length})
            </summary>
            <div className="px-3 pb-3">
              {data.jobs.length === 0 ? (
                <p className="text-xs text-navy-600">No jobs for this lead.</p>
              ) : (
                <ul className="space-y-2">
                  {data.jobs.map((j) => (
                    <li key={j.id}>
                      <Link
                        to={`/broker/jobs/${j.id}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-navy-800/10 p-3 hover:border-brand-500/40"
                      >
                        <span className="min-w-0 text-xs break-words text-navy-800">{j.title}</span>
                        <StatusBadge status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </div>
      </div>

      <RowContextMenu state={rowMenu} onClose={() => setRowMenu(null)} />
    </div>
  )
}
