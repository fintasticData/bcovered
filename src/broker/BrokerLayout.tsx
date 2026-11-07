import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Briefcase,
  Building2,
  CheckSquare,
  Database,
  FileStack,
  ServerCog,
  Bot,
  Network,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Newspaper,
  ExternalLink,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Menu,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useApprovals, useMe } from '@/api/hooks'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { cn } from '@/lib/utils'
import { LoadingState } from './PageHeader'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  badge?: boolean
}

const NAV: Array<{ group: string | null; business?: boolean; roles?: string[]; items: NavItem[] }> = [
  {
    group: null,
    items: [
      { to: '/broker', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/broker/workspace', label: 'AI Workspace', icon: Sparkles },
      { to: '/broker/leads', label: 'Leads', icon: Users },
      { to: '/broker/approvals', label: 'Approvals', icon: CheckSquare, badge: true },
      { to: '/broker/jobs', label: 'Tasks & Jobs', icon: ListChecks },
    ],
  },
  {
    group: 'Commercial',
    business: true,
    items: [
      { to: '/broker/commercial', label: 'Commercial workspace', icon: Briefcase, end: true },
      { to: '/broker/commercial/clients', label: 'Business clients', icon: Building2 },
      { to: '/broker/commercial/risk-twins', label: 'Risk Twins', icon: Network },
      { to: '/broker/commercial/submissions', label: 'Submissions', icon: FileStack },
    ],
  },
  {
    group: 'Systems',
    roles: ['manager', 'admin'],
    items: [
      { to: '/broker/systems', label: 'Systems overview', icon: ServerCog, end: true },
      { to: '/broker/systems/database', label: 'Database & ERD', icon: Database },
      { to: '/broker/systems/agents', label: 'Agents & copilots', icon: Bot },
    ],
  },
]

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-white">InsureFlow AI</span>
          <span className="block truncate text-[11px] text-navy-300">BCovered · demo tenant</span>
        </span>
      )}
    </span>
  )
}

function NavLinks({ collapsed, pending }: { collapsed: boolean; pending: number }) {
  const { data: me } = useMe()
  const sections = NAV.filter((s) => !s.roles || (me?.role && s.roles.includes(me.role)))
  return (
    <nav className="scroll-area flex-1 space-y-1 px-2 py-3">
      {sections.map((section) => (
        <div key={section.group ?? 'main'} className={cn('space-y-1', section.group && 'pt-3')}>
          {section.group &&
            (collapsed ? (
              <div className="mx-3 border-t border-white/10" aria-hidden />
            ) : (
              <p className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-semibold tracking-[0.18em] text-navy-300 uppercase">
                {section.business && <span className="h-1.5 w-1.5 rounded-full bg-business-200" aria-hidden />}
                {section.group}
              </p>
            ))}
          {section.items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2',
                  isActive
                    ? section.business
                      ? 'bg-business-500/40 text-white'
                      : 'bg-white/10 text-white'
                    : 'text-navy-200 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <n.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
              {n.badge && pending > 0 && (
                <span className={cn('rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-navy-900', collapsed && 'absolute top-0.5 right-1')}>
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

function FooterLinks({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      <Link to="/demo" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
        <FlaskConical className="h-4 w-4 shrink-0" /> {!collapsed && 'Demo Studio'}
      </Link>
      <Link to="/help" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
        <CircleHelp className="h-4 w-4 shrink-0" /> {!collapsed && 'Help and capabilities'}
      </Link>
      <Link to="/updates" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
        <Newspaper className="h-4 w-4 shrink-0" /> {!collapsed && 'System updates'}
      </Link>
      <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
        <ExternalLink className="h-4 w-4 shrink-0" /> {!collapsed && 'Public site'}
      </Link>
    </>
  )
}

export default function BrokerLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const { data: pending = [] } = useApprovals(['pending'])

  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  return (
    <div className="flex h-dvh bg-mist text-navy-900">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-navy-800/10 bg-navy-900 text-navy-100 transition-[width] lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
        aria-label="Broker navigation"
      >
        <div className="flex h-14 items-center px-4">
          <Brand collapsed={collapsed} />
        </div>
        <NavLinks collapsed={collapsed} pending={pending.length} />
        <div className="space-y-1 border-t border-white/10 px-2 py-3">
          <FooterLinks collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-300 hover:bg-white/5 hover:text-white"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
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
              <FooterLinks collapsed={false} />
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
          <p className="hidden truncate text-xs text-navy-600 lg:block">
            <strong className="text-navy-800">Demo mode.</strong> Synthetic data in this browser. Agents and approvals run in the in-browser
            service layer.
          </p>
          <RoleSwitcher />
        </header>
        <main className="scroll-area flex-1" data-identity={pathname.startsWith('/broker/commercial') ? 'business' : undefined}>
          <Suspense fallback={<div className="p-6"><LoadingState /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
