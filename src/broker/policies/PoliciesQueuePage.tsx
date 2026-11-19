import { Link, useSearchParams } from 'react-router-dom'
import { FileStack, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import { usePolicyServiceRequests, usePolicyCovers } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { RouteStartButtons } from '../routes/RouteActionsMenu'

/** Brokerage-wide Policies workspace: covers + service requests. */
export default function PoliciesQueuePage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const view = params.get('view') === 'policies' ? 'policies' : 'requests'
  const requests = usePolicyServiceRequests({ query: q || null, status: status || null })
  const covers = usePolicyCovers({ query: q || null })

  return (
    <Page>
      <PageHeader
        title="Policies"
        description="Brokerage-wide short-term cover and policy service requests. Open a policy, start a change, or jump to the client."
        actions={
          <Button size="sm" variant="accent" asChild>
            <Link to="/broker/policies/requests/new">
              <Plus /> Start a change request
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-navy-100/70 p-0.5">
          {(
            [
              ['requests', 'Service requests'],
              ['policies', 'Policies'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${view === id ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600'}`}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('view', id)
                setParams(next)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
          <input
            className="w-full rounded-lg border border-navy-800/15 bg-white py-2 pr-3 pl-8 text-sm"
            placeholder="Search client, policy, item…"
            value={q}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('q', e.target.value)
              else next.delete('q')
              setParams(next)
            }}
          />
        </label>
        {view === 'requests' && (
          <select
            className="rounded-lg border border-navy-800/15 bg-white px-2 py-2 text-sm"
            value={status}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('status', e.target.value)
              else next.delete('status')
              setParams(next)
            }}
          >
            <option value="">All statuses</option>
            <option value="requested">Requested</option>
            <option value="in_review">In review</option>
            <option value="awaiting_customer">Awaiting customer</option>
            <option value="awaiting_confirmation">Awaiting confirmation</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        )}
      </div>

      {view === 'requests' ? (
        requests.isLoading ? (
          <LoadingState label="Loading requests…" />
        ) : requests.error ? (
          <ErrorState message={requests.error.message} />
        ) : (
          <RequestTable rows={requests.data?.rows ?? []} />
        )
      ) : covers.isLoading ? (
        <LoadingState label="Loading policies…" />
      ) : covers.error ? (
        <ErrorState message={covers.error.message} />
      ) : (
        <PolicyTable rows={covers.data?.rows ?? []} />
      )}
    </Page>
  )
}

function RequestTable({
  rows,
}: {
  rows: Array<{
    id: string
    reference: string
    client_number: string
    customer_name: string
    person_id: string
    insurer_name: string | null
    item_label: string | null
    request_type: string
    status: string
    owner_name: string | null
    next_action: string | null
    due_at: string | null
  }>
}) {
  if (rows.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-2 border-dashed p-10 text-center">
        <FileStack className="h-8 w-8 text-navy-300" />
        <p className="text-sm text-navy-600">No service requests yet. Start a vehicle replacement from a client policy.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Insurer</th>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Next action</th>
            <th className="px-3 py-2">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-navy-800/10 hover:bg-sky-50/40">
              <td className="px-3 py-2 font-mono text-xs">
                <Link className="text-brand-700 hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=policies`}>
                  {r.client_number}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Link className="font-medium text-navy-900 hover:underline" to={`/broker/policies/requests/${r.id}`}>
                  {r.customer_name}
                </Link>
                <div className="font-mono text-[10px] text-navy-500">{r.reference}</div>
              </td>
              <td className="px-3 py-2 text-navy-700">{r.insurer_name ?? '—'}</td>
              <td className="px-3 py-2 text-navy-700">{r.item_label ?? '—'}</td>
              <td className="px-3 py-2 capitalize">{r.request_type.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">{r.owner_name ?? '—'}</td>
              <td className="px-3 py-2 text-navy-700">{r.next_action ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-navy-600">{r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PolicyTable({
  rows,
}: {
  rows: Array<{
    id: string
    policy_id: string
    reference: string | null
    policy_number: string | null
    client_number: string
    customer_name: string
    person_id: string
    insurer_name: string | null
    status: string
    item_summary: string | null
  }>
}) {
  if (rows.length === 0) {
    return <p className="panel border-dashed p-8 text-center text-sm text-navy-600">No short-term policies in this category yet.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Policy</th>
            <th className="px-3 py-2">Insurer</th>
            <th className="px-3 py-2">Items</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-navy-800/10 hover:bg-sky-50/40">
              <td className="px-3 py-2 font-mono text-xs">
                <Link className="text-brand-700 hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=policies`}>
                  {r.client_number}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Link className="font-medium hover:underline" to={`/broker/policies/${r.policy_id}`}>
                  {r.customer_name}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.policy_number ?? r.reference ?? '—'}</td>
              <td className="px-3 py-2">{r.insurer_name ?? '—'}</td>
              <td className="px-3 py-2 text-navy-700">{r.item_summary ?? '—'}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">
                <RouteStartButtons
                  personId={r.person_id}
                  policyId={r.policy_id}
                  actions={[
                    { definition_id: 'policy_change', label: 'Change' },
                    { definition_id: 'policy_renew', label: 'Renew' },
                    { definition_id: 'claim_register', label: 'Claim' },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
