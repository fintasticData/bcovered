import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, Briefcase, Check, Download, Eye, Loader2, Maximize2, Minimize2, Send, ShieldCheck, X } from 'lucide-react'
import type { SectionView, SubmissionDetail } from '@/api/client'
import { usePersistentConversation } from '@/api/conversations'
import { useApprovals, useConversation, useRequestSubmissionApproval, useSendMessage, useSubmission, useUpdateSection } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { AdviceNotice, ProvenanceBadge } from '@/components/commercial/badges'
import { ExposureCard } from '@/components/commercial/ExposureCard'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { rand } from '@/lib/quote'
import { cn, formatDateTime } from '@/lib/utils'
import { ApprovalCard } from '../ApprovalCard'
import { ErrorState, LoadingState } from '../PageHeader'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { ProfileEditor, TaskList } from './ClientDetailPage'

const APPROVAL_CHIP: Record<SubmissionDetail['approval_state'], { label: string; className: string } | null> = {
  none: null,
  pending_current: { label: 'Approval pending', className: 'bg-amber-50 text-amber-800' },
  pending_stale: { label: 'Changed since approval was requested', className: 'bg-red-50 text-red-700' },
  approved: { label: 'Approved by broker', className: 'bg-emerald-50 text-emerald-700' },
  changes_requested: { label: 'Changes requested', className: 'bg-amber-50 text-amber-800' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700' },
}

export default function SubmissionPage() {
  const { submissionId } = useParams()
  const { data, isLoading, error } = useSubmission(submissionId)
  const { conversationId, error: chatError } = usePersistentConversation('broker', 'commercial_copilot')
  const { data: conversation } = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const requestApproval = useRequestSubmissionApproval()
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('overview')
  const [highlight, setHighlight] = useState<string | null>(null)
  const clearHighlight = useCallback(() => setHighlight(null), [])
  const [pane, setPane] = useState<Pane>('work')

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Submission not found'} /></div>

  const s = data.submission
  const b = data.business
  const name = b.profile.trading_name ?? b.profile.registered_name
  const editable = ['draft', 'awaiting_approval'].includes(s.status)
  const chip = APPROVAL_CHIP[data.approval_state]
  const activeTab = tab === 'approval' && data.approval_state !== 'pending_current' ? 'overview' : tab

  const showSection = (id: string) => {
    setTab('sections')
    setHighlight(id)
  }

  const exportPack = () => {
    const blob = new Blob([JSON.stringify(s.pack, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-submission-draft.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
    {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Editor" />}
    <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
      {!expanded && (
        <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
          <ChatPanel
            title="Commercial Copilot"
            subtitle={`Working on ${name}`}
            avatar={<Briefcase className="h-4 w-4" />}
            messages={conversation?.messages ?? []}
            sending={send.isPending}
            onSend={(t) => send.mutate(t)}
            disabled={!conversationId}
            error={chatError ?? send.error?.message ?? null}
            placeholder={`e.g. Review ${name}`}
            footerNote={
              <>
                Results of Copilot requests open in the <Link to="/broker/commercial" className="font-semibold text-brand-600">commercial workspace</Link>.
                Agent suggestions for this pack are on the right.
              </>
            }
          />
        </div>
      )}

      <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="Submission editor">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/10 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-navy-900">
              <Link to={`/broker/commercial/clients/${b.profile.id}`} className="hover:text-brand-600">
                {name}
              </Link>{' '}
              · submission pack
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-navy-600">
              <StatusBadge status={s.status} />
              <SimulatedBadge label={s.status === 'ready_for_market' ? 'Ready for market · not sent' : 'Draft · not sent to any insurer'} />
              {chip && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', chip.className)}>{chip.label}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTab('preview')}>
              <Eye /> Preview pack
            </Button>
            <Button size="sm" variant="outline" onClick={exportPack} disabled={!s.pack}>
              <Download /> Export
            </Button>
            {data.approval_state === 'pending_current' && (
              <Button size="sm" variant="accent" onClick={() => setTab('approval')}>
                <ShieldCheck /> Review approval
              </Button>
            )}
            {data.can_request_approval && (
              <Button size="sm" variant="accent" onClick={() => requestApproval.mutate(s.id)} disabled={requestApproval.isPending}>
                {requestApproval.isPending ? <Loader2 className="animate-spin" /> : <Send />} Request approval again
              </Button>
            )}
            <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Copilot' : 'Expand editor'}
            </Button>
          </div>
        </div>
        {requestApproval.error && <p className="px-4 pt-2 text-xs font-medium text-red-600">{requestApproval.error.message}</p>}

        <Tabs value={activeTab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <TabsList className="lg:flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sections">Sections ({data.sections.length})</TabsTrigger>
              <TabsTrigger value="exposures">Exposures</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="missing">Missing info</TabsTrigger>
              <TabsTrigger value="preview">Pack preview</TabsTrigger>
              {data.approval_state === 'pending_current' && <TabsTrigger value="approval">Approval</TabsTrigger>}
            </TabsList>
          </div>
          <div className="scroll-area flex-1 px-4 py-4">
            <TabsContent value="overview">
              <Overview data={data} editable={editable} onShow={showSection} />
            </TabsContent>
            <TabsContent value="sections">
              <SectionsEditor sections={data.sections} editable={editable} highlight={highlight} onHighlighted={clearHighlight} />
            </TabsContent>
            <TabsContent value="exposures" className="space-y-3">
              <AdviceNotice />
              {b.exposures.map((e) => (
                <ExposureCard key={e.id} exposure={e} brokerName={b.assigned_broker} locationNames={Object.fromEntries(b.locations.map((l) => [l.id, l.suburb ?? l.name]))} />
              ))}
            </TabsContent>
            <TabsContent value="profile" className="space-y-4">
              <ProfileEditor data={b} />
              <section className="panel p-5">
                <h2 className="text-sm font-semibold text-navy-900">Locations</h2>
                <ul className="mt-2 divide-y divide-navy-800/5">
                  {b.locations.map((l) => (
                    <li key={l.id} className="py-2 text-sm">
                      <span className="font-medium text-navy-900">{l.name}</span>{' '}
                      <span className="text-xs text-navy-600">
                        · {l.ownership} · {l.construction ?? 'construction not given'} · fire: {l.fire_protection.join(', ') || 'none recorded'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </TabsContent>
            <TabsContent value="missing">
              <TaskList data={b} />
            </TabsContent>
            <TabsContent value="preview">
              <PackPreview data={data} />
            </TabsContent>
            {data.approval_state === 'pending_current' && (
              <TabsContent value="approval">
                <PendingApproval approvalId={data.pending_approval!.id} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </section>
    </div>
    </div>
  )
}

function PendingApproval({ approvalId }: { approvalId: string }) {
  const { data = [] } = useApprovals(['pending'])
  const v = data.find((a) => a.approval.id === approvalId)
  return v ? <ApprovalCard view={v} /> : <p className="text-sm text-navy-600">This approval has been decided.</p>
}

function Overview({ data, editable, onShow }: { data: SubmissionDetail; editable: boolean; onShow: (id: string) => void }) {
  const update = useUpdateSection()
  const s = data.submission
  const proposed = data.sections.filter((x) => x.status === 'proposed')
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-navy-800/10 p-3">
          <p className="text-[11px] font-semibold text-navy-500">Completeness</p>
          <p className="text-lg font-semibold text-navy-900">{s.completeness}%</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-100">
            <div className="h-full bg-brand-500" style={{ width: `${s.completeness}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-navy-800/10 p-3">
          <p className="text-[11px] font-semibold text-navy-500">Sections</p>
          <p className="text-lg font-semibold text-navy-900">
            {data.sections.filter((x) => x.status === 'included').length} included · {proposed.length} to decide
          </p>
        </div>
        <div className="rounded-xl border border-navy-800/10 p-3">
          <p className="text-[11px] font-semibold text-navy-500">Outstanding items</p>
          <p className="text-lg font-semibold text-navy-900">{s.outstanding_items.length}</p>
        </div>
      </div>

      {s.pack?.broker_summary && (
        <section>
          <h2 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Broker review summary</h2>
          <p className="mt-1 text-sm leading-relaxed text-navy-800">{s.pack.broker_summary}</p>
        </section>
      )}

      {s.validation && (s.validation.errors.length > 0 || s.validation.warnings.length > 0) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" /> Validation · checked {formatDateTime(s.validation.checked_at)}
          </h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-900">
            {[...s.validation.errors, ...s.validation.warnings].map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-navy-900">Agent suggestions for the draft</h2>
        <p className="text-xs text-navy-600">
          The Commercial Underwriting Agent proposed these sections from the potential exposures. Apply the ones you want; each change is recorded
          and needs approval again.
        </p>
        {proposed.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
            <Check className="h-4 w-4" /> Every proposed section has a broker decision.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {proposed.map((x) => (
              <li key={x.id} className="rounded-xl border border-navy-800/10 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-mist p-2.5">
                    <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Current</p>
                    <p className="mt-0.5 text-sm text-navy-800">Not yet in the draft</p>
                  </div>
                  <div className="rounded-lg border border-brand-500/30 bg-brand-50/60 p-2.5">
                    <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Suggested</p>
                    <p className="mt-0.5 text-sm text-navy-800">
                      Include <strong>{x.label}</strong>
                      {x.sum_insured !== null ? ` with a sum insured of ${rand(x.sum_insured)}` : ''}. {x.basis}
                    </p>
                    <p className="mt-0.5 text-[11px] text-navy-500">Raised by {x.exposure_ids.length} potential exposure{x.exposure_ids.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="accent" disabled={!editable || update.isPending} onClick={() => update.mutate({ section_id: x.id, status: 'included' })}>
                    <Check /> Apply to draft
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!editable || update.isPending} onClick={() => update.mutate({ section_id: x.id, status: 'excluded' })}>
                    <X /> Leave out
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onShow(x.id)}>
                    <Eye /> Show in draft
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {update.error && <p className="mt-2 text-xs font-medium text-red-600">{update.error.message}</p>}
      </section>
    </div>
  )
}

function SectionsEditor({ sections, editable, highlight, onHighlighted }: { sections: SectionView[]; editable: boolean; highlight: string | null; onHighlighted: () => void }) {
  const refs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (!highlight) return
    refs.current.get(highlight)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = window.setTimeout(onHighlighted, 2500)
    return () => window.clearTimeout(t)
  }, [highlight, onHighlighted])

  return (
    <div className="space-y-3">
      <p className="text-xs text-navy-600">
        Sections in catalogue order. Sums insured come only from declared values; liability limits and the business interruption basis need a
        broker decision.
      </p>
      <ol className="space-y-2">
        {sections.map((x) => (
          <li
            key={x.id}
            ref={(el) => {
              if (el) refs.current.set(x.id, el)
            }}
            className={cn('rounded-xl border border-navy-800/10 transition', highlight === x.id && 'ring-2 ring-brand-500 ring-offset-2')}
          >
            <SectionRow section={x} editable={editable} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function SectionRow({ section: x, editable }: { section: SectionView; editable: boolean }) {
  const update = useUpdateSection()
  const [sum, setSum] = useState(x.sum_insured?.toString() ?? '')
  const [limit, setLimit] = useState(x.limit_of_indemnity?.toString() ?? '')
  const [notes, setNotes] = useState(x.notes ?? '')
  useEffect(() => {
    setSum(x.sum_insured?.toString() ?? '')
    setLimit(x.limit_of_indemnity?.toString() ?? '')
    setNotes(x.notes ?? '')
  }, [x.sum_insured, x.limit_of_indemnity, x.notes])
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[\s,R]/g, '')))
  const dirty = num(sum) !== x.sum_insured || num(limit) !== x.limit_of_indemnity || (notes || null) !== x.notes
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-900">{x.label}</p>
        <div className="flex items-center gap-2">
          {x.broker_edited && <span className="text-[11px] font-medium text-navy-500">Edited by broker</span>}
          <select
            value={x.status}
            disabled={!editable || update.isPending}
            onChange={(e) => update.mutate({ section_id: x.id, status: e.target.value as SectionView['status'] })}
            className="rounded-lg border border-navy-800/15 bg-white px-2 py-1 text-xs font-semibold text-navy-800"
            aria-label={`${x.label} status`}
          >
            <option value="proposed">Proposed</option>
            <option value="included">Included</option>
            <option value="excluded">Left out</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-navy-600">{x.basis}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-[11px] text-navy-500">
          Sum insured (R)
          <input className="field mt-0.5 py-1.5" value={sum} onChange={(e) => setSum(e.target.value)} disabled={!editable} inputMode="numeric" />
        </label>
        <label className="text-[11px] text-navy-500">
          Limit of indemnity (R)
          <input className="field mt-0.5 py-1.5" value={limit} onChange={(e) => setLimit(e.target.value)} disabled={!editable} inputMode="numeric" />
        </label>
        <label className="text-[11px] text-navy-500">
          Broker note
          <input className="field mt-0.5 py-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} />
        </label>
      </div>
      {dirty && editable && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="accent"
            disabled={update.isPending}
            onClick={() => update.mutate({ section_id: x.id, sum_insured: num(sum), limit_of_indemnity: num(limit), notes: notes.trim() || null })}
          >
            {update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Apply to draft
          </Button>
          <span className="text-[11px] text-amber-700">Unsaved change</span>
        </div>
      )}
      {update.error && <p className="text-xs font-medium text-red-600">{update.error.message}</p>}
    </div>
  )
}

function PackPreview({ data }: { data: SubmissionDetail }) {
  const pack = data.submission.pack
  if (!pack) return <p className="text-sm text-navy-600">No pack yet.</p>
  return (
    <article className="space-y-5 text-sm">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">{pack.disclaimer}</p>
      <section>
        <h2 className="text-base font-semibold text-navy-900">{pack.business.registered_name}</h2>
        <p className="text-xs text-navy-600">
          {pack.business.industry} · {pack.business.operating_regions.join(', ')} · {pack.business.annual_turnover ? `turnover ${rand(pack.business.annual_turnover)}` : 'turnover not given'} ·{' '}
          {pack.business.employee_count ?? '?'} employees · registration {pack.business.registration_number ?? 'not given'}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-navy-600">
          Information sources:
          {(Object.keys(pack.information_sources) as Array<keyof typeof pack.information_sources>).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <ProvenanceBadge source={k} /> {pack.information_sources[k]}
            </span>
          ))}
        </p>
      </section>
      <section>
        <h3 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Locations</h3>
        <ul className="mt-1 space-y-1">
          {pack.locations.map((l) => (
            <li key={l.name} className="text-navy-800">
              <strong>{l.name}</strong> · {l.address} · {l.occupancy} · {l.ownership} · fire: {l.fire_protection.join(', ') || 'none recorded'} · security:{' '}
              {l.security.join(', ') || 'none recorded'}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Sections requested</h3>
        <div className="scroll-x mt-1">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="text-left text-navy-500">
            <tr>
              <th className="py-1">Section</th>
              <th className="py-1">Status</th>
              <th className="py-1">Sum insured</th>
              <th className="py-1">Limit</th>
              <th className="py-1">Basis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/5">
            {pack.sections.map((x) => (
              <tr key={x.cover_class}>
                <td className="py-1 font-medium text-navy-900">{x.label}</td>
                <td className="py-1">{humanise(x.status === 'excluded' ? 'left_out' : x.status)}</td>
                <td className="py-1">{x.sum_insured !== null ? rand(x.sum_insured) : '–'}</td>
                <td className="py-1">{x.limit_of_indemnity !== null ? rand(x.limit_of_indemnity) : '–'}</td>
                <td className="py-1 text-navy-600">{x.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Current cover and claims</h3>
          <p className="mt-1 text-navy-800">
            {pack.existing_cover?.insurer ?? 'No current insurer'}
            {pack.existing_cover?.renewal_month ? `, renews ${pack.existing_cover.renewal_month}` : ''}
          </p>
          <p className="text-navy-800">
            {pack.loss_history ? `${pack.loss_history.claims_last_5_years ?? '?'} claims in 5 years. ${pack.loss_history.notes ?? ''}` : 'Claims history not given'}
          </p>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Outstanding items</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-navy-800">
            {pack.outstanding_items.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      </section>
      <p className="text-[11px] text-navy-500">Prepared by {pack.prepared_by_agent.replace(/_/g, ' ')}. Payload pinned for approval by hash.</p>
    </article>
  )
}
