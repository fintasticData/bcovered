import { LayoutGrid, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LayoutView } from './useLayoutView'

export function ViewModeToggle({
  view,
  onChange,
  className,
  classicLabel = 'Classic',
  fintasticLabel = 'Fintastic',
}: {
  view: LayoutView
  onChange: (v: LayoutView) => void
  className?: string
  classicLabel?: string
  fintasticLabel?: string
}) {
  return (
    <div
      className={cn('inline-flex rounded-xl border border-navy-800/10 bg-navy-50/60 p-0.5', className)}
      role="group"
      aria-label="Layout view"
    >
      <button
        type="button"
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
          view === 'classic' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-800',
        )}
        aria-pressed={view === 'classic'}
        onClick={() => onChange('classic')}
      >
        <Rows3 className="h-3.5 w-3.5" aria-hidden />
        {classicLabel}
      </button>
      <button
        type="button"
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
          view === 'fintastic' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500 hover:text-navy-800',
        )}
        aria-pressed={view === 'fintastic'}
        onClick={() => onChange('fintastic')}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
        {fintasticLabel}
      </button>
    </div>
  )
}
