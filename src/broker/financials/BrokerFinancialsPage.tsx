import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  brokerFinancialsApi,
  useBfDemoContext,
  useBfEarning,
  useBfMutation,
  useBfPayouts,
  useBfStatements,
  useBfTransactions,
} from '@/copilot/brokerFinancialsApi'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page, Section, zar } from '../shared/ui'

type Tab = 'transactions' | 'statements' | 'payouts'

function LifecycleChips({ steps }: { steps: Array<{ id: string; done: boolean; label: string }> }) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {steps.map((s) => (
        <li
          key={s.id}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            s.done ? 'bg-emerald-100 text-emerald-900' : 'bg-navy-100 text-navy-600'
          }`}
        >
          {s.label}
        </li>
      ))}
    </ol>
  )
}

export default function BrokerFinancialsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'transactions'
  const earningId = params.get('earningId')
  const customerId = params.get('customerId')
  const policyId = params.get('policyId')
  const period = params.get('period')
  const ctx = useBfDemoContext()
  const txns = useBfTransactions({
    customer_id: customerId,
    policy_id: policyId,
    period: period,
  })
  const statements = useBfStatements()
  const payouts = useBfPayouts()
  const detail = useBfEarning(earningId)
  const match = useBfMutation(brokerFinancialsApi.matchStatementLine)
  const resolve = useBfMutation(brokerFinancialsApi.resolveStatementException)
  const receipt = useBfMutation(brokerFinancialsApi.recordReceipt)
  const payout = useBfMutation(brokerFinancialsApi.recordPayout)
  const [flash, setFlash] = useState<string | null>(null)
  const [russNote, setRussNote] = useState<string | null>(null)

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next)
  }

  const selected = useMemo(() => (txns.data ?? []).find((r) => r.id === earningId) ?? null, [txns.data, earningId])

  const explain = () => {
    if (!detail.data) return
    const e = detail.data.earning as Record<string, unknown>
    const choices = detail.data.choices as Record<string, unknown> | undefined
    const allocs = (detail.data.allocations as Array<Record<string, unknown>>) ?? []
    setRussNote(
      `${String(detail.data.scale_name ?? 'Scale')}: ${String(choices?.earning_type ?? e.earning_type)} via ${String(choices?.calc_method ?? e.calc_method)} ` +
        `on ${String(choices?.basis ?? e.basis)} at ${((Number(choices?.rate ?? e.rate ?? 0)) * 100).toFixed(1)}%. ` +
        `Gross R${Number(e.gross_amount).toFixed(2)} on eligible R${Number(e.eligible_amount).toFixed(2)}. ` +
        allocs.map((a) => `${a.recipient_role} ${a.share_percent}% = R${Number(a.amount).toFixed(2)}`).join('; ') +
        `. Lifecycle: ${String(detail.data.lifecycle)}.`,
    )
  }

  const findMatches = () => {
    const open = ((statements.data ?? []) as Array<{ lines?: Array<{ match_status: string }> }>)
      .flatMap((b) => b.lines ?? [])
      .filter((l) => l.match_status === 'unmatched' || l.match_status === 'exception')
    setRussNote(open.length ? `${open.length} statement line(s) need review.` : 'No unmatched statement lines.')
    if (open.length) setTab('statements')
  }

  const showUnpaid = () => {
    const rows = (txns.data ?? []).filter((t) => Number(t.adviser_payable) > 0)
    setRussNote(rows.length ? `${rows.length} earning(s) with unpaid allocations (payable > 0).` : 'No unpaid allocations.')
  }

  if (txns.isLoading && tab === 'transactions') return <div className="p-6"><LoadingState /></div>
  if (txns.error) return <div className="p-6"><ErrorState message={txns.error.message} /></div>

  return (
    <Page wide>
      <PageHeader
        title="Broker financials"
        description="Commission earnings, insurer statements, receipts and adviser payouts for this brokerage. Demo actions never initiate real payments."
      />
      {ctx.data && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-navy-600">
          <span>{ctx.data.organisation_name}</span>
          {ctx.data.is_demo_brokerage && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-950">Demo brokerage</span>
          )}
          <span className="rounded bg-navy-100 px-1.5 py-0.5 capitalize">{ctx.data.data_category}</span>
          {ctx.data.data_category === 'sample' && (
            <span className="text-navy-500">Mutations are Demo-only · simulated cash only</span>
          )}
        </p>
      )}
      {flash && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{flash}</p>}
      {russNote && <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950">Russ · {russNote}</p>}

      <div className="mb-4 flex flex-wrap gap-2 border-b border-navy-800/10 pb-2">
        {([
          ['transactions', 'Transactions'],
          ['statements', 'Statements & reconciliation'],
          ['payouts', 'Payouts'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === id ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-navy-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'transactions' && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Section title="Earnings">
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-navy-600">
                Period
                <input
                  type="month"
                  className="ml-2 rounded border border-navy-800/15 px-2 py-1 text-sm"
                  value={period ? String(period).slice(0, 7) : ''}
                  onChange={(e) => {
                    const next = new URLSearchParams(params)
                    if (e.target.value) next.set('period', `${e.target.value}-01`)
                    else next.delete('period')
                    setParams(next)
                  }}
                />
              </label>
              <Button size="sm" variant="outline" onClick={explain} disabled={!earningId}>Explain calculation</Button>
              <Button size="sm" variant="outline" onClick={findMatches}>Find statement matches</Button>
              <Button size="sm" variant="outline" onClick={showUnpaid}>Show unpaid allocations</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Policy</th>
                    <th className="px-3 py-2">Payer → payee</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(txns.data ?? []).map((r) => (
                    <tr
                      key={r.id}
                      className={`cursor-pointer border-t border-navy-800/10 ${earningId === r.id ? 'bg-sky-50' : 'hover:bg-navy-50/60'}`}
                      onClick={() => {
                        const next = new URLSearchParams(params)
                        next.set('earningId', r.id)
                        setParams(next)
                      }}
                    >
                      <td className="px-3 py-2">{String(r.period).slice(0, 7)}</td>
                      <td className="px-3 py-2 capitalize">{r.txn_type.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2">{r.customer_name ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.policy_number ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-navy-600">
                        {r.payer_name ?? 'Insurer'} → {r.payee_names ?? '—'}
                      </td>
                      <td className="px-3 py-2">{zar(Number(r.amount), true)}</td>
                      <td className="px-3 py-2 capitalize">{r.status.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                  {(txns.data ?? []).length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-sm text-navy-600">No commission earnings yet. Run the Highveld Demo Studio scenario or post from a confirmed replacement.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Calculation & linked records">
            {!earningId && <p className="text-sm text-navy-600">Select a row to see the scale, split and linked actions.</p>}
            {earningId && detail.isLoading && <LoadingState />}
            {detail.data && (
              <div className="space-y-3 text-sm">
                <LifecycleChips steps={(detail.data.lifecycle_steps as Array<{ id: string; done: boolean; label: string }>) ?? []} />
                <p><span className="text-navy-500">Customer</span> · {String(detail.data.customer_name ?? '—')}</p>
                <p><span className="text-navy-500">Policy</span> · {String(detail.data.policy_number ?? '—')}</p>
                <p><span className="text-navy-500">Payer</span> · {String(detail.data.payer_name ?? '—')}</p>
                <div className="rounded-lg border border-navy-800/10 p-3 text-xs">
                  <p className="font-semibold text-navy-800">Three commission choices</p>
                  <p className="mt-1">What earns: <span className="capitalize">{String((detail.data.choices as Record<string, unknown>)?.earning_type ?? '—').replace(/_/g, ' ')}</span></p>
                  <p>How calculated: {String((detail.data.choices as Record<string, unknown>)?.calc_method ?? '—')}
                    {(detail.data.choices as Record<string, unknown>)?.rate != null
                      ? ` · ${(Number((detail.data.choices as Record<string, unknown>).rate) * 100).toFixed(1)}%`
                      : ''} of {String((detail.data.choices as Record<string, unknown>)?.basis ?? '').replace(/_/g, ' ')}
                  </p>
                  <p>Scale: {String(detail.data.scale_name ?? '—')}</p>
                </div>
                {selected?.person_id && (
                  <Link className="text-brand-700 underline" to={`/broker/customers/people/${selected.person_id}?rtab=financials`}>
                    Open customer financials
                  </Link>
                )}
                {selected?.policy_id && (
                  <div>
                    <Link className="text-brand-700 underline" to={`/broker/policies/${selected.policy_id}?tab=transactions`}>
                      Open policy transactions
                    </Link>
                  </div>
                )}
                <div className="rounded-lg border border-navy-800/10 p-3">
                  <p className="text-xs font-semibold text-navy-800">Allocations</p>
                  <ul className="mt-2 space-y-1">
                    {((detail.data.allocations as Array<Record<string, unknown>>) ?? []).map((a) => (
                      <li key={String(a.id)} className="flex justify-between gap-2">
                        <span>{String(a.recipient_name ?? a.recipient_role)} ({String(a.share_percent)}%)</span>
                        <span>
                          {zar(Number(a.amount), true)}
                          {Number(a.payable_amount) > 0 ? ` · payable ${zar(Number(a.payable_amount), true)}` : ''}
                          {Number(a.paid_amount) > 0 ? ` · paid ${zar(Number(a.paid_amount), true)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={receipt.isPending || !earningId}
                    onClick={() =>
                      receipt.mutate(
                        { earning_id: earningId!, amount: Number((detail.data!.earning as Record<string, unknown>).gross_amount), scenario_id: 'broker-financials-highveld', event_ref: `receipt:${earningId}:full` },
                        { onSuccess: (r) => setFlash(String(r.summary ?? 'Receipt recorded')) },
                      )
                    }
                  >
                    Record receipt (full)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={receipt.isPending || !earningId}
                    onClick={() =>
                      receipt.mutate(
                        { earning_id: earningId!, amount: 100, scenario_id: 'broker-financials-highveld', event_ref: `receipt:${earningId}:partial100` },
                        { onSuccess: (r) => setFlash(String(r.summary ?? 'Partial receipt recorded')) },
                      )
                    }
                  >
                    Partial R100
                  </Button>
                  {((detail.data.allocations as Array<Record<string, unknown>>) ?? [])
                    .filter((a) => a.recipient_role !== 'brokerage' && Number(a.payable_amount) > 0)
                    .map((a) => (
                      <Button
                        key={String(a.id)}
                        size="sm"
                        variant="outline"
                        disabled={payout.isPending}
                        onClick={() =>
                          payout.mutate(
                            {
                              allocation_id: String(a.id),
                              amount: Number(a.payable_amount),
                              scenario_id: 'broker-financials-highveld',
                              event_ref: `payout:${a.id}:${a.payable_amount}`,
                            },
                            { onSuccess: (r) => setFlash(String(r.summary ?? 'Payout recorded')) },
                          )
                        }
                      >
                        Pay {String(a.recipient_name ?? a.recipient_role)} {zar(Number(a.payable_amount), true)}
                      </Button>
                    ))}
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === 'statements' && (
        <Section title="Statements & reconciliation">
          {statements.isLoading && <LoadingState />}
          <div className="space-y-4">
            {((statements.data ?? []) as Array<{ batch: Record<string, unknown>; insurer_name: string; lines: Array<Record<string, unknown>> }>).map((b) => (
              <div key={String(b.batch.id)} className="rounded-lg border border-navy-800/10 p-4">
                <p className="font-semibold text-navy-900">{String(b.batch.label)}</p>
                <p className="text-xs text-navy-600">{b.insurer_name} · {String(b.batch.period).slice(0, 7)} · {String(b.batch.status)}</p>
                <ul className="mt-3 space-y-2">
                  {b.lines.map((l) => (
                    <li key={String(l.id)} className="flex flex-wrap items-center justify-between gap-2 rounded border border-navy-800/10 px-3 py-2 text-sm">
                      <span>
                        {l.section_code ? `${String(l.section_code)} · ` : ''}
                        reported {zar(Number(l.reported_amount), true)}
                        {l.expected_amount != null ? ` · expected ${zar(Number(l.expected_amount), true)}` : ''}
                        {l.variance != null ? ` · variance ${zar(Number(l.variance), true)}` : ''}
                        {' · '}
                        <span className="capitalize">{String(l.match_status)}</span>
                        {l.exception_note ? ` — ${String(l.exception_note)}` : ''}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {(l.match_status === 'unmatched' || l.match_status === 'exception') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={match.isPending}
                            onClick={() =>
                              match.mutate(
                                { line_id: String(l.id), earning_id: earningId },
                                { onSuccess: (r) => setFlash(String(r.summary ?? r.outcome)) },
                              )
                            }
                          >
                            Match / investigate
                          </Button>
                        )}
                        {(l.match_status === 'exception' || (l.match_status === 'unmatched' && l.variance != null)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resolve.isPending}
                            onClick={() =>
                              resolve.mutate(
                                { line_id: String(l.id), resolution: 'accept_shortfall' },
                                { onSuccess: (r) => setFlash(String(r.summary ?? 'Exception resolved')) },
                              )
                            }
                          >
                            Accept shortfall
                          </Button>
                        )}
                        {l.match_status === 'resolved' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resolve.isPending}
                            onClick={() =>
                              resolve.mutate(
                                { line_id: String(l.id), resolution: 'reopen' },
                                { onSuccess: (r) => setFlash(String(r.summary ?? 'Reopened')) },
                              )
                            }
                          >
                            Reopen
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {(statements.data ?? []).length === 0 && <p className="text-sm text-navy-600">No sample statements in this brokerage.</p>}
          </div>
        </Section>
      )}

      {tab === 'payouts' && (
        <Section title="Payouts">
          {payouts.isLoading && <LoadingState />}
          <ul className="space-y-2">
            {((payouts.data ?? []) as Array<Record<string, unknown>>).map((p) => {
              const po = p.payout as Record<string, unknown>
              const al = p.allocation as Record<string, unknown>
              return (
                <li key={String(po.id)} className="rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
                  <p className="font-medium text-navy-900">
                    {zar(Number(po.amount), true)} to {String(al.recipient_name ?? al.recipient_role)} on {String(po.paid_on)}
                  </p>
                  <p className="text-xs text-navy-600">
                    {String(p.customer_name ?? '—')} · {String(p.policy_number ?? '—')}
                    {po.is_simulated ? ' · simulated' : ''}
                  </p>
                </li>
              )
            })}
            {(payouts.data ?? []).length === 0 && <p className="text-sm text-navy-600">No payouts recorded yet.</p>}
          </ul>
        </Section>
      )}
    </Page>
  )
}
