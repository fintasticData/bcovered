import { Link } from 'react-router-dom'
import { useConciergePartnerQueue } from '@/api/concierge'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'

export default function PartnerConciergeQueuePage() {
  const queue = useConciergePartnerQueue()

  return (
    <div className="min-h-[70vh] bg-mist">
      <div className="border-b border-navy-800/10 bg-white">
        <div className="container-x py-5">
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Insurer partner</p>
          <h1 className="font-display text-2xl font-bold text-navy-950">VIP Concierge referrals</h1>
          {queue.data && (
            <p className="mt-1 text-sm text-navy-600">
              {queue.data.insurer_name} · {queue.data.team_name}
            </p>
          )}
        </div>
      </div>
      <div className="container-x py-6">
        {queue.isLoading && <LoadingState label="Loading referrals…" />}
        {queue.error && <ErrorState message={queue.error.message} />}
        {queue.data && (
          <div className="space-y-3">
            {(queue.data.rows ?? []).map((row) => (
              <article key={row.id} className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-navy-500">{row.reference}</p>
                    <h2 className="font-semibold text-navy-950">{row.title}</h2>
                    <p className="mt-1 text-sm text-navy-600">
                      {row.customer_name}
                      {row.item_label ? ` · ${row.item_label}` : ''}
                      {row.concierge_name ? ` · Concierge ${row.concierge_name}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-navy-500">Next: {row.next_action ?? '—'}</p>
                  </div>
                  <Button size="sm" asChild>
                    <Link to={`/partner/concierge/${row.id}`}>Open referral</Link>
                  </Button>
                </div>
              </article>
            ))}
            {(queue.data.rows ?? []).length === 0 && (
              <p className="rounded-2xl border border-navy-800/10 bg-white p-8 text-center text-sm text-navy-600">
                No referrals assigned to this desk. The other pilot partner’s cases stay out of this queue.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
