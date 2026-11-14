import { useState } from 'react'
import { Search } from 'lucide-react'
import { usePeople } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, RowLink, Table, Td } from '../shared/ui'

export default function PeoplePage() {
  const [query, setQuery] = useState('')
  const { data, isLoading, error } = usePeople(query || undefined)
  return (
    <Page>
      <PageHeader
        title="People"
        description="One record per person. Policyholders, insured lives, beneficiaries, employees, fund members and dependants are roles of the same person, so nobody is captured twice."
      />
      <label className="relative block max-w-md">
        <span className="sr-only">Search people</span>
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-navy-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, last four ID digits or employee number" className="field pl-9" />
      </label>
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data && data.length === 0 && <EmptyState title="Nobody matches that search" />}
      {data && data.length > 0 && (
        <div className="panel">
          <Table head={['Person', 'Age', 'Client accounts', 'Employer', 'Policies', 'Schemes', 'Funds']} minWidth={820}>
            {data.slice(0, 200).map((r) => (
              <tr key={r.person.id} className="hover:bg-mist/60">
                <Td>
                  <RowLink to={`/broker/people/${r.person.id}`}>
                    {r.person.first_names} {r.person.surname}
                  </RowLink>
                  {r.person.id_last4 && <p className="text-[11px] text-navy-500">ID ending {r.person.id_last4}</p>}
                </Td>
                <Td>{r.age ?? '–'}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {r.accounts.map((a) => (
                      <Badge key={`${a.customer_id}-${a.role}`} tone={a.role === 'self' ? 'accent' : 'neutral'}>
                        {a.role === 'self' ? a.name : `${a.role} · ${a.name}`}
                      </Badge>
                    ))}
                    {!r.accounts.length && <span className="text-xs text-navy-500">–</span>}
                  </div>
                </Td>
                <Td className="text-xs">{r.employer ?? '–'}</Td>
                <Td>{r.policies || '–'}</Td>
                <Td>{r.schemes || '–'}</Td>
                <Td>{r.funds || '–'}</Td>
              </tr>
            ))}
          </Table>
          {data.length > 200 && <p className="px-3 py-2 text-xs text-navy-500">Showing 200 of {data.length}. Narrow the search to see more.</p>}
        </div>
      )}
    </Page>
  )
}
