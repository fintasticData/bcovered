import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, ClipboardList, FileText, Loader2, Play, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { api, session } from '@/api/client'
import { usePersistentConversation } from '@/api/conversations'
import { useConversation, useConversationProgress, useIdentities, useSendMessage } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { Button } from '@/components/ui/button'
import { MOTOR_FIELDS, formatMotorField } from '@/server/domain/motor'
import { getScenario } from '@/server/demo/scenarios'
import type { IntakeState } from '@/server/llm/adapter'
import { cn } from '@/lib/utils'

type StageState = 'done' | 'active' | 'todo'

type Progress = Awaited<ReturnType<typeof api.conversationProgress>>

function stages(intake: IntakeState | null, progress: Progress | undefined, messageCount: number) {
  const motorDone = intake ? MOTOR_FIELDS.every((f) => intake.details[f.key] !== undefined) : false
  const step = (key: string) => progress?.steps.find((s) => s.key === key)?.status
  const job = progress?.status
  const compared = step('approval') === 'completed'
  const released = job === 'completed'
  const list: Array<{ label: string; state: StageState }> = [
    { label: 'Understanding your needs', state: intake?.intent === 'motor_quote' ? 'done' : messageCount > 1 ? 'active' : 'todo' },
    { label: 'Capturing vehicle details', state: motorDone ? 'done' : intake?.intent === 'motor_quote' ? 'active' : 'todo' },
    { label: 'Preparing comparison', state: compared ? 'done' : progress ? 'active' : 'todo' },
    { label: 'Broker review', state: released || step('release') === 'running' ? 'done' : compared ? 'active' : 'todo' },
    { label: 'Proposal ready', state: released ? 'done' : 'todo' },
  ]
  return list
}

function StageIcon({ state }: { state: StageState }) {
  if (state === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  if (state === 'active') return <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
  return <Circle className="h-5 w-5 text-navy-200" />
}

export default function AssistPage() {
  const [params, setParams] = useSearchParams()
  const scenario = getScenario(params.get('scenario'))
  const { conversationId, restart, error: startError } = usePersistentConversation('public')
  const { data: view } = useConversation(conversationId)
  const { data: progress } = useConversationProgress(conversationId)
  const { data: identities = [] } = useIdentities()
  const send = useSendMessage(conversationId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [playing, setPlaying] = useState(false)

  const intake = view?.intake ?? null
  const messages = view?.messages ?? []
  const list = stages(intake, progress ?? undefined, messages.length)
  const customerIdentity = progress?.customer_id ? identities.find((i) => i.customer_id === progress.customer_id) : undefined
  const ended = progress?.status === 'cancelled'

  const play = async () => {
    if (!scenario) return
    setPlaying(true)
    try {
      const id = await restart()
      if (!id) return
      for (const line of scenario.script) {
        await new Promise((r) => setTimeout(r, 700))
        await api.sendMessage(id, line)
        await qc.invalidateQueries()
      }
    } finally {
      setPlaying(false)
    }
  }

  const openPortal = () => {
    if (!customerIdentity?.user_id) return
    session.set(customerIdentity.user_id)
    navigate('/portal')
  }

  return (
    <div className="bg-mist">
      <div className="container-x py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow mb-1 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> AI-assisted assessment
            </p>
            <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">Find my cover with Ava</h1>
            <p className="mt-2 max-w-2xl text-sm text-navy-600">
              Tell Ava what you need in your own words. She only asks for what’s missing, and a licensed broker reviews every
              comparison before you see it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void restart()} disabled={playing}>
              <RotateCcw /> New conversation
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/quote">
                <FileText /> Prefer a form?
              </Link>
            </Button>
          </div>
        </div>

        {scenario && (
          <div className="panel mb-5 flex flex-col gap-3 border-brand-500/30 bg-brand-50/50 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy-900">
                Demo Studio · Scenario {scenario.number}: {scenario.title}
              </p>
              <p className="text-xs text-navy-600">Plays the scripted visitor messages into a fresh conversation. Ava and the agents respond live.</p>
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
          <div className="h-[calc(100vh-14rem)] min-h-[560px]">
            <ChatPanel
              title="Ava"
              subtitle="AI insurance assistant · not a licensed adviser"
              messages={messages}
              sending={send.isPending || playing}
              onSend={(t) => send.mutate(t)}
              disabled={!conversationId || playing}
              error={startError ?? send.error?.message ?? null}
              placeholder="e.g. I’ve just bought a Toyota Corolla"
              footerNote={
                <>
                  Ava runs on a deterministic demo adapter in this build. Your details are used only to prepare this comparison (POPIA).
                </>
              }
            />
          </div>

          <aside className="space-y-5" aria-label="What Ava is doing">
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
                  Waiting for a licensed broker to review the comparison. Demo tip: switch to <strong>Thabo Nkosi (broker)</strong> and open Approvals.
                </p>
              )}
              {progress?.status === 'awaiting_information' && (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Your broker asked for a revision before releasing it.</p>
              )}
              {ended && (
                <p className="mt-4 rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-700">
                  The broker did not release this comparison. They will contact you directly.
                </p>
              )}
              {progress?.status === 'completed' && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-900">Your comparison is ready</p>
                  <p className="mt-0.5 text-xs text-emerald-800">A broker approved it for release to your portal.</p>
                  {customerIdentity && (
                    <Button size="sm" variant="accent" className="mt-3" onClick={openPortal}>
                      Open my portal as {customerIdentity.full_name.split(' ')[0]}
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
                <p className="mt-2 text-xs text-navy-600">Agents start once you confirm your details. Every step will appear here.</p>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Details captured</h2>
              {intake && MOTOR_FIELDS.some((f) => intake.details[f.key] !== undefined) ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {MOTOR_FIELDS.filter((f) => intake.details[f.key] !== undefined).map((f) => (
                    <div key={f.key}>
                      <dt className="text-navy-500">{f.label}</dt>
                      <dd className="font-medium text-navy-900">{formatMotorField(f.key, intake.details)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-navy-600">Nothing yet. Ava fills this in as you chat, and only asks for what’s missing.</p>
              )}
              <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-navy-600">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                Ava asks for consent before taking personal details. Comparisons use simulated figures from fictional insurers and are
                never binding cover.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
