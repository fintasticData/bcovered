import { useBrokerages } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/utils'
import { MODULE_LABEL } from '@/server/onboarding/config'
import { ErrorState, LoadingState, PageHeader } from '@/broker/PageHeader'
import { Page, RowLink, Table, Td } from '@/broker/shared/ui'

export default function BrokeragesPage() {
  const { data = [], isLoading, error } = useBrokerages()
  return (
    <Page wide>
      <PageHeader title="Brokerages" description="Every brokerage workspace on the platform. Platform staff manage access here; they cannot open a brokerage’s clients or policies." />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : (
        <div className="panel overflow-hidden">
          <Table head={['Brokerage', 'Workspace', 'Application', 'Owner', 'Team', 'Modules enabled', 'Insurers enabled']} minWidth={980}>
            {data.map((b) => (
              <tr key={b.organisation.id}>
                <Td>
                  <RowLink to={`/platform/brokerages/${b.organisation.id}`}>{b.organisation.name}</RowLink>
                  <span className="block text-[11px] text-navy-500">
                    {b.organisation.activated_at ? `Active since ${formatDateTime(b.organisation.activated_at)}` : `Created ${formatDateTime(b.organisation.created_at)}`}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={b.organisation.lifecycle_status} />
                </Td>
                <Td>{b.application_status ? <StatusBadge status={b.application_status} /> : <span className="text-xs text-navy-400">set up before onboarding</span>}</Td>
                <Td>{b.owner ?? '–'}</Td>
                <Td>{b.members}</Td>
                <Td className="text-xs">{b.modules_enabled.map((m) => MODULE_LABEL[m]).join(', ') || '–'}</Td>
                <Td>{b.insurers_enabled}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
