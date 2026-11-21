import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '../PageHeader'
import { QuoteFlowPanel } from './QuoteFlowPanel'

/** Structured SAMPLE / Manual quote entry. Live insurer APIs are listed but disabled. */
export default function SampleMotorQuotePage() {
  const [params] = useSearchParams()
  const personId = params.get('person')

  return (
    <div className="mx-auto max-w-7xl scroll-mt-4 p-4 sm:p-6">
      <Link to={personId ? `/broker/customers/people/${personId}?rtab=quotes` : '/broker/customers'} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> {personId ? 'Customer quotes' : 'My workspace'}
      </Link>
      <PageHeader
        title="Private motor quotes"
        description="Choose Sample (fixed or Russ / fal AI), Manual capture, or Live (disabled). SAMPLE figures are never binding cover."
      />
      <QuoteFlowPanel personId={personId} />
    </div>
  )
}
