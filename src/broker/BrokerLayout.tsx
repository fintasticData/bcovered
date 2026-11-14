import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, ChevronUp, CircleHelp, ExternalLink, FlaskConical, LifeBuoy, Menu, Newspaper, ShieldAlert, Sparkles, X } from 'lucide-react'
import { useApprovals, useMe } from '@/api/hooks'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { isFeatureOn } from '@/lib/features'
import { cn } from '@/lib/utils'
import { LoadingState } from './PageHeader'
import { MARKET_ACTIVE, MARKET_DOT, MARKET_LABEL, NAV, TERM_LABEL, TERM_STYLE, itemMatches, type NavSection, type Term } from './navConfig'

const COLLAPSED_KEY = 'bc.nav.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) !== '0'
  } catch {
    return true
  }
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  const { data: me } = useMe()
  const org = me?.organisation
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-white">InsureFlow AI</span>
          <span className="block truncate text-[11px] text-navy-300">{org ? `${org.name}${org.is_demo ? ' · demo' : ''}` : 'BCovered · demo tenant'}</span>
        </span>
      )}
    </span>
  )
}

function useVisibleSections(): NavSection[] {
  const { data: me } = useMe()
  const allowed = (roles?: string[]) => !roles || Boolean(me?.role && roles.includes(me.role))
  return NAV.filter((s) => allowed(s.roles) && (!s.feature || isFeatureOn(s.feature)))
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(i.roles) && (!i.feature || isFeatureOn(i.feature))) }))
    .filter((s) => s.items.length > 0)
}

function NavLinks({ collapsed, pending }: { collapsed: boolean; pending: number }) {
  const { pathname } = useLocation()
  const blocks: Array<{ term?: Term; sections: NavSection[] }> = []
  for (const s of useVisibleSections()) {
    const last = blocks[blocks.length - 1]
    if (s.term && last?.term === s.term) last.sections.push(s)
    else blocks.push({ term: s.term, sections: [s] })
  }

  return (
    <nav className="scroll-area flex-1 px-2 py-3" aria-label="Broker sections">
      {blocks.map((block, bi) => (
        <div key={block.term ?? block.sections[0].id} className={cn(bi > 0 && 'mt-3')}>
          {block.term &&
            (collapsed ? (
              <div className={cn('mx-auto mb-1.5 h-0.5 w-7 rounded-full', TERM_STYLE[block.term].rail)} title={TERM_LABEL[block.term]} aria-hidden />
            ) : (
              <p className={cn('px-3 pb-0.5 text-[10px] font-bold tracking-[0.18em] uppercase', TERM_STYLE[block.term].heading)}>{TERM_LABEL[block.term]}</p>
            ))}
          <div className={cn('relative space-y-1', block.term && 'pl-1.5')}>
            {block.term && <span className={cn('absolute top-0 bottom-0 left-0 w-0.5 rounded-full opacity-70', TERM_STYLE[block.term].rail)} aria-hidden />}
            {block.sections.map((section) => (
              <div key={section.id} className="space-y-1">
                {section.label &&
                  !collapsed &&
                  (section.market ? (
                    <p className="flex items-center gap-1.5 px-3 pt-1 text-[10px] font-semibold text-navy-300">
                      <span className={cn('h-1.5 w-1.5 rounded-full', MARKET_DOT[section.market])} aria-hidden />
                      {section.label}
                    </p>
                  ) : (
                    <p className="px-3 pb-0.5 text-[10px] font-bold tracking-[0.18em] text-navy-300 uppercase">{section.label}</p>
                  ))}
                {section.label && !section.term && collapsed && <div className="mx-3 mb-1.5 border-t border-white/10" aria-hidden />}
                {section.items.map((n) => {
                  const active = itemMatches(n, pathname)
                  const line = section.term && section.market ? ` · ${TERM_LABEL[section.term]} · ${MARKET_LABEL[section.market]}` : ''
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      aria-current={active ? 'page' : undefined}
                      aria-label={collapsed ? n.label : undefined}
                      title={collapsed ? `${n.label}${line}` : line ? line.slice(3) : undefined}
                      className={cn(
                        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2',
                        collapsed && 'justify-center px-0',
                        active ? (section.market ? MARKET_ACTIVE[section.market] : 'bg-white/10 text-white') : 'text-navy-200 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <span className="relative">
                        <n.icon className="h-4 w-4 shrink-0" />
                        {collapsed && section.market && (
                          <span className={cn('absolute -top-1 -right-1.5 h-1.5 w-1.5 rounded-full ring-2 ring-navy-900', MARKET_DOT[section.market])} aria-hidden />
                        )}
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                      {n.badge && pending > 0 && (
                        <span className={cn('rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-navy-900', collapsed && 'absolute top-0.5 right-1')}>{pending}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

const HELP_LINKS = [
  { to: '/demo', label: 'Demo Studio', icon: FlaskConical },
  { to: '/help', label: 'Help and capabilities', icon: CircleHelp },
  { to: '/updates', label: 'System updates', icon: Newspaper },
  { to: '/', label: 'Public site', icon: ExternalLink },
]

function HelpMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={collapsed ? 'Help and demo' : undefined}
        title={collapsed ? 'Help and demo' : undefined}
        className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0')}
      >
        <LifeBuoy className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">Help &amp; demo</span>}
        {!collapsed && <ChevronUp className={cn('h-4 w-4 transition', !open && 'rotate-180')} />}
      </button>
      {open && (
        <div role="menu" className={cn('absolute z-50 w-56 rounded-xl border border-white/10 bg-navy-800 p-1.5 shadow-2xl', collapsed ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2')}>
          {HELP_LINKS.map((l) => (
            <Link key={l.to} to={l.to} role="menuitem" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-100 hover:bg-white/10 hover:text-white">
              <l.icon className="h-4 w-4 shrink-0" /> {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/** Shown instead of the workspace while a brokerage is onboarding, suspended or closed. The service layer refuses the data too. */
function NotActive({ status, reason }: { status: string; reason: string | null }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-mist p-6">
      <div className="panel max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold text-navy-900">{status === 'onboarding' ? 'Your brokerage is not active yet' : status === 'suspended' ? 'This brokerage is suspended' : 'This brokerage is closed'}</h1>
        <p className="mt-2 text-sm text-navy-600">
          {status === 'onboarding'
            ? 'Finish onboarding and wait for B-Covered to approve and activate your workspace. Submitting an application does not give production access.'
            : `Operational records, quoting and imports are unavailable. Your records are kept. ${reason ? `Reason: ${reason}` : ''}`}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          {status === 'onboarding' && (
            <>
              <Link to="/broker/book" className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
                Open My workspace (Sample)
              </Link>
              <Link to="/onboarding" className="text-sm font-semibold text-brand-600 underline">
                Continue onboarding
              </Link>
            </>
          )}
          <WorkspaceSwitcher />
          <RoleSwitcher align="left" />
        </div>
      </div>
    </div>
  )
}

/** Before activation a brokerage still works in Sample: its sales book and the copilots read only Sample records. */
const SAMPLE_BEFORE_ACTIVATION = ['/broker/book', '/broker/workspace', '/broker/routes']

export default function BrokerLayout() {
  const { data: me } = useMe()
  const { pathname } = useLocation()
  const org = me?.organisation
  const sampleOnly = org?.lifecycle_status === 'onboarding' && SAMPLE_BEFORE_ACTIVATION.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (me?.member_role && org && org.lifecycle_status !== 'active' && !sampleOnly) return <NotActive status={org.lifecycle_status} reason={org.status_reason} />
  return <ActiveBrokerLayout />
}

function ActiveBrokerLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)
  const { pathname, search } = useLocation()
  const { data: pending = [] } = useApprovals(['pending'])
  const business = pathname.startsWith('/broker/commercial') || (pathname === '/broker/workspace' && new URLSearchParams(search).get('lens') === 'commercial')

  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // storage unavailable (private mode); the choice lasts for this visit only
    }
  }, [collapsed])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <div className="flex h-dvh bg-mist text-navy-900">
      <aside
        className={cn('hidden shrink-0 flex-col border-r border-navy-800/10 bg-navy-900 text-navy-100 transition-[width] lg:flex', collapsed ? 'w-16' : 'w-60')}
        aria-label="Broker navigation"
      >
        <div className={cn('flex h-14 items-center', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Brand collapsed={collapsed} />
        </div>
        <NavLinks collapsed={collapsed} pending={pending.length} />
        <div className="space-y-1 border-t border-white/10 px-2 py-3">
          <HelpMenu collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-300 hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : undefined}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Broker navigation">
          <button type="button" className="absolute inset-0 cursor-pointer bg-navy-900/50" onClick={() => setDrawer(false)} aria-label="Close navigation" />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-navy-900 text-navy-100 shadow-2xl animate-rise">
            <div className="flex h-14 items-center justify-between gap-2 px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-navy-200 hover:bg-white/10"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks collapsed={false} pending={pending.length} />
            <div className="space-y-1 border-t border-white/10 px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <HelpMenu collapsed={false} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-navy-800/10 bg-white px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-navy-800/10 text-navy-800"
              aria-label="Open navigation"
              aria-expanded={drawer}
            >
              <Menu className="h-5 w-5" />
              {pending.length > 0 && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" aria-hidden />}
            </button>
            <span className="truncate text-sm font-semibold text-navy-900">InsureFlow AI</span>
          </div>
          <DataSourceBadge />
          <div className="flex items-center gap-2">
            <WorkspaceSwitcher />
            <RoleSwitcher />
          </div>
        </header>
        <main className="scroll-area flex-1" data-identity={business ? 'business' : undefined}>
          <Suspense fallback={<div className="p-6"><LoadingState /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
