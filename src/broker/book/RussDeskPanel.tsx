import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Lightbulb, MessageSquare } from 'lucide-react'
import type { StepResult, TurnContext } from '@/copilot/api'
import { useClientRecord } from '@/copilot/salesApi'
import { cn } from '@/lib/utils'
import { CopilotPanel } from '../copilot/CopilotPanel'
import { usePerspective } from '@/lib/perspective'

type AvaTab = 'chat' | 'suggestions' | 'jobs'

/** Broker desk copilot: Ava is the main assistant; Russ runs as a sub-agent on handed-off work. */
export function RussDeskPanel({
  context,
  onContextChange,
  onSelect,
  selectedKey,
  personId,
  onOpenTab,
}: {
  context: TurnContext
  onContextChange: (ctx: TurnContext) => void
  onSelect: (selection: { key: string; step: StepResult } | null) => void
  selectedKey: string | null
  personId?: string | null
  onOpenTab?: (tab: string) => void
}) {
  const [tab, setTab] = useState<AvaTab>('chat')
  const perspective = usePerspective()
  const record = useClientRecord(personId)
  const r = record.data
  const workingLabel = r ? `${r.name} · ${r.client_number}` : 'no record selected'

  const suggestions = useMemo(() => {
    const out: Array<{ label: string; action: () => void }> = []
    if (!r) {
      out.push({ label: 'Open Customer Area', action: () => undefined })
      out.push({ label: 'Add a customer', action: () => undefined })
      return out
    }
    if (r.follow_ups[0]) out.push({ label: `Review follow-up: ${r.follow_ups[0].title}`, action: () => onOpenTab?.('overview') })
    if (r.offers.some((o) => o.status === 'sent')) out.push({ label: 'Open quotes ready for this customer', action: () => onOpenTab?.('quotes') })
    if (r.offers.some((o) => o.status === 'accepted')) out.push({ label: 'Record a decision on the accepted offer', action: () => onOpenTab?.('quotes') })
    if (r.offers.length === 0 && r.category === 'sample') out.push({ label: 'Prepare motor quotes', action: () => onOpenTab?.('quotes') })
    out.push({ label: 'Show items and cover', action: () => onOpenTab?.('items') })
    out.push({ label: 'Log a communication', action: () => onOpenTab?.('activity') })
    return out
  }, [r, onOpenTab])

  const jobs = [
    { label: 'Customer Area', to: '/broker/customers' },
    { label: 'My workspace queue', to: '/broker/book' },
    { label: 'Routes · What you wanna do!', to: '/broker/routes' },
    { label: 'Leads', to: '/broker/leads' },
    { label: 'Approvals', to: '/broker/approvals' },
    { label: 'Tasks & jobs', to: '/broker/jobs' },
  ]

  return (
    <aside className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Ava copilot">
      <div className="border-b border-navy-800/10 px-3 pt-3">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-navy-900">Ava</h2>
            <p className="truncate text-[11px] text-navy-600">
              Working on: {workingLabel} · View as {perspective}
            </p>
          </div>
        </div>
        <div role="tablist" aria-label="Ava panels" className="flex gap-1">
          {(
            [
              ['chat', 'Chat', MessageSquare],
              ['suggestions', 'Suggestions', Lightbulb],
              ['jobs', 'Jobs', Briefcase],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-t-lg px-2 py-2 text-[11px] font-semibold',
                tab === id ? 'bg-mist text-navy-900' : 'text-navy-500 hover:text-navy-800',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-mist">
        {tab === 'chat' && (
          <div className="h-full min-h-0">
            <CopilotPanel
              key={`ava-desk:${personId ?? 'none'}`}
              copilot="ava"
              scope="book-desk"
              context={context}
              onContextChange={onContextChange}
              onSelect={onSelect}
              selectedKey={selectedKey}
              intro={
                r
                  ? `Working with ${r.name} (${r.client_number}). Ask Ava to capture or link. Russ handles research, quotes and follow-ups when needed.`
                  : 'Ava is your main assistant. Open Customer Area to pick a record, or ask Ava to add and link people. Russ handles insurance research and quotes.'
              }
              starters={
                r
                  ? [`Show offers for ${r.name}`, 'What is waiting on this customer?', 'Log that I called the customer']
                  : ['Open Customer Area', 'Show my clients, latest comms and sales', 'Show my referral link']
              }
            />
          </div>
        )}
        {tab === 'suggestions' && (
          <div className="scroll-area space-y-2 p-3">
            <p className="text-xs text-navy-600">Suggested actions use the current customer and queue context.</p>
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  s.action()
                  setTab('chat')
                }}
                className="block w-full cursor-pointer rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-left text-sm font-medium text-navy-900 hover:border-brand-500/40"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {tab === 'jobs' && (
          <div className="scroll-area space-y-2 p-3">
            <p className="text-xs text-navy-600">Permitted jobs and screens.</p>
            {jobs.map((j) => (
              <Link
                key={j.to}
                to={j.to}
                className="block rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm font-medium text-navy-900 hover:border-brand-500/40"
              >
                {j.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
