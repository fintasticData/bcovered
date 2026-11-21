import { Link, useParams } from 'react-router-dom'
import { useBusinessPagePreview } from '@/api/businessPage'
import { LoadingState, ErrorState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'
import { BusinessPageView } from '@/pages/your-page/BusinessPageView'

/** Broker-side preview of My Business Page for a commercial profile. */
export default function BusinessPagePreviewPage() {
  const { profileId } = useParams<{ profileId: string }>()
  const page = useBusinessPagePreview(profileId)

  if (page.isLoading) {
    return (
      <div className="desk-x py-8">
        <LoadingState label="Loading business page preview…" />
      </div>
    )
  }

  if (page.error || !page.data) {
    return (
      <div className="desk-x space-y-4 py-8">
        <ErrorState message={page.error?.message ?? 'Business not found'} />
        <Button size="sm" variant="outline" asChild>
          <Link to={profileId ? `/broker/customers/businesses/${profileId}` : '/broker/customers?tab=businesses'}>
            Back to business record
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] bg-[radial-gradient(ellipse_at_top,_#eef7f6_0%,_#faf7f2_42%,_#f5f7fa_100%)]">
      <div className="border-b border-navy-800/10 bg-white/95">
        <div className="desk-x flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-navy-500 uppercase">Broker preview</p>
            <p className="text-sm font-semibold text-navy-950">{page.data.trading_name}</p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/customers/businesses/${page.data.profile_id}`}>Back to record</Link>
          </Button>
        </div>
      </div>
      <div className="desk-x py-4">
        <BusinessPageView
          dto={page.data}
          mode="preview"
          loading={false}
          basePath={`/broker/customers/businesses/${page.data.profile_id}/business-page`}
        />
      </div>
    </div>
  )
}
