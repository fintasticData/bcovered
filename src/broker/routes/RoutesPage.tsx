import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2, PlayCircle, Route as RouteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RunSummary } from '@/api/client'
import { useRoutes, useStartRoute } from '@/api/hooks'
import { newKey } from '@/copilot/salesApi'
import { cn } from '@/lib/utils'
import { DemoSampleBadge } from '../quotes/shared'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { dateTime, ErrorText } from '../book/bits'

const STATUS_LABEL = { active: 'In progress', completed: 'Complete', abandoned: 'Closed' } as const
const GROUP_ORDER = ['policies', 'claims', 'quotes', 'financials'] as const
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  policies: 'Policies',
  claims: 'Claims',
  quotes: 'Quotes',
  financials: 'Broker financials',
}

/** Routes hub: What you wanna do! + My work / Team work. */
export default function RoutesPage() {
  const [params, setParams] = useSearchParams()
  const [workScope, setWorkScope] = useState<'mine' | 'team'>('mine')
  const [area, setArea] = useState<string>('')
  const [status, setStatus] = useState<string>('active')
  const [owner, setOwner] = useState<string>('')
  const q = useRoutes(workScope)
  const start = useStartRoute()
  const navigate = useNavigate()
  const autoStarted = useRef(false)

  const { routes, runs } = q.data ?? { routes: [], runs: [] }

  // Deep-link Add: /broker/routes?start=policy_setup&personId=…&policyId=…&offerId=…
  useEffect(() => {
    const definition_id = params.get('start')
    if (!definition_id || autoStarted.current || start.isPending) return
    autoStarted.current = true
    const offerId = params.get('offerId')
    start.mutate(
      {
        definition_id,
        person_id: params.get('personId'),
        policy_id: params.get('policyId'),
        claim_id: params.get('claimId'),
        offer_id: offerId,
        offer_prefill: offerId
          ? {
              insurer_name: params.get('insurer'),
              cover_type: params.get('cover'),
              premium_amount: params.get('premium') ? Number(params.get('premium')) : null,
              item_label: params.get('item'),
              item_type: params.get('itemType'),
              reference: params.get('offerRef'),
            }
          : null,
        key: newKey(),
      },
      {
        onSuccess: (s) => {
          const next = new URLSearchParams(params)
          next.delete('start')
          next.delete('personId')
          next.delete('policyId')
          next.delete('claimId')
          next.delete('offerId')
          next.delete('insurer')
          next.delete('cover')
          next.delete('premium')
          next.delete('item')
          next.delete('itemType')
          next.delete('offerRef')
          setParams(next, { replace: true })
          navigate(`/broker/routes/runs/${s.progress.run.id}`)
        },
        onError: () => {
          autoStarted.current = false
        },
      },
    )
  }, [params, start, navigate, setParams])
  const grouped = useMemo(() => {
    const map = new Map<string, typeof routes>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const r of routes) {
      const g = (r.group as string) || 'quotes'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(r)
    }
    return map
  }, [routes])

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (status && r.status !== status) return false
      if (area && r.group !== area) return false
      if (owner && r.started_by_name !== owner) return false
      return true
    })
  }, [runs, status, area, owner])

  const waiting = filteredRuns.filter((r) => r.status === 'active' && (r.waiting_on || (r.due_at && r.due_at < new Date().toISOString())))

  if (q.isLoading) return <LoadingState label="Loading Routes…" />
  if (q.error || !q.data) return <div className="p-6"><ErrorState message={(q.error as Error | null)?.message ?? 'Routes are unavailable.'} /></div>

  const launch = (definition_id: string) => {
    start.mutate(
      { definition_id, key: newKey() },
      { onSuccess: (s) => navigate(`/broker/routes/runs/${s.progress.run.id}`) },
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <PageHeader
        title="What you wanna do!"
        description="Start a brokerage action, then work it in the guide or with Russ. Your progress is saved so you can leave a job waiting and resume later."
      />

      <section aria-labelledby="routes-actions" className="space-y-5">
        <h2 id="routes-actions" className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Action catalogue</h2>
        {GROUP_ORDER.map((g) => {
          const items = grouped.get(g) ?? []
          if (!items.length) return null
          return (
            <div key={g} className="space-y-3">
              <h3 className="text-sm font-semibold text-navy-800">{GROUP_LABEL[g]}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((r) => (
                  <article key={r.id} className="panel flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="flex items-center gap-2 text-base font-semibold text-navy-900">
                          <RouteIcon className="h-4 w-4 text-brand-600" /> {r.title}
                        </h4>
                        <p className="mt-1 text-sm text-navy-600">{r.outcome}</p>
                      </div>
                      {r.badge && <DemoSampleBadge />}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
                      <Button size="sm" variant="accent" disabled={start.isPending} onClick={() => launch(r.id)}>
                        {start.isPending ? <Loader2 className="animate-spin" /> : <PlayCircle />} Start
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )
        })}
        <ErrorText error={start.error} />
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-navy-800">Broker financials</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { to: '/broker/financials?tab=transactions', title: 'Review commission', outcome: 'Open earnings with calculation, scale and allocations.' },
              { to: '/broker/financials?tab=statements', title: 'Reconcile insurer statement', outcome: 'Match sample statement lines and investigate variances.' },
              { to: '/broker/financials?tab=payouts', title: 'Review broker payouts', outcome: 'See simulated adviser and franchise payouts linked to earnings.' },
            ].map((r) => (
              <article key={r.to} className="panel flex flex-col gap-3 p-4">
                <h4 className="text-base font-semibold text-navy-900">{r.title}</h4>
                <p className="text-sm text-navy-600">{r.outcome}</p>
                <div className="mt-auto flex justify-end">
                  <Button size="sm" variant="accent" asChild>
                    <Link to={r.to}>Open</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="routes-work" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="routes-work" className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Your work</h2>
          <div className="inline-flex rounded-xl bg-navy-100/70 p-0.5">
            {([
              ['mine', 'My work'],
              ['team', 'Team work'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn('cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold', workScope === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600')}
                onClick={() => setWorkScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select className="rounded-lg border border-navy-800/15 bg-white px-2 py-2 text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            <option value="policies">Policies</option>
            <option value="claims">Claims</option>
            <option value="quotes">Quotes</option>
          </select>
          <select className="rounded-lg border border-navy-800/15 bg-white px-2 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">In progress</option>
            <option value="completed">Complete</option>
            <option value="abandoned">Closed</option>
          </select>
          <select className="rounded-lg border border-navy-800/15 bg-white px-2 py-2 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All owners</option>
            {[...new Set(runs.map((r) => r.started_by_name).filter(Boolean))].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {waiting.length > 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {waiting.length} job{waiting.length === 1 ? '' : 's'} waiting on a client, insurer, approval, or past due.
          </p>
        )}

        {filteredRuns.length === 0 ? (
          <EmptyState title="No work in this view">Start an action above, or ask Russ to continue a saved Route.</EmptyState>
        ) : (
          <RunTable runs={filteredRuns} />
        )}
      </section>
    </div>
  )
}

function RunTable({ runs }: { runs: RunSummary[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-navy-800/10 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-4 py-2">Route</th>
            <th className="px-4 py-2">Client</th>
            <th className="px-4 py-2">Policy / claim</th>
            <th className="px-4 py-2">Owner</th>
            <th className="px-4 py-2">Next action</th>
            <th className="px-4 py-2">Due</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const overdue = r.due_at && r.status === 'active' && r.due_at < new Date().toISOString()
            return (
              <tr key={r.id} className="border-b border-navy-800/5 last:border-0">
                <td className="px-4 py-2.5 font-medium text-navy-900">{r.title}</td>
                <td className="px-4 py-2.5 text-navy-700">{r.subject_label ?? <span className="text-navy-500">Client not chosen</span>}</td>
                <td className="px-4 py-2.5 text-navy-700">{r.record_ref ?? '—'}</td>
                <td className="px-4 py-2.5 text-navy-700">{r.started_by_name}</td>
                <td className="px-4 py-2.5 text-navy-700">
                  {r.status === 'active' ? (
                    <span>
                      {r.next_label ?? '–'}
                      {r.waiting_on ? <span className="mt-0.5 block text-[11px] text-amber-800">Waiting on {r.waiting_on}</span> : null}
                    </span>
                  ) : (
                    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', r.status === 'completed' ? 'text-emerald-700' : 'text-navy-500')}>
                      {r.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />} {STATUS_LABEL[r.status]}
                    </span>
                  )}
                </td>
                <td className={cn('px-4 py-2.5 text-xs', overdue ? 'font-semibold text-amber-800' : 'text-navy-600')}>
                  {r.due_at ? dateTime(r.due_at) : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-navy-600">{STATUS_LABEL[r.status]} · {dateTime(r.updated_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/broker/routes/runs/${r.id}`}>{r.status === 'active' ? 'Resume' : 'Open'} <ArrowRight /></Link>
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
