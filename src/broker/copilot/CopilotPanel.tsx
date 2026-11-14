import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, RotateCcw, User } from 'lucide-react'
import { copilotApi, useCopilotHealth, type CopilotId, type EntityRef, type PolicyRef, type StepResult, type TurnContext, type TurnResult } from '@/copilot/api'
import type { StepInput } from '../../../supabase/functions/copilot-agent/planner'
import { Button } from '@/components/ui/button'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { routeTurn } from '../routes/russBridge'
import { ContextBar } from './ContextBar'
import { COPILOTS } from './identity'
import { MentionComposer, type ComposerSubmit } from './MentionComposer'
import { StepCard } from './StepCard'

interface UserMessage {
  id: string
  role: 'user'
  display: string
  entities: EntityRef[]
}

interface AgentMessage {
  id: string
  role: 'agent'
  request: { text: string; entities: EntityRef[]; context: TurnContext; message_id: string; steps: Record<number, StepInput> }
  result?: TurnResult
  error?: string
  pending?: boolean
}

type Message = UserMessage | AgentMessage

interface Conversation {
  id: string
  messages: Message[]
}

const STARTERS: Record<CopilotId, string[]> = {
  ar: ['Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application', 'Show policies for CL-S1001', 'Find Priy'],
  ava: ['Start a life application for Priyanka Naidu R650', 'Arrange a callback for Priya Naidoo tomorrow', 'Show history for Priya Naidoo'],
  russ: ['Show Ubuntu Foods', 'Show schemes for Karoo Logistics', 'Show members for Karoo Logistics'],
}

const newId = () => crypto.randomUUID()
const storageKey = (user: string | null, copilot: CopilotId, category: string, scope?: string) =>
  `bcovered_copilot_v1:${user ?? 'anon'}:${copilot}:${category}${scope ? `:${scope}` : ''}`

function load(key: string): Conversation {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as Conversation
  } catch {
    // a damaged copy starts a new conversation
  }
  return { id: newId(), messages: [] }
}

export const stepKey = (messageId: string, step: StepResult) => `${messageId}:${step.index}`

function UserBubble({ m }: { m: UserMessage }) {
  let parts: Array<{ text: string; chip?: EntityRef }> = [{ text: m.display }]
  for (const e of m.entities) {
    const needle = `@${e.name}${e.number ? ` · ${e.number}` : ''}`
    parts = parts.flatMap((p) => {
      if (p.chip || !p.text.includes(needle)) return [p]
      const pieces = p.text.split(needle)
      return pieces.flatMap((t, i) => (i < pieces.length - 1 ? [{ text: t }, { text: needle.slice(1), chip: e }] : [{ text: t }]))
    })
  }
  return (
    <div className="flex flex-row-reverse gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-100 text-navy-700" aria-hidden>
        <User className="h-3.5 w-3.5" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-navy-800 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line text-white">
        {parts.map((p, i) =>
          p.chip ? (
            <span key={i} className={cn('rounded-md px-1 font-medium', p.chip.category === 'live' ? 'bg-emerald-200 text-emerald-950' : 'bg-brand-200 text-brand-900')}>
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
    </div>
  )
}

export function CopilotPanel({
  copilot,
  context,
  onContextChange,
  onSelect,
  selectedKey,
  starters,
  scope,
  intro,
}: {
  copilot: CopilotId
  context: TurnContext
  onContextChange: (ctx: TurnContext) => void
  onSelect: (selection: { key: string; step: StepResult } | null) => void
  selectedKey: string | null
  /** Suggested first messages; defaults to the copilot's own. */
  starters?: string[]
  /** Keeps a separate conversation per screen (for example the sales workspace). */
  scope?: string
  intro?: string
}) {
  const category = useDataCategory()
  const auth = useSupabaseAuth()
  const queryClient = useQueryClient()
  const { data: health, error: healthError } = useCopilotHealth()
  const key = storageKey(auth.userId, copilot, category, scope)
  const starterList = starters ?? STARTERS[copilot]
  const [conversation, setConversation] = useState<Conversation>(() => load(key))
  const [searchSignal, setSearchSignal] = useState(0)
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const me = COPILOTS[copilot]

  useEffect(() => setConversation(load(key)), [key])
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ ...conversation, messages: conversation.messages.slice(-60) }))
    } catch {
      // storage full or unavailable: the conversation lasts for this visit
    }
  }, [key, conversation])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [conversation.messages.length])

  const ready = auth.status === 'signed_in'
  const sending = conversation.messages.some((m) => m.role === 'agent' && m.pending)

  const patch = (id: string, next: Partial<AgentMessage>) =>
    setConversation((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id && m.role === 'agent' ? { ...m, ...next } : m)) }))

  const run = async (agentId: string, request: AgentMessage['request']) => {
    patch(agentId, { pending: true, error: undefined, request })
    try {
      const routed = copilot === 'russ' ? await routeTurn(request.text, request.context, category) : null
      const result = routed ?? (await copilotApi.turn({ copilot, category, conversation_id: conversation.id, ...request }))
      patch(agentId, { pending: false, result })
      onContextChange(routed ? result.context : { ...result.context, route_run_id: request.context.route_run_id ?? null })
      if (routed) void queryClient.invalidateQueries()
      else if (result.steps.some((s) => s.status === 'saved')) void queryClient.invalidateQueries({ queryKey: ['supabase'] })
      const show = routed
        ? (result.steps.find((s) => s.status === 'needs_input') ?? result.steps[result.steps.length - 1])
        : (result.steps.find((s) => s.status === 'saved') ?? result.steps.find((s) => s.data !== undefined))
      if (show) onSelect({ key: stepKey(agentId, show), step: show })
    } catch (e) {
      patch(agentId, { pending: false, error: (e as Error).message })
    }
  }

  const send = ({ text, display, entities }: ComposerSubmit) => {
    const userMsg: UserMessage = { id: newId(), role: 'user', display, entities }
    const agentMsg: AgentMessage = { id: newId(), role: 'agent', request: { text, entities, context, message_id: newId(), steps: {} }, pending: true }
    setConversation((c) => ({ ...c, messages: [...c.messages, userMsg, agentMsg] }))
    void run(agentMsg.id, agentMsg.request)
  }

  const rerun = (m: AgentMessage, index: number, input: StepInput) => {
    const steps = { ...m.request.steps, [index]: { ...(m.request.steps[index] ?? {}), ...input, values: { ...(m.request.steps[index]?.values ?? {}), ...(input.values ?? {}) } } }
    void run(m.id, { ...m.request, steps })
  }

  const restart = () => {
    setConversation({ id: newId(), messages: [] })
    onSelect(null)
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden" aria-label={`${me.name} conversation`}>
      <header className="flex items-center gap-3 border-b border-navy-800/10 px-4 py-3">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', me.tone)}>
          <me.icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-navy-900">{me.name}</h2>
          <p className="truncate text-xs text-navy-600">{me.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={restart} aria-label={`New conversation with ${me.name}`} title="New conversation">
          <RotateCcw />
        </Button>
      </header>

      <div ref={listRef} className="scroll-area flex-1 space-y-4 px-4 py-4" aria-live="polite">
        {!ready && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {auth.status === 'unconfigured'
              ? 'This build has no Supabase connection, so the database copilots are unavailable. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
              : auth.status === 'signing_in'
                ? 'Signing in to the database…'
                : auth.error
                  ? `Database sign-in failed: ${auth.error}`
                  : 'Choose a brokerage staff identity under “Demo as” (for example Thabo Nkosi) to sign in to the database.'}
          </div>
        )}
        {ready && healthError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Copilot service unavailable: {(healthError as Error).message}</p>}
        {ready && category === 'live' && health && !health.live.available && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Live is not configured for you: {health.live.reason}. Switch to Sample.</p>
        )}
        {conversation.messages.length === 0 && ready && (
          <div className="space-y-3 text-sm text-navy-700">
            <p>
              {intro ? intro : copilot === 'ar'
                ? 'Tell AR what to do in plain language. AR splits the request, routes people work to Ava and business work to Russ, and asks before saving anything it cannot resolve.'
                : `Ask ${me.name} about ${copilot === 'ava' ? 'a client, their personal policies or life cover' : 'a business account, its commercial cover or group schemes'}.`}{' '}
              Type <strong>@</strong> to pick a client or account, or <strong>/</strong> for the list of jobs.
            </p>
            <div className="flex flex-wrap gap-2">
              {starterList.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrefill({ text: s, nonce: Date.now() })}
                  className="cursor-pointer rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1.5 text-left text-xs font-medium text-brand-700 hover:border-brand-500"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {conversation.messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} m={m} />
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', me.tone)} aria-hidden>
                <me.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {m.pending && (
                  <p className="flex items-center gap-2 text-xs text-navy-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving records and running jobs…
                  </p>
                )}
                {m.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{m.error}</p>}
                {m.result && m.result.steps.length > 1 && (
                  <p className="text-xs text-navy-600">
                    {m.result.steps.length} actions · {m.result.steps.filter((s) => s.status === 'saved').length} saved · {m.result.steps.filter((s) => s.status === 'retrieved').length} retrieved ·{' '}
                    {m.result.steps.filter((s) => s.status === 'needs_choice' || s.status === 'needs_input').length} waiting for you
                  </p>
                )}
                {m.result?.steps.map((s) => (
                  <StepCard
                    key={s.index}
                    step={s}
                    busy={m.pending}
                    selected={selectedKey === stepKey(m.id, s)}
                    onShow={() => onSelect({ key: stepKey(m.id, s), step: s })}
                    onChoose={(choice: EntityRef | PolicyRef) => rerun(m, s.index, { choice })}
                    onAnswer={(values) => {
                      if (s.input?.field === 'text') return setPrefill({ text: m.request.text, nonce: Date.now() })
                      rerun(m, s.index, { values })
                    }}
                  />
                ))}
                {m.result && m.result.steps.length === 0 && <p className="text-sm text-navy-700">{m.result.reply}</p>}
              </div>
            </div>
          ),
        )}
      </div>

      <ContextBar context={context} category={category} onChange={() => setSearchSignal((n) => n + 1)} onClear={() => onContextChange({})} />
      <div className="px-4 py-3">
        <MentionComposer
          copilot={copilot}
          category={category}
          disabled={!ready}
          sending={sending}
          placeholder={copilot === 'russ' ? 'e.g. Show schemes for @Karoo Logistics' : 'e.g. Add a note to @Priya Naidoo’s motor policy: …'}
          onSubmit={send}
          searchSignal={searchSignal}
          prefill={prefill}
        />
      </div>
    </section>
  )
}
