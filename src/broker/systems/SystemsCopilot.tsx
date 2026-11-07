import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelRightOpen, RotateCcw, ServerCog } from 'lucide-react'
import type { MessageView, SystemsFocus } from '@/api/client'
import { useAskSystems } from '@/api/hooks'
import { ChatPanel } from '@/components/ChatPanel'
import { Button } from '@/components/ui/button'
import { SYSTEMS_SUGGESTIONS } from '@/server/systems/copilot'
import { cn } from '@/lib/utils'
import { focusHref } from './shared'

interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  quick_replies: string[]
  focus: SystemsFocus | null
  at: string
}

const STORE = 'insureflow_systems_copilot_v1'

const greeting = (): Turn => ({
  id: 'greeting',
  role: 'assistant',
  content:
    'I’m the Systems Copilot. I answer from the Systems catalogue: the planned database and ERD, which tables each screen needs, agents and copilots, tools, workflows, endpoints and integrations. Answers open on the right.',
  quick_replies: SYSTEMS_SUGGESTIONS,
  focus: null,
  at: new Date().toISOString(),
})

function load(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as Turn[]
  } catch {
    sessionStorage.removeItem(STORE)
  }
  return [greeting()]
}

const toView = (t: Turn): MessageView => ({
  id: t.id,
  tenant_id: '',
  conversation_id: 'systems',
  role: t.role,
  content: t.content,
  structured: null,
  created_at: t.at,
  quick_replies: t.quick_replies,
  links: [],
  view: null,
})

export function SystemsCopilot({ activeHref, onOpen }: { activeHref: string; onOpen: () => void }) {
  const [turns, setTurns] = useState<Turn[]>(load)
  const ask = useAskSystems()
  const navigate = useNavigate()

  useEffect(() => {
    sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-40)))
  }, [turns])

  const open = (f: SystemsFocus) => {
    navigate(focusHref(f))
    onOpen()
  }

  const send = (text: string) => {
    const user: Turn = { id: crypto.randomUUID(), role: 'user', content: text, quick_replies: [], focus: null, at: new Date().toISOString() }
    setTurns((t) => [...t, user])
    ask.mutate(text, {
      onSuccess: (a) => {
        setTurns((t) => [...t, { id: crypto.randomUUID(), role: 'assistant', content: a.reply, quick_replies: a.quick_replies, focus: a.focus, at: new Date().toISOString() }])
        if (a.focus) navigate(focusHref(a.focus))
      },
    })
  }

  const byId = new Map(turns.map((t) => [t.id, t]))

  return (
    <ChatPanel
      title="Systems Copilot"
      subtitle="Explains the platform · answers open on the right"
      avatar={<ServerCog className="h-4 w-4" />}
      messages={turns.map(toView)}
      sending={ask.isPending}
      onSend={send}
      error={ask.error?.message ?? null}
      placeholder="e.g. What tables does the claims page need?"
      headerAction={
        <Button variant="ghost" size="icon" onClick={() => setTurns([greeting()])} aria-label="New Systems Copilot conversation" title="New conversation">
          <RotateCcw />
        </Button>
      }
      renderExtra={(m) => {
        const f = byId.get(m.id)?.focus
        if (!f) return null
        const active = focusHref(f) === activeHref
        return (
          <button
            type="button"
            onClick={() => open(f)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-800/10 text-navy-700 hover:border-brand-500',
            )}
          >
            <PanelRightOpen className="h-3 w-3" /> {f.label}
          </button>
        )
      }}
      footerNote="Answers come from the code registries and this browser’s demo data. The Copilot cannot change systems or apply database changes."
    />
  )
}
