import { useTransfers } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, RowLink, Table, Td, zar } from '../shared/ui'

export default function TransfersPage() {
  const { data, isLoading, error } = useTransfers()
  return (
    <Page>
      <PageHeader
        title="Transfers & conversions"
        description="Section 14 bulk transfers and individual transfers, tracked stage by stage with evidence. Section 14 is kept distinct from transfers under other procedures."
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !data.length && <EmptyState title="No transfers" />}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['Transfer', 'Employer', 'Stage', 'Members reconciled', 'Transfer value', 'Status']} minWidth={900}>
            {data.map((r) => (
              <tr key={r.transfer.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/transfers/${r.transfer.id}`}>
                    {r.transfer.transfer_type === 'section_14' ? 'Section 14' : humanise(r.transfer.transfer_type)}: {r.from} → {r.to}
                  </RowLink>
                  <p className="text-[11px] text-navy-500">effective {r.transfer.effective_date}</p>
                </Td>
                <Td>{r.employer ?? '–'}</Td>
                <Td>{humanise(r.transfer.stage)}</Td>
                <Td>
                  {r.reconciled}/{r.members}
                </Td>
                <Td>{zar(r.value_reported)}</Td>
                <Td>
                  <StatusBadge status={r.transfer.status} />
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
