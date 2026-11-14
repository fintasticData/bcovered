import { Building2, FlaskConical, Radio, Sparkles, UserRound } from 'lucide-react'
import type { CopilotId } from '@/copilot/api'
import { CATEGORY_LABEL, type DataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'

export const COPILOTS: Record<CopilotId, { name: string; role: string; icon: typeof Sparkles; tone: string; chip: string }> = {
  ar: { name: 'AR', role: 'Ava and Russ together: routes each part of a request', icon: Sparkles, tone: 'bg-navy-800 text-white', chip: 'border-navy-800/20 bg-navy-50 text-navy-800' },
  ava: { name: 'Ava', role: 'People: personal clients, motor, home, contents and individual life', icon: UserRound, tone: 'bg-personal-500 text-white', chip: 'border-personal-200 bg-personal-50 text-personal-700' },
  russ: { name: 'Russ', role: 'Business: business accounts, commercial cover and group schemes', icon: Building2, tone: 'bg-business-500 text-white', chip: 'border-business-200 bg-business-50 text-business-700' },
}

export function CopilotBadge({ id, className }: { id: CopilotId | 'ava' | 'russ'; className?: string }) {
  const c = COPILOTS[id]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold', c.chip, className)}>
      <c.icon className="h-3 w-3" aria-hidden /> {c.name}
    </span>
  )
}

export function CategoryBadge({ category, className }: { category: DataCategory; className?: string }) {
  const live = category === 'live'
  const Icon = live ? Radio : FlaskConical
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ring-1',
        live ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200',
        className,
      )}
      title={live ? 'Live record: real client data' : 'Sample record: synthetic demo data'}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden /> {CATEGORY_LABEL[category]}
    </span>
  )
}
