import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSwitchWorkspace } from '@/api/hooks'
import { brokerFinancialsApi, useBfDemoContext, useBfMutation } from '@/copilot/brokerFinancialsApi'
import { dataCategory } from '@/lib/supabase/category'
import { lastDemoBrokerage, DEMO_BROKERAGE } from '@/lib/supabase/demoBrokerage'
import {
  BROKER_FINANCIALS_SCENARIO,
  BROKER_FINANCIALS_SCENARIO_ID,
  COASTAL_SCENARIO,
  HIGHVELD_STEPS,
} from '@/server/demo/brokerFinancialsScenario'

/** Demo Studio runner: Next step / Run remaining / Reset for Highveld broker financials. */
export function BrokerFinancialsDemo() {
  const navigate = useNavigate()
  const switcher = useSwitchWorkspace()
  const ctx = useBfDemoContext()
  const reset = useBfMutation((c, id: string) => brokerFinancialsApi.resetScenario(c, id))
  const setStepRpc = useBfMutation(brokerFinancialsApi.setScenarioStep)
  const [step, setStep] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)

  useEffect(() => {
    const saved = ctx.data?.scenario_state
    if (saved?.scenario_id === BROKER_FINANCIALS_SCENARIO_ID && typeof saved.step_index === 'number') {
      setStep(saved.step_index)
      if (saved.blocked_reason) setBlocked(saved.blocked_reason)
      if (saved.last_summary) setLog((prev) => (prev.length ? prev : [saved.last_summary!]))
    }
  }, [ctx.data?.scenario_state])

  const ensureHighveld = async () => {
    dataCategory.set('sample')
    lastDemoBrokerage.set(DEMO_BROKERAGE.highveld)
    await new Promise<void>((resolve, reject) => {
      switcher.mutate(DEMO_BROKERAGE.highveld.id, {
        onSuccess: () => resolve(),
        onError: (e) => reject(e),
      })
    })
  }

  const persistStep = async (index: number, summary: string, blockedReason?: string | null) => {
    await brokerFinancialsApi.setScenarioStep('sample', {
      scenario_id: BROKER_FINANCIALS_SCENARIO_ID,
      step_index: index,
      status: blockedReason ? 'blocked' : index >= HIGHVELD_STEPS.length ? 'complete' : 'running',
      summary,
      blocked_reason: blockedReason ?? null,
    })
  }

  const runStep = async (index: number) => {
    setBusy(true)
    setBlocked(null)
    try {
      await ensureHighveld()
      const fresh = await brokerFinancialsApi.demoContext('sample')
      const s = HIGHVELD_STEPS[index]
      navigate(s.path(fresh))
      const result = await s.run('sample', fresh)
      setLog((prev) => [...prev, `${s.title}: ${result.summary}${result.record ? ` · ${result.record}` : ''}`])
      if (result.blocked) {
        setBlocked(result.summary)
        await persistStep(index, result.summary, result.summary)
        return false
      }
      const next = index + 1
      setStep(next)
      await persistStep(next, result.summary, null)
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Step failed'
      setBlocked(msg)
      setLog((prev) => [...prev, `Error: ${msg}`])
      await persistStep(index, msg, msg).catch(() => undefined)
      return false
    } finally {
      setBusy(false)
    }
  }

  const runRemaining = async () => {
    let i = step
    while (i < HIGHVELD_STEPS.length) {
      const ok = await runStep(i)
      if (!ok) break
      i += 1
    }
  }

  const nextAction = step < HIGHVELD_STEPS.length
    ? HIGHVELD_STEPS[step]?.description
    : 'Walkthrough complete — open Executive or switch to Coastal for the shortfall case.'

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-navy-800/10 bg-white p-6">
        <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Broker financials</p>
        <h3 className="mt-1 font-semibold text-navy-900">{BROKER_FINANCIALS_SCENARIO.title}</h3>
        <p className="mt-1 text-sm text-navy-600">{BROKER_FINANCIALS_SCENARIO.summary}</p>
        <p className="mt-2 text-xs text-navy-500">
          Current workspace: {ctx.data?.organisation_name ?? '…'}
          {ctx.data?.is_demo_brokerage ? ' · Demo' : ''}
          {' · '}step {Math.min(step + 1, HIGHVELD_STEPS.length)}/{HIGHVELD_STEPS.length}
        </p>
        <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950">
          Next: {nextAction}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="accent"
            disabled={busy || step >= HIGHVELD_STEPS.length || Boolean(blocked)}
            onClick={() => void runStep(step)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Play />} {step === 0 ? 'Run broker financials scenario' : 'Next step'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy || step >= HIGHVELD_STEPS.length || Boolean(blocked)} onClick={() => void runRemaining()}>
            <SkipForward /> Run remaining steps
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || reset.isPending}
            onClick={() => {
              dataCategory.set('sample')
              lastDemoBrokerage.set(DEMO_BROKERAGE.highveld)
              switcher.mutate(DEMO_BROKERAGE.highveld.id, {
                onSuccess: () => {
                  reset.mutate(BROKER_FINANCIALS_SCENARIO_ID, {
                    onSuccess: (r) => {
                      setStep(0)
                      setBlocked(null)
                      setLog([String(r.summary ?? 'Scenario reset')])
                      setStepRpc.mutate({
                        scenario_id: BROKER_FINANCIALS_SCENARIO_ID,
                        step_index: 0,
                        status: 'idle',
                        summary: 'Scenario reset',
                      })
                    },
                  })
                },
              })
            }}
          >
            <RotateCcw /> Reset scenario
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              dataCategory.set('sample')
              lastDemoBrokerage.set(DEMO_BROKERAGE.coastal)
              switcher.mutate(DEMO_BROKERAGE.coastal.id, {
                onSuccess: () => navigate('/broker/financials?tab=statements'),
              })
            }}
          >
            Open Coastal ({COASTAL_SCENARIO.brokerage.name})
          </Button>
        </div>
        {blocked && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">Stopped: {blocked}</p>}
        <ol className="mt-4 space-y-2 text-sm">
          {HIGHVELD_STEPS.map((s, i) => (
            <li key={s.id} className={i < step ? 'text-emerald-800' : i === step ? 'font-semibold text-navy-900' : 'text-navy-500'}>
              {s.title} — {s.description}
            </li>
          ))}
        </ol>
        {log.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-lg bg-navy-50/50 p-3 text-xs text-navy-700">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 rounded-lg border border-navy-800/10 p-4">
          <p className="text-sm font-semibold text-navy-900">{COASTAL_SCENARIO.title}</p>
          <p className="mt-1 text-xs text-navy-600">{COASTAL_SCENARIO.summary}</p>
          <p className="mt-2 text-xs text-navy-500">
            Switching to Coastal isolates Highveld earnings. On Statements, use Match / investigate then Accept shortfall for the R10 property variance.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                dataCategory.set('sample')
                lastDemoBrokerage.set(DEMO_BROKERAGE.coastal)
                switcher.mutate(DEMO_BROKERAGE.coastal.id, {
                  onSuccess: () => navigate('/broker/financials?tab=statements'),
                })
              }}
            >
              Investigate Coastal shortfall
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
