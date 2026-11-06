import { Link } from 'react-router-dom'
import { Network } from 'lucide-react'
import { useRiskTwins } from '@/api/hooks'
import { COVERAGE_LABEL } from '@/components/commercial/badges'
import { formatDateTime } from '@/lib/utils'
import type { CoverageStatus } from '@/server/db/commercialSchema'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'

const BAR: Record<CoverageStatus, string> = {
  awaiting_broker_review: 'bg-amber-400',
  unknown: 'bg-navy-300',
  potentially_covered: 'bg-sky-400',
  confirmed_covered: 'bg-emerald-500',
  confirmed_excluded: 'bg-red-500',
}

export default function RiskTwinsPage() {
  const { data, isLoading, error } = useRiskTwins()
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Risk Twins"
        description="The current structured model of each business: how its locations, assets, revenue and dependencies connect to potential exposures, with the coverage evidence status of each."
      />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}
      {data?.length === 0 && <EmptyState title="No Risk Twins yet">Ask the Commercial Copilot to review a business, or run the Restaurant Group scenario.</EmptyState>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((r) => (
          <Link key={r.risk_profile.id} to={`/broker/commercial/clients/${r.profile_id}`} className="panel block p-5 transition hover:border-brand-500/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Network className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-navy-900">{r.business_name}</p>
                  <p className="text-xs text-navy-600">
                    {r.industry_name} · v{r.risk_profile.version} · {r.risk_profile.node_count} records, {r.risk_profile.edge_count} relationships
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-navy-500">{formatDateTime(r.risk_profile.created_at)}</span>
            </div>
            <p className="mt-3 text-sm text-navy-800">
              {r.exposure_count} potential exposures · <strong>{r.high_priority_count} high advisory priority</strong>
            </p>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-navy-100" aria-hidden>
              {(Object.keys(r.coverage) as CoverageStatus[]).map((k) =>
                r.coverage[k] ? <div key={k} className={BAR[k]} style={{ width: `${(r.coverage[k] / Math.max(1, r.exposure_count)) * 100}%` }} /> : null,
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-navy-600">
              {(Object.keys(r.coverage) as CoverageStatus[])
                .filter((k) => r.coverage[k])
                .map((k) => `${r.coverage[k]} ${COVERAGE_LABEL[k].toLowerCase()}`)
                .join(' · ')}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
