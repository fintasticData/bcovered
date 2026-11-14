import { usePortalEmployer } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { LoadingState } from '@/broker/PageHeader'
import { EmployerBody } from '@/broker/benefits/EmployerPage'
import { Section, Table, Td, zar } from '@/broker/shared/ui'

export default function PortalEmployerPage() {
  const { data, isLoading, error } = usePortalEmployer()
  return (
    <div className="container-x space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">{data?.detail.customer.full_name ?? 'Employer portal'}</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-600">
          Your employees’ group risk and retirement fund records as B-Covered holds them. You see only your own organisation’s people. Values from the insurer and administrator are labelled as reported.
        </p>
      </div>
      {isLoading && <LoadingState />}
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {data && (
        <>
          <EmployerBody data={data.detail} staff={false} />
          <Section title={`Employees (${data.members.length})`}>
            <Table head={['Employee', 'Number', 'Category', 'Group life cover', 'Status']} minWidth={640}>
              {data.members.map((m) => (
                <tr key={m.person_id + m.employee_number}>
                  <Td>{m.name}</Td>
                  <Td>{m.employee_number}</Td>
                  <Td>{m.category}</Td>
                  <Td>{zar(m.cover)}</Td>
                  <Td>
                    <StatusBadge status={m.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </div>
  )
}
