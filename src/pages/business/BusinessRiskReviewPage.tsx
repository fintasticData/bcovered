import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, Circle, ClipboardList, Loader2, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import { api, session } from '@/api/client'
import { usePersistentConversation } from '@/api/conversations'
import { useConversation, useConversationProgress, useIdentities, useSendMessage } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { ProvenanceBadge } from '@/components/commercial/badges'
import { Button } from '@/components/ui/button'
import { getScenario } from '@/server/demo/scenarios'
import type { BusinessFacts } from '@/server/domain/commercial/facts'
import { compactRand } from '@/server/domain/commercial/format'
import type { CommercialIntakeState } from '@/server/llm/commercialIntake'
import { cn } from '@/lib/utils'
import { BusinessSubnav } from './BusinessSubnav'

type StageState = 'done' | 'active' | 'todo'
type Progress = Awaited<ReturnType<typeof api.conversationProgress>>

function stages(intake: CommercialIntakeState | null, progress: Progress | undefined, messages: number) {
  const step = (key: string) => progress?.steps.find((s) => s.key === key)?.status
  const talking = intake && ['collecting'].includes(intake.stage)
  const captured = intake && !['collecting'].includes(intake.stage)
  const list: Array<{ label: string; state: StageState }> = [
    { label: 'Understanding your business', state: intake?.facts.industry_key ? 'done' : messages > 1 ? 'active' : 'todo' },
    { label: 'Capturing how you operate', state: captured ? 'done' : talking && intake?.facts.industry_key ? 'active' : 'todo' },
    { label: 'Building your Risk Twin', state: step('twin') === 'completed' ? 'done' : progress ? 'active' : 'todo' },
    { label: 'Identifying potential exposures', state: step('gaps') === 'completed' ? 'done' : step('twin') === 'completed' ? 'active' : 'todo' },
    { label: 'Broker review', state: progress?.status === 'completed' ? 'done' : step('summary') === 'completed' ? 'active' : 'todo' },
  ]
  return list
}

function StageIcon({ state }: { state: StageState }) {
  if (state === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  if (state === 'active') return <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
  return <Circle className="h-5 w-5 text-navy-200" />
}

function factRows(f: BusinessFacts): Array<[string, string]> {
  const rows: Array<[string, string | undefined]> = [
    ['Business', f.registered_name ?? f.trading_name],
    ['Sites', f.location_count ? `${f.location_count}${f.location_names?.length ? ` (${f.location_names.join(', ')})` : ''}` : undefined],
    ['City', f.city],
    ['Premises', f.ownership],
    ['Turnover', f.annual_turnover !== undefined ? compactRand(f.annual_turnover) : undefined],
    ['Employees', f.employee_count?.toString()],
    ['Equipment per site', f.equipment_value_per_location !== undefined ? `${compactRand(f.equipment_value_per_location)} (replacement)` : undefined],
    ['Stock per site', f.stock_value_per_location !== undefined ? compactRand(f.stock_value_per_location) : undefined],
    ['Backup power', f.backup_power ? (f.backup_power === 'partial' ? `${f.backup_power_locations?.join(', ')} only` : f.backup_power) : undefined],
    ['Fire suppression', f.fire_suppression === undefined ? undefined : f.fire_suppression ? `Yes${f.fire_notes ? `, ${f.fire_notes}` : ''}` : 'No'],
    ['Security', f.security ? f.security.join(', ') || 'None' : undefined],
    ['Vehicles', f.vehicle_count !== undefined ? (f.vehicle_count ? `${f.vehicle_count} ${f.vehicle_type ?? 'vehicle'}(s)` : 'None') : undefined],
    ['Current insurer', f.current_insurer !== undefined ? f.current_insurer || 'None' : undefined],
    ['Claims (5 years)', f.claims_last_5_years?.toString()],
  ]
  return rows.filter((r): r is [string, string] => r[1] !== undefined)
}

export default function BusinessRiskReviewPage() {
  const [params, setParams] = useSearchParams()
  const scenario = getScenario(params.get('scenario'))
  const { conversationId, restart, error: startError } = usePersistentConversation('public', 'business_discovery')
  const { data: view } = useConversation(conversationId)
  const { data: progress } = useConversationProgress(conversationId)
  const { data: identities = [] } = useIdentities()
  const send = useSendMessage(conversationId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [playing, setPlaying] = useState(false)

  const intake = view?.commercial_intake ?? null
  const messages = view?.messages ?? []
  const list = stages(intake, progress ?? undefined, messages.length)
  const contactIdentity = progress?.customer_id ? identities.find((i) => i.customer_id === progress.customer_id) : undefined
  const facts = intake ? factRows(intake.facts) : []

  const play = async () => {
    if (!scenario) return
    setPlaying(true)
    try {
      const id = await restart()
      if (!id) return
      for (const line of scenario.script) {
        await new Promise((r) => setTimeout(r, 650))
        await api.sendMessage(id, line)
        await qc.invalidateQueries()
      }
    } finally {
      setPlaying(false)
    }
  }

  const openPortal = () => {
    if (!contactIdentity?.user_id) return
    session.set(contactIdentity.user_id)
    navigate('/portal/business')
  }

  return (
    <div className="bg-mist">
      <BusinessSubnav />
      <div className="container-x py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow mb-1 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Business risk review
            </p>
            <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">Tell us how your business operates</h1>
            <p className="mt-2 max-w-2xl text-sm text-navy-600">
              The Business Discovery Agent asks only what your industry needs. Agents then build a Risk Twin of your business, and a licensed
              broker reviews every finding before anything goes to an insurer.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void restart()} disabled={playing}>
            <RotateCcw /> New conversation
          </Button>
        </div>

        {scenario && (
          <div className="panel mb-5 flex flex-col gap-3 border-brand-500/30 bg-brand-50/50 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy-900">
                Demo Studio · Scenario {scenario.code ?? scenario.number}: {scenario.title}
              </p>
              <p className="text-xs text-navy-600">Plays the scripted, fictional business owner into a fresh conversation. The agents respond live.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="accent" size="sm" onClick={() => void play()} disabled={playing}>
                {playing ? <Loader2 className="animate-spin" /> : <Play />} {playing ? 'Playing…' : 'Play scenario'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setParams({})} disabled={playing}>
                Exit scenario
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="h-[calc(100vh-16rem)] min-h-[560px]">
            <ChatPanel
              title="Business Discovery Agent"
              subtitle="AI assistant · not a licensed adviser"
              avatar={<Building2 className="h-4 w-4" />}
              messages={messages}
              sending={send.isPending || playing}
              onSend={(t) => send.mutate(t)}
              disabled={!conversationId || playing}
              error={startError ?? send.error?.message ?? null}
              placeholder="e.g. We operate three restaurants around Johannesburg"
              footerNote="Deterministic demo adapter. Your details are used only for this review (POPIA)."
            />
          </div>

          <aside className="scroll-area space-y-5 lg:max-h-[calc(100vh-16rem)]" aria-label="What the agents are doing">
            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">What’s happening</h2>
              <ol className="mt-4 space-y-3">
                {list.map((s) => (
                  <li key={s.label} className="flex items-center gap-3">
                    <StageIcon state={s.state} />
                    <span className={cn('text-sm', s.state === 'todo' ? 'text-navy-500/70' : 'font-medium text-navy-900')}>{s.label}</span>
                  </li>
                ))}
              </ol>
              {progress?.status === 'awaiting_approval' && (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  A licensed broker is reviewing your draft submission pack. Demo tip: switch to <strong>Thabo Nkosi (broker)</strong> and open the
                  commercial workspace.
                </p>
              )}
              {progress?.status === 'completed' && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-900">Your broker has reviewed your business</p>
                  <p className="mt-0.5 text-xs text-emerald-800">Nothing has been sent to an insurer yet. Your portal lists the documents still needed.</p>
                  {contactIdentity && (
                    <Button size="sm" variant="accent" className="mt-3" onClick={openPortal}>
                      Open the business portal as {contactIdentity.full_name.split(' ')[0]}
                    </Button>
                  )}
                </div>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                <ClipboardList className="h-4 w-4 text-brand-500" /> Agent activity
              </h2>
              {progress ? (
                <ul className="mt-3 space-y-2.5">
                  {progress.steps.map((s) => (
                    <li key={s.key} className="flex gap-2.5">
                      <span className="mt-0.5">
                        <StageIcon state={s.status === 'completed' ? 'done' : s.status === 'running' ? 'active' : 'todo'} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-navy-800">{s.agent_label}</span>
                        <span className="block text-xs text-navy-600">{s.summary ?? s.name}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-navy-600">Agents start once you confirm. Every step will appear here.</p>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Your business so far</h2>
              {facts.length ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {facts.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-navy-500">{k}</dt>
                      <dd className="font-medium text-navy-900 first-letter:uppercase">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-navy-600">Nothing yet. This fills in as you chat.</p>
              )}
              {facts.length > 0 && (
                <p className="mt-3 flex items-center gap-2 text-[11px] text-navy-600">
                  <ProvenanceBadge source="declared" /> Everything here is your declaration until a broker verifies it.
                </p>
              )}
              <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-navy-600">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                Consent is requested before contact details. Agents identify potential exposures; only a licensed broker gives advice.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
