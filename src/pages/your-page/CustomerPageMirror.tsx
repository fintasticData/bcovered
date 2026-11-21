import { useState } from 'react'
import { useCustomerPage } from '@/api/customerPage'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { ReportClaimSlideout } from '@/pages/my/ReportClaimSlideout'
import { CustomerPageClaimsPanel } from '@/pages/your-page/CustomerPageClaimsPanel'
import { CustomerPageQuotesPanel } from '@/pages/your-page/CustomerPageQuotesPanel'
import { YourPageView } from '@/pages/your-page/YourPageView'
import type { DataCategory } from '@/lib/supabase/category'

/** Broker-side mirror of the customer_page book — same panels as My Page. */
export function CustomerPageMirror({
  personId,
  slice,
  category,
}: {
  personId: string
  slice: 'items' | 'values' | 'quotes' | 'claims'
  category?: DataCategory
}) {
  const page = useCustomerPage(personId, category)
  const [reportOpen, setReportOpen] = useState(false)

  if (page.isLoading) return <LoadingState label="Loading customer page…" />
  if (page.error || !page.data) {
    return <ErrorState message={page.error?.message ?? 'Customer page not available for this person yet.'} />
  }

  if (slice === 'items' || slice === 'values') {
    return (
      <div className="space-y-3 rounded-xl border border-navy-800/10 bg-navy-50/30 p-3">
        <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">As on My Page</p>
        <p className="text-xs text-navy-600">
          {slice === 'values'
            ? 'Same Values & payments desk the customer sees. Broker Financials above keeps Expected / Earned / Received / Outstanding.'
            : 'Same asset register the customer sees. Broker workbench remains above.'}
        </p>
        <YourPageView
          dto={page.data}
          mode={slice === 'values' ? 'preview' : 'customer'}
          loading={false}
          basePath={page.data.is_sample ? '/demo/my' : '/my'}
          category={page.data.data_category}
          deskLocked={slice === 'values' ? 'values' : 'items'}
          onRefresh={() => void page.refetch()}
        />
      </div>
    )
  }

  if (slice === 'quotes') {
    return (
      <CustomerPageQuotesPanel
        dto={page.data}
        mode="broker"
        category={page.data.data_category}
        compact
      />
    )
  }

  return (
    <>
      <ReportClaimSlideout
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        mode="broker"
        dto={page.data}
        category={page.data.data_category}
        target={{ personId: page.data.person_id }}
        onDone={() => void page.refetch()}
      />
      <CustomerPageClaimsPanel
        dto={page.data}
        mode="broker"
        basePath={page.data.is_sample ? '/demo/my' : '/my'}
        compact
        onReportClaim={() => setReportOpen(true)}
      />
    </>
  )
}
