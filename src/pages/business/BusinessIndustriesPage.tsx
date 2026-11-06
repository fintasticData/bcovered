import { Link } from 'react-router-dom'
import { ArrowRight, FileText, ShieldQuestion } from 'lucide-react'
import { useIndustries } from '@/api/hooks'
import { AdviceNotice } from '@/components/commercial/badges'
import { coverLabel } from '@/server/domain/commercial/coverClasses'
import { LoadingState } from '@/broker/PageHeader'
import { BusinessSubnav } from './BusinessSubnav'

export default function BusinessIndustriesPage() {
  const { data: industries, isLoading } = useIndustries()

  return (
    <>
      <BusinessSubnav />
      <div className="container-x py-12">
        <p className="eyebrow">Industry intelligence</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-navy-900">{industries?.length ?? 14} industry risk templates</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/70">
          Each template is a starting point: typical activities, assets, potential insurance classes and the documents a broker usually needs.
          The Business Discovery Agent adapts its questions to your specific business rather than asking everything.
        </p>
        <AdviceNotice className="mt-4 max-w-3xl">
          Templates are not automatic recommendations. Whether an exposure is insurable, and on what terms, is for a licensed broker and the
          insurer to determine.
        </AdviceNotice>

        {isLoading && <LoadingState />}
        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {industries?.map((t) => (
            <article key={t.key} id={t.key} className="card scroll-mt-28 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-navy-900">{t.name}</h2>
                  <p className="mt-1 text-sm text-ink/70">{t.summary}</p>
                </div>
                <span className="shrink-0 rounded-md bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-600">v{t.version}</span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Typical assets</h3>
                  <ul className="mt-1 space-y-0.5 text-sm text-navy-800">
                    {t.typical_assets.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Potential insurance classes</h3>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.potential_classes.map((c) => (
                      <span key={c} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
                        {coverLabel(c)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                    <FileText className="h-3 w-3" /> Documents a broker may request
                  </h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
                    {t.documents.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                    <ShieldQuestion className="h-3 w-3" /> Coverage considerations
                  </h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
                    {t.coverage_considerations.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/business/risk-review" className="btn-primary">
            Start a business risk review <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  )
}
