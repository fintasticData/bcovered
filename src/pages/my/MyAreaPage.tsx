import { useEffect, useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useMe } from '@/api/hooks'
import { useHasBusinessPage } from '@/api/businessPage'
import { LoadingState } from '@/broker/PageHeader'
import { useCustomerPage } from '@/api/customerPage'
import { YourPageView } from '@/pages/your-page/YourPageView'
import { usePortalBasePath, usePortalCategory, usePortalConciergeEnabled } from '@/pages/my/CustomerLayout'

/** Customer My Page — items-first cover desk. Staff are redirected to Customer Area. */
export default function MyAreaPage() {
  const { data: me, isLoading } = useMe()
  const [, setWorkingOn] = useState<string | null>(null)
  const category = usePortalCategory()
  const basePath = usePortalBasePath()
  const conciergeEnabled = usePortalConciergeEnabled()
  const { hash } = useLocation()
  const [, setParams] = useSearchParams()
  const isRealCustomer = me?.role === 'customer'
  const isStaff =
    Boolean(me?.member_role) ||
    ['broker', 'manager', 'admin', 'platform_admin'].includes(me?.role ?? '') ||
    Boolean(me?.organisation)
  const customerPage = useCustomerPage(isRealCustomer ? undefined : null, category)
  const hasBusiness = useHasBusinessPage()
  const businessTo = basePath === '/demo/my' ? '/demo/my/business' : '/my/business'

  const goComms = (thread: 'ava' | 'concierge') => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', 'comms')
        next.set('thread', thread)
        next.delete('claimId')
        next.delete('quoteRequestId')
        return next
      },
      { replace: false },
    )
  }

  useEffect(() => {
    if (!conciergeEnabled) return
    if (hash === '#vip-concierge-chat' || hash === '#vip-concierge') {
      goComms('concierge')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, conciergeEnabled, customerPage.data])

  const openAva = (ctx?: { itemIds?: string[]; label: string }) => {
    if (ctx?.label) setWorkingOn(ctx.label)
    goComms('ava')
  }

  const openConciergeChat = (_mode: 'message' | 'callback' = 'message') => {
    goComms('concierge')
  }

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoadingState label="Opening My Page…" />
      </div>
    )
  }

  if (isStaff && !isRealCustomer) {
    return <Navigate to="/broker/customers" replace />
  }

  // Business-only contacts: no personal cover book — open My Business Page (its own area), not empty My Page.
  const personalMissing =
    !customerPage.isLoading &&
    !customerPage.isFetching &&
    !customerPage.data &&
    (customerPage.error == null ||
      /not found|not linked|no person|profile/i.test(customerPage.error.message))
  if (personalMissing && hasBusiness.data === true) {
    return <Navigate to={businessTo} replace />
  }

  return (
    <div className="min-h-[60vh]">
      <div className="grid grid-cols-1 gap-4 py-4">
        <aside className="space-y-4" aria-label="Your page">
          <YourPageView
            dto={customerPage.data}
            mode="customer"
            loading={customerPage.isLoading || hasBusiness.isLoading}
            error={customerPage.error?.message}
            onAskAva={openAva}
            onWorkingOn={setWorkingOn}
            onRefresh={() => void customerPage.refetch()}
            conciergeEnabled={conciergeEnabled}
            onMessageConcierge={() => openConciergeChat('message')}
            basePath={basePath}
            category={category}
            hideDeskTabs
          />
        </aside>
      </div>
    </div>
  )
}
