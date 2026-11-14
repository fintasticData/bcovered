import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { MODULES, useSupabaseSync } from '@/lib/supabase/sync'
import { cn } from '@/lib/utils'

/** Where the broker area's records come from right now, and which category they are. */
export function DataSourceBadge() {
  const auth = useSupabaseAuth()
  const sync = useSupabaseSync()
  const category = useDataCategory()
  const onSupabase = auth.status === 'signed_in' && (sync.status === 'synced' || sync.status === 'hydrating' || sync.status === 'error')
  const label = onSupabase ? `Supabase · ${category === 'live' ? 'Live' : 'Sample'}${sync.status === 'hydrating' ? ' · loading' : sync.pending ? ` · saving ${sync.pending}` : ''}` : 'Browser only · synthetic data'
  const title = onSupabase
    ? `Modules on Supabase: ${sync.modules.map((m) => MODULES[m].label).join('; ')}. ${sync.rows} rows loaded${sync.syncedAt ? ` at ${new Date(sync.syncedAt).toLocaleTimeString()}` : ''}.${sync.lastError ? ` Last error: ${sync.lastError}` : ''} Onboarding and identity stay in this browser.`
    : auth.status === 'unconfigured'
      ? 'No Supabase connection in this build. Synthetic data in this browser only.'
      : 'Not signed in to Supabase. Choose a brokerage staff identity under “Demo as” to load records from the database.'
  return (
    <span
      className={cn(
        'hidden cursor-help rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 lg:inline-flex',
        !onSupabase ? 'bg-amber-50 text-amber-800 ring-amber-200' : sync.status === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : category === 'live' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200',
      )}
      title={title}
    >
      {label}
    </span>
  )
}
