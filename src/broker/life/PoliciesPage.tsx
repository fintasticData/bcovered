import { useMemo, useState } from 'react'
import { useLifePolicies } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Filters, Page, RowLink, Table, Td, zar } from '../shared/ui'

type Filter = 'all' | 'in_force' | 'pipeline' | 'attention'

export default function PoliciesPage() {
  const { data, isLoading, error } = useLifePolicies()
  const [filter, setFilter] = useState<Filter>('all')
  const rows = useMemo(
    () =>
      (data ?? []).filter((r) =>
        filter === 'in_force'
          ? ['in_force', 'accepted', 'reinstated'].includes(r.policy.status)
          : filter === 'pipeline'
            ? ['proposed', 'application_submitted', 'underwriting'].includes(r.policy.status)
            : filter === 'attention'
              ? r.beneficiaries === 0 || r.policy.underwriting_status === 'requirements_outstanding'
              : true,
      ),
    [data, filter],
  )
  return (
    <Page>
      <PageHeader
        title="Individual life policies"
        description="Placed and existing long-term policies. Each status entry records whether it came from the broker or the insurer."
        actions={
          <Filters
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All' },
              { id: 'in_force', label: 'In force' },
              { id: 'pipeline', label: 'Applications' },
              { id: 'attention', label: 'Needs attention' },
            ]}
          />
        }
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && !rows.length && <EmptyState title="No policies in this view" />}
      {rows.length > 0 && (
        <div className="panel">
          <Table head={['Policy', 'Client', 'Life insured', 'Life cover', 'Premium', 'Beneficiaries', 'Status']} minWidth={900}>
            {rows.map((r) => (
              <tr key={r.policy.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/life/policies/${r.policy.id}`}>
                    {r.provider} {r.policy.policy_number ?? '(application)'}
                  </RowLink>
                  <p className="flex items-center gap-1 text-[11px] text-navy-500">
                    {r.policy.origin.replace(/_/g, ' ')} <BasisBadge basis={r.policy.source} />
                  </p>
                </Td>
                <Td>{r.customer}</Td>
                <Td>{r.life_insured}</Td>
                <Td>{zar(r.cover)}</Td>
                <Td>
                  {zar(r.policy.premium_amount)} <span className="text-[11px] text-navy-500">pm</span>
                </Td>
                <Td className={r.beneficiaries ? '' : 'text-amber-700'}>{r.beneficiaries || 'None'}</Td>
                <Td>
                  <StatusBadge status={r.policy.status} />
                  {r.policy.inception_date && <p className="text-[11px] text-navy-500">since {formatDate(r.policy.inception_date)}</p>}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
