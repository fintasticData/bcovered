import { useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SystemsFocus, SystemsTab } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const TABS: Array<{ key: SystemsTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'database', label: 'Database' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'backend', label: 'Backend & APIs' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'agents', label: 'Agents & copilots' },
  { key: 'workflows', label: 'Workflows & jobs' },
  { key: 'audit', label: 'Audit' },
]

export const tabPath = (tab: SystemsTab) => (tab === 'overview' ? '/broker/systems' : `/broker/systems/${tab}`)

export function focusHref(f: Omit<SystemsFocus, 'label'>): string {
  const params = new URLSearchParams()
  if (f.view) params.set('view', f.view)
  if (f.domain) params.set('domain', f.domain)
  if (f.item) params.set('item', f.item)
  const qs = params.toString()
  return `${tabPath(f.tab)}${qs ? `?${qs}` : ''}`
}

/** The item the Copilot (or a link) put in focus, scrolled into view once it renders. */
export function useFocusedItem(): [string | null, (item: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const item = params.get('item')
  useEffect(() => {
    if (!item) return
    const t = window.setTimeout(() => {
      document.querySelector(`[data-item="${CSS.escape(item)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [item])
  const set = (next: string | null) => {
    const p = new URLSearchParams(params)
    if (next) p.set('item', next)
    else p.delete('item')
    setParams(p, { replace: true })
  }
  return [item, set]
}

export const focusRing = (active: boolean) => (active ? 'ring-2 ring-brand-500 ring-offset-2' : '')

const COMPONENT_TONE = { live: 'success', simulated: 'accent', planned: 'neutral', not_configured: 'warning' } as const
const COMPONENT_LABEL = { live: 'Live', simulated: 'Simulated', planned: 'Planned', not_configured: 'Not configured' } as const

export function ComponentStatus({ status }: { status: keyof typeof COMPONENT_TONE }) {
  return <Badge tone={COMPONENT_TONE[status]}>{COMPONENT_LABEL[status]}</Badge>
}

const TABLE_TONE = { new: 'info', reshaped: 'warning', carried: 'neutral' } as const

export function TableStatus({ status }: { status: keyof typeof TABLE_TONE }) {
  return <Badge tone={TABLE_TONE[status]}>{status === 'carried' ? 'Carried over' : status === 'new' ? 'New' : 'Reshaped'}</Badge>
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'warning' | 'danger' }) {
  return (
    <div className="rounded-xl border border-navy-800/10 bg-white p-3">
      <p className="text-[11px] font-medium text-navy-500">{label}</p>
      <p className={cn('mt-0.5 text-xl font-semibold text-navy-900', tone === 'warning' && 'text-amber-700', tone === 'danger' && 'text-red-700')}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-navy-600">{hint}</p>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{children}</h3>
      {action}
    </div>
  )
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition',
        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-800/10 bg-white text-navy-700 hover:border-brand-500',
      )}
    >
      {children}
    </button>
  )
}

export const hasParams = (route: string) => route.includes(':')
