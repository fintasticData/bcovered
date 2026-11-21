import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Eye, FlaskConical, Layers, UserCircle2 } from 'lucide-react'
import { PerspectiveSwitcher } from '@/components/PerspectiveSwitcher'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { CATEGORY_LABEL, useDataCategory } from '@/lib/supabase/category'
import { useMe } from '@/api/hooks'
import { cn } from '@/lib/utils'
import { CategorySwitch } from './copilot/CategorySwitch'

function ContextControls({ menuPlacement }: { menuPlacement: 'above' | 'aside' }) {
  const category = useDataCategory()
  const { data: me } = useMe()
  const org = me?.organisation
  const mode = CATEGORY_LABEL[category]

  return (
    <div className="space-y-3">
      <div>
        <p className="px-1 pb-1.5 text-[10px] font-bold tracking-[0.16em] text-navy-400 uppercase">Workspace</p>
        <CategorySwitch variant="sidebar" />
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-navy-400">
          {mode} view{org ? ` · ${org.name}` : ''}. Records never mix between Demo and Production.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-navy-400">
          <Building2 className="h-3 w-3" /> Brokerage
        </p>
        <WorkspaceSwitcher dark menuPlacement={menuPlacement} fullWidth />
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-navy-400">
          <UserCircle2 className="h-3 w-3" /> Signed in as
        </p>
        <RoleSwitcher dark menuPlacement={menuPlacement} fullWidth />
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-navy-400">
          <Eye className="h-3 w-3" /> Staff view
        </p>
        <PerspectiveSwitcher dark menuPlacement={menuPlacement} fullWidth />
      </div>

      <Link
        to="/demo"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-navy-300 hover:bg-white/5 hover:text-white"
      >
        <FlaskConical className="h-3.5 w-3.5 shrink-0" /> Open Demo Studio
      </Link>
    </div>
  )
}

/** Side-menu access to Demo/Production, brokerage, identity and preview lens. */
export function WorkspaceContextPanel({ collapsed }: { collapsed: boolean }) {
  const category = useDataCategory()
  const mode = CATEGORY_LABEL[category]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (collapsed) {
    return (
      <div className="relative border-t border-white/10 px-2 py-3" ref={ref} aria-label="Workspace context">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={`${mode} · workspace context`}
          className={cn(
            'mx-auto grid h-9 w-9 cursor-pointer place-items-center rounded-lg transition',
            category === 'live' ? 'bg-emerald-600/90 text-white hover:bg-emerald-500' : 'bg-amber-500/90 text-white hover:bg-amber-400',
          )}
        >
          <Layers className="h-4 w-4" />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="Workspace context"
            className="absolute bottom-0 left-full z-50 ml-2 w-64 rounded-xl border border-white/10 bg-navy-900 p-3 text-navy-100 shadow-2xl animate-rise"
          >
            <ContextControls menuPlacement="aside" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border-t border-white/10 px-2 py-3" aria-label="Workspace context">
      <ContextControls menuPlacement="above" />
    </div>
  )
}
