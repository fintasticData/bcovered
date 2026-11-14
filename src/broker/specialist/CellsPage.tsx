import { Link, useParams } from 'react-router-dom'
import { FileBarChart } from 'lucide-react'
import { useCell, useCells, usePrepareCellReport } from '@/api/hooks'
import type { CellView } from '@/api/client'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Notice, Page, Section, Stat, Table, Td, pct, zar } from '../shared/ui'

export default function CellsPage() {
  const { data, isLoading, error } = useCells()
  return (
    <Page>
      <PageHeader title="Cell captives" description="Financial oversight and reporting from the insurer’s accounts and each cell agreement’s own terms. Each cell owner sees only their own cell." />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No cell arrangements" />}
      {data?.map((c) => (
        <Link key={c.cell.id} to={`/broker/cells/${c.cell.id}`} className="panel block p-4 hover:border-brand-500">
          <p className="text-sm font-semibold text-navy-900">{c.cell.name}</p>
          <p className="text-xs text-navy-600">
            Owner {c.owner} · insurer {c.insurer} · {c.periods.length} periods · combined ratio {pct(c.totals.combined_ratio)} · net result {zar(c.totals.net_result)}
          </p>
        </Link>
      ))}
    </Page>
  )
}

export function CellPage() {
  const { cellId } = useParams()
  const { data, isLoading, error } = useCell(cellId)
  const prepare = usePrepareCellReport()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  return (
    <Page wide>
      <PageHeader
        title={data.cell.name}
        description={`Owner ${data.owner} · insurer ${data.insurer} · agreement ${data.cell.agreement_reference}`}
        actions={
          <Button size="sm" variant="accent" disabled={prepare.isPending} onClick={() => prepare.mutate(data.cell.id)}>
            <FileBarChart /> Prepare monthly report
          </Button>
        }
      />
      <CellBody data={data} />
    </Page>
  )
}

export function CellBody({ data }: { data: CellView }) {
  const t = data.totals
  return (
    <div className="space-y-4">
      <Notice>
        Terms from the agreement: {data.cell.terms.profit_share_pct}% profit share{data.cell.terms.deficit_carry_forward ? ' after earlier deficits are recovered' : ''}, {data.cell.terms.reporting_basis} basis. Inputs are the insurer’s reported accounts; every ratio and result below is a B-Covered calculation.
      </Notice>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Gross written premium" value={zar(t.gross_written_premium)} basis="reported" />
        <Stat label="Earned premium" value={zar(t.earned_premium)} basis="calculated" />
        <Stat label="Loss ratio" value={pct(t.loss_ratio)} basis="calculated" tone={(t.loss_ratio ?? 0) > 0.7 ? 'warning' : undefined} />
        <Stat label="Combined ratio" value={pct(t.combined_ratio)} basis="calculated" tone={(t.combined_ratio ?? 0) > 1 ? 'danger' : undefined} />
        <Stat label="Net result" value={zar(t.net_result)} basis="calculated" />
        <Stat label="Profit share accrued" value={zar(t.profit_share_accrued)} basis="calculated" />
      </div>
      <Section title="Monthly results" className="[&_td]:whitespace-nowrap">
        <Table head={['Period', 'GWP', 'Earned', 'Incurred claims', 'Expenses', 'Underwriting result', 'Investment income', 'Net result', 'Loss ratio', 'Combined', 'Profit share movement', 'Solvency cover']} minWidth={1300}>
          {data.results.map((r) => (
            <tr key={r.period_end}>
              <Td className="text-xs">{r.period_end.slice(0, 7)}</Td>
              <Td>{zar(r.gross_written_premium)}</Td>
              <Td>{zar(r.earned_premium)}</Td>
              <Td>{zar(r.incurred_claims)}</Td>
              <Td>{zar(r.expenses)}</Td>
              <Td className={r.underwriting_result < 0 ? 'font-semibold text-red-700' : ''}>{zar(r.underwriting_result)}</Td>
              <Td>{zar(r.investment_income)}</Td>
              <Td className={r.net_result < 0 ? 'font-semibold text-red-700' : ''}>{zar(r.net_result)}</Td>
              <Td>{pct(r.loss_ratio)}</Td>
              <Td>{pct(r.combined_ratio)}</Td>
              <Td className={r.profit_share_movement < 0 ? 'text-red-700' : ''}>{zar(r.profit_share_movement)}</Td>
              <Td>{r.solvency_cover === null ? '–' : `${r.solvency_cover.toFixed(2)}×`}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-navy-500">
          Earned = net written premium less the unearned premium movement. Incurred = paid claims plus outstanding and IBNR movements. Solvency cover = reserves held ÷ capital requirement (as reported). <BasisBadge basis="calculated" />
        </p>
      </Section>
      {data.evidence.length > 0 && (
        <Section title="Reports prepared">
          <ul className="space-y-1 text-xs text-navy-700">
            {data.evidence.map((e) => (
              <li key={e.id}>
                {e.description} · hash {e.sha256.slice(0, 12)} · {formatDateTime(e.created_at)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
