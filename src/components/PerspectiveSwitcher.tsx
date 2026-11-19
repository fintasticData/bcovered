import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Eye } from 'lucide-react'
import { perspectiveStore, usePerspective, type WorkspacePerspective } from '@/lib/perspective'
import { cn } from '@/lib/utils'

type MenuPlacement = 'below' | 'above' | 'aside'

/** Presentation-only Preview as control. Does not grant permissions. */
export function PerspectiveSwitcher({
  compact = false,
  dark = false,
  menuPlacement = 'below',
  fullWidth = false,
}: {
  compact?: boolean
  dark?: boolean
  menuPlacement?: MenuPlacement
  fullWidth?: boolean
}) {
  const perspective = usePerspective()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (p: WorkspacePerspective) => {
    perspectiveStore.set(p)
    setOpen(false)
    if (p === 'customer') navigate('/my')
    if (p === 'broker' || p === 'manager') navigate('/broker/book')
  }

  return (
    <div className={cn('relative', fullWidth && 'w-full')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold',
          fullWidth ? 'w-full max-w-none' : compact ? 'max-w-[11rem] sm:max-w-[14rem] xl:max-w-[15rem]' : 'max-w-[11rem] sm:max-w-[14rem]',
          dark
            ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
            : 'border-navy-800/15 bg-white text-navy-800 hover:border-navy-800/40',
        )}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Preview as: {perspectiveStore.label(perspective)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'panel z-50 w-56 p-2 shadow-xl animate-rise',
            menuPlacement === 'aside' ? 'absolute bottom-0 left-full ml-2' : menuPlacement === 'above' ? 'absolute bottom-full left-0 mb-2' : 'absolute top-10 right-0',
          )}
        >
          <p className="px-2 pb-2 text-[11px] leading-snug text-navy-600">
            Changes presentation only. Access stays limited by your role and Demo / Production.
          </p>
          {perspectiveStore.all.map((p) => (
            <button
              key={p}
              type="button"
              role="menuitem"
              onClick={() => choose(p)}
              className={cn(
                'flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-xs font-semibold',
                p === perspective ? 'bg-brand-50 text-brand-800' : 'text-navy-800 hover:bg-navy-50',
              )}
            >
              {perspectiveStore.label(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
