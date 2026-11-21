import { createContext, useContext, useMemo } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Building2, ShieldCheck } from 'lucide-react'
import { useHasBusinessPage } from '@/api/businessPage'
import { useMe } from '@/api/hooks'
import { useConciergeHome } from '@/api/concierge'
import { isSampleBookPortalEmail, toSamplePortalPath } from '@/lib/demo/samplePortal'
import type { DataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { FintasticNewsBar } from '@/fintastic-ux'
import { deskTabClass } from '@/pages/your-page/deskTabStyles'

const PortalCategoryContext = createContext<DataCategory>('live')
const ConciergeEnabledContext = createContext(false)
/** True when CustomerLayout owns the desk tab strip (customer portal). */
const LayoutOwnsTabsContext = createContext(false)

/** Category pinned by route: /demo/my → sample, /my* → live. */
export function usePortalCategory(): DataCategory {
  return useContext(PortalCategoryContext)
}

/** Base path for My Page links: `/demo/my` or `/my`. */
export function usePortalBasePath(): '/demo/my' | '/my' {
  const { pathname } = useLocation()
  return pathname.startsWith('/demo/my') ? '/demo/my' : '/my'
}

/** True when concierge_customer_home.enabled for this customer + category. */
export function usePortalConciergeEnabled(): boolean {
  return useContext(ConciergeEnabledContext)
}

/** True when Cover desk chrome owns desk tabs (hide in-page DeskShell tabs). */
export function useLayoutOwnsTabs(): boolean {
  return useContext(LayoutOwnsTabsContext)
}

function portalNavClass({ isActive }: { isActive: boolean }) {
  return deskTabClass(isActive)
}

type DeskNavItem = { to: string; label: string; active: boolean; end?: boolean }

/**
 * One Cover desk for personal and business accounts:
 * account switcher + shared desk tabs (no separate business sidebar).
 */
export default function CustomerLayout() {
  const { pathname, hash } = useLocation()
  const [params] = useSearchParams()
  const { data: me } = useMe()
  const isDemo = pathname.startsWith('/demo/my')
  const category: DataCategory = isDemo ? 'sample' : 'live'
  const sampleOnly = isSampleBookPortalEmail(me?.email)
  const first = (me?.full_name ?? 'there').split(' ')[0]
  const concierge = useConciergeHome({
    categoryOverride: category,
    enabled: me?.role === 'customer' && (isDemo || !sampleOnly),
    authEmail: me?.email,
  })
  const vipEnabled = Boolean(concierge.data?.enabled)

  const coverTo = isDemo ? '/demo/my' : '/my'
  const businessTo = isDemo ? '/demo/my/business' : '/my/business'
  const onBusiness = pathname === businessTo || pathname.startsWith(`${businessTo}/`)

  const deskTab = params.get('tab')
  const onRisk = onBusiness && pathname.startsWith(`${businessTo}/risk-profile`)

  const personalTabs: DeskNavItem[] = [
    {
      to: coverTo,
      label: 'Cover',
      active:
        !onBusiness &&
        deskTab !== 'values' &&
        deskTab !== 'quotes' &&
        deskTab !== 'claims' &&
        deskTab !== 'comms' &&
        hash !== '#vip-concierge' &&
        (pathname === coverTo || pathname === `${coverTo}/`),
      end: true,
    },
    {
      to: `${coverTo}?tab=values`,
      label: 'Values & payments',
      active: !onBusiness && deskTab === 'values',
    },
    {
      to: `${coverTo}?tab=quotes`,
      label: 'Quotes',
      active: !onBusiness && (deskTab === 'quotes' || pathname.endsWith('/quotes')),
    },
    {
      to: `${coverTo}?tab=claims`,
      label: 'Claims',
      active: !onBusiness && (deskTab === 'claims' || pathname.includes('/claims')),
    },
    {
      to: `${coverTo}?tab=comms`,
      label: 'Comms',
      active: !onBusiness && deskTab === 'comms' && params.get('thread') !== 'concierge',
    },
  ]
  if (vipEnabled) {
    personalTabs.push({
      to: `${coverTo}?tab=comms&thread=concierge`,
      label: 'Concierge',
      active:
        !onBusiness &&
        (pathname.includes('/concierge') ||
          (pathname === coverTo && hash === '#vip-concierge') ||
          (deskTab === 'comms' && params.get('thread') === 'concierge')),
    })
  }

  const businessTabs: DeskNavItem[] = [
    {
      to: businessTo,
      label: 'Overview',
      active: onBusiness && !onRisk && (deskTab == null || deskTab === '' || deskTab === 'overview'),
      end: true,
    },
    {
      to: `${businessTo}?tab=assets`,
      label: 'Assets & cover',
      active: onBusiness && !onRisk && deskTab === 'assets',
    },
    {
      to: `${businessTo}?tab=values`,
      label: 'Values & payments',
      active: onBusiness && !onRisk && deskTab === 'values',
    },
    {
      to: `${businessTo}?tab=requests`,
      label: 'Requests',
      active: onBusiness && !onRisk && deskTab === 'requests',
    },
    {
      to: `${businessTo}/risk-profile`,
      label: 'Risk profile',
      active: onRisk,
    },
  ]

  const deskTabs = onBusiness ? businessTabs : personalTabs

  const hasBusiness = useHasBusinessPage()
  const showBusinessSwitcher = hasBusiness.data === true || onBusiness

  const categoryValue = useMemo(() => category, [category])

  if (!isDemo && sampleOnly) {
    return <Navigate to={toSamplePortalPath(pathname)} replace />
  }

  return (
    <PortalCategoryContext.Provider value={categoryValue}>
      <ConciergeEnabledContext.Provider value={vipEnabled}>
        <LayoutOwnsTabsContext.Provider value={true}>
          <div
            className={cn(
              'min-h-[70vh]',
              onBusiness
                ? 'bg-[radial-gradient(ellipse_at_top,_#e8f0f7_0%,_#f5f7fa_45%,_#eef2f6_100%)]'
                : 'bg-[radial-gradient(ellipse_at_top,_#eef7f6_0%,_#faf7f2_42%,_#f5f7fa_100%)]',
            )}
          >
            {isDemo && <FintasticNewsBar />}
            <div className="border-b border-navy-800/10 bg-white/95">
              <div className="desk-x flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'grid h-9 w-9 place-items-center rounded-lg',
                        onBusiness ? 'bg-navy-100 text-navy-800' : 'bg-brand-50 text-brand-800',
                      )}
                    >
                      {onBusiness ? <Building2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-[0.14em] text-navy-500 uppercase">My Cover</p>
                      <p className="truncate text-sm font-semibold text-navy-950">
                        {onBusiness ? 'Business' : first}
                        <span
                          className={cn(
                            'ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            isDemo ? 'bg-violet-100 text-violet-950' : 'bg-emerald-100 text-emerald-900',
                          )}
                        >
                          {isDemo ? 'Demo' : 'Live'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {showBusinessSwitcher && (
                      <div
                        className="inline-flex rounded-lg border border-navy-800/15 bg-white p-0.5"
                        role="group"
                        aria-label="Cover account"
                      >
                        <Link
                          to={coverTo}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                            !onBusiness
                              ? 'bg-navy-900 text-white'
                              : 'text-navy-700 hover:bg-mist hover:text-navy-900',
                          )}
                          aria-current={!onBusiness ? 'page' : undefined}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                          Personal
                        </Link>
                        <Link
                          to={businessTo}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                            onBusiness
                              ? 'bg-navy-900 text-white'
                              : 'text-navy-700 hover:bg-mist hover:text-navy-900',
                          )}
                          aria-current={onBusiness ? 'page' : undefined}
                        >
                          <Building2 className="h-3.5 w-3.5" aria-hidden />
                          Business
                        </Link>
                      </div>
                    )}
                    {isDemo ? (
                      sampleOnly ? null : (
                        <Link to="/my" className="font-semibold text-brand-700 hover:underline">
                          Back to live cover
                        </Link>
                      )
                    ) : (
                      <Link to="/demo/my" className="font-semibold text-violet-800 hover:underline">
                        View demo records
                      </Link>
                    )}
                  </div>
                </div>

                <nav
                  className="scroll-x -mx-1 flex flex-nowrap items-center gap-1 px-1 pb-0.5 sm:flex-wrap sm:overflow-visible"
                  aria-label={onBusiness ? 'Business desk' : 'Personal desk'}
                >
                  {deskTabs.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={() => cn(portalNavClass({ isActive: item.active }), 'shrink-0 touch-manipulation')}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>
            <div className="desk-x">
              <Outlet />
            </div>
          </div>
        </LayoutOwnsTabsContext.Provider>
      </ConciergeEnabledContext.Provider>
    </PortalCategoryContext.Provider>
  )
}
