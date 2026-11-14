import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, Maximize2, Minimize2, PanelRightOpen, RotateCcw } from 'lucide-react'
import type { MessageView } from '@/api/client'
import { RussResult } from './russ/RussResult'
import { usePersistentConversation } from '@/api/conversations'
import { useApprovals, useCommercialClient, useConversation, useJob, useJobs, useLeads, useSendMessage } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { AdviceNotice } from '@/components/commercial/badges'
import { RiskTwinMap } from '@/components/commercial/RiskTwinMap'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CopilotView } from '@/server/agents/copilotCommands'
import { MOTOR_FIELDS, formatMotorField } from '@/server/domain/motor'
import { cn, formatDateTime } from '@/lib/utils'
import { ApprovalCard } from './ApprovalCard'
import { CommercialResult, isCommercialView } from './commercial/CommercialResult'
import { MobilePaneSwitch, type Pane } from './MobilePaneSwitch'
import { JobControls } from './JobControls'
import { EmptyState } from './PageHeader'
import { MARKET_DOT, TERM_STYLE, lineLabel } from './navConfig'
import { availableLenses, lensFor, type Lens } from './russ/lenses'
import { CopilotWorkspace } from './copilot/CopilotWorkspace'

const ACTIVE = ['queued', 'running', 'awaiting_approval', 'awaiting_information', 'paused']

export const viewJobId = (view: CopilotView): string | null =>
  view.kind === 'job' || view.kind === 'business' || view.kind === 'twin' || view.kind === 'life_case' || view.kind === 'reconciliation' || view.kind === 'movements' ? view.job_id : null

export default function WorkspacePage() {
  return <CopilotWorkspace />
}

/** A copilot's workflow lenses (`?lens=`): the in-browser agent workflows, conversation on the left, result on the right. */
export function LensWorkflows({ copilot }: { copilot?: 'ava' | 'russ' }) {
  const [params] = useSearchParams()
  const lens = lensFor(params.get('lens'), copilot)
  return <LensWorkspace key={lens.id} lens={lens} copilot={copilot} />
}

function LensSwitcher({ current, copilot }: { current: Lens; copilot?: 'ava' | 'russ' }) {
  const [params, setParams] = useSearchParams()
  const lenses = availableLenses(copilot)
  if (lenses.length < 2) return null
  return (
    <div className="scroll-x px-3 pt-3 sm:px-4">
      <div role="tablist" aria-label="Russ lens" className="inline-flex gap-1 rounded-xl bg-navy-100/70 p-1">
        {lenses.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === current.id}
            title={l.line ? lineLabel(l.line) : 'Across all lines'}
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('prompt')
              next.set('lens', l.id)
              setParams(next)
            }}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
              l.id === current.id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900',
            )}
          >
            {l.line ? (
              <span className="flex items-center gap-0.5" aria-hidden>
                <span className={cn('h-2.5 w-0.5 rounded-full', TERM_STYLE[l.line.term].rail)} />
                <span className={cn('h-1.5 w-1.5 rounded-full', MARKET_DOT[l.line.market])} />
              </span>
            ) : (
              <l.icon className="h-3.5 w-3.5" aria-hidden />
            )}
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function LensWorkspace({ lens, copilot }: { lens: Lens; copilot?: 'ava' | 'russ' }) {
  const name = lens.copilot === 'russ' ? 'Russ' : 'Ava'
  const { conversationId, restart, error: startError } = usePersistentConversation('broker', lens.assistant)
  const { data: conversation } = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const { data: jobs = [] } = useJobs()
  const { data: pending = [] } = useApprovals(['pending'])
  const [params, setParams] = useSearchParams()
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('result')
  const [selected, setSelected] = useState<string | null>(null)
  const [pane, setPane] = useState<Pane>('chat')
  const sentPrompt = useRef<string | null>(null)

  const messages = conversation?.messages ?? []
  const withViews = messages.filter((m) => m.view && m.view.kind !== 'none')
  const current: MessageView | undefined = withViews.find((m) => m.id === selected) ?? withViews[withViews.length - 1]
  const view: CopilotView = current?.view ?? { kind: 'none' }

  const lensJobs = jobs.filter((j) => lens.workflows.includes(j.workflow_type))
  const focusJobId = viewJobId(view) ?? conversation?.job_id ?? lensJobs.find((j) => ACTIVE.includes(j.status))?.id ?? lensJobs[0]?.id ?? null
  const focusProfileId = view.kind === 'business' || view.kind === 'twin' ? view.profile_id : null
  const { data: job } = useJob(focusJobId)
  const { data: business } = useCommercialClient(focusProfileId)
  const pendingApproval = pending.find((a) => (focusJobId && a.approval.job_id === focusJobId) || (focusProfileId && a.submission?.profile_id === focusProfileId))
  const showContext = lens.customerContext && Boolean(job?.customer || job?.lead)

  useEffect(() => {
    if (withViews.length) setSelected(null)
  }, [withViews.length])

  const prompt = params.get('prompt')
  useEffect(() => {
    if (!prompt || !conversationId || sentPrompt.current === prompt) return
    sentPrompt.current = prompt
    send.mutate(prompt)
    const next = new URLSearchParams(params)
    next.delete('prompt')
    setParams(next, { replace: true })
  }, [prompt, conversationId, send, params, setParams])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <LensSwitcher current={lens} copilot={copilot} />}
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} />}
      <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
            <ChatPanel
              title={lens.title}
              subtitle={lens.subtitle}
              avatar={<lens.icon className="h-4 w-4" />}
              messages={messages}
              sending={send.isPending}
              onSend={(t) => {
                send.mutate(t)
                setTab('result')
              }}
              disabled={!conversationId}
              error={startError ?? send.error?.message ?? null}
              placeholder={lens.placeholder}
              headerAction={
                <Button variant="ghost" size="icon" onClick={() => void restart()} aria-label={`New conversation with ${name}`} title="New conversation">
                  <RotateCcw />
                </Button>
              }
              renderExtra={(m) =>
                m.view && m.view.kind !== 'none' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(m.id)
                      setTab('result')
                      setPane('work')
                    }}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                      current?.id === m.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-800/10 text-navy-700 hover:border-brand-500',
                    )}
                  >
                    <PanelRightOpen className="h-3 w-3" /> {m.view.title}
                  </button>
                ) : null
              }
              footerNote={lens.footerNote}
            />
          </div>
        )}

        <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="Workspace results">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/10 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-navy-900">{view.kind === 'none' ? 'Workspace' : view.title}</h2>
              {job && (
                <p className="flex items-center gap-2 truncate text-xs text-navy-600">
                  Focus job: {job.job.title} <StatusBadge status={job.job.status} />
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pendingApproval && (
                <Button size="sm" variant="accent" onClick={() => setTab('approve')}>
                  Review approval
                </Button>
              )}
              {job?.job.quote_id && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/broker/quotes/${job.job.quote_id}`}>
                    <Eye /> Preview
                  </Link>
                </Button>
              )}
              {job && <JobControls job={job.job} />}
              <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? `Show ${name}` : 'Expand editor'}
              </Button>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-3">
              <TabsList>
                <TabsTrigger value="result">Result</TabsTrigger>
                <TabsTrigger value="plan">Execution plan</TabsTrigger>
                {showContext && <TabsTrigger value="context">Customer context</TabsTrigger>}
                {business && <TabsTrigger value="twin">Risk Twin</TabsTrigger>}
                {pendingApproval && <TabsTrigger value="approve">Approval</TabsTrigger>}
              </TabsList>
            </div>
            <div className="scroll-area flex-1 px-4 py-4">
              <TabsContent value="result">
                {view.kind === 'none' ? (
                  <div className="space-y-4">
                    <EmptyState title="Results appear here">{lens.emptyText}</EmptyState>
                    {lens.id === 'commercial' && <AdviceNotice />}
                  </div>
                ) : (
                  <ResultView view={view} />
                )}
              </TabsContent>
              <TabsContent value="plan">
                {job ? (
                  <>
                    <p className="mb-4 text-xs text-navy-600">
                      {job.job.title} · {job.job.steps_done}/{job.job.steps_total} steps · started {formatDateTime(job.job.started_at)}
                    </p>
                    <ExecutionPlan steps={job.steps} detailed />
                    <Link to={`/broker/jobs/${job.job.id}`} className="mt-2 inline-block text-xs font-semibold text-brand-600">
                      Full job record and audit trail
                    </Link>
                  </>
                ) : (
                  <EmptyState title="No job in focus">{lens.planEmpty}</EmptyState>
                )}
              </TabsContent>
              {showContext && job?.customer && (
                <TabsContent value="context">
                  <div className="space-y-4">
                    <div>
                      <p className="text-base font-semibold text-navy-900">{job.customer.full_name}</p>
                      <p className="text-xs text-navy-600">
                        {job.customer.email} · {job.customer.phone} · {humanise(job.customer.status)}
                      </p>
                    </div>
                    {job.lead?.qualification.vehicle && (
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                        {MOTOR_FIELDS.map((f) => (
                          <div key={f.key}>
                            <dt className="text-[11px] text-navy-500">{f.label}</dt>
                            <dd className="font-medium text-navy-900">{formatMotorField(f.key, job.lead!.qualification.vehicle!)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {job.lead && (
                      <Link to={`/broker/leads/${job.lead.id}`} className="text-xs font-semibold text-brand-600">
                        Open lead record
                      </Link>
                    )}
                  </div>
                </TabsContent>
              )}
              {business && (
                <TabsContent value="twin">
                  {business.risk_profile ? (
                    <RiskTwinMap data={business} brokerName={business.assigned_broker} />
                  ) : (
                    <EmptyState title="No Risk Twin yet">The Industry Risk Analyst builds it during the review.</EmptyState>
                  )}
                </TabsContent>
              )}
              {pendingApproval && (
                <TabsContent value="approve">
                  <ApprovalCard view={pendingApproval} />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </section>
      </div>
    </div>
  )
}

export function ResultView({ view }: { view: CopilotView }) {
  const { data: approvals = [] } = useApprovals()
  const { data: leads = [] } = useLeads()
  const { data: jobs = [] } = useJobs()
  const leadRows = useMemo(() => (view.kind === 'leads' ? leads.filter((l) => view.lead_ids.includes(l.id)) : []), [view, leads])

  if (view.kind === 'none') {
    return (
      <EmptyState title="Results appear here">
        Ask Russ for pending approvals, new leads or running jobs, or to create a quote comparison. Each answer opens as a working view you can act on.
      </EmptyState>
    )
  }
  if (view.kind === 'approvals') {
    const rows = approvals.filter((a) => view.approval_ids.includes(a.approval.id))
    return rows.length ? (
      <div className="space-y-4">{rows.map((a) => <ApprovalCard key={a.approval.id} view={a} compact />)}</div>
    ) : (
      <EmptyState title="Nothing was waiting for approval" />
    )
  }
  if (view.kind === 'leads') {
    return leadRows.length ? (
      <ul className="divide-y divide-navy-800/5">
        {leadRows.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <Link to={`/broker/leads/${l.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                {l.customer_name}
              </Link>
              <p className="truncate text-xs text-navy-600">{l.qualification.summary}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-navy-600">{humanise(l.product_category)}</span>
              <StatusBadge status={l.status} />
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState title="No leads matched" />
    )
  }
  if (view.kind === 'jobs') {
    const rows = jobs.filter((j) => view.job_ids.includes(j.id))
    return rows.length ? (
      <ul className="space-y-3">
        {rows.map((j) => (
          <li key={j.id} className="rounded-xl border border-navy-800/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <Link to={`/broker/jobs/${j.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                {j.title}
              </Link>
              <StatusBadge status={j.status} />
            </div>
            <p className="mt-0.5 text-xs text-navy-600">
              {j.customer_name ?? 'No customer yet'} · {j.steps_done}/{j.steps_total} steps {j.current_step && `· ${j.current_step}`}
            </p>
            <div className="mt-2">
              <JobControls job={j} />
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState title="No jobs matched" />
    )
  }
  if (isCommercialView(view)) return <CommercialResult view={view} />
  if (view.kind !== 'job') return <RussResult view={view} />
  return <JobResult jobId={view.job_id} />
}

function JobResult({ jobId }: { jobId: string }) {
  const { data } = useJob(jobId)
  const { data: pending = [] } = useApprovals(['pending'])
  if (!data) return null
  const approval = pending.find((a) => a.approval.job_id === jobId)
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-800/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-navy-900">{data.job.title}</p>
          <StatusBadge status={data.job.status} />
        </div>
        <p className="mt-0.5 text-xs text-navy-600">{data.customer?.full_name}</p>
        <div className="mt-3">
          <ExecutionPlan steps={data.steps} />
        </div>
      </div>
      {approval && <ApprovalCard view={approval} />}
    </div>
  )
}
