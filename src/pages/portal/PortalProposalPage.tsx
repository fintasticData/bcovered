import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Info, Plus, RefreshCw } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useMe, usePortalProposal } from '@/api/hooks'
import { CompareWithAi } from '@/components/CompareWithAi'
import { QuoteComparisonTable } from '@/components/QuoteComparisonTable'
import { SimulatedBadge, SimulationNotice } from '@/components/SimulatedBadge'
import { Button } from '@/components/ui/button'
import { fetchOrganisationMedia } from '@/lib/supabase/organisations'
import { describeVehicle, formatMotorField } from '@/server/domain/motor'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { isSampleBookPortalEmail } from '@/lib/demo/samplePortal'

export default function PortalProposalPage() {
  const { quoteId } = useParams()
  const { data, isLoading, error, refetch, isFetching } = usePortalProposal(quoteId)
  const { data: me } = useMe()
  const basePath = isSampleBookPortalEmail(me?.email) ? '/demo/my' : '/my'
  const quotesPath = `${basePath}/quotes`
  const [highlight, setHighlight] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(me?.organisation?.logo_url ?? null)

  useEffect(() => {
    setLogoUrl(me?.organisation?.logo_url ?? null)
    const id = me?.organisation?.id
    if (!id) return
    let cancelled = false
    void fetchOrganisationMedia(id).then((media) => {
      if (!cancelled && media?.logo_url) setLogoUrl(media.logo_url)
    })
    return () => {
      cancelled = true
    }
  }, [me?.organisation?.id, me?.organisation?.logo_url])

  if (isLoading) {
    return (
      <div className="container-x py-10">
        <LoadingState label="Loading proposal…" />
      </div>
    )
  }

  const missing =
    !data &&
    (error instanceof ApiError
      ? error.code === 'not_found' || error.status === 404
      : Boolean(error) || !quoteId)

  if (missing) {
    return (
      <div className="container-x py-10">
        <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-navy-800/10 bg-white p-6 text-center">
          <h1 className="font-display text-xl font-bold text-navy-900">That quote is no longer available</h1>
          <p className="text-sm text-navy-600">
            The proposal may have expired or never been released. Your requests stay on My quotes.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button size="sm" variant="accent" asChild>
              <Link to={quotesPath}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back to My quotes
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`${quotesPath}?getQuote=1`}>
                <Plus className="h-3.5 w-3.5" /> Get a quote
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="container-x space-y-4 py-10">
        <ErrorState message={error?.message ?? 'Could not load this proposal'} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="accent" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={quotesPath}>Back to My quotes</Link>
          </Button>
        </div>
      </div>
    )
  }

  const v = data.quote.risk_summary.vehicle ?? {}
  const brokerageName = me?.organisation?.name

  return (
    <div className="bg-mist">
      <div className="container-x py-10">
        <Link to={quotesPath} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          <ArrowLeft className="h-3.5 w-3.5" /> My quotes
        </Link>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-navy-800/10" />}
          {brokerageName && <p className="text-sm font-semibold text-navy-700">{brokerageName}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold text-navy-900">Your motor comparison</h1>
          <SimulatedBadge />
        </div>
        <p className="mt-2 text-sm text-navy-600">
          {describeVehicle(v)} · {formatMotorField('value', v)} · {formatMotorField('cover_type', v)}. Reviewed and
          released by your broker.
        </p>
        <SimulationNotice className="mt-5" />

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
          <section className="panel p-5">
            <QuoteComparisonTable
              options={data.options}
              comparison={data.quote.proposal?.comparison}
              highlight={highlight}
            />
          </section>
          <div className="space-y-5">
            <CompareWithAi
              quoteId={data.quote.id}
              onHighlight={(label) =>
                setHighlight(data.options.find((o) => o.option_label === label)?.id ?? null)
              }
            />
            {data.quote.proposal && (
              <section className="panel p-4">
                <h2 className="text-sm font-semibold text-navy-900">Key differences</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-navy-700">
                  {data.quote.proposal.comparison.trade_offs.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="panel flex gap-3 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <p className="text-xs leading-relaxed text-navy-700">
                Choosing cover is a decision to make with your broker, who will confirm suitability, disclosures and the
                insurer’s actual terms. These demo options cannot be accepted online.{' '}
                <Link to="/contact" className="font-semibold text-brand-600 underline">
                  Contact your broker
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
