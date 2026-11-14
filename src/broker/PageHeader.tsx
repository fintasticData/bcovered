import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MARKET_DOT, TERM_STYLE, lineForPath, lineLabel, type Market, type Term } from './navConfig'
import { HubTabs, useHub } from './shared/TabbedHub'

type Line = { term: Term; market: Market }

/** Which insurance line a screen belongs to: term colour and market dot, always with its text label. */
export function LineChip({ line, className }: { line: Line; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold', TERM_STYLE[line.term].chip, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', MARKET_DOT[line.market])} aria-hidden />
      {lineLabel(line)}
    </span>
  )
}

/** Screen title. The line chip comes from the route unless `line` is given (null hides it). */
export function PageHeader({ title, description, actions, line }: { title: string; description?: ReactNode; actions?: ReactNode; line?: Line | null }) {
  const { pathname } = useLocation()
  const hub = useHub()
  const chip = line === undefined ? lineForPath(pathname) : line
  return (
    <div className="mb-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          {(hub || chip) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {hub && <span className="text-[11px] font-semibold tracking-[0.14em] text-navy-500 uppercase">{hub.label}</span>}
              {chip && <LineChip line={chip} />}
            </div>
          )}
          <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-navy-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {hub && <HubTabs hub={hub} />}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-navy-600" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="panel flex items-start gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel border-dashed p-8 text-center">
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {children && <div className="mt-1 text-xs text-navy-600">{children}</div>}
    </div>
  )
}
