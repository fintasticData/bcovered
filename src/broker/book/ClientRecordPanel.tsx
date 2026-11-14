import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, Lock, PencilLine, Plus, Repeat2, Route as RouteIcon, ShieldCheck } from 'lucide-react'
import { useStartRoute } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopilotError } from '@/copilot/api'
import { newKey, salesApi, useClientRecord, useSalesMutation, type ClientRecord, type CommKind, type Communication, type Direction } from '@/copilot/salesApi'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategoryBadge, CommIcon, ErrorText, EVENT_LABEL, Field, inputClass, KIND_LABEL, MemberLabel, StageBadge, dateTime, money, perFrequency, shortDate } from './bits'
import { CreateOfferDialog } from './dialogs'
import { OfferCard } from './OfferCard'
import { EnquiryAttribution, FranchiseReferrer } from '../franchise/EnquiryAttribution'

function Facts({ r }: { r: ClientRecord }) {
  const firstEnquiry = r.enquiries[r.enquiries.length - 1]
  const items: Array<[string, ReactNode]> = [
    ['Client number', <span className="font-mono">{r.client_number}</span>],
    ['Contact stage', r.contact_stage === 'client' ? 'Client' : 'Prospect'],
    ['Assigned to', <MemberLabel member={r.assigned} />],
    ['Referred by', r.referred_by ? <MemberLabel member={r.referred_by} code /> : <FranchiseReferrer personId={r.id} />],
    ['Mobile', r.account?.phone ?? '–'],
    ['Email', r.account?.email ?? '–'],
    ['Account', r.account ? <span><span className="font-mono">{r.account.number}</span> · {r.account.name}</span> : '–'],
    ['First enquiry', firstEnquiry ? `${firstEnquiry.reference} · ${shortDate(firstEnquiry.created_at)}` : '–'],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{k}</dt>
          <dd className="mt-0.5 text-navy-900">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function LogCommunication({ r }: { r: ClientRecord }) {
  const [key, setKey] = useState(newKey)
  const [f, setF] = useState({ kind: 'call' as CommKind, direction: 'outbound' as Direction, body: '', offer_id: '', occurred_at: '' })
  const log = useSalesMutation(salesApi.logComm)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    log.mutate(
      { person_id: r.id, kind: f.kind, direction: f.direction, body: f.body.trim(), offer_id: f.offer_id || null, occurred_at: f.occurred_at ? new Date(f.occurred_at).toISOString() : null, key },
      { onSuccess: () => { setF({ ...f, body: '', occurred_at: '' }); setKey(newKey()) } },
    )
  }
  return (
    <form onSubmit={submit} className="@container space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/40 p-3" aria-label="Log a communication">
      <div className="grid gap-2 @sm:grid-cols-2 @2xl:grid-cols-4">
        <Field label="Channel" htmlFor="lc-kind">
          <select id="lc-kind" className={inputClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CommKind })}>
            <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option>
          </select>
        </Field>
        <Field label="Direction" htmlFor="lc-dir">
          <select id="lc-dir" className={inputClass} value={f.kind === 'note' ? 'internal' : f.direction} disabled={f.kind === 'note'} onChange={(e) => setF({ ...f, direction: e.target.value as Direction })}>
            <option value="outbound">Outgoing</option><option value="inbound">Incoming (reply)</option><option value="internal">Internal</option>
          </select>
        </Field>
        <Field label="Offer (optional)" htmlFor="lc-offer">
          <select id="lc-offer" className={inputClass} value={f.offer_id} onChange={(e) => setF({ ...f, offer_id: e.target.value })}>
            <option value="">Not linked</option>
            {r.offers.map((o) => <option key={o.id} value={o.id}>{o.reference} · {o.insurer}</option>)}
          </select>
        </Field>
        <Field label="When" htmlFor="lc-when">
          <input id="lc-when" type="datetime-local" className={inputClass} value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} />
        </Field>
      </div>
      <Field label="Summary" htmlFor="lc-body">
        <textarea id="lc-body" rows={2} className={inputClass} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="e.g. Called to confirm the vehicle details; she wants comprehensive cover" />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-navy-500">Replies from the customer are logged here as incoming entries.</p>
        <Button size="sm" type="submit" disabled={!f.body.trim() || log.isPending}>{log.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Log</Button>
      </div>
      <ErrorText error={log.error} />
    </form>
  )
}

const ROLE_LABEL: Record<string, string> = {
  broker: 'Broker', sub_broker: 'Sub-broker', agent: 'Agent', brokerage_owner: 'Owner', brokerage_admin: 'Admin',
  representative: 'Representative', operations_admin: 'Operations', compliance_reviewer: 'Compliance', manager: 'Manager',
}

function CorrectEntry({ c, onDone }: { c: Communication; onDone: () => void }) {
  const [key] = useState(newKey)
  const [body, setBody] = useState(c.body)
  const [reason, setReason] = useState('')
  const fix = useSalesMutation(salesApi.correctComm)
  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2"
      aria-label={`Correct ${c.reference}`}
      onSubmit={(e) => { e.preventDefault(); fix.mutate({ interaction_id: c.id, body: body.trim(), reason: reason.trim(), key }, { onSuccess: onDone }) }}
    >
      <Field label="Corrected wording" htmlFor={`fix-body-${c.id}`}>
        <textarea id={`fix-body-${c.id}`} rows={2} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Reason for the correction" htmlFor={`fix-reason-${c.id}`}>
        <input id={`fix-reason-${c.id}`} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong channel recorded" />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-navy-600">The original stays on record; the correction is added as a new entry.</p>
        <span className="flex gap-1.5">
          <Button size="sm" type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button size="sm" type="submit" disabled={!body.trim() || !reason.trim() || fix.isPending}>{fix.isPending ? <Loader2 className="animate-spin" /> : <PencilLine />} Add correction</Button>
        </span>
      </div>
      <ErrorText error={fix.error} />
    </form>
  )
}

function RetentionNotice({ r }: { r: ClientRecord }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-navy-800/10 bg-navy-50/50 px-3 py-2 text-[11px] text-navy-600">
      <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-700" />
      {r.category === 'live'
        ? 'Live communications are kept permanently for FAIS record keeping, with who wrote each entry and who held the client at the time. Entries can’t be edited or deleted; add a correction instead.'
        : 'Sample communications are demo records. Live communications are kept permanently for FAIS record keeping and can only be corrected, never edited or deleted.'}
    </p>
  )
}

function Timeline({ r }: { r: ClientRecord }) {
  const [correcting, setCorrecting] = useState<string | null>(null)
  if (!r.communications.length) return <EmptyState title="No communications yet">Log a call, WhatsApp, email or note above.</EmptyState>
  return (
    <ol className="space-y-3" aria-label="Communications timeline">
      {r.communications.map((c) => (
        <li key={c.id} id={`comm-${c.id}`} className="flex gap-3">
          <CommIcon kind={c.kind} direction={c.direction} />
          <div className={`min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 ${c.corrected_by ? 'border-amber-200' : 'border-navy-800/10'}`}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-navy-600">
              <span className="font-semibold text-navy-900">{KIND_LABEL[c.kind] ?? c.kind}</span>
              <span>{c.direction === 'inbound' ? 'Incoming' : c.direction === 'outbound' ? 'Outgoing' : 'Internal'}</span>
              <span className={c.event === 'whatsapp_opened' ? 'rounded bg-amber-50 px-1 font-semibold text-amber-800' : c.event === 'message_sent' ? 'rounded bg-emerald-50 px-1 font-semibold text-emerald-800' : ''}>
                {c.event !== 'logged' ? EVENT_LABEL[c.event] : ''}
              </span>
              {c.offer && <span className="rounded bg-navy-50 px-1 font-mono">{c.offer.reference}</span>}
              <span className="ml-auto">{dateTime(c.occurred_at)}</span>
            </p>
            {c.corrects && (
              <p className="mt-1 text-[11px] font-semibold text-amber-800">
                Correction of <a href={`#comm-${c.corrects.id}`} className="font-mono underline">{c.corrects.reference}</a>{c.correction_reason ? `: ${c.correction_reason}` : ''}
              </p>
            )}
            <p className={`mt-1 text-sm ${c.corrected_by ? 'text-navy-600' : 'text-navy-900'}`}>{c.body}</p>
            {c.corrected_by && (
              <p className="mt-1 text-[11px] font-semibold text-amber-800">
                Corrected by <a href={`#comm-${c.corrected_by.id}`} className="font-mono underline">{c.corrected_by.reference}</a> · original kept on record
              </p>
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-navy-500">
              <span>
                {c.author ?? 'System'}{c.author_role ? ` (${ROLE_LABEL[c.author_role] ?? c.author_role.replace(/_/g, ' ')})` : ''}
                {c.copilot ? ` via ${c.copilot === 'ar' ? 'AR' : c.copilot === 'ava' ? 'Ava' : 'Russ'}` : ''}
              </span>
              {c.assigned_at_time && c.assigned_at_time !== c.author && <span>· client held by {c.assigned_at_time}</span>}
              <span>· <span className="font-mono">{c.reference}</span></span>
              {c.retention === 'permanent'
                ? <span className="rounded bg-emerald-50 px-1 font-semibold text-emerald-800">Kept permanently</span>
                : <span className="rounded bg-navy-50 px-1">Sample record</span>}
              {correcting !== c.id && (
                <button type="button" className="ml-auto font-semibold text-navy-700 hover:underline" onClick={() => setCorrecting(c.id)}>Correct entry</button>
              )}
            </p>
            {correcting === c.id && <CorrectEntry c={c} onDone={() => setCorrecting(null)} />}
          </div>
        </li>
      ))}
    </ol>
  )
}

function FollowUps({ r }: { r: ClientRecord }) {
  const done = useSalesMutation((c, id: string) => salesApi.completeFollowUp(c, id))
  if (!r.follow_ups.length) return <p className="text-sm text-navy-500">No open follow-ups.</p>
  return (
    <ul className="space-y-2">
      {r.follow_ups.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium text-navy-900">{t.title}</span>
            <span className="block text-xs text-navy-500">
              <span className="font-mono">{t.reference}</span> · due {t.due_date ? shortDate(t.due_date) : 'no date'} · {t.assigned_to ?? 'Unassigned'}
            </span>
          </span>
          <Button size="sm" variant="outline" disabled={done.isPending} onClick={() => done.mutate(t.id)}><CheckCircle2 /> Done</Button>
        </li>
      ))}
    </ul>
  )
}

function Reassign({ r }: { r: ClientRecord }) {
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [key, setKey] = useState(newKey)
  const move = useSalesMutation(salesApi.reassign)
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); move.mutate({ person_id: r.id, member_id: to, reason, key }, { onSuccess: () => { setTo(''); setReason(''); setKey(newKey()) } }) }}>
      <Field label="Reassign to" htmlFor="ra-to">
        <select id="ra-to" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose a team member</option>
          {r.team.filter((m) => m.member_id !== r.assigned?.member_id).map((m) => <option key={m.member_id} value={m.member_id}>{m.name} · {m.role_label}</option>)}
        </select>
      </Field>
      <Field label="Reason (optional)" htmlFor="ra-reason"><input id="ra-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Button size="sm" type="submit" variant="outline" disabled={!to || move.isPending}><Repeat2 /> Reassign</Button>
      <p className="w-full text-[11px] text-navy-500">The original referrer ({r.referred_by?.name ?? 'none'}) is kept.</p>
      <ErrorText error={move.error} />
    </form>
  )
}

/** Starts (or resumes) the Prepare motor quotes Route with this client already selected. */
function PrepareMotorQuotes({ personId }: { personId: string }) {
  const start = useStartRoute()
  const navigate = useNavigate()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={start.isPending}
      onClick={() => start.mutate({ definition_id: 'motor_quotes', person_id: personId, key: newKey() }, { onSuccess: (s) => navigate(`/broker/routes/runs/${s.progress.run.id}`) })}
    >
      {start.isPending ? <Loader2 className="animate-spin" /> : <RouteIcon />} Prepare motor quotes
    </Button>
  )
}

export function ClientRecordPanel({ personId, offerId, onBack, tab, onTab }: { personId: string; offerId?: string | null; onBack: () => void; tab: string; onTab: (t: string) => void }) {
  const q = useClientRecord(personId)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (offerId && q.data) document.getElementById(`offer-${offerId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [offerId, q.data, tab])

  if (q.isLoading) return <LoadingState label="Opening client…" />
  if (q.error || !q.data) {
    const denied = q.error instanceof CopilotError && (q.error.status === 404 || q.error.status === 403)
    return (
      <div className="space-y-4">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft /> Clients</Button>
        <div className="panel p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-500" />
          <h2 className="mt-3 text-base font-semibold text-navy-900">{denied ? 'You don’t have access to this client' : 'This client could not be opened'}</h2>
          <p className="mt-1 text-sm text-navy-600">
            {denied ? 'It is assigned to someone else in your brokerage, or belongs to the other category (Sample / Live). Ask your broker to reassign it if you need it.' : (q.error as Error | null)?.message}
          </p>
        </div>
      </div>
    )
  }
  const r = q.data
  const sold = r.sales[0]
  const accepted = r.offers.find((o) => o.status === 'accepted')

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button size="sm" variant="ghost" className="-ml-2" onClick={onBack}><ArrowLeft /> Clients</Button>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-navy-900">
            {r.name} <span className="font-mono text-sm font-normal text-navy-500">{r.client_number}</span>
            <StageBadge stage={r.stage} /> <CategoryBadge category={r.category} />
          </h2>
          <p className="text-xs text-navy-600">
            {r.contact_stage === 'client' ? 'Client' : 'Prospect'} · assigned to {r.assigned?.name ?? 'nobody'}{r.referred_by ? ` · referred by ${r.referred_by.name} (${r.referred_by.referral_code})` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.category === 'sample' && <PrepareMotorQuotes personId={r.id} />}
          <Button size="sm" variant="accent" onClick={() => setCreating(true)}><Plus /> Create offer</Button>
        </div>
      </div>

      {(sold || accepted) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {accepted && (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
              Accepted offer <span className="font-mono font-semibold">{accepted.reference}</span> · {accepted.insurer} · {money(accepted.premium_amount)} {perFrequency(accepted.premium_frequency)}
            </p>
          )}
          {sold && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Sale <span className="font-mono font-semibold">{sold.reference}</span> · {sold.offer_reference} · insurer reference <span className="font-mono font-semibold">{sold.insurer_reference}</span> · cover from {shortDate(sold.cover_start_date)}
            </p>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={onTab} className="mt-4 flex min-h-0 flex-col">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="offers">Offers ({r.offers.length})</TabsTrigger>
          <TabsTrigger value="comms">Communications ({r.communications.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-5 pt-4">
          <Facts r={r} />
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Open follow-ups</h3>
            <FollowUps r={r} />
          </section>
          {r.enquiries.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Enquiries</h3>
              <ul className="space-y-1.5 text-sm">
                {r.enquiries.map((e) => (
                  <li key={e.id} className="rounded-lg border border-navy-800/10 px-3 py-2">
                    <span className="font-mono text-xs">{e.reference}</span> · {shortDate(e.created_at)} · {e.source.replace(/_/g, ' ')}
                    {e.referrer ? ` · ${e.referrer.name} (${e.referral_code ?? e.referrer.referral_code})` : ''}{e.interest ? ` · ${e.interest}` : ''}
                    {e.message && <span className="block text-xs text-navy-600">{e.message}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <EnquiryAttribution personId={r.id} />
          {r.can_reassign && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Assignment</h3>
              <Reassign r={r} />
              {r.assignment_history.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-navy-600">
                  {r.assignment_history.map((a, i) => <li key={i}>{shortDate(a.at)}: {a.from?.name ?? 'Unassigned'} → {a.to?.name} by {a.by}{a.reason ? ` (${a.reason})` : ''}</li>)}
                </ul>
              )}
            </section>
          )}
        </TabsContent>
        <TabsContent value="offers" className="space-y-3 pt-4">
          {r.offers.length ? r.offers.map((o) => <OfferCard key={o.id} offer={o} highlighted={o.id === offerId} canWrite />) : (
            <EmptyState title="No offers yet">Create an offer from a saved quote or capture insurer, product, premium and frequency.</EmptyState>
          )}
        </TabsContent>
        <TabsContent value="comms" className="space-y-4 pt-4">
          <LogCommunication r={r} />
          <RetentionNotice r={r} />
          <Timeline r={r} />
        </TabsContent>
      </Tabs>

      {creating && <CreateOfferDialog personId={r.id} onClose={() => setCreating(false)} onCreated={() => onTab('offers')} />}
    </div>
  )
}
