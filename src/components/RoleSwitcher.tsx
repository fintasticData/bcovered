import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, LogOut, UserCircle2 } from 'lucide-react'
import { session } from '@/api/client'
import { useIdentities, useMe, useSignOut } from '@/api/hooks'
import { supabaseAuth } from '@/lib/supabase/client'
import { PLATFORM_ROLE_LABEL, ROLE_LABEL } from '@/server/onboarding/config'
import { humanise } from './StatusBadge'
import { cn } from '@/lib/utils'

type MenuPlacement = 'below' | 'above' | 'aside'

export function RoleSwitcher({
  dark = false,
  align = 'right',
  compact = false,
  menuPlacement = 'below',
  fullWidth = false,
}: {
  dark?: boolean
  align?: 'left' | 'right'
  compact?: boolean
  menuPlacement?: MenuPlacement
  fullWidth?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: identities = [] } = useIdentities()
  const { data: me } = useMe()
  const signOut = useSignOut()
  const navigate = useNavigate()

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (userId: string | null, home: string) => {
    session.set(userId)
    setOpen(false)
    navigate(home)
  }

  const leave = () => {
    setOpen(false)
    signOut.mutate(undefined, {
      onSuccess: () => {
        void supabaseAuth.signOut().catch(() => undefined)
        navigate('/')
      },
    })
  }

  const roleLabel = me?.platform_role ? PLATFORM_ROLE_LABEL[me.platform_role] : me?.member_role ? ROLE_LABEL[me.member_role] : me ? humanise(me.role) : ''
  const current = me ? `${me.full_name} · ${roleLabel}` : 'Public visitor'

  return (
    <div className={cn('relative', fullWidth && 'w-full')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition sm:py-1.5',
          fullWidth ? 'w-full max-w-none' : compact ? 'max-w-[11rem] xl:max-w-[15rem]' : 'max-w-[11rem] sm:max-w-[15rem]',
          dark ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' : 'border-navy-800/15 bg-white text-navy-800 hover:border-navy-800/40',
        )}
      >
        <UserCircle2 className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          <span className={cn('opacity-60', fullWidth ? 'inline' : compact ? 'hidden xl:inline' : 'hidden sm:inline')}>Signed in as </span>
          {current}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'panel z-50 max-h-[70dvh] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-2 shadow-xl animate-rise',
            menuPlacement === 'aside' ? 'absolute bottom-0 left-full ml-2' : menuPlacement === 'above' ? 'absolute bottom-full left-0 mb-2' : 'absolute top-11',
            menuPlacement === 'below' && (align === 'right' ? 'right-0' : 'left-0'),
          )}
        >
          <p className="px-2 pb-2 pt-1 text-[11px] leading-snug text-navy-600">
            Switch identity for the MVP. Client zone → Johan. Broker zone → Thabo.
          </p>
          {me && (
            <button
              role="menuitem"
              type="button"
              onClick={leave}
              disabled={signOut.isPending}
              className="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-navy-800/10 bg-navy-50 px-2 py-2.5 text-left text-sm font-semibold text-navy-900 hover:bg-navy-100"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          )}
          {identities.map((i, idx) => {
            const active = (me?.id ?? null) === i.user_id
            const heading = idx === 0 || identities[idx - 1].group !== i.group
            return (
              <div key={i.user_id ?? 'visitor'}>
                {heading && <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-navy-500 uppercase">{i.group}</p>}
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => choose(i.user_id, i.home)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-navy-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-navy-900">{i.full_name}</span>
                    <span className="block text-[11px] text-navy-600">{i.description}</span>
                  </span>
                  {active && <Check className="h-4 w-4 text-brand-500" />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
