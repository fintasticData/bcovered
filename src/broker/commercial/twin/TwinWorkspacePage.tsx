import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Briefcase, Building2, FileText, Maximize2, Minimize2, PanelRightOpen, RotateCcw } from 'lucide-react'
import { usePersistentConversation } from '@/api/conversations'
import { useConversation, useSendMessage, useTwinWorkspace } from '@/api/hooks'
import { BuildTwinButton } from '@/components/commercial/BuildTwinButton'
import { ChatPanel } from '@/components/ChatPanel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { TwinTable } from '@/server/db/commercialSchema'
import { failVerb } from '@/server/domain/commercial/graph'
import { EmptyState, ErrorState, LoadingState } from '../../PageHeader'
import { MobilePaneSwitch, type Pane } from '../../MobilePaneSwitch'
import { ActionsTab } from './ActionsTab'
import { AssessmentTab } from './AssessmentTab'
import { ChangesTab } from './ChangesTab'
import { GraphTab, type GraphMode } from './GraphTab'
import { InsuranceTab } from './InsuranceTab'
import { StageBadge, type TwinTab } from './shared'

const TABS: TwinTab[] = ['assessment', 'graph', 'actions', 'insurance', 'changes']
const STAGE_TAB: Record<string, TwinTab> = { discovery: 'assessment', assets: 'graph', exposures: 'assessment', insurance: 'insurance', signoff: 'assessment' }

/** The assessment-led Risk Twin screen: the Copilot guides on the left, the broker's work product sits on the right. */
export default function TwinWorkspacePage() {
  const { profileId } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: w, isLoading, error } = useTwinWorkspace(profileId)
  const { conversationId, restart, error: startError } = usePersistentConversation('broker', 'commercial_copilot')
  const { data: conversation } = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const [expanded, setExpanded] = useState(false)
  const [pane, setPane] = useState<Pane>('work')
  const [selected, setSelected] = useState<string | null>(null)

  const tab: TwinTab = TABS.includes(params.get('tab') as TwinTab) ? (params.get('tab') as TwinTab) : 'assessment'
  const impactParam = params.get('impact')
  const [mode, setMode] = useState<GraphMode>(() => {
    if (!impactParam) return null
    const [table, id] = impactParam.split(':')
    return { kind: 'impact', table: table as TwinTable, id }
  })
  const setTab = (t: TwinTab) => setParams((p) => ({ ...Object.fromEntries(p), tab: t }), { replace: true })
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab])

  const messages = conversation?.messages ?? []
  /** Undefined until the conversation loads, so results from before this visit do not move the workspace. */
  const lastSeen = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!conversation) return
    const last = [...messages].reverse().find((m) => m.view && m.view.kind !== 'none')
    if (lastSeen.current === undefined) {
      lastSeen.current = last?.id ?? null
      return
    }
    if (!last || lastSeen.current === last.id) return
    lastSeen.current = last.id
    const v = last.view
    if (v?.kind === 'twin' && v.profile_id === profileId) {
      setTab(v.focus)
      if (v.impact) {
        setMode({ kind: 'impact', table: v.impact.table, id: v.impact.id })
        setSelected(`${v.impact.table}:${v.impact.id}`)
      }
      setPane('work')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, messages.length, profileId])

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !w) return <div className="p-6"><ErrorState message={error?.message ?? 'Business not found'} /></div>

  const p = w.business.profile
  const name = p.trading_name ?? p.registered_name
  const formal = w.assessment && w.assessment.status !== 'draft' ? w.assessment : null
  const ask = (prompt: string) => {
    send.mutate(prompt)
    setPane('chat')
  }
  const starters = [
    `Assess ${name} and identify the five most important risk areas requiring review`,
    ...(w.business.assets.length
      ? [(w.business.assets.find((a) => a.asset_class === 'machinery') ?? w.business.assets[0]).description].map((d) => `What happens if the ${d.toLowerCase()} ${failVerb(d)} at ${name}?`)
      : []),
    `Investigate possible underinsurance at ${name}`,
    `Compare ${name} with its last assessment`,
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Assessment" />}
      <div className={cn('grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
            <ChatPanel
              title="Russ · commercial"
              subtitle={`Working on ${name} · results open on the right`}
              avatar={<Briefcase className="h-4 w-4" />}
              messages={messages}
              sending={send.isPending}
              onSend={(t) => send.mutate(t)}
              disabled={!conversationId}
              error={startError ?? send.error?.message ?? null}
              placeholder={`Ask about ${name}, e.g. what happens if the cold rooms fail?`}
              starters={w.business.risk_profile ? starters : [`Create a Risk Twin for ${name}`]}
              headerAction={
                <Button variant="ghost" size="icon" onClick={() => void restart()} aria-label="New Copilot conversation" title="New conversation">
                  <RotateCcw />
                </Button>
              }
              renderExtra={(m) =>
                m.view?.kind === 'twin' && m.view.profile_id === profileId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (m.view?.kind !== 'twin') return
                      setTab(m.view.focus)
                      if (m.view.impact) setMode({ kind: 'impact', table: m.view.impact.table, id: m.view.impact.id })
                      setPane('work')
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-navy-800/10 px-2.5 py-1 text-[11px] font-semibold text-navy-700 hover:border-brand-500"
                  >
                    <PanelRightOpen className="h-3 w-3" /> {m.view.title}
                  </button>
                ) : null
              }
              footerNote="Copilot uses typed tools only. It proposes findings and coverage evidence; only you can confirm cover or sign off an assessment."
            />
          </div>
        )}

        <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label={`${name} Business Risk Assessment`}>
          <header className="shrink-0 border-b border-navy-800/10 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-navy-900">{name} · Business Risk Assessment</h1>
                <p className="flex flex-wrap items-center gap-2 text-xs text-navy-600">
                  {w.business.industry.name} · {formal ? w.assessment_type_labels[formal.assessment_type] : 'No formal assessment yet'}
                  {formal && <StatusBadge status={formal.status} />}
                  {p.is_synthetic && <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[11px]">Illustrative data</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/broker/commercial/clients/${p.id}`}>
                    <Building2 /> Client record
                  </Link>
                </Button>
                {formal ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/broker/commercial/assessments/${formal.id}/report`}>
                      <FileText /> Report
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled title="Run an assessment to produce the report">
                    <FileText /> Report
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                  {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Copilot' : 'Expand editor'}
                </Button>
              </div>
            </div>
          </header>

          {!w.business.risk_profile ? (
            <div className="p-6">
              <EmptyState title={`${name} has no Risk Twin yet`}>
                <p>Build it from the records already held. The agents link the business, locations, operations and assets, and identify potential exposures.</p>
                <div className="mt-3 flex justify-center">
                  <BuildTwinButton profileId={p.id} activeJobId={w.business.jobs.find((j) => !['completed', 'failed', 'cancelled'].includes(j.status))?.id ?? null} label="Build Risk Twin" />
                </div>
              </EmptyState>
            </div>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as TwinTab)} className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 px-4 pt-3">
                <TabsList className="max-w-full overflow-x-auto">
                  <TabsTrigger value="assessment">Assessment</TabsTrigger>
                  <TabsTrigger value="graph">Graph</TabsTrigger>
                  <TabsTrigger value="actions">Actions{w.pending_approvals.length ? ` (${w.pending_approvals.length})` : ''}</TabsTrigger>
                  <TabsTrigger value="insurance">Insurance</TabsTrigger>
                  <TabsTrigger value="changes">Changes</TabsTrigger>
                </TabsList>
              </div>
              <div ref={scroller} className="scroll-area relative flex-1 space-y-4 px-4 py-4">
                <div className="space-y-2">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Exposures identified', w.kpis.exposures],
                    ['Information requests', w.kpis.information_requests],
                    ['Verified facts', w.kpis.verified_facts],
                    ['Open broker tasks', w.kpis.open_broker_tasks],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-navy-800/10 px-3 py-2">
                      <dd className="text-xl font-semibold text-navy-900">{value}</dd>
                      <dt className="text-[11px] text-navy-600">{label}</dt>
                    </div>
                  ))}
                </dl>
                <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5" aria-label="Assessment workflow">
                  {w.stages.map((s, i) => (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => setTab(STAGE_TAB[s.key])}
                        className="h-full w-full cursor-pointer rounded-xl border border-navy-800/10 p-2 text-left transition hover:border-brand-500/50"
                        title={s.detail}
                      >
                        <span className="block text-[11px] font-semibold text-navy-500">
                          {i + 1}. {s.label}
                        </span>
                        <span className="mt-1 block">
                          <StageBadge status={s.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                </div>
                <TabsContent value="assessment">
                  <AssessmentTab
                    w={w}
                    onShowNode={(table, id) => {
                      setSelected(`${table}:${id}`)
                      setTab('graph')
                    }}
                  />
                </TabsContent>
                <TabsContent value="graph">
                  <GraphTab w={w} selected={selected} onSelect={setSelected} mode={mode} onMode={setMode} onAsk={ask} onTab={setTab} />
                </TabsContent>
                <TabsContent value="actions">
                  <ActionsTab w={w} />
                </TabsContent>
                <TabsContent value="insurance">
                  <InsuranceTab w={w} />
                </TabsContent>
                <TabsContent value="changes">
                  <ChangesTab w={w} />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </section>
      </div>
    </div>
  )
}
