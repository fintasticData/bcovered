import { Link, useParams } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { usePortfolio, useReconcileHoldings } from '@/api/hooks'
import { humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Notice, Page, Section, Stat, Table, Td, num, pct, zar } from '../shared/ui'

export default function PortfolioPage() {
  const { portfolioId } = useParams()
  const { data, isLoading, error } = usePortfolio(portfolioId)
  const reconcile = useReconcileHoldings()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const maxAbs = Math.max(...data.twr.periods.map((p) => Math.abs(p.return)), ...data.benchmarks.map((b) => Math.abs(b.benchmark_return)), 0.01)

  return (
    <Page wide>
      <PageHeader
        title={data.portfolio.name}
        description={`${data.fund} · manager ${data.manager} · benchmark ${data.portfolio.mandate.benchmark}`}
        actions={
          <Button size="sm" variant="accent" disabled={reconcile.isPending} onClick={() => reconcile.mutate(data.portfolio.id)}>
            <Scale /> Reconcile holdings
          </Button>
        }
      />
      {reconcile.error && <ErrorState message={reconcile.error.message} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Market value" value={zar(data.market_value)} hint={`at ${data.valuation_date ?? '–'}`} basis="reported" />
        <Stat label="Time-weighted return" value={pct(data.twr.cumulative, 2)} hint={`${data.twr.periods.length} months`} basis="calculated" />
        <Stat label="Benchmark" value={pct(data.benchmark_cumulative, 2)} hint={`Relative ${pct(data.twr.cumulative - data.benchmark_cumulative, 2)}`} basis="reported" />
        <Stat label="Money-weighted return" value={`${pct(data.mwr.annualised, 2)} pa`} basis="calculated" />
        <Stat label="Open exceptions" value={data.exceptions.length} tone={data.exceptions.length ? 'danger' : undefined} />
      </div>
      <Notice>
        Methods: {data.twr.method}. {data.mwr.method}. Inputs are dated manager valuations and cash flows. These are B-Covered calculations, not official fund returns.
      </Notice>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Monthly returns against the benchmark">
          <div className="space-y-1" role="img" aria-label="Monthly portfolio and benchmark returns">
            {data.twr.periods.map((p) => {
              const b = data.benchmarks.find((x) => x.period_end === p.date)?.benchmark_return ?? null
              const unusual = data.unusual.some((u) => u.date === p.date)
              return (
                <div key={p.date} className="grid grid-cols-[4.5rem_1fr_4rem_4rem] items-center gap-2 text-xs">
                  <span className={unusual ? 'font-semibold text-amber-800' : 'text-navy-600'}>{p.date.slice(0, 7)}</span>
                  <div className="relative h-3 rounded bg-mist">
                    <span className="absolute top-0 left-1/2 h-3 w-px bg-navy-300" />
                    <span className={`absolute top-0 h-3 rounded ${p.return >= 0 ? 'left-1/2 bg-brand-500' : 'right-1/2 bg-red-400'}`} style={{ width: `${(Math.abs(p.return) / maxAbs) * 50}%` }} />
                    {b !== null && <span className="absolute top-0 h-3 w-0.5 bg-navy-900" style={{ left: `${50 + (b / maxAbs) * 50}%` }} title={`Benchmark ${pct(b, 2)}`} />}
                  </div>
                  <span className="text-right text-navy-900">{pct(p.return, 2)}</span>
                  <span className="text-right text-navy-500">{pct(b, 2)}</span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-navy-500">Bars: portfolio. Dark marker and right column: benchmark. Months more than 0.6 percentage points from the benchmark are highlighted for investigation.</p>
        </Section>
        <Section title="Asset allocation against the mandate">
          <Table head={['Asset class', 'Weight', 'Mandate range', '']} minWidth={420}>
            {data.allocation.map((a) => (
              <tr key={a.asset_class}>
                <Td>{humanise(a.asset_class)}</Td>
                <Td>{a.weight.toFixed(1)}%</Td>
                <Td>
                  {a.min}–{a.max}%
                </Td>
                <Td className={a.breach ? 'font-semibold text-red-700' : 'text-emerald-700'}>{a.breach ? 'Outside range' : 'Within range'}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-navy-500">
            From the manager’s holdings <BasisBadge basis="calculated" />
          </p>
        </Section>
      </div>

      <Section
        title="Holdings: administrator register vs manager report"
        actions={
          data.last_run && (
            <Link to={`/broker/controls/reconciliations/${data.last_run.id}`} className="text-xs font-semibold text-brand-600">
              Last reconciliation ({data.last_run.difference_count} differences)
            </Link>
          )
        }
      >
        <Table head={['Instrument', 'Class', 'Units (administrator)', 'Units (manager)', 'Price (administrator)', 'Price (manager)', 'Value (administrator)', 'Value (manager)']} minWidth={1100}>
          {data.holdings.map((h) => {
            const unitsDiffer = h.administrator && h.manager && h.administrator.units !== h.manager.units
            return (
              <tr key={h.instrument}>
                <Td className="font-medium">{h.instrument}</Td>
                <Td className="text-xs">{humanise(h.asset_class)}</Td>
                <Td className={unitsDiffer ? 'font-semibold text-red-700' : ''}>{num(h.administrator?.units, 2)}</Td>
                <Td>{num(h.manager?.units, 2)}</Td>
                <Td className={h.administrator?.unit_price === null ? 'font-semibold text-red-700' : ''}>{h.administrator?.unit_price === null ? 'Missing' : num(h.administrator?.unit_price, 4)}</Td>
                <Td>{num(h.manager?.unit_price, 4)}</Td>
                <Td>{zar(h.administrator?.market_value, true)}</Td>
                <Td>{zar(h.manager?.market_value, true)}</Td>
              </tr>
            )
          })}
        </Table>
      </Section>
    </Page>
  )
}
