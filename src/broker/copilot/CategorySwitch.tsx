import { FlaskConical, Radio } from 'lucide-react'
import { useCopilotHealth } from '@/copilot/api'
import { dataCategory, useDataCategory, type DataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** Sample / Live: every copilot job, search and record screen is scoped to the chosen category by the database. */
export function CategorySwitch({ onChange }: { onChange?: (next: DataCategory) => void }) {
  const category = useDataCategory()
  const auth = useSupabaseAuth()
  const { data: health } = useCopilotHealth()
  const liveReason =
    auth.status === 'unconfigured' ? 'Live is not configured: this build has no Supabase connection.'
    : auth.status !== 'signed_in' ? 'Live needs a brokerage staff sign-in.'
    : health && !health.live.available ? `Live is not available: ${health.live.reason ?? 'not configured'}`
    : null
  const choose = (next: DataCategory) => {
    if (next === category) return
    dataCategory.set(next)
    onChange?.(next)
  }
  const item = (value: DataCategory, label: string, Icon: typeof Radio, disabled: string | null) => (
    <button
      type="button"
      role="radio"
      aria-checked={category === value}
      disabled={Boolean(disabled)}
      title={disabled ?? (value === 'live' ? 'Real client records' : 'Synthetic demo records')}
      onClick={() => choose(value)}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        category === value ? (value === 'live' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-amber-500 text-white shadow-sm') : 'text-navy-600 hover:text-navy-900',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  )
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Record category" className="inline-flex gap-0.5 rounded-xl bg-navy-100/70 p-0.5">
        {item('sample', 'Sample', FlaskConical, null)}
        {item('live', 'Live', Radio, category === 'live' ? null : liveReason)}
      </div>
      {liveReason && <span className="hidden text-[11px] text-navy-500 xl:inline">Live: not configured</span>}
    </div>
  )
}
