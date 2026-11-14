import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { SystemsTab } from '@/api/client'
import { useSystemsCatalogue } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { ErrorState, LoadingState } from '../PageHeader'
import { AgentsTab, AuditTab, BackendTab, FrontendTab, IntegrationsTab, OverviewTab, WorkflowsTab } from './CatalogTabs'
import { DatabaseTab } from './DatabaseTab'
import { SystemsCopilot } from './SystemsCopilot'
import { TABS, tabPath } from './shared'

const DESCRIPTION: Record<SystemsTab, string> = {
  overview: 'What the platform is made of today and what it moves to on Supabase.',
  database: 'Live tables, ERD and Edge Functions in the bcovered project, the normalised target schema and the tables behind every screen.',
  frontend: 'Every route, who can open it and how it stores data today.',
  backend: 'Services and every endpoint the UI calls, with where each one moves.',
  integrations: 'External services, storage, database instances and assistant adapters.',
  agents: 'Assistants, copilots, agents and engines, and the tools they use.',
  workflows: 'Durable workflows, the agent behind each step and job counts.',
  audit: 'Recent changes by people, agents and the system.',
}

export default function SystemsPage() {
  const { pathname, search } = useLocation()
  const tab = (TABS.find((t) => pathname === tabPath(t.key))?.key ?? 'overview') as SystemsTab
  const { data: cat, isLoading, error } = useSystemsCatalogue()
  const [expanded, setExpanded] = useState(false)
  const [pane, setPane] = useState<Pane>('work')
  const title = TABS.find((t) => t.key === tab)!.label

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Systems" />}
      <div className={cn('grid min-h-0 flex-1 grid-cols-1 gap-4 p-3 sm:p-4', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
            <SystemsCopilot activeHref={`${pathname}${search}`} onOpen={() => setPane('work')} />
          </div>
        )}

        <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="Systems">
          <div className="flex items-start justify-between gap-3 border-b border-navy-800/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
                Systems · {title} <Badge tone="success">Supabase bcovered live</Badge>
              </h1>
              <p className="text-xs text-navy-600">{DESCRIPTION[tab]}</p>
            </div>
            <Button size="sm" variant="ghost" className="hidden shrink-0 lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Copilot' : 'Expand editor'}
            </Button>
          </div>

          <nav className="px-4 pt-3" aria-label="Systems sections">
            <div className="scroll-x inline-flex max-w-full items-center gap-1 rounded-xl bg-navy-50 p-1">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  to={tabPath(t.key)}
                  aria-current={t.key === tab ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
                    t.key === tab ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="scroll-area relative flex-1 px-4 py-4">
            {isLoading && <LoadingState label="Loading the systems catalogue…" />}
            {error && <ErrorState message={error.message} />}
            {cat && (
              <>
                {tab === 'overview' && <OverviewTab cat={cat} />}
                {tab === 'database' && <DatabaseTab cat={cat} />}
                {tab === 'frontend' && <FrontendTab cat={cat} />}
                {tab === 'backend' && <BackendTab cat={cat} />}
                {tab === 'integrations' && <IntegrationsTab cat={cat} />}
                {tab === 'agents' && <AgentsTab cat={cat} />}
                {tab === 'workflows' && <WorkflowsTab cat={cat} />}
                {tab === 'audit' && <AuditTab cat={cat} />}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
