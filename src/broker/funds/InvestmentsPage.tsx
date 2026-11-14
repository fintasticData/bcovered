import { usePortfolios } from '@/api/hooks'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Page, RowLink, Table, Td, zar } from '../shared/ui'

export default function InvestmentsPage() {
  const { data, isLoading, error } = usePortfolios()
  return (
    <Page>
      <PageHeader
        title="Investment oversight"
        description="Portfolios, holdings from the administrator and the manager side by side, reconciliation and calculated performance. Official fund accounting and unitisation stay with the administrator."
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No portfolios yet" />}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['Portfolio', 'Fund', 'Manager', 'Market value', 'Open exceptions']} minWidth={760}>
            {data.map((r) => (
              <tr key={r.portfolio.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/investments/${r.portfolio.id}`}>{r.portfolio.name}</RowLink>
                  <p className="text-[11px] text-navy-500">Benchmark: {r.portfolio.mandate.benchmark}</p>
                </Td>
                <Td>{r.fund}</Td>
                <Td>{r.manager}</Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    {zar(r.market_value)} <BasisBadge basis="reported" />
                  </span>
                  <p className="text-[11px] text-navy-500">at {r.valuation_date ?? '–'}</p>
                </Td>
                <Td className={r.open_exceptions ? 'font-semibold text-red-700' : ''}>{r.open_exceptions}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
