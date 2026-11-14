import { Link, useNavigate } from 'react-router-dom'
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

/** Routes: business processes you start as a task, then work through with Russ and the guide. */
export default function RoutesPage() {
  const q = useRoutes()
  const start = useStartRoute()
  const navigate = useNavigate()

  if (q.isLoading) return <LoadingState label="Loading Routes…" />
  if (q.error || !q.data) return <div className="p-6"><ErrorState message={(q.error as Error | null)?.message ?? 'Routes are unavailable.'} /></div>

  const { routes, runs } = q.data
  const active = runs.filter((r) => r.status === 'active')
  const finished = runs.filter((r) => r.status !== 'active').slice(0, 10)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Routes"
        description="Guided business processes. Start one as a task, then work through it in the guide or ask Russ to continue; both work on the same saved progress."
      />

      <section aria-labelledby="routes-available" className="space-y-3">
        <h2 id="routes-available" className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Start a Route</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {routes.map((r) => (
            <article key={r.id} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-navy-900"><RouteIcon className="h-4 w-4 text-brand-600" /> {r.title}</h3>
                  <p className="mt-1 text-sm text-navy-600">{r.outcome}</p>
                </div>
                {r.badge && <DemoSampleBadge />}
              </div>
              <ol className="grid gap-1.5 text-xs text-navy-700 sm:grid-cols-2">
                {r.phases.map((p, i) => (
                  <li key={p.title} className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                    <span className="font-semibold text-navy-900">{i + 1}. {p.title}</span>
                    <span className="block text-navy-600">{p.actions.join(i === r.phases.length - 1 ? ' or ' : ' · ')}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-navy-500">Runs on Sample clients. Or open a client in <Link to="/broker/book" className="font-semibold text-brand-600 underline">My workspace</Link> and choose {r.title}.</p>
                <Button
                  size="sm"
                  variant="accent"
                  disabled={start.isPending}
                  onClick={() => start.mutate({ definition_id: r.id, key: newKey() }, { onSuccess: (s) => navigate(`/broker/routes/runs/${s.progress.run.id}`) })}
                >
                  {start.isPending ? <Loader2 className="animate-spin" /> : <PlayCircle />} {r.title}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <ErrorText error={start.error} />
      </section>

      <section aria-labelledby="routes-runs" className="space-y-3">
        <h2 id="routes-runs" className="text-xs font-semibold tracking-wide text-navy-500 uppercase">In progress ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState title="No Routes in progress">Start one above, or ask Russ to “Prepare motor quotes” for a Sample client.</EmptyState>
        ) : (
          <RunTable runs={active} />
        )}
      </section>

      {finished.length > 0 && (
        <section aria-labelledby="routes-finished" className="space-y-3">
          <h2 id="routes-finished" className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Recently finished</h2>
          <RunTable runs={finished} />
        </section>
      )}
    </div>
  )
}

function RunTable({ runs }: { runs: RunSummary[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-navy-800/10 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-4 py-2">Client</th>
            <th className="px-4 py-2">Route</th>
            <th className="px-4 py-2">Next action</th>
            <th className="px-4 py-2">Progress</th>
            <th className="px-4 py-2">Last updated</th>
            <th className="px-4 py-2"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-navy-800/5 last:border-0">
              <td className="px-4 py-2.5 font-medium text-navy-900">{r.subject_label ?? <span className="text-navy-500">Client not chosen</span>}</td>
              <td className="px-4 py-2.5 text-navy-700">{r.title}</td>
              <td className="px-4 py-2.5 text-navy-700">
                {r.status === 'active' ? r.next_label ?? '–' : (
                  <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', r.status === 'completed' ? 'text-emerald-700' : 'text-navy-500')}>
                    {r.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />} {STATUS_LABEL[r.status]}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-navy-700">{r.done_count} of {r.total_count}</td>
              <td className="px-4 py-2.5 text-xs text-navy-600">{dateTime(r.updated_at)} · {r.started_by_name}</td>
              <td className="px-4 py-2.5 text-right">
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/broker/routes/runs/${r.id}`}>{r.status === 'active' ? 'Resume' : 'Open'} <ArrowRight /></Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
