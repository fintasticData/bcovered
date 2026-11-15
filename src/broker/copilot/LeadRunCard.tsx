// Russ "Generate leads" in the copilot conversation: confirm the filters Russ read, start the search, watch it work and
// open the saved prospects. The run lives in the database, so the card reopens it after a refresh and offers Resume.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Play, Square, Table2 } from 'lucide-react'
import type { StepResult } from '@/copilot/api'
import { Button } from '@/components/ui/button'
import type { DataCategory } from '@/lib/supabase/category'
import { supabaseSync } from '@/lib/supabase/sync'
import { isFinished, isIdle, leadResearchApi, runTitle, type LeadFilters, type LeadRun } from '@/lib/leadResearch/api'
import { CategoryBadge, CopilotBadge } from './identity'
import { AreaFindings, FilterChips, LeadRunDetails, RejectedList, RunLeadItem, RunProgressBar } from '../leads/LeadRunViews'

export interface LeadStepData {
  prompt: string
  message_id: string
  run_id: string | null
}

/** One step request per run at a time, across remounts of the same card. */
const inflight = new Map<string, Promise<unknown>>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function useRunDriver(runId: string | null, category: DataCategory, autoStart: boolean) {
  const queryClient = useQueryClient()
  const [run, setRun] = useState<LeadRun | null>(null)
  const [driving, setDriving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const token = useRef(0)
  const refreshTimer = useRef<number | null>(null)

  const refreshGrid = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => {
      void supabaseSync.refresh().then(() => queryClient.invalidateQueries())
    }, 1500)
  }, [queryClient])

  const drive = useCallback(async () => {
    if (!runId) return
    const mine = ++token.current
    setDriving(true)
    setError(null)
    let failures = 0
    let found = -1
    while (token.current === mine) {
      try {
        const prior = inflight.get(runId)
        if (prior) await prior.catch(() => null)
        if (token.current !== mine) break
        const req = leadResearchApi.step(runId, category)
        inflight.set(runId, req)
        const r = await req.finally(() => inflight.delete(runId))
        if (token.current !== mine) break
        setRun(r.run)
        failures = 0
        if (r.run.leads.length !== found) {
          if (found >= 0) refreshGrid()
          found = r.run.leads.length
        }
        if (isFinished(r.run)) {
          refreshGrid()
          setNote(null)
          break
        }
        if (r.busy) {
          setNote('Another tab is working on this search. Showing its progress.')
          await sleep(5000)
          const latest = await leadResearchApi.get(runId, category)
          if (token.current !== mine) break
          setRun(latest)
          if (isFinished(latest)) break
          continue
        }
        setNote(null)
      } catch (e) {
        failures++
        if (failures >= 3) {
          setError((e as Error).message)
          break
        }
        await sleep(3000)
      }
    }
    if (token.current === mine) setDriving(false)
  }, [runId, category, refreshGrid])

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    leadResearchApi
      .get(runId, category)
      .then((r) => {
        if (cancelled) return
        setRun(r)
        if (autoStart && !isFinished(r)) void drive()
      })
      .catch((e) => !cancelled && setError((e as Error).message))
    return () => {
      cancelled = true
      token.current++
    }
    // autoStart only matters for the first load of a run this card created
  }, [runId, category])

  const cancel = async () => {
    if (!runId) return
    try {
      const r = await leadResearchApi.cancel(runId, category)
      setRun(r)
      if (isFinished(r)) {
        token.current++
        setDriving(false)
        refreshGrid()
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return { run, driving, error, note, drive, cancel }
}

function FilterForm({ prompt, busy, onStart }: { prompt: string; busy: boolean; onStart: (f: LeadFilters) => void }) {
  const parsed = useQuery({ queryKey: ['lead-parse', prompt], queryFn: () => leadResearchApi.parse(prompt), staleTime: Infinity, retry: false })
  const [f, setF] = useState<LeadFilters | null>(null)
  useEffect(() => {
    if (parsed.data && !f) setF(parsed.data.filters)
  }, [parsed.data, f])
  if (parsed.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-navy-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your request…
      </p>
    )
  }
  if (parsed.error) return <p className="text-xs text-red-700">{(parsed.error as Error).message}</p>
  if (!f) return null
  const max = parsed.data?.max_count ?? 50
  const b = parsed.data?.budget
  const set = (k: keyof LeadFilters, v: string) =>
    setF((cur) => (cur ? { ...cur, [k]: k === 'radius_km' || k === 'requested_count' ? (v === '' ? null : Number(v)) : v || null } : cur))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (f.area?.trim()) onStart({ ...f, requested_count: Math.min(max, Math.max(1, f.requested_count ?? 20)) })
  }
  const field = (k: keyof LeadFilters, label: string, opts: { type?: string; placeholder?: string; hint?: string } = {}) => (
    <label className="space-y-0.5">
      <span className="block text-[11px] font-medium text-navy-600">{label}</span>
      <input
        value={f[k] ?? ''}
        type={opts.type ?? 'text'}
        min={opts.type === 'number' ? 1 : undefined}
        max={k === 'requested_count' ? max : undefined}
        onChange={(e) => set(k, e.target.value)}
        placeholder={opts.placeholder}
        className="field w-full py-1 text-sm"
      />
      {opts.hint && <span className="block text-[10px] text-navy-500">{opts.hint}</span>}
    </label>
  )
  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{field('area', 'Area', { placeholder: 'Suburb, town or landmark' })}</div>
        {field('radius_km', 'Radius (km)', { type: 'number', placeholder: 'Any' })}
        {field('requested_count', `Leads wanted (max ${max})`, { type: 'number' })}
        {field('business_function', 'Business function', { placeholder: 'e.g. Vehicle repair', hint: 'What the business does' })}
        {field('category', 'Category', { placeholder: 'e.g. Workshop' })}
        {field('industry', 'Industry', { placeholder: 'e.g. Automotive', hint: 'Wider sector; function narrows it' })}
        {field('cover_type', 'Cover to offer', { placeholder: 'e.g. Commercial property' })}
      </div>
      {b && (
        <p className="text-[11px] text-navy-500">
          Limits per search: {Math.round(b.max_seconds / 60)} min of research, {b.max_searches} web searches, {b.max_page_fetches} page reads, ${b.max_cost_usd.toFixed(2)}.
          {parsed.data?.source === 'rules' ? ' Filters were read by rules; check them.' : ''}
        </p>
      )}
      <Button size="sm" type="submit" disabled={busy || !f.area?.trim()}>
        {busy ? <Loader2 className="animate-spin" /> : <Play />} Start search
      </Button>
    </form>
  )
}

/** The job page for a lead search: full results, with Resume and Cancel driven from this tab. */
export function LeadRunJobPanel({ runId, category }: { runId: string; category: DataCategory }) {
  const { run, driving, error, note, drive, cancel } = useRunDriver(runId, category, false)
  if (!run) return error ? <p className="text-sm text-red-700">{error}</p> : <p className="text-sm text-navy-600">Loading the lead search…</p>
  const finished = isFinished(run)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!finished && !driving && (isIdle(run) || error) && (
          <Button size="sm" onClick={() => void drive()}>
            <Play /> Resume
          </Button>
        )}
        {!finished && (
          <Button size="sm" variant="outline" onClick={() => void cancel()}>
            <Square /> Cancel
          </Button>
        )}
        <Button size="sm" variant={finished ? 'default' : 'outline'} asChild>
          <Link to={run.open_path}>
            <Table2 /> Open in Leads grid
          </Link>
        </Button>
        {note && <span className="text-xs text-navy-600">{note}</span>}
        {error && <span className="text-xs text-amber-800">Paused: {error}</span>}
      </div>
      <LeadRunDetails run={run} />
    </div>
  )
}

export function LeadRunCard({ step, category, onRunStarted, onShow }: { step: StepResult; category: DataCategory; onRunStarted: (runId: string) => void; onShow?: () => void }) {
  const data = step.data as LeadStepData
  const [runId, setRunId] = useState<string | null>(data.run_id)
  const [startedHere, setStartedHere] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const { run, driving, error, note, drive, cancel } = useRunDriver(runId, category, startedHere)

  const start = async (filters: LeadFilters) => {
    setStarting(true)
    setStartError(null)
    try {
      const r = await leadResearchApi.create({ category, prompt: data.prompt, filters, idempotency_key: `leadgen-${data.message_id}` })
      setStartedHere(true)
      setRunId(r.id)
      onRunStarted(r.id)
    } catch (e) {
      setStartError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const finished = run ? isFinished(run) : false
  return (
    <div className="rounded-xl border border-business-200 bg-white p-3 text-left text-sm">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-business-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-navy-900">{run ? `Generate leads: ${runTitle(run.inputs.filters)}` : 'Generate leads'}</p>
            <CopilotBadge id="russ" />
            <CategoryBadge category={category} />
          </div>
          <p className="mt-0.5 text-[11px] text-navy-500 italic">“{step.clause}”</p>
          {!runId && <p className="mt-1 text-navy-800">{step.summary}</p>}
        </div>
      </div>

      {!runId && <FilterForm prompt={data.prompt} busy={starting} onStart={start} />}
      {startError && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{startError}</p>}

      {runId && !run && !error && (
        <p className="mt-2 flex items-center gap-2 text-xs text-navy-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening the search…
        </p>
      )}

      {run && (
        <div className="mt-2 space-y-2.5">
          <FilterChips filters={run.inputs.filters} />
          <RunProgressBar progress={run.outputs.progress} stop={run.outputs.stop_reason} running={driving || (run.status === 'running' && !isIdle(run))} />
          {run.outputs.summary && <p className="font-medium text-navy-900">{run.outputs.summary}</p>}
          {note && <p className="text-xs text-navy-600">{note}</p>}
          {run.outputs.last_error && !finished && <p className="text-xs text-amber-800">Last problem: {run.outputs.last_error}</p>}
          <AreaFindings findings={run.outputs.area_findings ?? []} summary={run.outputs.area_summary} defaultOpen={false} />
          {run.leads.length > 0 && (
            <ul className="scroll-area max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {run.leads.map((l) => (
                <RunLeadItem key={l.match_id} lead={l} />
              ))}
            </ul>
          )}
          <RejectedList rejected={run.outputs.rejected} />
        </div>
      )}
      {error && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Paused: {error}</p>}

      {run && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {!finished && driving && (
            <Button size="sm" variant="outline" onClick={() => void cancel()}>
              <Square /> Cancel
            </Button>
          )}
          {!finished && !driving && (isIdle(run) || error) && (
            <Button size="sm" onClick={() => void drive()}>
              <Play /> Resume
            </Button>
          )}
          {!finished && !driving && !isIdle(run) && !error && (
            <Button size="sm" variant="outline" onClick={() => void cancel()}>
              <Square /> Cancel
            </Button>
          )}
          {(run.leads.length > 0 || finished) && (
            <Button size="sm" variant={finished ? 'default' : 'outline'} asChild>
              <Link to={run.open_path}>
                <Table2 /> Open in Leads grid
              </Link>
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/broker/jobs/${run.id}`}>Open job</Link>
          </Button>
          {onShow && (
            <button type="button" onClick={onShow} className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">
              Show in editor
            </button>
          )}
        </div>
      )}
    </div>
  )
}
