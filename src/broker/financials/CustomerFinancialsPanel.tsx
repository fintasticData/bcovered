import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useBfTransactions } from '@/copilot/brokerFinancialsApi'
import { LoadingState } from '../PageHeader'
import { zar } from '../shared/ui'
import { cn } from '@/lib/utils'

/** Customer → Financials: cross-policy earnings for authorised brokerage staff. */
export function CustomerFinancialsPanel({
  customerId,
  personId,
  portalBasePath,
}: {
  customerId?: string | null
  personId?: string | null
  /** When set, link into the same Values & payments desk the customer sees. */
  portalBasePath?: '/my' | '/demo/my'
}) {
  // Prefer person_id so we still show rows when account/customer ids diverge.
  const byPerson = useBfTransactions({ person_id: personId || null })
  const byCustomer = useBfTransactions({ customer_id: customerId || null })
  const personRows = byPerson.data ?? []
  const customerRows = byCustomer.data ?? []
  const rows = personId && personRows.length > 0
    ? personRows
    : customerId && customerRows.length > 0
      ? customerRows
      : personId
        ? personRows
        : customerRows
  const loading = (personId ? byPerson.isLoading : false) || (customerId ? byCustomer.isLoading : false)
  const error = byPerson.error ?? byCustomer.error

  const totals = useMemo(() => {
    let earned = 0
    let received = 0
    for (const r of rows) {
      earned += Number(r.amount) || 0
      received += Number(r.cash_received_amount) || 0
    }
    const outstanding = Math.max(0, earned - received)
    return {
      expected: earned,
      earned,
      received,
      outstanding,
    }
  }, [rows])

  if (loading) return <LoadingState />
  if (error) return <p className="text-sm text-red-700">{error.message}</p>

  const valuesHref = portalBasePath
    ? `${portalBasePath}?tab=values`
    : personId
      ? `/broker/customers/people/${personId}?rtab=financials`
      : null

  const cards = [
    { key: 'expected', label: 'Expected', amount: totals.expected, hint: 'From policy commission terms / posted' },
    { key: 'earned', label: 'Earned', amount: totals.earned, hint: 'Posted earnings' },
    { key: 'received', label: 'Received', amount: totals.received, hint: 'Insurer cash received' },
    { key: 'outstanding', label: 'Outstanding', amount: totals.outstanding, hint: 'Earned less received' },
  ] as const

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-navy-600">
          Broker <span className="font-semibold">Commission</span> across this customer&apos;s policies. Expected, Earned,
          Received and Outstanding reconcile to the transactions below. Agent splits stay on Broker financials.
        </p>
        {portalBasePath && (
          <Link
            className="text-xs font-semibold text-brand-800 underline"
            to={`${portalBasePath}?tab=values`}
          >
            Open Values & payments
          </Link>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Commission totals">
        {cards.map((card) => (
          <a
            key={card.key}
            href={valuesHref ?? '#txns'}
            className={cn(
              'rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-left transition hover:border-brand-300',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
            )}
          >
            <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Commission · {card.label}</p>
            <p className="mt-1 text-lg font-semibold text-navy-900 tabular-nums">{zar(card.amount, true)}</p>
            <p className="mt-0.5 text-[11px] text-navy-600">{card.hint}</p>
          </a>
        ))}
      </div>

      <div id="txns" className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Policy</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Earned</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Outstanding</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const earned = Number(r.amount) || 0
              const received = Number(r.cash_received_amount) || 0
              const outstanding = Math.max(0, earned - received)
              return (
                <tr key={r.id} className="border-t border-navy-800/10">
                  <td className="px-3 py-2">{String(r.period).slice(0, 7)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.policy_number ?? '—'}</td>
                  <td className="px-3 py-2 capitalize">{r.txn_type.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 tabular-nums">{zar(earned, true)}</td>
                  <td className="px-3 py-2 tabular-nums">{zar(received, true)}</td>
                  <td className="px-3 py-2 tabular-nums">{zar(outstanding, true)}</td>
                  <td className="px-3 py-2 capitalize">{r.status.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="text-brand-700 underline"
                      to={`/broker/financials?earningId=${r.id}${r.customer_id ? `&customerId=${r.customer_id}` : ''}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-sm text-navy-600">
                  No broker financial transactions for this customer yet.
                  {personId ? (
                    <>
                      {' '}
                      <Link className="text-brand-700 underline" to={`/broker/customers/people/${personId}?rtab=policies`}>
                        View policies
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
