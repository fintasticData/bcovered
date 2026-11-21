import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { ContextMenuItem, ContextMenuState } from '@/broker/shared/RowContextMenu'

const PAD = 8

function clamp(x: number, y: number, w: number, h: number) {
  return {
    x: Math.max(PAD, Math.min(x, window.innerWidth - w - PAD)),
    y: Math.max(PAD, Math.min(y, window.innerHeight - h - PAD)),
  }
}

/** Compact landscape credit-card action grid for Fintastic record rows. */
export function ActionCard({
  state,
  onClose,
}: {
  state: ContextMenuState
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [focusIdx, setFocusIdx] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const actionable =
    state?.items.filter((i): i is Extract<ContextMenuItem, { onSelect: () => void }> => i.type !== 'separator') ?? []

  useLayoutEffect(() => {
    if (!state || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(clamp(state.x, state.y, rect.width, rect.height))
    setFocusIdx(0)
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (!actionable.length) return
      const cols = Math.min(3, actionable.length)
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusIdx((i) => (i + 1) % actionable.length)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusIdx((i) => (i - 1 + actionable.length) % actionable.length)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => Math.min(actionable.length - 1, i + cols))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => Math.max(0, i - cols))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = actionable[focusIdx]
        if (item && !item.disabled) {
          onClose()
          item.onSelect()
        }
      }
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [state, onClose, actionable, focusIdx])

  if (!state || !actionable.length) return null

  return createPortal(
    <div
      ref={ref}
      id={listId}
      role="menu"
      aria-label="Record actions"
      className="fixed z-[80] w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-navy-800/15 bg-navy-900 p-2 shadow-xl shadow-navy-900/25"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="grid grid-cols-3 gap-1">
        {actionable.map((item, idx) => {
          const Icon = item.icon as ComponentType<{ className?: string }> | undefined
          const focused = idx === focusIdx
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : item.label}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition',
                item.disabled && 'cursor-not-allowed opacity-40',
                !item.disabled && focused && 'bg-brand-500/25 ring-1 ring-brand-200/60',
                !item.disabled && !focused && 'hover:bg-white/10',
                item.danger ? 'text-red-300' : 'text-white',
              )}
              onMouseEnter={() => setFocusIdx(idx)}
              onClick={() => {
                if (item.disabled) return
                onClose()
                item.onSelect()
              }}
            >
              {Icon ? <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden /> : <span className="h-5 w-5" />}
              <span className="line-clamp-2 text-[10px] leading-tight font-semibold tracking-wide">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
