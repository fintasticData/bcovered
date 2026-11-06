import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, UserCircle2 } from 'lucide-react'
import { session } from '@/api/client'
import { useIdentities, useMe } from '@/api/hooks'
import { humanise } from './StatusBadge'
import { cn } from '@/lib/utils'

const HOME: Record<string, string> = { visitor: '/', customer: '/portal', broker: '/broker', manager: '/broker', admin: '/broker' }

export function RoleSwitcher({ dark = false, align = 'right' }: { dark?: boolean; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: identities = [] } = useIdentities()
  const { data: me } = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (userId: string | null, role: string) => {
    session.set(userId)
    setOpen(false)
    navigate(HOME[role] ?? '/')
  }

  const current = me ? `${me.full_name} · ${humanise(me.role)}` : 'Public visitor'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex max-w-[11rem] cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition sm:max-w-[15rem] sm:py-1.5',
          dark ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' : 'border-navy-800/15 bg-white text-navy-800 hover:border-navy-800/40',
        )}
      >
        <UserCircle2 className="h-4 w-4 shrink-0" />
        <span className="truncate">
          <span className="hidden opacity-60 sm:inline">Demo as </span>
          {current}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'panel absolute top-11 z-50 max-h-[70dvh] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-2 shadow-xl animate-rise',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <p className="px-2 pb-2 pt-1 text-[11px] leading-snug text-navy-600">
            Seeded demo identities. No passwords or real credentials are used.
          </p>
          {identities.map((i) => {
            const active = (me?.id ?? null) === i.user_id
            return (
              <button
                key={i.user_id ?? 'visitor'}
                role="menuitem"
                type="button"
                onClick={() => choose(i.user_id, i.role)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-navy-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-navy-900">{i.full_name}</span>
                  <span className="block text-[11px] text-navy-600">{i.description}</span>
                </span>
                {active && <Check className="h-4 w-4 text-brand-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
