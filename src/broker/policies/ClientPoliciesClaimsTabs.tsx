import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListTodo, Plus, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingState, ErrorState } from '../PageHeader'
import { useClaimsQueue, usePolicyCovers, usePolicyServiceRequests } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { RouteStartButtons } from '../routes/RouteActionsMenu'
import { ReportClaimSlideout } from '@/pages/my/ReportClaimSlideout'
import { PolicyTasksSlideout } from './PolicyTasksSlideout'
import { RightSlideout } from '../shared/RightSlideout'
import {
  RenewalCompactPanel,
  findRenewalForCustomer,
  UBUNTU_FOODS_CUSTOMER_ID,
  zar,
} from '@/fintastic-ux'

/** Policies working list inside a client record. */
export function ClientPoliciesTab({ personId }: { personId: string }) {
  const covers = usePolicyCovers({ person_id: personId })
  const requests = usePolicyServiceRequests({ person_id: personId })
  const [tasksOpen, setTasksOpen] = useState(false)
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null)
  const [renewalDrawerOpen, setRenewalDrawerOpen] = useState(false)
  const [discussOpen, setDiscussOpen] = useState(false)
  const [discussSubject, setDiscussSubject] = useState('')
  const [discussBody, setDiscussBody] = useState('')

  if (covers.isLoading || requests.isLoading) return <LoadingState label="Loading policies…" />
  if (covers.error) return <ErrorState message={covers.error.message} />

  const policies = covers.data?.rows ?? []
  const openReqs = requests.data?.rows ?? []
  const customerName = policies[0]?.customer_name ?? null
  const renewal =
    findRenewalForCustomer(personId, customerName) ??
    (personId === UBUNTU_FOODS_CUSTOMER_ID
      ? findRenewalForCustomer(UBUNTU_FOODS_CUSTOMER_ID, 'Ubuntu Foods')
      : null)

  return (
    <div className="space-y-5">
      <PolicyTasksSlideout
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        personId={personId}
        policyId={activePolicyId}
      />
      {renewal && (
        <div className="rounded-2xl border border-brand-200/80 bg-brand-50/40 px-3 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Upcoming renewal</p>
          <p className="text-sm font-semibold text-navy-900">
            {renewal.client} · Excess {zar(renewal.expiringExcess)} → {zar(renewal.proposedExcess)}
          </p>
          <p className="text-xs text-navy-600">
            {renewal.policyNumber} · Renewal {renewal.renewalDate}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" type="button" onClick={() => setRenewalDrawerOpen(true)}>
              Inspect renewal
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/renewals?view=fintastic&focus=${renewal.id}`}>Open full queue</Link>
            </Button>
          </div>
        </div>
      )}
      <RightSlideout
        open={renewalDrawerOpen && Boolean(renewal)}
        onClose={() => setRenewalDrawerOpen(false)}
        title={renewal ? `Renewals · ${renewal.client}` : 'Renewal'}
        subtitle={renewal?.policyNumber}
      >
        {renewal && (
          <RenewalCompactPanel
            row={renewal}
            onClose={() => setRenewalDrawerOpen(false)}
            onDiscuss={() => {
              setRenewalDrawerOpen(false)
              setDiscussSubject(`Renewal discussion — ${renewal.client} (${renewal.policyNumber})`)
              setDiscussBody(
                `Hi,\n\nOn the proposed renewal for ${renewal.client}, the excess moves from ${zar(renewal.expiringExcess)} to ${zar(renewal.proposedExcess)}. Shall we discuss options before we confirm?\n\nRuss · B-Covered`,
              )
              setDiscussOpen(true)
            }}
          />
        )}
      </RightSlideout>
      <RightSlideout
        open={discussOpen}
        onClose={() => setDiscussOpen(false)}
        title={renewal ? `Discuss ${renewal.client} renewal` : 'Discuss renewal'}
        subtitle="Draft for the policyholder (demo)"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" type="button" onClick={() => setDiscussOpen(false)}>
              <MessageSquare /> Send draft
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => setDiscussOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-navy-600">
            Subject
            <input
              className="field mt-1 w-full"
              value={discussSubject}
              onChange={(e) => setDiscussSubject(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-navy-600">
            Message
            <textarea
              className="field mt-1 min-h-[10rem] w-full"
              value={discussBody}
              onChange={(e) => setDiscussBody(e.target.value)}
            />
          </label>
        </div>
      </RightSlideout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Policies</h3>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              setActivePolicyId(policies[0]?.policy_id ?? null)
              setTasksOpen(true)
            }}
          >
            <ListTodo /> Tasks
          </Button>
          <RouteStartButtons
            personId={personId}
            actions={[
              { definition_id: 'policy_setup', label: 'Set up policy' },
              { definition_id: 'policy_change', label: 'Change a policy' },
            ]}
          />
          <Button size="sm" variant="outline" asChild>
            <Link
              to={
                policies[0]
                  ? `/broker/policies/requests/new?personId=${personId}&policyId=${policies[0].policy_id}`
                  : `/broker/policies/requests/new?personId=${personId}`
              }
            >
              <Plus /> Vehicle replacement
            </Link>
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
                <p className="text-xs text-navy-600">{p.insurer_name} · {p.item_summary ?? 'No items yet — open policy to add'}</p>
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
  const [params, setParams] = useSearchParams()
  const [reportOpen, setReportOpen] = useState(false)
  const policyId = params.get('policyId')

  useEffect(() => {
    const flag = params.get('reportClaim')
    if (flag !== '1' && flag !== 'true') return
    setReportOpen(true)
    const next = new URLSearchParams(params)
    next.delete('reportClaim')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('reportClaim')])

  if (claims.isLoading) return <LoadingState label="Loading claims…" />
  if (claims.error) return <ErrorState message={claims.error.message} />
  const rows = claims.data?.rows ?? []

  return (
    <div className="space-y-4">
      <ReportClaimSlideout
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        mode="broker"
        target={{ personId, policyId }}
        onDone={() => void claims.refetch()}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Claims</h3>
        <div className="flex flex-wrap gap-1.5">
          <RouteStartButtons personId={personId} actions={[{ definition_id: 'claim_register', label: 'Register a claim' }]} />
          <Button size="sm" variant="accent" type="button" onClick={() => setReportOpen(true)}>
            <Plus /> Incident form
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
                <Link className="text-sm font-semibold text-brand-700 hover:underline" to={`/broker/claims/${c.id}?view=fintastic`}>{c.reference}</Link>
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
