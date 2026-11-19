import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingState, ErrorState } from '../PageHeader'
import { useClaimsQueue, usePolicyCovers, usePolicyServiceRequests } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { RouteStartButtons } from '../routes/RouteActionsMenu'

/** Policies working list inside a client record. */
export function ClientPoliciesTab({ personId }: { personId: string }) {
  const covers = usePolicyCovers({ person_id: personId })
  const requests = usePolicyServiceRequests({ person_id: personId })

  if (covers.isLoading || requests.isLoading) return <LoadingState label="Loading policies…" />
  if (covers.error) return <ErrorState message={covers.error.message} />

  const policies = covers.data?.rows ?? []
  const openReqs = requests.data?.rows ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Policies</h3>
        <div className="flex flex-wrap gap-1.5">
          <RouteStartButtons
            personId={personId}
            actions={[
              { definition_id: 'policy_setup', label: 'Set up policy' },
              { definition_id: 'policy_change', label: 'Change a policy' },
            ]}
          />
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/policies/requests/new?personId=${personId}`}><Plus /> Vehicle replacement</Link>
          </Button>
        </div>
      </div>
      {policies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-800/20 p-4 text-sm text-navy-600">No policies for this client yet.</p>
      ) : (
        <ul className="space-y-2">
          {policies.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-800/10 px-3 py-2.5">
              <div>
                <Link className="text-sm font-semibold text-brand-700 hover:underline" to={`/broker/policies/${p.policy_id}`}>
                  {p.policy_number ?? p.reference ?? 'Policy'}
                </Link>
                <p className="text-xs text-navy-600">{p.insurer_name} · {p.item_summary ?? 'No items'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={p.status} />
                <RouteStartButtons
                  personId={personId}
                  policyId={p.policy_id}
                  actions={[
                    { definition_id: 'policy_change', label: 'Change' },
                    { definition_id: 'policy_renew', label: 'Renew' },
                    { definition_id: 'policy_cancel', label: 'Cancel' },
                    { definition_id: 'claim_register', label: 'Register claim' },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Open service requests</h3>
        {openReqs.length === 0 ? (
          <p className="text-xs text-navy-500">None</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {openReqs.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 rounded-lg border border-navy-800/10 px-3 py-2">
                <Link className="font-medium text-brand-700 hover:underline" to={`/broker/policies/requests/${r.id}`}>{r.reference}</Link>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Claims working list inside a client record. */
export function ClientClaimsTab({ personId }: { personId: string }) {
  const claims = useClaimsQueue({ person_id: personId })
  if (claims.isLoading) return <LoadingState label="Loading claims…" />
  if (claims.error) return <ErrorState message={claims.error.message} />
  const rows = claims.data?.rows ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Claims</h3>
        <div className="flex flex-wrap gap-1.5">
          <RouteStartButtons personId={personId} actions={[{ definition_id: 'claim_register', label: 'Register a claim' }]} />
          <Button size="sm" variant="accent" asChild>
            <Link to={`/broker/claims/new?personId=${personId}`}><Plus /> Incident form</Link>
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-navy-800/20 p-4 text-sm text-navy-600">No claims for this client.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-800/10 px-3 py-2.5">
              <div>
                <Link className="text-sm font-semibold text-brand-700 hover:underline" to={`/broker/claims/${c.id}`}>{c.reference}</Link>
                <p className="text-xs text-navy-600 capitalize">{c.incident_type.replace(/_/g, ' ')} · {c.incident_at ? new Date(c.incident_at).toLocaleDateString() : '—'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={c.status} />
                {c.status !== 'closed' && (
                  <RouteStartButtons
                    personId={personId}
                    claimId={c.id}
                    actions={[
                      { definition_id: 'claim_progress', label: 'Progress' },
                      { definition_id: 'claim_resolve', label: 'Resolve' },
                    ]}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
