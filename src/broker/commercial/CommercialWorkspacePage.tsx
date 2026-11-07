import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Briefcase, Maximize2, Minimize2, PanelRightOpen, RotateCcw } from 'lucide-react'
import type { MessageView } from '@/api/client'
import { usePersistentConversation } from '@/api/conversations'
import { useApprovals, useCommercialClient, useConversation, useJob, useSendMessage } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { AdviceNotice } from '@/components/commercial/badges'
import { RiskTwinMap } from '@/components/commercial/RiskTwinMap'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CopilotView } from '@/server/agents/copilotCommands'
import { cn, formatDateTime } from '@/lib/utils'
import { ApprovalCard } from '../ApprovalCard'
import { JobControls } from '../JobControls'
import { EmptyState } from '../PageHeader'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { ResultView } from '../WorkspacePage'

export default function CommercialWorkspacePage() {
  const { conversationId, restart, error: startError } = usePersistentConversation('broker', 'commercial_copilot')
  const { data: conversation } = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const [params, setParams] = useSearchParams()
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('result')
  const [selected, setSelected] = useState<string | null>(null)
  const sentPrompt = useRef<string | null>(null)
  const [pane, setPane] = useState<Pane>('chat')

  const messages = conversation?.messages ?? []
  const withViews = messages.filter((m) => m.view && m.view.kind !== 'none')
  const current: MessageView | undefined = withViews.find((m) => m.id === selected) ?? withViews[withViews.length - 1]
  const view: CopilotView = current?.view ?? { kind: 'none' }
  const focusJobId = view.kind === 'job' || view.kind === 'business' || view.kind === 'twin' ? view.job_id : null
  const focusProfileId = view.kind === 'business' || view.kind === 'twin' ? view.profile_id : null
  const { data: job } = useJob(focusJobId)
  const { data: business } = useCommercialClient(focusProfileId)
  const { data: pending = [] } = useApprovals(['pending'])
  const pendingApproval = pending.find((a) => (focusJobId && a.approval.job_id === focusJobId) || (focusProfileId && a.submission?.profile_id === focusProfileId))

  useEffect(() => {
    if (withViews.length) setSelected(null)
  }, [withViews.length])

  const prompt = params.get('prompt')
  useEffect(() => {
    if (!prompt || !conversationId || sentPrompt.current === prompt) return
    sentPrompt.current = prompt
    send.mutate(prompt)
    setParams({}, { replace: true })
  }, [prompt, conversationId, send, setParams])

  return (
    <div className="flex h-full min-h-0 flex-col">
    {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} />}
    <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
      {!expanded && (
        <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
          <ChatPanel
            title="Commercial Copilot"
            subtitle="Coordinates the commercial agents · results open on the right"
            avatar={<Briefcase className="h-4 w-4" />}
            messages={messages}
            sending={send.isPending}
            onSend={(t) => {
              send.mutate(t)
              setTab('result')
            }}
            disabled={!conversationId}
            error={startError ?? send.error?.message ?? null}
            placeholder="e.g. Review Ubuntu Foods and identify outstanding insurance questions"
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
            footerNote="Copilot uses typed tools only. It identifies potential exposures; it cannot approve, give advice or contact insurers."
          />
        </div>
      )}

      <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="Commercial results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-navy-900">{view.kind === 'none' ? 'Commercial workspace' : view.title}</h2>
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
            {job && <JobControls job={job.job} />}
            <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Copilot' : 'Expand editor'}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="plan">Execution plan</TabsTrigger>
              {business && <TabsTrigger value="twin">Risk Twin</TabsTrigger>}
              {pendingApproval && <TabsTrigger value="approve">Approval</TabsTrigger>}
            </TabsList>
          </div>
          <div className="scroll-area flex-1 px-4 py-4">
            <TabsContent value="result">
              {view.kind === 'none' ? (
                <div className="space-y-4">
                  <EmptyState title="Results appear here">
                    Ask the Copilot to review a business, show commercial clients or draft submissions. Each answer opens here as a working view.
                  </EmptyState>
                  <AdviceNotice />
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
                <EmptyState title="No job in focus">Ask the Copilot to review a business to see its plan here.</EmptyState>
              )}
            </TabsContent>
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
