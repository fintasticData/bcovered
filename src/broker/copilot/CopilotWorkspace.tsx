import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Database, Maximize2, Minimize2, Workflow } from 'lucide-react'
import { useAccountOverview, useClientOverview, useCopilotHealth, usePolicyDetail, type CopilotId, type EntityRef, type StepResult, type TurnContext } from '@/copilot/api'
import { Button } from '@/components/ui/button'
import { dataCategory, useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { useSupabaseSync } from '@/lib/supabase/sync'
import { cn } from '@/lib/utils'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { LensWorkflows } from '../WorkspacePage'
import { CategorySwitch } from './CategorySwitch'
import { CopilotPanel } from './CopilotPanel'
import { COPILOTS } from './identity'
import { RecordPane } from './RecordPane'

const COPILOT_IDS: CopilotId[] = ['ar', 'ava', 'russ']

function ConnectionChip() {
  const auth = useSupabaseAuth()
  const sync = useSupabaseSync()
  const { data: health } = useCopilotHealth()
  const tone =
    auth.status !== 'signed_in' ? 'bg-amber-50 text-amber-800 ring-amber-200'
    : health?.mcp.ok === false || sync.status === 'error' ? 'bg-red-50 text-red-800 ring-red-200'
    : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  const label =
    auth.status === 'unconfigured' ? 'Database not configured'
    : auth.status !== 'signed_in' ? 'Not signed in to the database'
    : health ? `MCP · ${health.mcp.tools} jobs · ${health.user?.brokerage ?? ''}`
    : 'Connecting…'
  const title = [
    health ? `Signed in as ${health.user?.name} (${health.user?.role}).` : '',
    health ? `Live ${health.live.available ? 'available' : `not configured: ${health.live.reason}`}.` : '',
    health && !health.hook_claims ? 'Access token hook not registered: tenant and role come from the active membership.' : '',
    `Records: ${sync.status === 'synced' ? `${sync.rows} rows loaded from Supabase` : sync.status}${sync.lastError ? ` (${sync.lastError})` : ''}.`,
  ].join(' ')
  return (
    <span className={cn('hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 md:inline-flex', tone)} title={title}>
      <Database className="h-3 w-3" aria-hidden /> {label}
    </span>
  )
}

/** Turns ?ctx=client:<id> | account:<id> | policy:<id> into the copilot's working records. */
function useLaunchContext(ctx: string | null): TurnContext | null {
  const [kind, id] = ctx?.split(':') ?? []
  const client = useClientOverview(kind === 'client' ? id : undefined)
  const account = useAccountOverview(kind === 'account' ? id : undefined)
  const policy = usePolicyDetail(kind === 'policy' ? id : undefined)
  const category = useDataCategory()
  if (kind === 'client' && client.data) {
    const c = client.data
    const acct = c.accounts[0]
    const person: EntityRef = { record_type: 'client', id: c.client.id, number: c.client.number, name: c.client.name, category, open_path: c.client.open_path, account: acct ? { id: acct.id, number: acct.number, name: acct.name } : null }
    return { person, account: acct ? { record_type: 'account', id: acct.id, number: acct.number, name: acct.name, category, detail: acct.type === 'commercial' ? 'Business account' : 'Personal account', open_path: acct.open_path } : null, policy: null }
  }
  if (kind === 'account' && account.data) {
    const a = account.data.account
    return { person: null, account: { record_type: 'account', id: a.id, number: a.number, name: a.name, category, detail: a.type === 'commercial' ? 'Business account' : 'Personal account', open_path: a.open_path }, policy: null }
  }
  if (kind === 'policy' && policy.data) {
    const p = policy.data
    const holder = p.parties.find((x) => x.role === 'policyholder') ?? p.parties[0]
    return {
      policy: p,
      person: holder ? { record_type: 'client', id: holder.person_id, number: holder.client_number, name: holder.name, category, open_path: `/broker/people/${holder.person_id}`, account: p.account ?? null } : null,
      account: p.account ? { record_type: 'account', id: p.account.id, number: p.account.number, name: p.account.name, category, open_path: `/broker/accounts/${p.account.id}` } : null,
    }
  }
  return null
}

export function CopilotWorkspace() {
  const [params, setParams] = useSearchParams()
  const copilot: CopilotId = COPILOT_IDS.includes(params.get('copilot') as CopilotId) ? (params.get('copilot') as CopilotId) : 'ar'
  const workflows = params.get('mode') === 'workflows' || params.has('lens')
  const category = useDataCategory()
  const ctxParam = params.get('ctx')
  const catParam = params.get('cat')
  const [context, setContext] = useState<TurnContext>({})
  const [selection, setSelection] = useState<{ key: string; step: StepResult } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [pane, setPane] = useState<Pane>('chat')

  useEffect(() => {
    if ((catParam === 'sample' || catParam === 'live') && catParam !== dataCategory.get()) dataCategory.set(catParam)
  }, [catParam])

  const launched = useLaunchContext(ctxParam)
  useEffect(() => {
    if (launched) setContext(launched)
  }, [launched?.person?.id, launched?.account?.id, launched?.policy?.id])

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    setParams(q)
  }

  const onCategory = (_next: DataCategory) => {
    setContext({})
    setSelection(null)
    go({ ctx: null, cat: null })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-4">
        <div role="tablist" aria-label="Copilot" className="inline-flex gap-1 rounded-xl bg-navy-100/70 p-1">
          {COPILOT_IDS.map((id) => {
            const c = COPILOTS[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={copilot === id}
                title={c.role}
                onClick={() => {
                  setSelection(null)
                  go({ copilot: id, lens: null, prompt: null })
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  copilot === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900',
                )}
              >
                <span className={cn('grid h-5 w-5 place-items-center rounded-full', c.tone)}>
                  <c.icon className="h-3 w-3" aria-hidden />
                </span>
                {c.name}
              </button>
            )
          })}
        </div>
        <div role="tablist" aria-label="Mode" className="inline-flex gap-1 rounded-xl bg-navy-100/70 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={!workflows}
            onClick={() => go({ mode: null, lens: null, prompt: null })}
            className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold', !workflows ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900')}
            title="Clients, accounts and policies in the database, through MCP jobs"
          >
            <Database className="h-3.5 w-3.5" /> Records
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workflows}
            onClick={() => go({ mode: 'workflows' })}
            className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold', workflows ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900')}
            title="Quote comparisons, life advice, commercial reviews and reconciliations"
          >
            <Workflow className="h-3.5 w-3.5" /> Workflows
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ConnectionChip />
          <CategorySwitch onChange={onCategory} />
        </div>
      </div>

      {workflows ? (
        <div className="min-h-0 flex-1">
          <LensWorkflows copilot={copilot === 'ar' ? undefined : copilot} />
        </div>
      ) : (
        <>
          {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Record" />}
          <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
            {!expanded && (
              <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
                <CopilotPanel
                  key={`${copilot}:${category}`}
                  copilot={copilot}
                  context={context}
                  onContextChange={(ctx) => {
                    setContext(ctx)
                    if (!ctx.person && !ctx.account && !ctx.policy) go({ ctx: null })
                  }}
                  onSelect={(s) => {
                    setSelection(s)
                    if (s) setPane('work')
                  }}
                  selectedKey={selection?.key ?? null}
                />
              </div>
            )}
            <section className={cn('panel flex min-h-0 flex-col max-lg:overflow-y-auto lg:overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="Record editor">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/10 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-navy-900">{selection ? selection.step.title : 'Record'}</h2>
                  <p className="truncate text-xs text-navy-600">{selection ? `“${selection.step.clause}”` : 'The selected client, account or policy'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selection?.step.links[0] && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={selection.step.links[0].to}>Open record</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                    {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? `Show ${COPILOTS[copilot].name}` : 'Expand editor'}
                  </Button>
                </div>
              </div>
              <div className="flex-1 px-4 py-4 max-lg:shrink-0 lg:scroll-area">
                <RecordPane step={selection?.step ?? null} context={context} />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
