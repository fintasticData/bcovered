import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ExternalLink, Eye, FileUp, Loader2, Lock, PencilLine, Plus, Repeat2, Route as RouteIcon, Share2, ShieldCheck } from 'lucide-react'
import { useCustomerPageInvite } from '@/api/customerPage'
import { ShareInvite } from '@/components/ShareInvite'
import { usePerson, useStartRoute } from '@/api/hooks'
import { MediaAttachPanel } from '@/components/MediaAttachPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopilotError } from '@/copilot/api'
import { newKey, salesApi, useClientRecord, useSalesMutation, useSalesProfile, type ClientRecord, type CommKind, type Communication, type Direction } from '@/copilot/salesApi'
import { listMediaAssets, resolveMediaUrl, type MediaAssetRow, type MediaBucket } from '@/lib/supabase/media'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategoryBadge, CommIcon, ErrorText, EVENT_LABEL, Field, inputClass, KIND_LABEL, MemberLabel, StageBadge, dateTime, money, perFrequency, shortDate } from './bits'
import { AddCoversDialog, CreateOfferDialog } from './dialogs'
import { OfferCard } from './OfferCard'
import { EnquiryAttribution, FranchiseReferrer } from '../franchise/EnquiryAttribution'
import { StatusBadge } from '@/components/StatusBadge'
import { QuoteFlowPanel } from '../quotes/QuoteFlowPanel'
import { ClientClaimsTab, ClientPoliciesTab } from '../policies/ClientPoliciesClaimsTabs'
import { CustomerFinancialsPanel } from '../financials/CustomerFinancialsPanel'
import { CustomerPageMirror } from '@/pages/your-page/CustomerPageMirror'
import { useClaimsQueue } from '@/copilot/policyClaimsApi'
import {
  installStatusLabel,
  usePartnerStatusMutation,
  usePersonInstallRequests,
  type PartnerInstallRequest,
} from '@/copilot/partnerTrackingApi'

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
      {r.follow_ups.map((t) => {
        const confirmCoverTask = /^confirm cover/i.test(t.title)
        return (
          <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-navy-900">{t.title}</span>
              <span className="block text-xs text-navy-500">
                <span className="font-mono">{t.reference}</span> · due {t.due_date ? shortDate(t.due_date) : 'no date'} · {t.assigned_to ?? 'Unassigned'}
              </span>
              {confirmCoverTask && (
                <span className="mt-0.5 block text-[11px] text-violet-800">Done closes the reminder only. Use Confirm cover on the offer to place cover.</span>
              )}
            </span>
            <Button size="sm" variant="outline" disabled={done.isPending} onClick={() => done.mutate(t.id)}><CheckCircle2 /> Done</Button>
          </li>
        )
      })}
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

function ItemMediaUpload({
  tenantId,
  ownerTable,
  ownerId,
  compact = false,
}: {
  tenantId: string
  ownerTable: 'sales_offers' | 'sales_sales' | 'persons'
  ownerId: string
  compact?: boolean
}) {
  return (
    <MediaAttachPanel
      tenantId={tenantId}
      purpose="item_document"
      ownerTable={ownerTable}
      ownerId={ownerId}
      compact={compact}
      label={compact ? 'Upload' : 'Client documents'}
      hint={compact ? undefined : 'One or more invoices, photos or schedules — stored on this client.'}
    />
  )
}

function ClientDocuments({ r, tenantId }: { r: ClientRecord; tenantId: string | null }) {
  const ownerIds = useMemo(() => [r.id, ...r.offers.map((o) => o.id), ...r.sales.map((s) => s.id)], [r.id, r.offers, r.sales])
  const docs = useQuery({
    queryKey: ['media-assets', tenantId, 'client', r.id, ownerIds.join(',')],
    queryFn: () => listMediaAssets({ tenantId: tenantId!, ownerIds }),
    enabled: Boolean(tenantId),
  })
  const [links, setLinks] = useState<Record<string, string | null>>({})

  useEffect(() => {
    const rows = docs.data ?? []
    let cancelled = false
    void Promise.all(
      rows.map(async (row) => {
        const url = row.public_url ?? (await resolveMediaUrl(row.bucket as MediaBucket, row.storage_path))
        return [row.id, url] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      setLinks(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [docs.data])

  if (!tenantId) return null
  if (docs.isLoading) return <p className="text-xs text-navy-500">Loading documents…</p>
  if (docs.error) return <p className="text-xs text-red-600">{(docs.error as Error).message}</p>
  const rows = docs.data ?? []
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-navy-800/15 bg-navy-50/40 px-3 py-3 text-xs text-navy-600">
        No invoices or item files yet. Upload from Items &amp; cover on an offer or sale.
      </p>
    )
  }

  const labelFor = (row: MediaAssetRow) => {
    if (row.owner_table === 'sales_offers') return r.offers.find((o) => o.id === row.owner_id)?.reference ?? 'Offer'
    if (row.owner_table === 'sales_sales') return r.sales.find((s) => s.id === row.owner_id)?.reference ?? 'Sale'
    return 'Client'
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-navy-800/10 bg-white px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium text-navy-900">
              <FileUp className="h-3.5 w-3.5 shrink-0 text-navy-400" />
              <span className="truncate">{row.file_name}</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-navy-500">
              {labelFor(row)} · {row.purpose.replace(/_/g, ' ')} · {shortDate(row.created_at)}
            </span>
          </span>
          {links[row.id] ? (
            <a href={links[row.id]!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              Open <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-[11px] text-navy-400">…</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function ItemFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy-900">{children}</dd>
    </div>
  )
}

/** One cover / offer / sale as a stacked card — fits the Customer Area slide-out. */
function CoverItemCard({
  title,
  subtitle,
  meta,
  value,
  premium,
  insurer,
  status,
  next,
  documents,
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  value: ReactNode
  premium: ReactNode
  insurer: ReactNode
  status: ReactNode
  next: ReactNode
  documents?: ReactNode
}) {
  return (
    <article className="min-w-0 rounded-xl border border-navy-800/10 bg-white p-3 shadow-sm">
      <header className="min-w-0">
        <div className="text-sm font-semibold text-navy-900">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-navy-500">{subtitle}</div>}
        {meta}
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <ItemFact label="Value / sum insured">{value}</ItemFact>
        <ItemFact label="Premium">{premium}</ItemFact>
        <ItemFact label="Insurer / policy">{insurer}</ItemFact>
        <ItemFact label="Status">{status}</ItemFact>
        <ItemFact label="Next action">{next}</ItemFact>
        {documents != null && <ItemFact label="Documents">{documents}</ItemFact>}
      </dl>
    </article>
  )
}

function PartnerInstallsSection({ personId }: { personId: string }) {
  const q = usePersonInstallRequests(personId)
  const update = usePartnerStatusMutation()
  const rows = q.data?.rows ?? []
  if (q.isLoading) return <p className="text-xs text-navy-500">Loading tracking requests…</p>
  if (rows.length === 0) return null

  const advance = (r: PartnerInstallRequest) => {
    const next: PartnerInstallRequest['status'] | null =
      r.status === 'requested' ? 'partner_contacting'
        : r.status === 'partner_contacting' ? 'booked'
          : r.status === 'booked' ? 'fitted'
            : null
    if (!next) return
    update.mutate({
      request_id: r.id,
      status: next,
      appointment_at: next === 'booked' ? new Date(Date.now() + 3 * 86400000).toISOString() : undefined,
      appointment_note: next === 'booked' ? 'Demo booking — partner to confirm' : undefined,
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">
        Vehicle tracking requests ({rows.length})
      </h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-navy-800/10 px-3 py-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs text-navy-500">{r.reference}</p>
                <p className="font-semibold text-navy-900">
                  {r.vehicle_label || 'Vehicle'} · {r.package_name}
                </p>
                <p className="text-xs text-navy-600">
                  Partner: {r.partner_name}
                  {r.preferred_area ? ` · ${r.preferred_area}` : ''}
                  {r.request_kind === 'fleet_quote' ? ' · Fleet quote' : ''}
                </p>
                <p className="mt-1 text-xs font-medium text-amber-900">
                  {installStatusLabel(r.status)}
                  {r.appointment_at ? ` · ${new Date(r.appointment_at).toLocaleString()}` : ''}
                </p>
                {r.next_action && <p className="text-xs text-navy-600">{r.next_action}</p>}
              </div>
              {['requested', 'partner_contacting', 'booked'].includes(r.status) && (
                <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => advance(r)}>
                  {r.status === 'requested' ? 'Mark contacting' : r.status === 'partner_contacting' ? 'Mark booked' : 'Mark fitted'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ItemsCoverTab({ r, onAddCovers }: { r: ClientRecord; onAddCovers: () => void }) {
  const person = usePerson(r.id)
  const profile = useSalesProfile()
  const tenantId = profile.data?.brokerage?.id ?? null
  const policies = person.data?.policies ?? []
  const offerItems = r.offers
  const hasAnything = policies.length > 0 || offerItems.length > 0 || r.sales.length > 0

  if (person.isLoading) return <LoadingState label="Loading items and cover…" />

  if (!hasAnything) {
    return (
      <div className="space-y-4">
        <EmptyState title="Nothing to protect on record yet">
          Add one or more insurance covers with estimate quotes, prepare motor quotes, or link an existing policy. Missing amounts stay blank — they are never shown as zero.
        </EmptyState>
        <PartnerInstallsSection personId={r.id} />
        <Button size="sm" variant="accent" onClick={onAddCovers}><Plus /> Add covers</Button>
        {tenantId && <ItemMediaUpload tenantId={tenantId} ownerTable="persons" ownerId={r.id} />}
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="accent" onClick={onAddCovers}><Plus /> Add covers</Button>
      </div>
      <PartnerInstallsSection personId={r.id} />

      {policies.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Policies ({policies.length})</h3>
          {policies.map(({ policy, provider, benefits }) => {
            const life = benefits.find((b) => b.benefit_type_key === 'life')
            const sum = life?.sum_assured
            const covered = ['in_force', 'accepted', 'reinstated'].includes(policy.status)
            return (
              <CoverItemCard
                key={policy.id}
                title={(
                  <Link to={`/broker/life/policies/${policy.id}`} className="text-brand-700 hover:underline">
                    {policy.line.replace(/_/g, ' ')}
                  </Link>
                )}
                subtitle={policy.policy_number ?? 'Application'}
                value={sum != null ? money(sum) : <span className="text-navy-400">Not set</span>}
                premium={
                  policy.premium_amount != null ? (
                    <>
                      {money(policy.premium_amount)} <span className="text-[11px] text-navy-500">pm</span>
                    </>
                  ) : (
                    <span className="text-navy-400">Not set</span>
                  )
                }
                insurer={<span className="text-xs">{provider}</span>}
                status={(
                  <div>
                    <StatusBadge status={policy.status} />
                    {!covered && <span className="mt-1 block text-[11px] text-amber-800">Not confirmed cover</span>}
                  </div>
                )}
                next={(
                  <Link to={`/broker/life/policies/${policy.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                    {covered ? 'Service policy' : 'Complete requirements'}
                  </Link>
                )}
                documents={<span className="text-xs text-navy-400">—</span>}
              />
            )
          })}
        </section>
      )}

      {offerItems.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Offers ({offerItems.length})</h3>
          {offerItems.map((o) => (
            <CoverItemCard
              key={o.id}
              title={o.product || 'Offer'}
              subtitle={<span className="font-mono">{o.reference}</span>}
              meta={o.from_sample_quote ? <span className="mt-1 inline-block text-[11px] font-semibold text-amber-800">DEMO · Sample quote</span> : undefined}
              value={<span className="text-navy-400">Not set</span>}
              premium={(
                <>
                  {money(o.premium_amount)} <span className="text-[11px] text-navy-500">{perFrequency(o.premium_frequency)}</span>
                </>
              )}
              insurer={<span className="text-xs">{o.insurer}</span>}
              status={<span className="text-xs capitalize">{o.status.replace(/_/g, ' ')}</span>}
              next={(
                <span className="text-xs text-navy-700">
                  {o.status === 'sent' ? 'Follow up' : o.status === 'accepted' ? 'Record decision' : o.status === 'sold' ? 'Manage cover' : 'Complete offer'}
                </span>
              )}
              documents={
                tenantId ? (
                  <ItemMediaUpload tenantId={tenantId} ownerTable="sales_offers" ownerId={o.id} compact />
                ) : (
                  <span className="text-xs text-navy-400">—</span>
                )
              }
            />
          ))}
        </section>
      )}

      {r.sales.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Confirmed cover ({r.sales.length})</h3>
          {r.sales.map((s) => (
            <CoverItemCard
              key={s.id}
              title="Confirmed cover"
              subtitle={<span className="font-mono">{s.reference}</span>}
              value={<span className="text-navy-400">See policy</span>}
              premium={(
                <>
                  {money(s.premium_amount)} <span className="text-[11px] text-navy-500">{perFrequency(s.premium_frequency)}</span>
                </>
              )}
              insurer={<span className="text-xs">Insurer ref {s.insurer_reference}</span>}
              status={<span className="text-xs font-semibold text-emerald-800">Cover confirmed</span>}
              next={<span className="text-xs text-navy-700">Service from {shortDate(s.cover_start_date)}</span>}
              documents={
                tenantId ? (
                  <ItemMediaUpload tenantId={tenantId} ownerTable="sales_sales" ownerId={s.id} compact />
                ) : (
                  <span className="text-xs text-navy-400">—</span>
                )
              }
            />
          ))}
        </section>
      )}

      {person.error && (
        <p className="text-xs text-navy-500">Life/policy hydrate unavailable for this person right now — offers and sales above still come from the live sales book.</p>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Item documents</h3>
        <ClientDocuments r={r} tenantId={tenantId} />
      </section>
    </div>
  )
}

function ActivityDocumentsSection({ r }: { r: ClientRecord }) {
  const profile = useSalesProfile()
  const tenantId = profile.data?.brokerage?.id ?? null
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Documents</h3>
      <ClientDocuments r={r} tenantId={tenantId} />
    </section>
  )
}

function QuotesDecisionsTab({ r, offerId, onCreate, onAddCovers }: { r: ClientRecord; offerId?: string | null; onCreate: () => void; onAddCovers: () => void }) {
  const [quoteFlow, setQuoteFlow] = useState(false)
  const canCompare = r.quotes.length >= 2
  if (quoteFlow) {
    return (
      <QuoteFlowPanel
        personId={r.id}
        compact
        onBack={() => setQuoteFlow(false)}
      />
    )
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-800/10 bg-navy-50/50 p-3 text-xs text-navy-700">
        <p className="font-semibold text-navy-900">Quote → offer → decision → cover</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Get SAMPLE quotes (fixed or Russ / fal) or capture a Manual premium.</li>
          <li>Save as a draft offer (not cover yet).</li>
          <li>Mark Offer sent → Accepted → Record sale when the insurer confirms.</li>
        </ol>
        <p className="mt-1 text-amber-900">Live insurer APIs are shown in the quote picker but disabled in this build.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-navy-600">Distinguish quote selected, application submitted and cover confirmed using the statuses below.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="accent" onClick={onAddCovers}><Plus /> Add covers</Button>
          <Button size="sm" variant="outline" onClick={() => setQuoteFlow(true)}>Get quotes</Button>
          {canCompare && (
            <Button size="sm" variant="outline" onClick={() => setQuoteFlow(true)}>
              Compare quotes ({r.quotes.length})
            </Button>
          )}
          {r.category === 'sample' && <PrepareMotorQuotes personId={r.id} />}
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/quotes/sample-motor?person=${r.id}`}>Open full quote page</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onCreate}><Plus /> Manual / saved offer</Button>
        </div>
      </div>
      {r.quotes.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Saved quote options</h3>
            {canCompare && (
              <Button size="sm" variant="ghost" onClick={() => setQuoteFlow(true)}>
                Open compare
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {r.quotes.map((q) => (
              <li key={`${q.quote_id}-${q.option_id}`} className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm">
                <span className="font-medium text-navy-900">{q.label || q.product}</span>
                <span className="mt-0.5 block text-xs text-navy-600">
                  {q.insurer} · {money(q.monthly_premium)} / month · {q.status.replace(/_/g, ' ')}
                  {q.is_sample ? ' · SAMPLE' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Offers & decisions</h3>
        {r.offers.length ? r.offers.map((o) => <OfferCard key={o.id} offer={o} highlighted={o.id === offerId} canWrite />) : (
          <EmptyState title="No offers yet">Get SAMPLE quotes or capture a Manual offer. Cover is only confirmed after a recorded sale.</EmptyState>
        )}
      </section>
    </div>
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

export function ClientRecordPanel({
  personId,
  offerId,
  onBack,
  tab,
  onTab,
  embedded,
}: {
  personId: string
  offerId?: string | null
  onBack: () => void
  tab: string
  onTab: (t: string) => void
  /** When true (slide-out), hide queue back chrome — the panel owns close. */
  embedded?: boolean
}) {
  const q = useClientRecord(personId)
  const newClaims = useClaimsQueue({ person_id: personId, filter: 'new' })
  const [creating, setCreating] = useState(false)
  const [addingCovers, setAddingCovers] = useState(false)
  const [shareInvite, setShareInvite] = useState<{ path: string; expires_at: string } | null>(null)
  const invite = useCustomerPageInvite()
  useEffect(() => {
    if (offerId && q.data) document.getElementById(`offer-${offerId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [offerId, q.data, tab])

  if (q.isLoading) return <LoadingState label="Opening client…" />
  if (q.error || !q.data) {
    const denied = q.error instanceof CopilotError && (q.error.status === 404 || q.error.status === 403)
    return (
      <div className="space-y-4">
        {!embedded && (
          <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft /> Clients</Button>
        )}
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
  const accepted = r.offers.find((o) => o.status === 'accepted' && !o.sale)
  const awaitingCover = Boolean(accepted)
  const itemCount = r.offers.length + r.sales.length
  const coveredCount = r.sales.length + r.offers.filter((o) => o.status === 'sold').length
  const attention = r.follow_ups.length + r.offers.filter((o) => o.status === 'sent' || (o.status === 'accepted' && !o.sale)).length
  const activeTab = tab === 'offers' ? 'quotes' : tab === 'comms' ? 'activity' : tab
  const claimAlerts = (newClaims.data?.rows ?? []).filter(
    (c) => c.intake_source === 'customer' && !c.broker_acknowledged_at,
  )
  const claimAlert = claimAlerts[0]

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!embedded && (
            <>
              <Button size="sm" variant="ghost" className="-ml-2" onClick={onBack}><ArrowLeft /> Queue</Button>
              <p className="mt-1 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Customers / {r.name}</p>
              <h2 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold text-navy-900">
                {r.name} <span className="font-mono text-sm font-normal text-navy-500">{r.client_number}</span>
                <StageBadge stage={r.stage} /> <CategoryBadge category={r.category} />
              </h2>
            </>
          )}
          {embedded && (
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={r.stage} />
              <CategoryBadge category={r.category} />
            </div>
          )}
          <p className={cn('text-xs text-navy-600', embedded ? 'mt-1' : '')}>
            Broker {r.assigned?.name ?? 'unassigned'}
            {r.account?.phone ? ` · ${r.account.phone}` : ''}
            {r.referred_by ? ` · referred by ${r.referred_by.name}` : ''}
          </p>
          <p className="mt-1 text-xs text-navy-700">
            Contact stage: {r.contact_stage === 'client' ? 'Client' : 'Prospect'}
            {' · '}
            {itemCount} item{itemCount === 1 ? '' : 's'} · {coveredCount} covered
            {awaitingCover ? ' · 1 awaiting cover confirmation' : ''}
            {attention ? ` · ${attention} need attention` : ''}
            {r.follow_ups[0] ? ` · Next: ${r.follow_ups[0].title}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/customers/people/${r.id}/your-page`}><Eye /> Preview customer page</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={invite.isPending}
            onClick={() =>
              invite.mutate(r.id, {
                onSuccess: (inv) => setShareInvite({ path: inv.path, expires_at: inv.expires_at }),
              })
            }
          >
            {invite.isPending ? <Loader2 className="animate-spin" /> : <Share2 />} Share customer page
          </Button>
          {r.category === 'sample' && <PrepareMotorQuotes personId={r.id} />}
          <Button size="sm" variant="outline" onClick={() => setAddingCovers(true)}><Plus /> Add covers</Button>
          <Button size="sm" variant="accent" onClick={() => setCreating(true)}><Plus /> Create offer</Button>
        </div>
      </div>

      {shareInvite && (
        <div className="mt-3">
          <ShareInvite
            url={shareInvite.path}
            title="Customer page invitation"
            hint="The customer signs in and lands on Your page for this record."
            expiresAt={shareInvite.expires_at}
            whatsappText={`Open your B-Covered page: ${typeof window !== 'undefined' ? window.location.origin : ''}${shareInvite.path}`}
            onRevoke={() => setShareInvite(null)}
            revokeLabel="Hide"
          />
        </div>
      )}
      {invite.error && (
        <p className="mt-2 text-xs text-red-700" role="alert">{(invite.error as Error).message}</p>
      )}

      {claimAlert && (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-3 text-xs text-rose-950">
          <p className="font-semibold text-rose-950">New claim submitted</p>
          <p className="mt-1">
            <span className="font-mono font-semibold">{claimAlert.reference}</span>
            {' · '}
            <span className="capitalize">{claimAlert.incident_type.replace(/_/g, ' ')}</span>
            {claimAlert.created_at
              ? ` · reported ${new Date(claimAlert.created_at).toLocaleString()}`
              : null}
            {claimAlerts.length > 1 ? ` · +${claimAlerts.length - 1} more` : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={() => onTab('claims')}>
              Open claims
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/claims/${claimAlert.id}?view=fintastic`}>Review on desk</Link>
            </Button>
          </div>
        </div>
      )}

      {awaitingCover && accepted && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 text-xs text-violet-900">
          <p className="font-semibold text-violet-950">Offer accepted · Awaiting cover confirmation</p>
          <p className="mt-1">
            <span className="font-mono font-semibold">{accepted.reference}</span> · {accepted.insurer} · {money(accepted.premium_amount)}{' '}
            {perFrequency(accepted.premium_frequency)}. Completing a follow-up as Done does not place cover — use Confirm cover on the offer.
          </p>
          <div className="mt-2">
            <Button size="sm" variant="accent" onClick={() => onTab('quotes')}>
              Go to offer · Confirm cover
            </Button>
          </div>
        </div>
      )}

      {(sold || (accepted && !awaitingCover)) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sold && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Sale <span className="font-mono font-semibold">{sold.reference}</span> · {sold.offer_reference} · insurer reference <span className="font-mono font-semibold">{sold.insurer_reference}</span> · cover from {shortDate(sold.cover_start_date)}
            </p>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={onTab} className="mt-4 flex min-h-0 flex-col">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items & cover</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="claims">
            Claims
            {claimAlerts.length > 0 ? (
              <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {claimAlerts.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="quotes">Quotes & decisions ({r.offers.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity & documents ({r.communications.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-5 pt-4">
          <section
            className="rounded-xl border border-navy-800/10 bg-navy-50/40 px-3 py-3"
            aria-label="Items on this customer"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Items on this customer</h3>
                <p className="mt-1 text-sm text-navy-800">
                  {itemCount} item{itemCount === 1 ? '' : 's'} · {coveredCount} covered
                  {awaitingCover ? ' · 1 awaiting cover' : ''}
                  {attention ? ` · ${attention} need attention` : ''}
                </p>
                {r.offers[0] && (
                  <p className="mt-0.5 text-xs text-navy-600">
                    Latest: {r.offers[0].insurer} · {r.offers[0].product.replace(/_/g, ' ')} · {r.offers[0].status.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" type="button" onClick={() => onTab('items')}>
                  Items & cover
                </Button>
                <Button size="sm" variant="accent" type="button" onClick={() => onTab('quotes')}>
                  Quotes ({r.offers.length})
                </Button>
              </div>
            </div>
          </section>
          <Facts r={r} />
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">What happens next</h3>
            <FollowUps r={r} />
          </section>
          {r.enquiries.length > 0 && (
            <details className="rounded-lg border border-navy-800/10 open:bg-navy-50/30 sm:open:bg-transparent" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
                Enquiries
              </summary>
              <ul className="space-y-1.5 px-3 pb-3 text-sm">
                {r.enquiries.map((e) => (
                  <li key={e.id} className="rounded-lg border border-navy-800/10 px-3 py-2">
                    <span className="font-mono text-xs">{e.reference}</span> · {shortDate(e.created_at)} · {e.source.replace(/_/g, ' ')}
                    {e.referrer ? ` · ${e.referrer.name} (${e.referral_code ?? e.referrer.referral_code})` : ''}{e.interest ? ` · ${e.interest}` : ''}
                    {e.message && <span className="block text-xs text-navy-600">{e.message}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <EnquiryAttribution personId={r.id} />
          {r.can_reassign && (
            <details className="rounded-lg border border-navy-800/10 open:bg-navy-50/30 sm:open:bg-transparent" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
                Assignment
              </summary>
              <div className="space-y-2 px-3 pb-3">
                <Reassign r={r} />
                {r.assignment_history.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-navy-600">
                    {r.assignment_history.map((a, i) => <li key={i}>{shortDate(a.at)}: {a.from?.name ?? 'Unassigned'} → {a.to?.name} by {a.by}{a.reason ? ` (${a.reason})` : ''}</li>)}
                  </ul>
                )}
              </div>
            </details>
          )}
        </TabsContent>
        <TabsContent value="items" className="space-y-5 pt-4">
          <ItemsCoverTab r={r} onAddCovers={() => setAddingCovers(true)} />
          <CustomerPageMirror personId={r.id} slice="items" category={r.category} />
        </TabsContent>
        <TabsContent value="policies" className="pt-4">
          <ClientPoliciesTab personId={r.id} />
        </TabsContent>
        <TabsContent value="financials" className="space-y-5 pt-4">
          <CustomerFinancialsPanel
            customerId={r.account?.id ?? null}
            personId={r.id}
            portalBasePath={r.category === 'sample' ? '/demo/my' : '/my'}
          />
          <CustomerPageMirror personId={r.id} slice="values" category={r.category} />
        </TabsContent>
        <TabsContent value="claims" className="space-y-5 pt-4">
          <ClientClaimsTab personId={r.id} />
          <div className="rounded-xl border border-navy-800/10 bg-navy-50/30 p-3">
            <CustomerPageMirror personId={r.id} slice="claims" category={r.category} />
          </div>
        </TabsContent>
        <TabsContent value="quotes" className="space-y-5 pt-4">
          <QuotesDecisionsTab r={r} offerId={offerId} onCreate={() => setCreating(true)} onAddCovers={() => setAddingCovers(true)} />
          <div className="rounded-xl border border-navy-800/10 bg-navy-50/30 p-3">
            <CustomerPageMirror personId={r.id} slice="quotes" category={r.category} />
          </div>
        </TabsContent>
        <TabsContent value="activity" className="space-y-4 pt-4">
          <LogCommunication r={r} />
          <RetentionNotice r={r} />
          <details className="rounded-lg border border-navy-800/10 open:bg-navy-50/30 sm:open:bg-transparent" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
              Documents
            </summary>
            <div className="px-3 pb-3">
              <ActivityDocumentsSection r={r} />
            </div>
          </details>
          <details className="rounded-lg border border-navy-800/10 open:bg-navy-50/30 sm:open:bg-transparent" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold tracking-wide text-navy-500 uppercase select-none">
              Timeline
            </summary>
            <div className="px-3 pb-3">
              <Timeline r={r} />
            </div>
          </details>
        </TabsContent>
      </Tabs>

      {creating && <CreateOfferDialog personId={r.id} onClose={() => setCreating(false)} onCreated={() => onTab('quotes')} />}
      {addingCovers && (
        <AddCoversDialog
          personId={r.id}
          onClose={() => setAddingCovers(false)}
          onCreated={() => onTab('quotes')}
        />
      )}
    </div>
  )
}
