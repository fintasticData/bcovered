import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, CheckCircle2, Circle, Loader2, Lock, Maximize2, Minimize2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ActionOutcome, ActionProgress, RouteProgress } from '@/api/client'
import { useRouteRun, useRunRouteAction } from '@/api/hooks'
import type { StepResult, TurnContext } from '@/copilot/api'
import { newKey } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import type { ActionInput } from '@/routes'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategorySwitch } from '../copilot/CategorySwitch'
import { CopilotPanel } from '../copilot/CopilotPanel'
import { dateTime, ErrorText } from '../book/bits'
import { DemoSampleBadge } from '../quotes/shared'
import { MOTOR_SURFACES, MotorOutcomeCard, type SurfaceProps } from './MotorQuoteSurfaces'

/** Per-action editors by action id. A Route without its own surfaces still works through the generic one. */
const SURFACES: Record<string, (p: SurfaceProps) => ReactNode> = { ...MOTOR_SURFACES }

const STATUS_STYLE: Record<ActionProgress['status'], { icon: typeof Circle; tone: string; label: string }> = {
  done: { icon: CheckCircle2, tone: 'text-emerald-600', label: 'Done' },
  available: { icon: Circle, tone: 'text-brand-600', label: 'Ready' },
  stale: { icon: AlertTriangle, tone: 'text-amber-600', label: 'Out of date' },
  blocked: { icon: Lock, tone: 'text-navy-400', label: 'Waiting' },
  not_needed: { icon: Circle, tone: 'text-navy-300', label: 'Not needed' },
}

function GenericSurface({ action, busy, run }: SurfaceProps) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-700">{action.handover}</p>
      {action.confirm && (
        <label className="flex items-center gap-2 text-sm text-navy-800">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm {action.label.toLowerCase()}
        </label>
      )}
      <Button variant="accent" disabled={busy || (action.confirm && !confirmed)} onClick={() => run(action.confirm ? { confirmed: true } : {})}>{action.label}</Button>
    </div>
  )
}

function ActionButton({ action, selected, onClick }: { action: ActionProgress; selected: boolean; onClick: () => void }) {
  const s = STATUS_STYLE[action.status]
  const detail = action.done
    ? `${action.done.summary ?? 'Done'} · ${action.done.by} · ${dateTime(action.done.at)}`
    : action.reason ?? action.last_issue?.reason ?? (action.russ === 'auto' ? 'Russ can do this for you' : 'Needs you')
  return (
    <button
      type="button"
      id={`route-action-${action.id}`}
      onClick={onClick}
      aria-current={selected ? 'step' : undefined}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        selected ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20' : 'border-navy-800/10 bg-white hover:border-brand-500/50',
        action.status === 'not_needed' && 'opacity-60',
      )}
    >
      <s.icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.tone)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 font-medium text-navy-900">
          {action.label}
          {action.is_next && <span className="rounded bg-brand-500 px-1.5 text-[10px] font-semibold text-white uppercase">Next</span>}
          {action.status !== 'done' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-navy-500 uppercase">
              {action.russ === 'auto' ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />} {action.russ === 'auto' ? 'Russ' : 'You'}
            </span>
          )}
          <span className="sr-only">{s.label}</span>
        </span>
        <span className={cn('block text-xs', action.status === 'stale' || action.last_issue ? 'text-amber-800' : 'text-navy-600')}>{detail}</span>
      </span>
    </button>
  )
}

function Phases({ progress, selected, onSelect }: { progress: RouteProgress; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ol className="space-y-3" aria-label="Route phases">
      {progress.phases.map((p, i) => (
        <li key={p.id} className={cn('rounded-xl border p-3', p.status === 'current' ? 'border-brand-500/40 bg-white' : 'border-navy-800/10 bg-navy-50/40')}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-navy-600 uppercase">
            <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[11px]', p.status === 'done' ? 'bg-emerald-600 text-white' : p.status === 'current' ? 'bg-brand-500 text-white' : 'bg-navy-200 text-navy-700')}>
              {p.status === 'done' ? '✓' : i + 1}
            </span>
            {p.title}
            {p.status === 'done' && <span className="font-normal normal-case text-emerald-700">complete</span>}
          </h3>
          <div className={cn('grid gap-2', p.actions.length > 1 && 'sm:grid-cols-2')}>
            {p.actions.map((a) => <ActionButton key={a.id} action={a} selected={selected === a.id} onClick={() => onSelect(a.id)} />)}
          </div>
          {p.actions.length > 1 && progress.phases.length - 1 === i && p.status !== 'done' && <p className="mt-1.5 text-[11px] text-navy-500">Either one completes this phase.</p>}
        </li>
      ))}
    </ol>
  )
}

/** The guide: navigation, then Russ (about 40%), then the Route's phases and the selected action's work surface. */
export default function RouteGuidePage() {
  const { runId } = useParams()
  const [params, setParams] = useSearchParams()
  const category = useDataCategory()
  const q = useRouteRun(runId)
  const act = useRunRouteAction()
  const [expanded, setExpanded] = useState(false)
  const [pane, setPane] = useState<Pane>('work')
  const [context, setContext] = useState<TurnContext>({ route_run_id: runId })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [last, setLast] = useState<{ action_id: string; outcome: ActionOutcome } | null>(null)

  const p = q.data
  const allActions = p?.phases.flatMap((x) => x.actions) ?? []
  const requested = params.get('action')
  const selectedId = (requested && allActions.some((a) => a.id === requested) ? requested : null) ?? p?.next?.id ?? allActions[allActions.length - 1]?.id ?? null
  const selected = allActions.find((a) => a.id === selectedId) ?? null

  useEffect(() => {
    const client = p?.run.state.client as { person_id: string; client_number: string; name: string } | undefined
    if (client && context.person?.id !== client.person_id) {
      setContext((c) => ({ ...c, route_run_id: runId, person: { record_type: 'client', id: client.person_id, number: client.client_number, name: client.name, category: 'sample', open_path: `/broker/book/clients/${client.person_id}` } }))
    }
  }, [p?.run.state.client, runId, context.person?.id])

  const choose = (id: string | null, focus = false) => {
    const next = new URLSearchParams(params)
    if (id) next.set('action', id)
    else next.delete('action')
    setParams(next, { replace: true })
    setPane('work')
    if (focus && id) requestAnimationFrame(() => document.getElementById(`route-action-${id}`)?.focus())
  }

  const run = (input: ActionInput) => {
    if (!selected || !runId) return
    const actionId = selected.id
    act.mutate(
      { run_id: runId, action_id: actionId, input, key: newKey() },
      {
        onSuccess: (r) => {
          setLast({ action_id: actionId, outcome: r.outcome })
          if (r.outcome.status === 'done') choose(r.progress.next?.id ?? null, true)
        },
      },
    )
  }

  const onSelect = (s: { key: string; step: StepResult } | null) => {
    setSelectedKey(s?.key ?? null)
    const to = s?.step.links.find((l) => l.to.startsWith(`/broker/routes/runs/${runId}`))?.to
    const action = to ? new URL(to, window.location.origin).searchParams.get('action') : null
    if (action) choose(action)
  }

  if (q.isLoading) return <LoadingState label="Opening the Route…" />
  if (!p) {
    return (
      <div className="p-6">
        <EmptyState title="This Route run is not available">
          It may belong to another workspace or browser. <Link to="/broker/routes" className="font-semibold text-brand-600 underline">Open Routes</Link>
        </EmptyState>
      </div>
    )
  }

  const client = p.run.state.client as { person_id: string; name: string; client_number: string } | undefined
  const Surface = (selected && SURFACES[selected.id]) || GenericSurface
  const lastForSelected = last && last.action_id === selected?.id ? last.outcome : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Guide" />}
      <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
            <CopilotPanel
              key={`russ:route:${runId}:${category}`}
              copilot="russ"
              scope={`route:${runId}`}
              context={context}
              onContextChange={(c) => setContext({ ...c, route_run_id: c.route_run_id ?? runId })}
              onSelect={onSelect}
              selectedKey={selectedKey}
              intro={`Russ works on ${p.route.title} with you. Ask him to continue: he does the steps marked Russ (reviewing the vehicle, getting sample quotes) and hands back the ones that need you. Both of you update the same saved progress.`}
              starters={['Continue', `${p.route.title}`]}
            />
          </div>
        )}

        <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label={`${p.route.title} guide`}>
          <header className="space-y-2 border-b border-navy-800/10 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to="/broker/routes" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600"><ArrowLeft className="h-3.5 w-3.5" /> Routes</Link>
                <h1 className="truncate text-base font-semibold text-navy-900">{p.route.title}</h1>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-navy-600">
                  {client ? <Link to={`/broker/book/clients/${client.person_id}`} className="font-medium text-navy-900 underline">{client.name}</Link> : 'Client not chosen yet'}
                  {client && <span className="font-mono">{client.client_number}</span>}
                  <span className="rounded bg-brand-100 px-1.5 text-[11px] font-semibold text-brand-800">Sample</span>
                  {p.route.badge && <DemoSampleBadge />}
                  <span>· {p.done_count} of {p.total_count} done</span>
                  {p.run.status !== 'active' && <span className="font-semibold text-emerald-700">· {p.run.status === 'completed' ? 'Complete' : 'Closed'}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CategorySwitch />
                <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                  {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Russ' : 'Expand editor'}
                </Button>
              </div>
            </div>
            {category !== 'sample' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Routes run on Sample clients. Russ answers Route requests in Sample; the guide always saves to the Sample record.</p>
            )}
            {p.next && (
              <p className="flex items-center gap-1.5 text-xs text-navy-700">
                <ArrowRight className="h-3.5 w-3.5 text-brand-600" /> Next: <strong>{p.next.label}</strong> ({p.next.phase}) · {p.next.russ === 'auto' ? 'Russ can do this' : 'needs you'}
              </p>
            )}
          </header>

          <div className="scroll-area flex-1 space-y-4 px-4 py-4">
            {p.complete && <MotorOutcomeCard progress={p} />}
            <Phases progress={p} selected={selectedId} onSelect={(id) => choose(id)} />

            {selected && p.run.status === 'active' && (
              <section aria-labelledby="route-surface" className="rounded-xl border border-navy-800/10 bg-white p-4">
                <h2 id="route-surface" className="text-sm font-semibold text-navy-900">{selected.label}</h2>
                <p className="mb-3 text-xs text-navy-600">{selected.handover}</p>
                {selected.status === 'blocked' || selected.status === 'not_needed' ? (
                  <p className="flex items-start gap-2 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-700"><Lock className="mt-0.5 h-4 w-4 shrink-0" /> {selected.reason}</p>
                ) : (
                  <Surface key={`${selected.id}:${p.run.updated_at}`} progress={p} action={selected} busy={act.isPending} outcome={lastForSelected} run={run} goTo={(id) => choose(id, true)} />
                )}
                {lastForSelected && (
                  <p
                    role="status"
                    className={cn('mt-3 rounded-lg px-3 py-2 text-xs', lastForSelected.status === 'done' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')}
                  >
                    {lastForSelected.status === 'done' ? 'Done: ' : ''}{lastForSelected.message}
                  </p>
                )}
                {act.isPending && <p className="mt-2 flex items-center gap-2 text-xs text-navy-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</p>}
                <ErrorText error={act.error} />
              </section>
            )}

            {p.history.length > 0 && (
              <details className="rounded-xl border border-navy-800/10 px-4 py-3 text-xs text-navy-700">
                <summary className="cursor-pointer font-semibold text-navy-800">Activity ({p.history.length})</summary>
                <ul className="mt-2 space-y-1">
                  {p.history.map((h) => (
                    <li key={h.id}>
                      {dateTime(h.created_at)} · {h.actor_name} · {allActions.find((a) => a.id === h.action_id)?.label ?? h.action_id}: {h.status === 'done' ? h.summary : `${h.status.replace('_', ' ')} (${h.reason})`}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
