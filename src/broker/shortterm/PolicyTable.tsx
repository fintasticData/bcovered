import { Link } from 'react-router-dom'
import type { ShortTermPolicyRow } from '@/api/client'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/utils'
import { EmptyState } from '../PageHeader'
import { BasisBadge, Section, Table, Td, zar } from '../shared/ui'

/** Short-term policies on the brokerage's book, as declared, imported or placed. */
export function ShortTermPolicyTable({ rows, title }: { rows: ShortTermPolicyRow[]; title: string }) {
  return (
    <Section title={`${title} (${rows.length})`}>
      {rows.length === 0 ? (
        <EmptyState title="No policies on record yet">
          Existing policies arrive through the{' '}
          <Link to="/broker/imports/client-book" className="font-semibold text-brand-600">
            client-book import
          </Link>
          ; placed policies appear here once an insurer confirms them.
        </EmptyState>
      ) : (
        <Table head={['Policy', 'Client', 'Premium', 'Status']} minWidth={640}>
          {rows.map((r) => (
            <tr key={r.policy.id} className="hover:bg-mist/60">
              <Td>
                <Link
                  to={r.policy.line === 'short_term_personal' ? `/broker/personal/policies/${r.policy.id}` : `/broker/accounts/${r.policy.customer_id}`}
                  className="font-medium text-navy-900 hover:text-brand-600"
                >
                  {r.provider} {r.policy.policy_number ?? '(no number)'}
                </Link>
                <p className="flex items-center gap-1 text-[11px] text-navy-500">
                  {r.policy.origin.replace(/_/g, ' ')} <BasisBadge basis={r.policy.source} />
                </p>
              </Td>
              <Td>{r.customer}</Td>
              <Td>
                {zar(r.policy.premium_amount)} <span className="text-[11px] text-navy-500">{r.policy.premium_frequency === 'annually' ? 'pa' : 'pm'}</span>
              </Td>
              <Td>
                <StatusBadge status={r.policy.status} />
                {r.policy.inception_date && <p className="text-[11px] text-navy-500">since {formatDate(r.policy.inception_date)}</p>}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  )
}
