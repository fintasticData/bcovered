import { Link } from 'react-router-dom'
import { usePortalLife } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { formatDate } from '@/lib/utils'
import { LoadingState } from '@/broker/PageHeader'
import { SourceBadge, zar } from '@/broker/shared/ui'

export default function PortalLifePage() {
  const { data, isLoading, error } = usePortalLife()
  return (
    <div className="container-x space-y-6 py-10">
      <div>
        <Link to="/portal" className="text-xs font-semibold text-brand-600">
          ← My portal
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-navy-900">My life cover</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-600">
          Your individual life policies as B-Covered records them. Insurer updates are labelled separately from our own notes. Contact your adviser to change beneficiaries.
        </p>
      </div>
      {isLoading && <LoadingState />}
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {data && !data.policies.length && <p className="panel p-6 text-sm text-navy-600">No life policies are recorded for you yet.</p>}
      {data?.policies.map((p) => (
        <article key={p.policy.id} className="panel space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-navy-900">
              {p.provider} {p.policy.policy_number ?? ''}
            </h2>
            <StatusBadge status={p.policy.status} />
          </div>
          <p className="text-sm text-navy-700">
            {zar(p.policy.premium_amount)} per month {p.policy.inception_date && `· since ${formatDate(p.policy.inception_date)}`}
          </p>
          <ul className="text-sm text-navy-800">
            {p.benefits.map((b) => (
              <li key={b.id}>
                {humanise(b.benefit_type_key)}: {zar(b.sum_assured ?? b.monthly_benefit)}
                {b.monthly_benefit ? ' per month' : ''}
              </li>
            ))}
          </ul>
          <div className="text-sm">
            <p className="text-xs font-semibold text-navy-600">Beneficiaries</p>
            {p.beneficiaries.length ? (
              p.beneficiaries.map((b) => (
                <p key={b.name}>
                  {b.name} · {b.share_pct}%
                </p>
              ))
            ) : (
              <p className="text-amber-800">None nominated. Ask your adviser to add one.</p>
            )}
          </div>
          <div className="grid gap-2 text-xs text-navy-700 sm:grid-cols-2">
            {p.last_insurer_update && (
              <p className="flex items-center gap-1.5">
                <SourceBadge source="insurer" /> {humanise(p.last_insurer_update.status)} · {formatDate(p.last_insurer_update.occurred_at)}
              </p>
            )}
            {p.last_broker_update && (
              <p className="flex items-center gap-1.5">
                <SourceBadge source="broker" /> {humanise(p.last_broker_update.status)} · {formatDate(p.last_broker_update.occurred_at)}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
