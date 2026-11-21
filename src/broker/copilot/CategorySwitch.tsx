import { FlaskConical, Radio } from 'lucide-react'
import { useCopilotHealth } from '@/copilot/api'
import { CATEGORY_HINT, CATEGORY_LABEL, dataCategory, useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { lastDemoBrokerage } from '@/lib/supabase/demoBrokerage'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { useSwitchWorkspace } from '@/api/hooks'
import { cn } from '@/lib/utils'

/** Why Production (Live) cannot be selected right now, or null when it is available. */
export function useProductionBlockReason(): string | null {
  const category = useDataCategory()
  const auth = useSupabaseAuth()
  const { data: health } = useCopilotHealth()
  if (category === 'live') return null
  if (auth.status === 'unconfigured') return 'Production is not configured: this build has no Supabase connection.'
  if (auth.status !== 'signed_in') return 'Production needs a brokerage staff sign-in.'
  if (health && !health.live.available) return `Production is not available: ${health.live.reason ?? 'not configured'}`
  return null
}

type Variant = 'light' | 'dark' | 'sidebar'

/** Demo / Production: every copilot job, search and record screen is scoped to the chosen category by the database. */
export function CategorySwitch({
  onChange,
  variant = 'light',
  className,
}: {
  onChange?: (next: DataCategory) => void
  variant?: Variant
  className?: string
}) {
  const category = useDataCategory()
  const productionBlock = useProductionBlockReason()
  const switcher = useSwitchWorkspace()
  const choose = (next: DataCategory) => {
    if (next === category) return
    dataCategory.set(next)
    if (next === 'sample') {
      const last = lastDemoBrokerage.get()
      switcher.mutate(last.id)
    }
    onChange?.(next)
  }
  const dark = variant === 'dark' || variant === 'sidebar'
  const fullWidth = variant === 'sidebar'
  const item = (value: DataCategory, Icon: typeof Radio, disabled: string | null) => (
    <button
      type="button"
      role="radio"
      aria-checked={category === value}
      disabled={Boolean(disabled)}
      title={disabled ?? CATEGORY_HINT[value]}
      onClick={() => choose(value)}
      className={cn(
        'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'flex-1',
        category === value
          ? value === 'live'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'bg-amber-500 text-white shadow-sm'
          : dark
            ? 'text-navy-200 hover:text-white'
            : 'text-navy-600 hover:text-navy-900',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {CATEGORY_LABEL[value]}
    </button>
  )
  return (
    <div className={cn('flex flex-col gap-1', fullWidth && 'w-full', className)}>
      <div
        role="radiogroup"
        aria-label="Workspace mode"
        className={cn(
          'inline-flex gap-0.5 rounded-xl p-0.5',
          fullWidth && 'w-full',
          dark ? 'bg-white/10' : 'bg-navy-100/70',
        )}
      >
        {item('sample', FlaskConical, null)}
        {item('live', Radio, productionBlock)}
      </div>
      {productionBlock && (
        <span className={cn('text-[10px] leading-snug', dark ? 'text-navy-400' : 'hidden text-navy-500 xl:inline')}>
          {variant === 'sidebar' ? productionBlock : 'Production: not available'}
        </span>
      )}
    </div>
  )
}
