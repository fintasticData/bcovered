import { useParams } from 'react-router-dom'
import { useAccountOverview, useRecordHistory } from '@/copilot/api'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { AskCopilotButton } from '../copilot/AskCopilotButton'
import { AccountOverviewView, HistoryTimeline } from '../copilot/RecordViews'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, Section } from '../shared/ui'

/** One client account (household or business) from Supabase: people, policies, schemes, notes and history. */
export default function AccountPage() {
  const { accountId } = useParams()
  const auth = useSupabaseAuth()
  const { data, isLoading, error } = useAccountOverview(accountId)
  const history = useRecordHistory(accountId ? { customer_id: accountId } : null)
  if (auth.status !== 'signed_in') {
    return (
      <Page>
        <EmptyState title="Sign in to the database">Accounts are read from Supabase. Choose a brokerage staff identity under “Demo as”.</EmptyState>
      </Page>
    )
  }
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={(error as Error | null)?.message ?? 'Account not found in this category'} /></div>
  const business = data.account.type === 'commercial'
  return (
    <Page>
      <PageHeader
        title={data.account.name}
        description={`${business ? 'Business' : 'Personal'} account · ${data.account.number}`}
        actions={<AskCopilotButton copilot={business ? 'russ' : 'ava'} kind="account" id={data.account.id} />}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AccountOverviewView data={data} />
        <Section title="History">{history.data ? <HistoryTimeline items={history.data} /> : <LoadingState />}</Section>
      </div>
    </Page>
  )
}
