import { Link } from 'react-router-dom'
import { useClientOverview, useRecordHistory } from '@/copilot/api'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { LoadingState } from '../PageHeader'
import { Section } from '../shared/ui'
import { CategoryBadge } from './identity'
import { HistoryTimeline } from './RecordViews'

/** Client number, accounts and dated activity from Supabase, including notes and follow-ups saved by Ava and Russ. */
export function ClientActivity({ personId }: { personId: string }) {
  const auth = useSupabaseAuth()
  const overview = useClientOverview(personId)
  const history = useRecordHistory({ person_id: personId })
  if (auth.status !== 'signed_in') return null
  if (overview.error) return null
  const c = overview.data
  return (
    <Section title="Client number and activity">
      {!c ? (
        <LoadingState />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-navy-900">{c.client.number}</span>
            <CategoryBadge category={c.client.category} />
            {c.accounts.map((a) => (
              <Link key={a.id} to={a.open_path} className="rounded-full border border-navy-800/10 px-2 py-0.5 text-xs hover:border-brand-500">
                {a.name} <span className="font-mono">{a.number}</span>
              </Link>
            ))}
          </div>
          {history.data ? <HistoryTimeline items={history.data.slice(0, 12)} /> : <LoadingState />}
        </div>
      )}
    </Section>
  )
}
