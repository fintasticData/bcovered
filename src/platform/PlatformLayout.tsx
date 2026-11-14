import { Suspense } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Building2, ClipboardList, ExternalLink, Loader2, MailPlus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMe } from '@/api/hooks'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { cn } from '@/lib/utils'
import { PLATFORM_ROLE_LABEL } from '@/server/onboarding/config'
import { LoadingState } from '@/broker/PageHeader'

const NAV = [
  { to: '/platform/onboarding', label: 'Onboarding queue', icon: ClipboardList },
  { to: '/platform/brokerages', label: 'Brokerages', icon: Building2 },
  { to: '/platform/invitations', label: 'Invite a brokerage', icon: MailPlus },
]

/** B-Covered staff only. The service layer checks the platform role on every call as well. */
export default function PlatformLayout() {
  const { data: me, isLoading } = useMe()
  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-mist">
        <Loader2 className="h-6 w-6 animate-spin text-navy-600" />
      </div>
    )
  }
  if (!me?.platform_role) {
    return (
      <div className="grid min-h-dvh place-items-center bg-mist p-6">
        <div className="panel max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-semibold text-navy-900">Platform administration needs a B-Covered staff role</h1>
          <p className="mt-2 text-sm text-navy-600">Choose Nomvula Khoza (platform administrator) or Pieter Botha (onboarding reviewer) in the demo switcher.</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <RoleSwitcher align="left" />
            <Link to="/" className="text-xs font-semibold text-brand-600 underline">Back to the public site</Link>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-dvh bg-mist text-navy-900">
      <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 text-navy-100 lg:flex" aria-label="Platform navigation">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-400 text-navy-900">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-white">B-Covered platform</span>
            <span className="block text-[11px] text-navy-300">{PLATFORM_ROLE_LABEL[me.platform_role]}</span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white')}>
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-2 py-3">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
            <ExternalLink className="h-4 w-4" /> Public site
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-navy-800/10 bg-white px-3 sm:px-5">
          <nav className="flex gap-1 lg:hidden" aria-label="Platform sections">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('rounded-lg px-2 py-1.5 text-xs font-semibold', isActive ? 'bg-navy-800 text-white' : 'text-navy-700')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <p className="hidden text-xs text-navy-600 lg:block">
            <strong className="text-navy-800">Platform staff access is explicit and audited.</strong> You see onboarding records only, never a brokerage’s clients or policies.
          </p>
          <RoleSwitcher compact />
        </header>
        <main className="scroll-area flex-1">
          <Suspense fallback={<div className="p-6"><LoadingState /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
