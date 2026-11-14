import { useParams } from 'react-router-dom'
import { usePolicyDetail } from '@/copilot/api'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { AskCopilotButton } from '../copilot/AskCopilotButton'
import { PolicyDetailView } from '../copilot/RecordViews'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page } from '../shared/ui'

/** A personal short-term policy read from Supabase, with its parties, notes and activity. */
export default function ShortTermPolicyPage() {
  const { policyId } = useParams()
  const auth = useSupabaseAuth()
  const { data, isLoading, error } = usePolicyDetail(policyId)
  if (auth.status !== 'signed_in') {
    return (
      <Page>
        <EmptyState title="Sign in to the database">Policies are read from Supabase. Choose a brokerage staff identity under “Demo as”.</EmptyState>
      </Page>
    )
  }
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={(error as Error | null)?.message ?? 'Policy not found in this category'} /></div>
  return (
    <Page>
      <PageHeader
        title={`${data.provider ?? 'Policy'} ${data.display_number}`}
        description={data.account ? `${data.account.name} · ${data.account.number}` : undefined}
        line={{ term: 'short', market: 'personal' }}
        actions={<AskCopilotButton copilot="ava" kind="policy" id={data.id} />}
      />
      <PolicyDetailView data={data} />
    </Page>
  )
}
