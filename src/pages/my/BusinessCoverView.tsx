import { Link } from 'react-router-dom'
import { Building2, MessageSquare, Sparkles } from 'lucide-react'
import { useMe, usePortalBusiness } from '@/api/hooks'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/broker/PageHeader'

/** Lightweight business-client desk aligned to the bakery mockup — SAMPLE-aware. */
export function BusinessCoverView({ onAskRuss }: { onAskRuss?: () => void }) {
  const { data: me } = useMe()
  const { data, isLoading, error } = usePortalBusiness()
  const first = (me?.full_name ?? 'there').split(' ')[0]

  if (isLoading) return <LoadingState label="Loading business cover…" />
  if (error) {
    return (
      <div className="panel space-y-3 p-5 text-sm text-navy-700">
        <p className="font-semibold text-navy-900">Business cover preview</p>
        <p className="text-xs text-navy-600">{error.message}</p>
        <p className="text-xs text-navy-600">Personal customers without a business profile see My items & cover instead. Quote path still applies: SAMPLE or Manual — Live disabled.</p>
        <Button size="sm" variant="outline" asChild>
          <Link to="/portal/business">Open business portal</Link>
        </Button>
      </div>
    )
  }
  if (!data) return <ErrorState message="Could not load business cover" />

  const name = data.profile.trading_name ?? data.profile.registered_name ?? 'Your business'
  const attention = data.open_requests.length
  const assets = data.assets.length
  const locations = data.locations.length

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy-900">Welcome back, {first}.</p>
            <p className="text-xs text-navy-600">
              {name}
              {attention > 0 ? ` · ${attention} request${attention === 1 ? '' : 's'} need attention.` : ` · ${locations} location${locations === 1 ? '' : 's'}, ${assets} asset${assets === 1 ? '' : 's'}.`}{' '}
              <SimulatedBadge />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="accent" asChild>
            <Link to="/portal/business">Review equipment</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onAskRuss}>
            <MessageSquare /> Ask Russ
          </Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Locations</p>
          <p className="mt-1 text-lg font-semibold text-navy-900">{locations}</p>
        </div>
        <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Assets</p>
          <p className="mt-1 text-lg font-semibold text-navy-900">{assets}</p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50/50 px-3 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Needs attention</p>
          <p className="mt-1 text-lg font-semibold text-navy-900">{attention}</p>
        </div>
      </div>

      <div className="panel space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Building2 className="h-4 w-4 text-brand-700" /> Assets & cover
        </div>
        <p className="text-xs text-navy-600">
          Confirm replacement values before requesting quotes. Missing values stay blank — never shown as R0. Quote path: SAMPLE (fixed or Russ / fal) or Manual — Live insurer APIs disabled.
        </p>
        <ul className="space-y-2">
          {data.assets.slice(0, 6).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-sm">
              <span className="font-medium text-navy-900">{a.description || a.asset_class.replace(/_/g, ' ')}</span>
              <span className="text-xs text-navy-600">
                {a.declared_value != null ? `R${Number(a.declared_value).toLocaleString('en-ZA')} · ${a.value_basis.replace(/_/g, ' ')}` : 'Value not set'} · Not yet confirmed cover
              </span>
            </li>
          ))}
          {data.assets.length === 0 && <li className="text-xs text-navy-600">No assets listed yet. Open the business portal to review the twin.</li>}
        </ul>
        <Button size="sm" variant="outline" asChild>
          <Link to="/portal/business/risk-profile">Review risk profile</Link>
        </Button>
      </div>
    </div>
  )
}
