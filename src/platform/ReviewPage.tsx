import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, CircleX, ExternalLink, Lock, MessageSquare, Power } from 'lucide-react'
import { api, type ItemDecision, type ReviewView } from '@/api/client'
import { useOnboardingReview, usePlatformAction } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatDateTime } from '@/lib/utils'
import type { OnboardingSection } from '@/server/db/onboardingSchema'
import { MODULE_LABEL, REQUIREMENT_FIELDS, SECTION_FIELDS, SECTIONS } from '@/server/onboarding/config'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { auditReason, NotAuthorisation, openBase64, textInput } from '@/onboarding/ui'

function valueText(view: ReviewView, path: string) {
  const [section, key] = path.split('.') as [OnboardingSection, string]
  const def = SECTION_FIELDS[section]?.find((f) => f.key === key)
  const v = view.application.sections[section]?.[key]
  const label = (x: string) => (section === 'products' ? (MODULE_LABEL[x as keyof typeof MODULE_LABEL] ?? x) : (def?.options?.find((o) => o.value === x)?.label ?? x))
  const text = Array.isArray(v) ? v.map(label).join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v ? label(String(v)) : ''
  return { label: def?.label ?? key, text }
}

function ItemCard({ view, item, reviewing }: { view: ReviewView; item: ReviewView['readiness']['checklist'][number]; reviewing: boolean }) {
  const decide = usePlatformAction(api.platformAdmin.decideItem)
  const [mode, setMode] = useState<ItemDecision | null>(null)
  const [feedback, setFeedback] = useState('')
  const [note, setNote] = useState('')
  const doc = view.documents.find((d) => d.id === item.document_id)
  const fields = REQUIREMENT_FIELDS[item.requirement_key]
  const notes = view.internal_notes.filter((n) => n.item_id === item.item_id)
  const fb = view.feedback.filter((f) => f.item_id === item.item_id)
  const canReview = view.platform_role !== 'platform_read_only'

  const run = (decision: ItemDecision) => {
    if ((decision === 'request_correction' || decision === 'reject') && !feedback.trim()) {
      setMode(decision)
      return
    }
    decide.mutate({ item_id: item.item_id, decision, feedback: feedback || undefined, internal_note: note || undefined }, { onSuccess: () => { setMode(null); setFeedback(''); setNote('') } })
  }
  const open = async () => {
    const link = await api.onboarding.documentLink(doc!.id)
    const file = await api.onboarding.openDocument(link.token)
    if (file.content_base64) openBase64(file.file_name, file.mime_type, file.content_base64)
  }

  return (
    <li className={cn('rounded-xl border p-3', item.status === 'accepted' ? 'border-emerald-200 bg-emerald-50/40' : item.status === 'correction_requested' || item.status === 'rejected' ? 'border-amber-200 bg-amber-50/50' : 'border-navy-800/10 bg-white')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-navy-900">
          {item.label}
          {!item.required && <span className="text-xs font-normal text-navy-500"> (optional)</span>}
        </span>
        <StatusBadge status={item.status} />
      </div>
      {fields && (
        <dl className="mt-2 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[12rem_1fr]">
          {fields.map((p) => {
            const v = valueText(view, p)
            return [
              <dt key={`${p}-l`} className="text-navy-500">{v.label}</dt>,
              <dd key={`${p}-v`} className="text-navy-900">{v.text || <em className="text-navy-400">not provided</em>}</dd>,
            ]
          })}
        </dl>
      )}
      {doc && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-navy-700">
          {doc.file_name} · {formatDateTime(doc.created_at)} {doc.data_origin === 'demo' && <Badge tone="warning">Sample</Badge>}
          <button type="button" className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-600 underline" onClick={() => void open()} disabled={!doc.has_content}>
            <ExternalLink className="h-3 w-3" /> {doc.has_content ? 'Open (audited)' : 'Metadata only'}
          </button>
        </p>
      )}
      {fb.map((f) => (
        <p key={f.id} className="mt-2 rounded-lg bg-white px-2 py-1 text-xs text-amber-900">
          <MessageSquare className="mr-1 inline h-3 w-3" /> To brokerage: {f.body} {f.resolved_at && <span className="text-navy-500">(resolved)</span>}
        </p>
      ))}
      {notes.map((n) => (
        <p key={n.id} className="mt-2 rounded-lg bg-navy-50 px-2 py-1 text-xs text-navy-800">
          <Lock className="mr-1 inline h-3 w-3" /> Internal: {n.body} · {n.author_name}
        </p>
      ))}
      {reviewing && canReview && (
        <div className="mt-3 space-y-2">
          {mode && (
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold text-navy-700" htmlFor={`fb-${item.item_id}`}>
                Feedback the brokerage will see {mode === 'request_correction' || mode === 'reject' ? '(required)' : '(optional)'}
              </label>
              <textarea id={`fb-${item.item_id}`} rows={2} className={textInput} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <label className="text-[11px] font-semibold text-navy-700" htmlFor={`nt-${item.item_id}`}>
                Internal note (B-Covered only)
              </label>
              <textarea id={`nt-${item.item_id}`} rows={2} className={textInput} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" disabled={decide.isPending || item.status === 'outstanding'} onClick={() => run('accept')}>
              <CheckCircle2 /> Accept
            </Button>
            <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => (mode === 'request_correction' ? run('request_correction') : setMode('request_correction'))}>
              {mode === 'request_correction' ? 'Send correction request' : 'Request correction'}
            </Button>
            <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => (mode === 'reject' ? run('reject') : setMode('reject'))}>
              <CircleX /> {mode === 'reject' ? 'Confirm reject' : 'Reject'}
            </Button>
            {!item.required || item.status === 'outstanding' ? (
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => run('waive')}>
                Waive
              </Button>
            ) : null}
            {mode && (
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
            )}
          </div>
          {decide.error && <p className="text-xs text-red-600">{decide.error.message}</p>}
        </div>
      )}
    </li>
  )
}

export default function ReviewPage() {
  const { applicationId } = useParams()
  const { data: view, isLoading, error } = useOnboardingReview(applicationId)
  const start = usePlatformAction(api.platformAdmin.startReview)
  const requestInfo = usePlatformAction(api.platformAdmin.requestInformation)
  const approve = usePlatformAction(api.platformAdmin.approve)
  const decline = usePlatformAction(api.platformAdmin.decline)
  const activate = usePlatformAction(api.platformAdmin.activate)
  const assign = usePlatformAction(api.platformAdmin.assign)
  const addNote = usePlatformAction(api.platformAdmin.note)
  const addFeedback = usePlatformAction(api.platformAdmin.feedback)
  const [reason, setReason] = useState('')
  const [noteText, setNoteText] = useState('')
  const [feedbackText, setFeedbackText] = useState('')

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !view) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load the application'} /></div>

  const app = view.application
  const reviewing = app.status === 'under_review'
  const canAct = view.platform_role !== 'platform_read_only'
  const actionError = [start, requestInfo, approve, decline, activate, assign].find((m) => m.error)?.error?.message
  const requiredPending = view.readiness.checklist.filter((c) => c.required && c.status !== 'accepted' && c.status !== 'waived').length

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <Link to="/platform/onboarding" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Onboarding queue
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">{view.organisation.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-navy-600">
            <StatusBadge status={app.status} /> {app.route === 'invitation' ? 'Invited by B-Covered' : 'Applied through Join as a broker'} · revision {app.revision}
            {app.submitted_at && ` · submitted ${formatDateTime(app.submitted_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-navy-600" htmlFor="reviewer">
            Reviewer
          </label>
          <select id="reviewer" className="rounded-lg border border-navy-800/15 px-2 py-1.5 text-sm" value={view.reviewer?.id ?? ''} disabled={!canAct} onChange={(e) => assign.mutate({ application_id: app.id, reviewer_id: e.target.value || null })}>
            <option value="">Unassigned</option>
            {view.reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.role_label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {app.status === 'submitted' && (
            <Button variant="accent" disabled={!canAct || start.isPending} onClick={() => start.mutate(app.id)}>
              Start review
            </Button>
          )}
          {reviewing && (
            <>
              <Button variant="accent" disabled={!canAct || approve.isPending || requiredPending > 0} title={requiredPending ? `${requiredPending} required item(s) not accepted or waived` : undefined} onClick={() => approve.mutate({ application_id: app.id })}>
                <CheckCircle2 /> Approve application
              </Button>
              <Button variant="outline" disabled={!canAct || requestInfo.isPending || !reason.trim()} onClick={() => requestInfo.mutate({ application_id: app.id, reason }, { onSuccess: () => setReason('') })}>
                Request information
              </Button>
            </>
          )}
          {app.status === 'approved' && (
            <Button variant="accent" disabled={!canAct || activate.isPending || view.activation.some((c) => !c.ok)} onClick={() => activate.mutate(app.id)}>
              <Power /> Activate workspace
            </Button>
          )}
          {['submitted', 'under_review', 'information_required', 'approved'].includes(app.status) && (
            <Button variant="danger" disabled={!canAct || decline.isPending || !reason.trim()} onClick={() => decline.mutate({ application_id: app.id, reason }, { onSuccess: () => setReason('') })}>
              Decline
            </Button>
          )}
          <Link to={`/platform/brokerages/${view.organisation.id}`} className="ml-auto text-xs font-semibold text-brand-600 underline">
            Brokerage administration
          </Link>
        </div>
        {(reviewing || ['submitted', 'information_required', 'approved'].includes(app.status)) && canAct && (
          <div>
            <label htmlFor="decision-reason" className="text-[11px] font-semibold text-navy-700">
              Reason or summary for the brokerage (needed to request information or decline)
            </label>
            <input id="decision-reason" className={textInput} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {actionError && <p className="text-xs text-red-600">{actionError}</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {view.activation.map((c) => (
            <p key={c.label} className={cn('flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs', c.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-navy-50 text-navy-700')}>
              {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />} {c.label}
            </p>
          ))}
        </div>
        <NotAuthorisation />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {SECTIONS.filter((s) => view.readiness.checklist.some((c) => c.section === s.key)).map((s) => (
            <section key={s.key} className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold text-navy-900">{s.label}</h2>
              <ul className="space-y-2">
                {view.readiness.checklist
                  .filter((c) => c.section === s.key)
                  .map((c) => (
                    <ItemCard key={c.item_id} view={view} item={c} reviewing={reviewing} />
                  ))}
              </ul>
            </section>
          ))}
          <section className="panel p-4 text-sm">
            <h2 className="mb-2 text-sm font-semibold text-navy-900">Team and insurers</h2>
            <ul className="space-y-1 text-xs text-navy-700">
              {view.team.members.map((m) => (
                <li key={m.membership_id}>
                  {m.full_name} · {m.role_label} · {m.email}
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1 text-xs text-navy-700">
              {view.insurers.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  {a.insurer_name} · {MODULE_LABEL[a.product_module]} · code {a.intermediary_code ?? '–'} <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="panel flex min-h-[24rem] flex-col p-4">
          <Tabs defaultValue="notes" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="notes">Internal notes</TabsTrigger>
              <TabsTrigger value="feedback">Feedback to brokerage</TabsTrigger>
              <TabsTrigger value="history">History and audit</TabsTrigger>
            </TabsList>
            <TabsContent value="notes" className="mt-3 space-y-2">
              <p className="text-[11px] text-navy-500">Visible to B-Covered staff only. Stored separately from feedback.</p>
              {canAct && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    addNote.mutate({ application_id: app.id, body: noteText }, { onSuccess: () => setNoteText('') })
                  }}
                >
                  <textarea aria-label="Internal note" rows={2} className={textInput} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                  <Button size="sm" type="submit" disabled={!noteText.trim() || addNote.isPending}>
                    <Lock /> Add internal note
                  </Button>
                </form>
              )}
              {view.internal_notes.map((n) => (
                <article key={n.id} className="rounded-lg bg-navy-50 p-2 text-xs text-navy-800">
                  {n.requirement_label && <p className="font-semibold">{n.requirement_label}</p>}
                  <p>{n.body}</p>
                  <p className="mt-1 text-navy-500">
                    {n.author_name} · {formatDateTime(n.created_at)}
                  </p>
                </article>
              ))}
            </TabsContent>
            <TabsContent value="feedback" className="mt-3 space-y-2">
              <p className="text-[11px] text-navy-500">The brokerage sees this in Russ’s Review tab and on the affected items.</p>
              {canAct && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    addFeedback.mutate({ application_id: app.id, body: feedbackText }, { onSuccess: () => setFeedbackText('') })
                  }}
                >
                  <textarea aria-label="Feedback to the brokerage" rows={2} className={textInput} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} />
                  <Button size="sm" type="submit" variant="outline" disabled={!feedbackText.trim() || addFeedback.isPending}>
                    <MessageSquare /> Send feedback
                  </Button>
                </form>
              )}
              {view.feedback.map((f) => (
                <article key={f.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-xs text-navy-900">
                  {f.requirement_label && <p className="font-semibold">{f.requirement_label}</p>}
                  <p>{f.body}</p>
                  <p className="mt-1 text-navy-500">
                    {f.author_name} · {formatDateTime(f.created_at)} {f.resolved_at && '· resolved'}
                  </p>
                </article>
              ))}
            </TabsContent>
            <TabsContent value="history" className="mt-3 space-y-3">
              <ol className="space-y-1.5">
                {view.history.map((h) => (
                  <li key={h.id} className="text-xs text-navy-700">
                    <StatusBadge status={h.to_status} /> {formatDateTime(h.created_at)} · {h.actor_name ?? h.actor_type}
                    {h.reason && <span className="block text-navy-600">{h.reason}</span>}
                  </li>
                ))}
              </ol>
              <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Audit trail</h3>
              <ul className="space-y-1">
                {view.audit.map((e) => (
                  <li key={e.id} className="text-[11px] text-navy-700">
                    <span className="font-medium">{e.action}</span> · {e.actor_name} · {formatDateTime(e.created_at)} {e.actor_scope === 'platform' && <Badge tone="accent">platform</Badge>}
                    {auditReason(e.after) && <span className="block text-navy-500">Reason: {auditReason(e.after)}</span>}
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  )
}
