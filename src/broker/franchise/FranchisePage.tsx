import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info, Maximize2, Minimize2, Plus, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StepResult, TurnContext } from '@/copilot/api'
import { periodPreset, useFranchiseList, type EnquiryStatusFilter } from '@/copilot/franchiseApi'
import { useSalesProfile } from '@/copilot/salesApi'
import { dataCategory, useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { MobilePaneSwitch, type Pane } from '../MobilePaneSwitch'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategorySwitch } from '../copilot/CategorySwitch'
import { CopilotPanel } from '../copilot/CopilotPanel'
import { SetupFranchiseDialog } from './dialogs'
import { EnquiriesTab } from './EnquiriesTab'
import { FranchiseesTab, OutletPanel } from './FranchiseesTab'
import { OutletsTab } from './OutletsTab'
import { PeriodPicker, ReportingCategory, type PeriodId } from './shared'

const STATUSES: EnquiryStatusFilter[] = ['uncontacted', 'contacted', 'offered', 'sold']

/** Franchise sales channel: outlet performance, franchise enquiries and franchisee set-up, worked through with Russ. */
export default function FranchisePage() {
  const [params, setParams] = useSearchParams()
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  const profile = useSalesProfile()
  const canManage = Boolean(profile.data?.can_manage_team)
  const list = useFranchiseList(category)
  const [expanded, setExpanded] = useState(false)
  const [pane, setPane] = useState<Pane>('work')
  const [context, setContext] = useState<TurnContext>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { partner: { id: string; name: string } | null }>(null)

  const tab = params.get('tab') ?? 'outlets'
  const outletId = params.get('outlet')
  const status = STATUSES.find((s) => s === params.get('status')) ?? null
  const view = params.get('view') === 'sales' ? 'sales' : 'intake'
  const reporting: DataCategory = params.get('rc') === 'sample' ? 'sample' : 'live'
  const period = (params.get('period') as PeriodId | null) ?? (params.get('from') || params.get('to') ? 'custom' : 'this_month')
  const preset = period === 'custom' ? null : periodPreset(period)
  const from = preset ? preset.from : params.get('from')
  const to = preset ? preset.to : params.get('to')
  // The outlet report defaults to this month; the enquiry list shows every date unless a period was chosen.
  const explicitPeriod = params.has('period') || params.has('from') || params.has('to')
  const outletLabel = outletId ? list.data?.partners.flatMap((p) => p.outlets).find((o) => o.id === outletId)?.label ?? null : null

  const setQuery = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) (v === null ? q.delete(k) : q.set(k, v))
    setParams(q, { replace: true })
  }

  /** Russ's franchise results open in the editor: the outlet with its QR code, the filtered enquiry grid, or the outlet report. */
  const onSelect = (s: { key: string; step: StepResult } | null) => {
    setSelectedKey(s?.key ?? null)
    if (!s) return
    const to = s.step.links.find((l) => l.to.startsWith('/broker/franchise'))?.to
    if (!to) return
    setPane('work')
    const q = new URLSearchParams(to.split('?')[1] ?? '')
    const month = periodPreset('this_month')
    const thisMonth = q.get('from') === month.from && q.get('to') === month.to
    const next: Record<string, string | null> = {
      tab: q.get('tab'), outlet: q.get('outlet'), qr: q.get('qr'), status: q.get('status'), view: q.get('view'), period: null,
      from: thisMonth ? null : q.get('from'), to: thisMonth ? null : q.get('to'),
    }
    if (q.get('tab') === 'outlets') next.rc = s.step.category
    setQuery(next)
  }

  if (auth.status !== 'signed_in') {
    return (
      <div className="p-6">
        <EmptyState title="Sign in to open Franchise">{auth.status === 'unconfigured' ? 'This build has no Supabase connection.' : 'Sign in with your broker login.'}</EmptyState>
      </div>
    )
  }
  if (profile.isLoading) return <LoadingState label="Opening Franchise…" />
  const live = Boolean(profile.data?.brokerage?.live_available)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Franchise" />}
      <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', 'grid-cols-1', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
            <CopilotPanel
              key={`russ:${category}:franchise`}
              copilot="russ"
              scope="franchise"
              context={context}
              onContextChange={setContext}
              onSelect={onSelect}
              selectedKey={selectedKey}
              intro="Ask Russ to set up a franchisee and its outlet, find franchise enquiries nobody has contacted, or show which outlets brought in sales. Each result opens on the right."
              starters={[
                'Set up Benoni Motors as a franchisee, add its Benoni outlet and route enquiries to Lerato.',
                'Show me franchise enquiries nobody has contacted yet.',
                'Which outlets brought us sales this month?',
              ]}
            />
          </div>
        )}

        <section className={cn('panel flex min-h-0 flex-col max-lg:overflow-y-auto lg:overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label="Franchise editor">
          <header className="space-y-3 border-b border-navy-800/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-navy-900">Franchise</h1>
                <p className="hidden text-xs text-navy-600 sm:block">Which outlet brought each customer, who is handling them, and whether it became a sale.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CategorySwitch onChange={() => setQuery({ outlet: null, qr: null })} />
                <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                  {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Russ' : 'Expand editor'}
                </Button>
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="accent" onClick={() => setDialog({ partner: null })}><Store /> Set up franchisee</Button>
                <Button size="sm" variant="outline" disabled={!list.data?.partners.length} onClick={() => {
                  const p = list.data?.partners[0]
                  if (p) setDialog({ partner: { id: p.id, name: p.name } })
                }} title="Adds an outlet to the first franchisee; use Add outlet on a franchisee for others">
                  <Plus /> Add outlet
                </Button>
              </div>
            )}
            {!live && category === 'live' && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Live franchise set-up opens once B-Covered activates {profile.data?.brokerage?.name ?? 'your brokerage'}. Switch to Sample to run the journey now.
              </p>
            )}
          </header>

          <div className="flex-1 px-4 py-4 max-lg:shrink-0 lg:scroll-area">
            <Tabs value={tab} onValueChange={(t) => setQuery({ tab: t, outlet: null, qr: null })} className="flex min-h-0 flex-col">
              <TabsList>
                <TabsTrigger value="outlets">Outlets</TabsTrigger>
                <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
                <TabsTrigger value="franchisees">Franchisees</TabsTrigger>
              </TabsList>

              <TabsContent value="outlets" className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ReportingCategory value={reporting} onChange={(v) => setQuery({ rc: v === 'live' ? null : v })} />
                  <PeriodPicker label={view === 'sales' ? 'Sale date' : 'Received'} value={period}
                    onChange={(p) => setQuery({ period: p === 'this_month' ? null : p, from: null, to: null })} />
                  {period === 'custom' && <span className="text-xs text-navy-600">{from ?? 'start'} to {to ?? 'today'}</span>}
                </div>
                <OutletsTab
                  category={reporting}
                  from={from}
                  to={to}
                  view={view}
                  onView={(v) => setQuery({ view: v === 'sales' ? 'sales' : null })}
                  onOpenOutlet={(id) => {
                    dataCategory.set(reporting)
                    setQuery({ tab: 'franchisees', outlet: id })
                  }}
                  onOpenEnquiries={({ outlet_id, status: s }) => {
                    dataCategory.set(reporting)
                    setQuery({ tab: 'enquiries', outlet: outlet_id, status: s, period: period === 'custom' ? null : period })
                  }}
                />
              </TabsContent>

              <TabsContent value="enquiries" className="pt-4">
                <EnquiriesTab
                  category={category}
                  status={status}
                  outletId={outletId}
                  outletLabel={outletLabel}
                  from={explicitPeriod && period !== 'all' ? from : null}
                  to={explicitPeriod && period !== 'all' ? to : null}
                  onStatus={(s) => setQuery({ status: s })}
                  onClearOutlet={() => setQuery({ outlet: null })}
                  onClearDates={() => setQuery({ period: 'all', from: null, to: null })}
                />
              </TabsContent>

              <TabsContent value="franchisees" className="pt-4">
                {outletId ? (
                  <OutletPanel outletId={outletId} showQr={params.get('qr') === '1'} onBack={() => setQuery({ outlet: null, qr: null })}
                    onOpenEnquiries={() => setQuery({ tab: 'enquiries', status: null, period: 'all' })} />
                ) : (
                  <FranchiseesTab onOpenOutlet={(id) => setQuery({ outlet: id })} onAddOutlet={(p) => setDialog({ partner: p })} onSetup={() => setDialog({ partner: null })} />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </div>

      {dialog && (
        <SetupFranchiseDialog
          partner={dialog.partner}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null)
            setQuery({ tab: 'franchisees', outlet: id, qr: '1' })
          }}
        />
      )}
    </div>
  )
}
