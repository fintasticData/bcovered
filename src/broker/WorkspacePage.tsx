import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Maximize2, Minimize2, PanelRightOpen, RotateCcw, Sparkles } from 'lucide-react'
import type { MessageView } from '@/api/client'
import { usePersistentConversation } from '@/api/conversations'
import { useApprovals, useConversation, useJob, useJobs, useLeads, useSendMessage } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { ExecutionPlan } from '@/components/ExecutionPlan'
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

const ACTIVE = ['queued', 'running', 'awaiting_approval', 'awaiting_information', 'paused']

export default function WorkspacePage() {
  const { conversationId, restart, error: startError } = usePersistentConversation('broker')
  const { data: conversation } = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const { data: jobs = [] } = useJobs()
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('result')
  const [selected, setSelected] = useState<string | null>(null)
  const [pane, setPane] = useState<Pane>('chat')

  const messages = conversation?.messages ?? []
  const withViews = messages.filter((m) => m.view && m.view.kind !== 'none')
  const current: MessageView | undefined = withViews.find((m) => m.id === selected) ?? withViews[withViews.length - 1]
  const view: CopilotView = current?.view ?? { kind: 'none' }

  const focusJobId =
    (view.kind === 'job' || view.kind === 'business' ? view.job_id : null) ?? conversation?.job_id ?? jobs.find((j) => ACTIVE.includes(j.status))?.id ?? jobs[0]?.id ?? null
  const { data: job } = useJob(focusJobId)
  const pendingApproval = job?.approvals.find((a) => a.status === 'pending')

  useEffect(() => {
    if (withViews.length) setSelected(null)
  }, [withViews.length])

  return (
    <div className="flex h-full min-h-0 flex-col">
    {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} />}
    <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
      {!expanded && (
        <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
          <ChatPanel
            title="Broker Copilot"
            subtitle="Coordinates the agents · results open on the right"
            avatar={<Sparkles className="h-4 w-4" />}
            messages={messages}
            sending={send.isPending}
            onSend={(t) => {
              send.mutate(t)
              setTab('result')
            }}
            disabled={!conversationId}
            error={startError ?? send.error?.message ?? null}
            placeholder="e.g. Create a quote comparison for Ayanda Khumalo"
            headerAction={
              <Button variant="ghost" size="icon" onClick={() => void restart()} aria-label="New Copilot conversation" title="New conversation">
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
            footerNote="Copilot uses typed tools only. It cannot approve, bind cover or send external messages."
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
                Approve
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
              {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Copilot' : 'Expand workspace'}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="plan">Execution plan</TabsTrigger>
              <TabsTrigger value="context">Customer context</TabsTrigger>
              {pendingApproval && <TabsTrigger value="approve">Approval</TabsTrigger>}
            </TabsList>
          </div>
          <div className="scroll-area flex-1 px-4 py-4">
            <TabsContent value="result">
              <ResultView view={view} />
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
                <EmptyState title="No job in focus">Ask the Copilot to create a comparison to see the plan here.</EmptyState>
              )}
            </TabsContent>
            <TabsContent value="context">
              {job?.customer ? (
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
              ) : (
                <EmptyState title="No customer in focus yet" />
              )}
            </TabsContent>
            {pendingApproval && (
              <TabsContent value="approve">
                <ApprovalForJob approvalId={pendingApproval.id} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </section>
    </div>
    </div>
  )
}

function ApprovalForJob({ approvalId }: { approvalId: string }) {
  const { data = [] } = useApprovals(['pending'])
  const v = data.find((a) => a.approval.id === approvalId)
  return v ? <ApprovalCard view={v} /> : <EmptyState title="This approval has been decided" />
}

export function ResultView({ view }: { view: CopilotView }) {
  const { data: approvals = [] } = useApprovals()
  const { data: leads = [] } = useLeads()
  const { data: jobs = [] } = useJobs()
  const leadRows = useMemo(() => (view.kind === 'leads' ? leads.filter((l) => view.lead_ids.includes(l.id)) : []), [view, leads])

  if (view.kind === 'none') {
    return (
      <EmptyState title="Results appear here">
        Ask the Copilot for pending approvals, new leads or running jobs, or to create a quote comparison. Each answer opens as a working view
        you can act on.
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
