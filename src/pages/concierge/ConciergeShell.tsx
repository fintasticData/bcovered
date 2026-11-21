import { Outlet, useLocation } from 'react-router-dom'
import { usePortalCategory } from '@/pages/my/CustomerLayout'

/** Thin Concierge content wrapper — My Page chrome lives in CustomerLayout. */
export function ConciergeShell({ children }: { children?: React.ReactNode }) {
  const { pathname } = useLocation()
  const category = usePortalCategory()
  const isDemo = pathname.startsWith('/demo/my') || category === 'sample'

  return (
    <div className="container-x py-6 sm:py-8">
      {children ?? <Outlet />}
      {isDemo && <p className="mt-6 text-right text-[11px] text-navy-400">Demo Concierge</p>}
    </div>
  )
}
