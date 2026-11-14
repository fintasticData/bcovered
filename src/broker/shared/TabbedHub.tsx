import { createContext, useContext, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface HubTab {
  to: string
  label: string
}

export interface Hub {
  label: string
  tabs: HubTab[]
}

export const CONTROLS_HUB: Hub = {
  label: 'Controls',
  tabs: [
    { to: '/broker/controls/imports', label: 'Imports' },
    { to: '/broker/controls/reconciliations', label: 'Reconciliations' },
    { to: '/broker/controls/exceptions', label: 'Financial exceptions' },
  ],
}

export const SETTINGS_HUB: Hub = {
  label: 'Brokerage settings',
  tabs: [
    { to: '/broker/settings/team', label: 'Team' },
    { to: '/broker/settings/insurers', label: 'Insurer access' },
    { to: '/broker/imports/client-book', label: 'Client-book import' },
  ],
}

export const LIFE_POLICIES_HUB: Hub = {
  label: 'Life policies',
  tabs: [
    { to: '/broker/life/policies', label: 'Policies' },
    { to: '/broker/life/servicing', label: 'Servicing' },
  ],
}

const HubContext = createContext<Hub | null>(null)

export const useHub = () => useContext(HubContext)

/** Groups sibling list screens under one heading; the screen's PageHeader renders the hub label and tabs. */
export function TabbedHub({ hub, children }: { hub: Hub; children: ReactNode }) {
  return <HubContext.Provider value={hub}>{children}</HubContext.Provider>
}

export function HubTabs({ hub }: { hub: Hub }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label={`${hub.label} sections`} className="scroll-x mt-4 flex gap-1 border-b border-navy-800/10">
      {hub.tabs.map((t) => {
        const active = pathname === t.to
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition',
              active ? 'border-brand-500 text-navy-900' : 'border-transparent text-navy-600 hover:text-navy-900',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
