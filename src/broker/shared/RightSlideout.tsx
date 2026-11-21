import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type RightSlideoutSize = 'default' | 'wide' | 'record' | 'results'

/** Right slideout for task / Russ work and Customer Area records. */
export function RightSlideout({
  open,
  onClose,
  title,
  subtitle,
  demo,
  children,
  footer,
  wide,
  size,
  headerActions,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  demo?: boolean
  children: ReactNode
  /** Pass `null` to hide the footer entirely (record panels own their actions). */
  footer?: ReactNode | null
  /** @deprecated Prefer `size="wide"`. */
  wide?: boolean
  size?: RightSlideoutSize
  headerActions?: ReactNode
}) {
  const resolvedSize: RightSlideoutSize = size ?? (wide ? 'wide' : 'default')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-pointer bg-navy-900/40" aria-label="Close panel" onClick={onClose} />
      <aside
        className={cn(
          'relative flex h-full w-full min-w-0 flex-col border-l border-navy-800/15 bg-white shadow-xl',
          resolvedSize === 'default' && 'max-w-md',
          resolvedSize === 'wide' && 'max-w-lg',
          // Compact brief → expand for streamed results (Find providers, similar jobs)
          resolvedSize === 'results' && 'max-w-none sm:max-w-[min(36rem,94vw)] xl:max-w-[min(42rem,62vw)]',
          // Target Ladder–style record panel: full width on mobile, ~65vw capped on desktop
          resolvedSize === 'record' && 'max-w-none sm:max-w-[min(44rem,92vw)] xl:max-w-[min(52rem,70vw)]',
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-navy-800/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:pt-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-navy-900">{title}</h2>
              {demo && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-900 uppercase">
                  Demo
                </span>
              )}
            </div>
            {subtitle && <div className="mt-0.5 truncate text-xs text-navy-600">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <Button size="sm" variant="ghost" type="button" className="touch-manipulation" aria-label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="scroll-area min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3">{children}</div>
        {footer !== null && (
          <footer className="shrink-0 border-t border-navy-800/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer ?? (
              <Button className="w-full touch-manipulation" variant="accent" type="button" onClick={onClose}>
                Done
              </Button>
            )}
          </footer>
        )}
      </aside>
    </div>
  )
}
