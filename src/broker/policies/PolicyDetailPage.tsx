import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Car, FileWarning, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import { usePolicyDetail } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'

export default function PolicyDetailPage() {
  const { policyId } = useParams<{ policyId: string }>()
  const { data, isLoading, error } = usePolicyDetail(policyId)

  if (isLoading) return <div className="p-6"><LoadingState label="Loading policy…" /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Policy not found'} /></div>

  const current = data.current_version
  return (
    <Page>
      <PageHeader
        title={data.policy_number ?? data.reference ?? 'Policy'}
        description={`${data.customer_name} · ${data.client_number} · ${data.insurer_name ?? 'Insurer TBD'}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${data.person_id}?rtab=policies`}>
                <ArrowLeft /> Client record
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/claims/new?policyId=${data.policy_id}&personId=${data.person_id}`}>
                <FileWarning /> Report an incident
              </Link>
            </Button>
            <Button size="sm" variant="accent" asChild>
              <Link to={`/broker/policies/requests/new?policyId=${data.policy_id}&personId=${data.person_id}`}>
                <Plus /> Request a change
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel space-y-3 p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-navy-900">Current cover</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Fact label="Status" value={<StatusBadge status={data.status} />} />
            <Fact label="Insurer" value={data.insurer_name ?? '—'} />
            <Fact label="Policy number" value={data.policy_number ?? '—'} />
            <Fact label="Effective" value={current?.effective_at ? new Date(current.effective_at).toLocaleString() : '—'} />
            <Fact label="Premium" value={current?.terms?.premium != null ? `R ${Number(current.terms.premium).toLocaleString()}/mo` : '—'} />
            <Fact label="Excess" value={current?.terms?.excess != null ? `R ${Number(current.terms.excess).toLocaleString()}` : '—'} />
          </dl>
          <h3 className="pt-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Insured items</h3>
          <ul className="space-y-2">
            {(data.items ?? []).map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-lg border border-navy-800/10 px-3 py-2">
                <Car className="mt-0.5 h-4 w-4 text-navy-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-900">{item.display_label}</p>
                  <p className="text-xs text-navy-600 capitalize">{item.item_type} · {item.status.replace(/_/g, ' ')}</p>
                </div>
                {item.item_type === 'vehicle' && item.status === 'covered' && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/broker/policies/requests/new?policyId=${data.policy_id}&personId=${data.person_id}&itemId=${item.id}&type=vehicle_replacement`}>
                      Replace vehicle
                    </Link>
                  </Button>
                )}
              </li>
            ))}
            {(data.items ?? []).length === 0 && <p className="text-sm text-navy-500">No insured items on the current version.</p>}
          </ul>
        </section>

        <aside className="space-y-4">
          <section className="panel space-y-2 p-4">
            <h2 className="text-sm font-semibold text-navy-900">Open requests</h2>
            {(data.open_requests ?? []).length === 0 ? (
              <p className="text-xs text-navy-500">None</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.open_requests.map((r) => (
                  <li key={r.id}>
                    <Link className="font-medium text-brand-700 hover:underline" to={`/broker/policies/requests/${r.id}`}>
                      {r.reference}
                    </Link>
                    <span className="ml-2 text-xs text-navy-600">{r.status.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel space-y-2 p-4">
            <h2 className="text-sm font-semibold text-navy-900">Related claims</h2>
            {(data.related_claims ?? []).length === 0 ? (
              <p className="text-xs text-navy-500">None</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.related_claims.map((c) => (
                  <li key={c.id}>
                    <Link className="font-medium text-brand-700 hover:underline" to={`/broker/claims/${c.id}`}>
                      {c.reference}
                    </Link>
                    <span className="ml-2 text-xs text-navy-600">{c.status.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel space-y-2 p-4">
            <h2 className="text-sm font-semibold text-navy-900">Policy history</h2>
            <ul className="space-y-2 text-xs text-navy-700">
              {(data.versions ?? []).map((v) => (
                <li key={v.id} className="rounded-lg border border-navy-800/10 px-2 py-1.5">
                  <span className="font-semibold">v{v.version_no}</span> · effective {new Date(v.effective_at).toLocaleString()}
                  {v.superseded_at ? ` · to ${new Date(v.superseded_at).toLocaleString()}` : ' · current'}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </Page>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-navy-900">{value}</dd>
    </div>
  )
}
