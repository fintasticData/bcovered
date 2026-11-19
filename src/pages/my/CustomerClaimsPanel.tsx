import { Link } from 'react-router-dom'
import { useMyCover } from '@/copilot/policyClaimsApi'
import { CUSTOMER_CLAIM_STATUS } from '@/broker/claims/claimLabels'
import { LoadingState, ErrorState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'

/** Customer My claims + items from policy/claims RPCs. */
export function CustomerClaimsPanel() {
  const { data, isLoading, error } = useMyCover()
  if (isLoading) return <LoadingState label="Loading your claims…" />
  if (error) return <ErrorState message={error.message} />
  const claims = data?.claims ?? []
  const items = data?.rows ?? []
  const firstPolicyId = items.find((i) => i.policy_id)?.policy_id

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-navy-600">Track incidents reported to B-Covered. You can add evidence later on the same claim. Ask your broker or Russ to open a new report from an insured item.</p>
        <Button size="sm" variant="accent" asChild>
          <Link to={firstPolicyId ? `/my/claims/new?policyId=${firstPolicyId}` : '/my/claims/new'}>Report an incident</Link>
        </Button>
      </div>
      {claims.length === 0 ? (
        <p className="panel border-dashed p-6 text-center text-sm text-navy-600">No claims yet. Report an incident from an insured item when something happens.</p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li key={c.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-navy-500">{c.reference}</p>
                  <p className="text-sm font-semibold text-navy-900 capitalize">{c.incident_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-navy-600">{c.incident_at ? new Date(c.incident_at).toLocaleString() : ''}</p>
                </div>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                  {CUSTOMER_CLAIM_STATUS[c.status] ?? c.status}
                </span>
              </div>
              {c.next_action && <p className="mt-2 text-xs text-navy-700">Next: {c.next_action}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CustomerItemsFromCover() {
  const { data, isLoading, error } = useMyCover()
  if (isLoading) return <LoadingState label="Loading your items…" />
  if (error) return null
  const items = data?.rows ?? []
  const requests = data?.requests ?? []
  if (items.length === 0) return null
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="panel flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy-900">{item.display_label}</p>
            <p className="text-xs capitalize text-navy-600">{item.item_type} · {item.status.replace(/_/g, ' ')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.item_type === 'vehicle' && item.status === 'covered' && item.policy_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/my?tab=claims`}>View open requests</Link>
              </Button>
            )}
            {item.policy_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/my/claims/new?policyId=${item.policy_id}&itemId=${item.id}`}>Report an incident</Link>
              </Button>
            )}
          </div>
        </div>
      ))}
      {requests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Open requests</h3>
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-navy-800/10 px-3 py-2 text-sm">
              <span className="font-mono text-xs">{r.reference}</span>
              <span className="ml-2 capitalize">{r.status.replace(/_/g, ' ')}</span>
              {r.next_action && <span className="ml-2 text-xs text-navy-600">· {r.next_action}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
