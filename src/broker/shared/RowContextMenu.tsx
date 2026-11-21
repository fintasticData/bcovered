import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ContextMenuItem =
  | { type: 'separator'; id: string }
  | {
      type?: 'item'
      id: string
      label: string
      icon?: ComponentType<{ className?: string }>
      shortcut?: string
      disabled?: boolean
      disabledReason?: string
      danger?: boolean
      onSelect: () => void
    }

export type ContextMenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
} | null

const MENU_PAD = 8

function clampPosition(x: number, y: number, width: number, height: number) {
  const maxX = window.innerWidth - width - MENU_PAD
  const maxY = window.innerHeight - height - MENU_PAD
  return {
    x: Math.max(MENU_PAD, Math.min(x, maxX)),
    y: Math.max(MENU_PAD, Math.min(y, maxY)),
  }
}

export function RowContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [focusIdx, setFocusIdx] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const actionable = (state?.items ?? []).filter((i): i is Extract<ContextMenuItem, { onSelect: () => void }> => i.type !== 'separator')

  useLayoutEffect(() => {
    if (!state || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setPos(clampPosition(state.x, state.y, rect.width, rect.height))
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
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => (i + 1) % actionable.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => (i - 1 + actionable.length) % actionable.length)
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [state, onClose, actionable, focusIdx])

  if (!state || !state.items.length) return null

  let actionCursor = -1

  return createPortal(
    <div
      ref={menuRef}
      id={listId}
      role="menu"
      aria-label="Row actions"
      className="fixed z-[80] min-w-[14rem] max-w-[20rem] overflow-hidden rounded-lg border border-navy-800/10 bg-white py-1 shadow-xl shadow-navy-900/10"
      style={{ left: pos.x, top: pos.y }}
    >
      {state.items.map((item) => {
        if (item.type === 'separator') {
          return <div key={item.id} role="separator" className="my-1 h-px bg-navy-800/10" />
        }
        actionCursor += 1
        const idx = actionCursor
        const Icon = item.icon
        const focused = idx === focusIdx
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabled ? item.disabledReason : undefined}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
              item.disabled && 'cursor-not-allowed opacity-45',
              !item.disabled && focused && 'bg-mist',
              !item.disabled && !focused && 'hover:bg-mist',
              item.danger ? 'text-[#B91C1C]' : 'text-navy-900',
            )}
            onMouseEnter={() => setFocusIdx(idx)}
            onClick={() => {
              if (item.disabled) return
              onClose()
              item.onSelect()
            }}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden /> : <span className="w-4" />}
            <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
            {item.shortcut && <span className="text-[10px] font-semibold tracking-wide text-navy-400 uppercase">{item.shortcut}</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

/** Opens the shared menu from a button (⋯) for discoverability. */
export function RowActionsButton({
  items,
  onOpen,
  label = 'Actions',
  className,
}: {
  items: ContextMenuItem[]
  onOpen: (state: NonNullable<ContextMenuState>) => void
  label?: string
  className?: string
}) {
  if (!items.length) return null
  return (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-navy-700 ring-1 ring-navy-800/10 hover:bg-mist',
        className,
      )}
      aria-haspopup="menu"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onOpen({ x: r.left, y: r.bottom + 4, items })
      }}
    >
      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

/** Attach to a row: right-click + long-press (~500ms) for touch. */
export function useRowContextHandlers(
  getItems: () => ContextMenuItem[] | null | undefined,
  setMenu: (state: ContextMenuState) => void,
) {
  const pressTimer = useRef<number | null>(null)

  const openAt = useCallback(
    (x: number, y: number) => {
      const items = getItems()
      if (!items?.length) return false
      setMenu({ x, y, items })
      return true
    },
    [getItems, setMenu],
  )

  const onContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      const items = getItems()
      if (!items?.length) return
      e.preventDefault()
      e.stopPropagation()
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    [getItems, setMenu],
  )

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      const x = t.clientX
      const y = t.clientY
      pressTimer.current = window.setTimeout(() => {
        openAt(x, y)
      }, 500)
    },
    [openAt],
  )

  const clearPress = useCallback(() => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }, [])

  return {
    onContextMenu,
    onTouchStart,
    onTouchEnd: clearPress,
    onTouchMove: clearPress,
    onTouchCancel: clearPress,
  }
}

export function ContextMenuHost({
  menu,
  setMenu,
  children,
}: {
  menu: ContextMenuState
  setMenu: (s: ContextMenuState) => void
  children: ReactNode
}) {
  return (
    <>
      {children}
      <RowContextMenu state={menu} onClose={() => setMenu(null)} />
    </>
  )
}
