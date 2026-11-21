import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Lightbulb, MessageSquare } from 'lucide-react'
import type { StepResult, TurnContext } from '@/copilot/api'
import { useClientRecord } from '@/copilot/salesApi'
import { usePerspective } from '@/lib/perspective'
import { cn } from '@/lib/utils'
import { CopilotPanel } from '../copilot/CopilotPanel'
import { SeedDemoCustomersButton } from './SeedDemoCustomersButton'

type AvaTab = 'chat' | 'suggestions' | 'jobs'

export function AvaDeskPanel({
  context,
  onContextChange,
  onSelect,
  selectedKey,
  personId,
  profileId,
  workingLabel,
  onOpenTab,
  onOpenPerson,
}: {
  context: TurnContext
  onContextChange: (ctx: TurnContext) => void
  onSelect: (selection: { key: string; step: StepResult } | null) => void
  selectedKey: string | null
  personId?: string | null
  profileId?: string | null
  workingLabel: string
  onOpenTab?: (tab: string) => void
  onOpenPerson?: (personId: string) => void
}) {
  const [tab, setTab] = useState<AvaTab>('chat')
  const perspective = usePerspective()
  const record = useClientRecord(personId)
  const r = record.data

  const suggestions = useMemo(() => {
    const out: Array<{ label: string; action: () => void; embed?: 'seed-demo' }> = []
    if (!r && !profileId) {
      out.push({ label: 'Create multiple demo clients for a sales walkthrough', action: () => undefined, embed: 'seed-demo' })
      out.push({ label: 'Find a customer in Customer Area', action: () => undefined })
      out.push({ label: 'Add a customer or import contacts', action: () => undefined })
      return out
    }
    if (profileId) {
      out.push({ label: 'Add franchisee role and an outlet', action: () => onOpenTab?.('outlets') })
      out.push({ label: 'Ask Russ for a commercial property quote', action: () => onOpenTab?.('quotes') })
      out.push({ label: 'Link people to this business', action: () => onOpenTab?.('relationships') })
      return out
    }
    if (r?.follow_ups[0]) out.push({ label: `Review follow-up: ${r.follow_ups[0].title}`, action: () => onOpenTab?.('overview') })
    if (r?.offers.some((o) => o.status === 'sent')) out.push({ label: 'Open quotes ready for this customer', action: () => onOpenTab?.('quotes') })
    if (personId) {
      out.push({
        label: 'Report an incident from notes',
        action: () => onOpenTab?.('claims'),
      })
    }
    out.push({ label: 'Log a customer conversation', action: () => onOpenTab?.('activity') })
    out.push({ label: 'Show items and cover', action: () => onOpenTab?.('items') })
    return out
  }, [r, profileId, onOpenTab, personId])

  const jobs = [
    { label: 'Customer Area', to: '/broker/customers' },
    { label: 'Leads', to: '/broker/leads' },
    { label: 'Claims', to: '/broker/claims' },
    { label: 'Policies', to: '/broker/policies' },
    ...(personId
      ? [{ label: 'Client claims', to: `/broker/customers/people/${personId}?rtab=claims` }]
      : []),
    { label: 'Franchise operations', to: '/broker/franchise' },
    { label: 'Quotes', to: '/broker/quotes/sample-motor' },
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
              key={`ava-desk:${personId ?? profileId ?? 'none'}`}
              copilot="ava"
              scope="customer-area"
              context={context}
              onContextChange={onContextChange}
              onSelect={onSelect}
              selectedKey={selectedKey}
              intro={
                r
                  ? `Working with ${r.name} (${r.client_number}). Ask Ava to capture, link or import. Russ handles research, quotes and follow-ups when needed.`
                  : profileId
                    ? `Working on this business. Ask Ava to link people or set up a franchisee outlet. Russ prepares commercial quotes and research.`
                    : 'Ava is your main assistant. Select a customer or business, or ask Ava to add, import or link records. Russ handles insurance research and quotes.'
              }
              starters={
                r
                  ? [
                      `Log that I called ${r.name}`,
                      `Show offers for ${r.name}`,
                      'What is waiting on this customer?',
                      `Report a claim for ${r.name}`,
                    ]
                  : profileId
                    ? ['Add franchisee role and Benoni outlet', 'Request a commercial property quote', 'Link contacts to this business']
                    : [
                        'Create demo customers for a walkthrough',
                        'Set up Benoni Motors as a franchisee, add its Benoni outlet',
                        'Add Naledi as finance manager at Benoni Motors',
                        'Show me franchise enquiries nobody has contacted yet',
                      ]
              }
            />
          </div>
        )}
        {tab === 'suggestions' && (
          <div className="scroll-area space-y-2 p-3">
            <p className="text-xs text-navy-600">Suggested actions use the current Customer Area context.</p>
            {!r && !profileId && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-2 text-xs text-navy-700">Seed fictional Demo clients (sample category) with estimate covers for practice.</p>
                <SeedDemoCustomersButton
                  onDone={(id) => {
                    if (id) onOpenPerson?.(id)
                    setTab('chat')
                  }}
                />
              </div>
            )}
            {suggestions.map((s) =>
              s.embed === 'seed-demo' ? null : (
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
              ),
            )}
          </div>
        )}
        {tab === 'jobs' && (
          <div className="scroll-area space-y-2 p-3">
            <p className="text-xs text-navy-600">Permitted jobs and screens. Long runs show progress under Tasks &amp; jobs.</p>
            <div className="rounded-xl border border-navy-800/10 bg-white p-3">
              <p className="mb-2 text-xs text-navy-600">Demo data</p>
              <SeedDemoCustomersButton onDone={(id) => id && onOpenPerson?.(id)} />
            </div>
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
