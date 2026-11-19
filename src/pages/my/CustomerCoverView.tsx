import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileText, MessageSquare, Plus, Sparkles } from 'lucide-react'
import { useMe, usePortal } from '@/api/hooks'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { Button } from '@/components/ui/button'
import { describeVehicle } from '@/server/domain/motor'
import { rand } from '@/lib/quote'
import { cn, formatDate } from '@/lib/utils'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { CustomerClaimsPanel, CustomerItemsFromCover } from './CustomerClaimsPanel'

type CoverTab = 'items' | 'claims' | 'quotes' | 'add'

/** Customer “My items & cover” desk — SAMPLE-aware, with quote-in-between before cover. */
export function CustomerCoverView({ onAskRuss }: { onAskRuss?: () => void }) {
  const { data: me } = useMe()
  const { data, isLoading, error } = usePortal()
  const initialTab = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'claims'
    ? 'claims'
    : 'items') as CoverTab
  const [tab, setTab] = useState<CoverTab>(initialTab)
  const first = (me?.full_name ?? data?.customer.full_name ?? 'there').split(' ')[0]

  if (isLoading) return <LoadingState label="Loading your cover…" />
  if (error || !data) return <ErrorState message={error?.message ?? 'Could not load your cover'} />

  const ready = data.proposals.length
  const inReview = data.in_review.length
  const monthly =
    data.proposals.length > 0
      ? Math.min(...data.proposals.flatMap((p) => p.options.map((o) => o.monthly_premium)))
      : null

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy-900">Welcome back, {first}.</p>
            <p className="text-xs text-navy-600">
              {ready > 0
                ? `${ready} quote comparison${ready === 1 ? '' : 's'} ready for your decision.`
                : inReview > 0
                  ? `${inReview} request${inReview === 1 ? '' : 's'} still with your broker.`
                  : 'Tell Russ what you want to insure, or add something below.'}{' '}
              <SimulatedBadge className="align-middle" />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ready > 0 && (
            <Button size="sm" variant="accent" asChild>
              <Link to={`/portal/proposals/${data.proposals[0].quote.id}`}>Compare my quotes</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onAskRuss}>
            <MessageSquare /> Ask Russ
          </Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Monthly premium (lowest ready)" value={monthly != null ? rand(monthly) : '—'} />
        <Stat label="Comparisons ready" value={String(ready)} />
        <Stat label="Needs your decision" value={String(ready)} highlight={ready > 0} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="inline-flex gap-1 rounded-xl bg-navy-100/70 p-0.5">
          {(
            [
              ['items', 'My items & cover'],
              ['claims', 'My claims'],
              ['quotes', 'Quotes & decisions'],
              ['add', 'Add something'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold',
                tab === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600',
              )}
            >
              {label}
              {id === 'quotes' && ready > 0 ? ` (${ready})` : ''}
            </button>
          ))}
        </div>
        <Button size="sm" variant="accent" onClick={() => setTab('add')}>
          <Plus /> Add something to insure
        </Button>
      </div>

      {tab === 'claims' && <CustomerClaimsPanel />}

      {tab === 'items' && (
        <div className="space-y-3">
          <CustomerItemsFromCover />
          {ready === 0 && inReview === 0 && (
            <p className="panel border-dashed p-6 text-center text-sm text-navy-600">
              No covered items are listed in this demo portal yet. Add something to insure, or ask Russ to start a comparison (SAMPLE until a broker releases a proposal).
            </p>
          )}
          {data.proposals.map((p) => {
            const cheapest = Math.min(...p.options.map((o) => o.monthly_premium))
            return (
              <Link
                key={p.quote.id}
                to={`/portal/proposals/${p.quote.id}`}
                className="panel flex flex-wrap items-center gap-3 p-4 transition hover:border-brand-500/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-800">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
                    {describeVehicle(p.quote.risk_summary.vehicle ?? {})}
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900 uppercase">{p.options.length} quotes ready</span>
                    <SimulatedBadge />
                  </span>
                  <span className="mt-0.5 block text-xs text-navy-600">
                    Not yet covered · from {rand(cheapest)}/mo · approved {formatDate(p.quote.released_at)}
                  </span>
                </span>
                <span className="text-sm font-semibold text-brand-700">Compare quotes <ArrowRight className="inline h-4 w-4" /></span>
              </Link>
            )
          })}
          {data.in_review.map((r) => (
            <div key={r.quote_id} className="panel flex items-center gap-3 p-4 text-sm">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">With broker</span>
              <span className="flex-1 text-navy-800">{r.product_category.replace(/_/g, ' ')}</span>
              <span className="text-xs text-navy-500">Awaiting quote release</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="space-y-3">
          {data.proposals.length === 0 ? (
            <p className="panel border-dashed p-6 text-center text-sm text-navy-600">No quotes ready. Add an item or ask Russ — SAMPLE comparisons appear here after your broker releases them.</p>
          ) : (
            data.proposals.map((p) => (
              <Link key={p.quote.id} to={`/portal/proposals/${p.quote.id}`} className="panel block p-4 hover:border-brand-500/40">
                <span className="text-sm font-semibold text-navy-900">{describeVehicle(p.quote.risk_summary.vehicle ?? {})}</span>
                <span className="mt-1 block text-xs text-navy-600">{p.options.length} options · decision needed</span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'add' && (
        <div className="panel space-y-4 p-5">
          <div>
            <h3 className="text-sm font-semibold text-navy-900">Add something to insure</h3>
            <p className="mt-0.5 text-xs text-navy-600">Describe it to Russ, or start Find My Cover. Cover does not start until quotes are compared and a broker confirms.</p>
          </div>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-navy-700">
            <li>Capture item details (SAMPLE path for now).</li>
            <li>Broker or Russ prepares SAMPLE or Manual quotes.</li>
            <li>You compare → decide → cover confirmed later.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" asChild>
              <Link to="/assist">Find My Cover with Russ</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={onAskRuss}>
              Describe an item to Russ
            </Button>
          </div>
          <p className="rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-600">Draft · Not yet covered · Live insurer APIs disabled in this demo.</p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-white px-3 py-3', highlight ? 'border-amber-300 bg-amber-50/50' : 'border-navy-800/10')}>
      <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-navy-900">
        {highlight && <CheckCircle2 className="h-4 w-4 text-amber-600" />}
        {value}
      </p>
    </div>
  )
}
