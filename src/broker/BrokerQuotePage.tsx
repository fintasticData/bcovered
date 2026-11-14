import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useQuote } from '@/api/hooks'
import { CompareWithAi } from '@/components/CompareWithAi'
import { QuoteComparisonTable } from '@/components/QuoteComparisonTable'
import { SimulatedBadge, SimulationNotice } from '@/components/SimulatedBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { describeVehicle, formatMotorField } from '@/server/domain/motor'
import { ErrorState, LoadingState, PageHeader } from './PageHeader'

export default function BrokerQuotePage() {
  const { quoteId } = useParams()
  const { data, isLoading, error } = useQuote(quoteId)
  const [highlight, setHighlight] = useState<string | null>(null)

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Quote not found'} /></div>
  const { quote, options, customer } = data
  const v = quote.risk_summary.vehicle ?? {}
  const pendingApproval = data.approvals.find((a) => a.status === 'pending')

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {data.lead && (
        <Link to={`/broker/leads/${data.lead.id}`} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Lead for {customer.full_name}
        </Link>
      )}
      <PageHeader
        title={`${customer.full_name} · ${describeVehicle(v)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={quote.status} /> <SimulatedBadge /> {formatMotorField('cover_type', v)} · value{' '}
            {formatMotorField('value', v)}
          </span>
        }
        actions={
          <>
            {pendingApproval && (
              <Button variant="accent" asChild>
                <Link to="/broker/approvals">Review approval</Link>
              </Button>
            )}
            {data.job_id && (
              <Button variant="outline" asChild>
                <Link to={`/broker/jobs/${data.job_id}`}>View agent job</Link>
              </Button>
            )}
          </>
        }
      />
      <SimulationNotice className="mb-5" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <section className="panel p-5">
          <QuoteComparisonTable options={options} comparison={quote.proposal?.comparison} highlight={highlight} />
        </section>
        <div className="space-y-5">
          <CompareWithAi quoteId={quote.id} onHighlight={(label) => setHighlight(options.find((o) => o.option_label === label)?.id ?? null)} />
          {quote.proposal && (
            <section className="panel p-4">
              <h3 className="text-sm font-semibold text-navy-900">Russ summary</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-700">{quote.proposal.broker_summary}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
