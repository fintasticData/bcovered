import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, ChevronDown, LogOut } from 'lucide-react'
import { useMe, useSignOut, useSwitchWorkspace } from '@/api/hooks'
import { StatusBadge } from './StatusBadge'
import { cn } from '@/lib/utils'

/** People in more than one brokerage switch explicitly; every query then runs in the chosen brokerage only. */
export function WorkspaceSwitcher({ dark = false }: { dark?: boolean }) {
  const { data: me } = useMe()
  const switcher = useSwitchWorkspace()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  if (!me || (!me.workspaces.length && !me.platform_role)) return null
  const active = me.workspaces.find((w) => w.active)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex max-w-[14rem] cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
          dark ? 'border-white/20 bg-white/10 text-white' : 'border-navy-800/15 bg-white text-navy-800 hover:border-navy-800/40',
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="truncate">{active?.name ?? (me.platform_role ? 'B-Covered platform' : 'Choose a brokerage')}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div role="menu" className="panel absolute top-10 right-0 z-50 w-72 p-2 shadow-xl animate-rise">
          <p className="px-2 pb-2 pt-1 text-[11px] text-navy-600">Workspaces you belong to. Switching changes which brokerage’s records you see.</p>
          {me.workspaces.map((w) => (
            <button
              key={w.organisation_id}
              type="button"
              role="menuitem"
              disabled={switcher.isPending}
              onClick={() =>
                switcher.mutate(w.organisation_id, {
                  onSuccess: () => {
                    setOpen(false)
                    navigate(w.lifecycle_status === 'active' ? '/broker' : '/onboarding')
                  },
                })
              }
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-navy-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy-900">{w.name}</span>
                <span className="block text-[11px] text-navy-600">{w.role_label}</span>
              </span>
              {w.lifecycle_status !== 'active' && <StatusBadge status={w.lifecycle_status} />}
              {w.active && <Check className="h-4 w-4 text-brand-500" />}
            </button>
          ))}
          {me.platform_role && (
            <button type="button" role="menuitem" onClick={() => navigate('/platform/onboarding')} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-navy-50">
              B-Covered platform administration
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/') })}
            className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg border-t border-navy-800/10 px-2 py-2 text-left text-sm text-navy-700 hover:bg-navy-50"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          {switcher.error && <p className="px-2 text-xs text-red-600">{switcher.error.message}</p>}
        </div>
      )}
    </div>
  )
}
