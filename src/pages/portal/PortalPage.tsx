import { Link } from 'react-router-dom'
import { ArrowRight, Bell, Building2, Clock, FileText, Sparkles } from 'lucide-react'
import { useMe, usePortal } from '@/api/hooks'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { humanise } from '@/components/StatusBadge'
import { describeVehicle } from '@/server/domain/motor'
import { rand } from '@/lib/quote'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState } from '@/broker/PageHeader'

const REVIEW_LABEL: Record<string, string> = {
  draft: 'Being prepared',
  comparing: 'Comparing options',
  awaiting_approval: 'With your broker for review',
  approved: 'Approved, releasing shortly',
  rejected: 'Your broker will contact you',
  expired: 'Expired',
}

export default function PortalPage() {
  const { data, isLoading, error } = usePortal()
  const { data: me } = useMe()

  if (isLoading) return <div className="container-x py-10"><LoadingState /></div>
  if (error || !data) return <div className="container-x py-10"><ErrorState message={error?.message ?? 'Could not load your portal'} /></div>
  const first = (me?.full_name ?? data.customer.full_name).split(' ')[0]
  const isBusiness = Boolean(data.business_profile_id)

  return (
    <div className="bg-mist">
      <div className="container-x py-10">
        <p className="eyebrow mb-1">Customer portal</p>
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">Welcome back, {first}</h1>
        <p className="mt-2 text-sm text-navy-600">
          Your proposals, requests and messages in one place. Policies, documents and claims arrive in the next phase of this demo.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            {data.business_profile_id && (
              <Link to="/portal/business" className="panel group flex items-center gap-4 border-brand-500/30 p-5 transition hover:border-brand-500/60">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Building2 className="h-6 w-6" />
                </span>
                <span className="flex-1">
                  <span className="block text-base font-semibold text-navy-900">Business portal</span>
                  <span className="block text-xs text-navy-600">Your business risk review, risk profile and the documents your broker needs.</span>
                </span>
                <ArrowRight className="h-5 w-5 text-brand-500 transition group-hover:translate-x-1" />
              </Link>
            )}
            <section>
              <h2 className="mb-3 text-sm font-semibold text-navy-900">Proposals ready to compare</h2>
              {data.proposals.length === 0 ? (
                <div className="panel p-6 text-sm text-navy-600">
                  No proposals yet. Once a broker approves a comparison it appears here.
                </div>
              ) : (
                <div className="space-y-4">
                  {data.proposals.map((p) => {
                    const cheapest = Math.min(...p.options.map((o) => o.monthly_premium))
                    return (
                      <Link
                        key={p.quote.id}
                        to={`/portal/proposals/${p.quote.id}`}
                        className="panel group flex flex-col gap-4 p-5 transition hover:border-brand-500/40 sm:flex-row sm:items-center"
                      >
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                          <FileText className="h-6 w-6" />
                        </span>
                        <span className="flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-navy-900">
                              Motor comparison · {describeVehicle(p.quote.risk_summary.vehicle ?? {})}
                            </span>
                            <SimulatedBadge />
                          </span>
                          <span className="mt-0.5 block text-xs text-navy-600">
                            {p.options.length} options from {rand(cheapest)} per month · approved by your broker {formatDate(p.quote.released_at)}
                          </span>
                        </span>
                        <ArrowRight className="h-5 w-5 text-brand-500 transition group-hover:translate-x-1" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>

            {data.in_review.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-navy-900">In progress</h2>
                <ul className="space-y-2">
                  {data.in_review.map((r) => (
                    <li key={r.quote_id} className="panel flex items-center gap-3 p-4">
                      <Clock className="h-5 w-5 text-amber-600" />
                      <span className="flex-1 text-sm text-navy-800">{humanise(r.product_category)} comparison</span>
                      <span className="text-xs font-medium text-amber-800">{REVIEW_LABEL[r.status] ?? humanise(r.status)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="panel p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                <Bell className="h-4 w-4 text-brand-500" /> Messages
              </h2>
              {data.notifications.length === 0 ? (
                <p className="mt-2 text-xs text-navy-600">No messages yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.notifications.map((n) => (
                    <li key={n.id} className="rounded-xl bg-mist p-3">
                      <p className="text-sm font-medium text-navy-900">{n.subject}</p>
                      <p className="mt-0.5 text-xs text-navy-700">{n.body}</p>
                      <p className="mt-1 text-[11px] text-navy-500">{formatDateTime(n.created_at)} · in-app</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                <Sparkles className="h-4 w-4 text-brand-500" /> Need something else?
              </h2>
              <p className="mt-1 text-xs text-navy-600">
                {isBusiness
                  ? 'Open your business portal for document requests, or contact your broker.'
                  : 'Start a new motor comparison with Ava, or contact your broker.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {isBusiness ? (
                  <Link to="/portal/business" className="btn-dark px-4 py-2 text-xs">Business portal</Link>
                ) : (
                  <Link to="/assist" className="btn-dark px-4 py-2 text-xs">Talk to Ava</Link>
                )}
                <Link to="/contact" className="btn-ghost px-4 py-2 text-xs">Contact my broker</Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
