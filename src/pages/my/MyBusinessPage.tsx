import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useBusinessPage } from '@/api/businessPage'
import { useMe } from '@/api/hooks'
import { LoadingState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'
import { usePortalBasePath } from '@/pages/my/CustomerLayout'
import { BusinessPageView } from '@/pages/your-page/BusinessPageView'

/** Customer My Business Page — assets-first commercial desk. Staff redirect to Customer Area. */
export default function MyBusinessPage() {
  const { data: me, isLoading } = useMe()
  const [, setWorkingOn] = useState<string | null>(null)
  const portalBase = usePortalBasePath()
  const businessBase = portalBase === '/demo/my' ? '/demo/my/business' : '/my/business'
  const isRealCustomer = me?.role === 'customer'
  const isStaff =
    Boolean(me?.member_role) ||
    ['broker', 'manager', 'admin', 'platform_admin'].includes(me?.role ?? '') ||
    Boolean(me?.organisation)

  const page = useBusinessPage({
    enabled: isRealCustomer,
    basePath: businessBase,
  })

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoadingState label="Opening My Business Page…" />
      </div>
    )
  }

  if (isStaff && !isRealCustomer) {
    return <Navigate to="/broker/customers?tab=businesses" replace />
  }

  const notFound = page.error instanceof ApiError && page.error.code === 'not_found'

  return (
    <div className="min-h-[60vh]">
      <div className="grid grid-cols-1 gap-4 py-4">
        {notFound ? (
          <section className="rounded-2xl border border-navy-800/10 bg-white p-6 text-center">
            <h2 className="text-base font-semibold text-navy-900">No business linked yet</h2>
            <p className="mt-2 text-sm text-navy-600">
              Your personal cover stays on My Page. When your broker links a business profile, assets and locations
              appear here.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="accent" asChild>
                <Link to="/business/risk-review">Start a risk review</Link>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to={portalBase}>Back to Cover</Link>
              </Button>
            </div>
          </section>
        ) : (
          <BusinessPageView
            dto={page.data}
            mode="customer"
            loading={page.isLoading}
            error={page.error instanceof Error ? page.error.message : null}
            onAskRuss={(ctx) => {
              if (ctx?.label) setWorkingOn(ctx.label)
            }}
            onWorkingOn={setWorkingOn}
            basePath={businessBase}
            hideDeskTabs
          />
        )}
      </div>
    </div>
  )
}
