import { Link } from 'react-router-dom'
import { ArrowRight, Plus, Sparkles } from 'lucide-react'
import type { PersonalProductKey } from '@/api/client'
import { usePersonalLines } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { products } from '@/data/products'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { lensPath } from '../russ/lenses'
import { Page, Stat, zar } from '../shared/ui'
import { ShortTermPolicyTable } from './PolicyTable'

const PRODUCT = new Map(products.map((p) => [p.slug, p]))

export default function PersonalLinesPage() {
  const { data, isLoading, error } = usePersonalLines()
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load personal lines'} /></div>
  const awaiting = data.products.reduce((s, p) => s + p.quotes_awaiting_approval, 0)

  return (
    <Page>
      <PageHeader
        title="Personal lines"
        description="Short-term cover for people and households: the same five products as the public site, with the leads, quotes and policies behind each."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to={lensPath('general')}>
                <Sparkles /> Ask Russ
              </Link>
            </Button>
            <Button variant="accent" size="sm" asChild>
              <Link to="/broker/quotes/sample-motor">
                <Plus /> New motor quote
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open personal leads" value={data.open_leads} />
        <Stat label="Quotes awaiting approval" value={awaiting} tone={awaiting ? 'warning' : undefined} />
        <Stat label="Active policies" value={data.active_policies} />
        <Stat label="Monthly premium on the book" value={zar(data.monthly_premium)} hint="Monthly and quarterly policies, as recorded" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {data.products.map((p) => {
          const product = PRODUCT.get(p.key)
          const Icon = product?.icon
          return (
            <div key={p.key} className="panel flex flex-col p-4">
              <div className="flex items-center gap-2">
                {Icon && (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-personal-50 text-personal-600">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy-900">{product?.name ?? p.key}</p>
                  <p className="line-clamp-2 text-[11px] text-navy-500">{product?.short}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-navy-500">Open leads</dt>
                  <dd className="text-base font-semibold text-navy-900">{p.open_leads}</dd>
                </div>
                <div>
                  <dt className="text-navy-500">Quotes</dt>
                  <dd className="text-base font-semibold text-navy-900">
                    {p.quotes}
                    {p.quotes_awaiting_approval > 0 && <span className="ml-1 text-[11px] font-medium text-amber-700">{p.quotes_awaiting_approval} to approve</span>}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs font-semibold">
                <Link to={productLeads(p.key)} aria-label={`${product?.name ?? p.key} leads`} className="inline-flex items-center gap-1 text-brand-600">
                  Leads <ArrowRight className="h-3 w-3" />
                </Link>
                {p.key === 'car' ? (
                  <Link to="/broker/quotes/sample-motor" aria-label="New car quote" className="text-brand-600">
                    New quote
                  </Link>
                ) : (
                  <span className="font-normal text-navy-500" title="Only private motor has a quote comparison in this demo">
                    Quote form only
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {data.other_open_leads > 0 && (
        <p className="text-xs text-navy-600">
          {data.other_open_leads} open personal lead{data.other_open_leads === 1 ? '' : 's'} with another product.{' '}
          <Link to="/broker/leads?market=personal" className="font-semibold text-brand-600">
            All personal leads
          </Link>
        </p>
      )}

      <ShortTermPolicyTable rows={data.policies} title="Personal policies" />
    </Page>
  )
}

const productLeads = (key: PersonalProductKey) => `/broker/leads?product=${key}`
