import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCustomerPage } from '@/api/customerPage'
import { Button } from '@/components/ui/button'
import { YourPageView } from './YourPageView'

/** Broker read-only preview of a customer's Your page. */
export default function YourPagePreviewPage() {
  const { personId = '' } = useParams()
  const q = useCustomerPage(personId || null)

  return (
    <div className="bg-mist min-h-[60vh]">
      <div className="border-b border-navy-800/10 bg-white/80">
        <div className="container-x flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <Button size="sm" variant="ghost" className="-ml-2" asChild>
              <Link to={`/broker/customers/people/${personId}`}><ArrowLeft /> Customer record</Link>
            </Button>
            <h1 className="mt-1 font-display text-xl font-bold text-navy-900">Preview customer page</h1>
            <p className="text-xs text-navy-600">Same component the customer sees on Your page.</p>
          </div>
        </div>
      </div>
      <div className="container-x max-w-5xl py-6">
        <YourPageView
          dto={q.data}
          mode="preview"
          loading={q.isLoading}
          error={q.error?.message}
          onRefresh={() => void q.refetch()}
        />
      </div>
    </div>
  )
}
