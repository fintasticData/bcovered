import { useEmployers } from '@/api/hooks'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Page, RowLink, Table, Td, zar } from '../shared/ui'

export default function EmployersPage() {
  const { data, isLoading, error } = useEmployers()
  return (
    <Page>
      <PageHeader
        title="Employers & schemes"
        description="Employer clients with group risk schemes and retirement fund participations. An employer can hold several arrangements; each member is one person record."
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No employer clients yet" />}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['Employer', 'Active members', 'Schemes', 'Funds', 'Annual salary roll', 'Last reconciliation', 'Open exceptions']} minWidth={900}>
            {data.map((r) => (
              <tr key={r.customer.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/benefits/employers/${r.customer.id}`}>{r.customer.full_name}</RowLink>
                  <p className="text-[11px] text-navy-500">{r.customer.region}</p>
                </Td>
                <Td>{r.members}</Td>
                <Td>{r.schemes}</Td>
                <Td>{r.funds}</Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    {zar(r.salary_roll_annual)} <BasisBadge basis="reported" />
                  </span>
                </Td>
                <Td>{r.last_reconciliation?.slice(0, 7) ?? <span className="text-amber-700">None</span>}</Td>
                <Td className={r.open_exceptions ? 'font-semibold text-red-700' : ''}>{r.open_exceptions}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
