import { useFunds } from '@/api/hooks'
import { humanise } from '@/components/StatusBadge'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Page, RowLink, Table, Td, zar } from '../shared/ui'

export default function FundsPage() {
  const { data, isLoading, error } = useFunds()
  return (
    <Page>
      <PageHeader
        title="Retirement funds"
        description="Administration oversight. Member values and two-pot components are shown as the administrator reports them, with their valuation date. B-Covered does not calculate official balances."
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No funds yet" />}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['Fund', 'Type', 'Administrator', 'Employers', 'Active members', 'Reported member values', 'Open benefit events']} minWidth={980}>
            {data.map((r) => (
              <tr key={r.fund.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/funds/${r.fund.id}`}>{r.fund.name}</RowLink>
                  <p className="text-[11px] text-navy-500">{r.fund.registration_number}</p>
                </Td>
                <Td>{humanise(r.fund.fund_type)}</Td>
                <Td>{r.administrator}</Td>
                <Td>{r.employers}</Td>
                <Td>{r.members}</Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    {zar(r.reported_value)} <BasisBadge basis="reported" />
                  </span>
                  <p className="text-[11px] text-navy-500">at {r.valuation_date ?? '–'}</p>
                </Td>
                <Td>{r.open_events}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
