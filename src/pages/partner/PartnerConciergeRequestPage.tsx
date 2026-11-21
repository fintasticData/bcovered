import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { newConciergeKey, useConciergeMutations, useConciergeRequest } from '@/api/concierge'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'

export default function PartnerConciergeRequestPage() {
  const { requestId } = useParams()
  const detail = useConciergeRequest(requestId)
  const mut = useConciergeMutations()
  const [premium, setPremium] = useState('189')
  const [sumInsured, setSumInsured] = useState('45000')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (detail.isLoading) {
    return (
      <div className="container-x py-10">
        <LoadingState label="Opening referral…" />
      </div>
    )
  }
  if (detail.error || !detail.data) {
    return (
      <div className="container-x py-10">
        <ErrorState message={detail.error?.message ?? 'Referral not available'} />
        <Button className="mt-4" size="sm" variant="outline" asChild>
          <Link to="/partner/concierge">Back to queue</Link>
        </Button>
      </div>
    )
  }

  const r = detail.data

  return (
    <div className="min-h-[70vh] bg-mist">
      <div className="border-b border-navy-800/10 bg-white">
        <div className="container-x py-5">
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">
            <Link to="/partner/concierge" className="hover:text-brand-700">Referrals</Link>
            {' · '}{r.reference}
          </p>
          <h1 className="font-display text-2xl font-bold text-navy-950">{r.title}</h1>
          <p className="mt-1 text-sm text-navy-600">
            Customer contact throughout: Concierge {r.concierge_name ?? r.owner_name ?? 'assigned broker'}
          </p>
        </div>
      </div>

      <div className="container-x grid gap-4 py-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-navy-500">Customer</dt><dd className="font-semibold">{r.customer_name}</dd></div>
              <div><dt className="text-navy-500">Item</dt><dd className="font-semibold">{r.item_label ?? '—'}</dd></div>
              <div><dt className="text-navy-500">Status</dt><dd className="font-semibold">{r.status}</dd></div>
              <div><dt className="text-navy-500">Next</dt><dd className="font-semibold">{r.next_action ?? '—'}</dd></div>
            </dl>
          </div>

          <div className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-navy-900">Shared updates</h2>
            <ol className="mt-2 space-y-2">
              {r.events.map((ev) => (
                <li key={ev.id} className="text-sm">
                  <p className="text-navy-900">{ev.body ?? ev.event_type}</p>
                  <p className="text-[11px] text-navy-500">{new Date(ev.created_at).toLocaleString('en-ZA')}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-navy-900">Relevant documents</h2>
            {r.documents.length === 0 ? (
              <p className="mt-2 text-sm text-navy-600">No documents shared yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {r.documents.map((d) => (
                  <li key={d.id}>{d.label}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="text-sm font-semibold text-navy-900">Return sample quote</h2>
          <p className="mt-1 text-xs text-navy-600">
            Creates a released quote for the customer without marking the item Covered.
          </p>
          <label className="mt-3 block text-sm font-semibold">
            Monthly premium
            <input className="field mt-1" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Sum insured
            <input className="field mt-1" value={sumInsured} onChange={(e) => setSumInsured(e.target.value)} />
          </label>
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={mut.returnQuote.isPending || r.status !== 'with_insurer'}
            onClick={() => {
              setError(null)
              setDone(null)
              void mut.returnQuote
                .mutateAsync({
                  requestId: r.id,
                  monthly: Number(premium) || 189,
                  sumInsured: Number(sumInsured) || 45000,
                  key: newConciergeKey(),
                })
                .then((res) => setDone(`Quote ${res.quote_id ?? 'returned'} · item still awaiting acceptance`))
                .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
            }}
          >
            {mut.returnQuote.isPending ? 'Sending…' : 'Return sample quote'}
          </Button>
          {done && <p className="mt-2 text-sm text-emerald-800">{done}</p>}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </aside>
      </div>
    </div>
  )
}
