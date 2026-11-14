import { useAccountOverview, useClientOverview, usePolicyDetail, type AccountOverview, type ClientOverview, type HistoryItem, type PolicyDetail, type PolicyRef, type StepResult, type TurnContext } from '@/copilot/api'
import { SalesStepView } from '../book/SalesRecordViews'
import { EmptyState, LoadingState } from '../PageHeader'
import { AccountOverviewView, ClientOverviewView, HistoryTimeline, MembersTable, PolicyDetailView, PolicyTable, SchemesTable } from './RecordViews'
import { FranchiseStepView, isFranchiseStep } from '../franchise/FranchiseViews'

function ContextRecord({ context }: { context: TurnContext }) {
  const policy = usePolicyDetail(context.policy?.id)
  const client = useClientOverview(context.policy ? undefined : context.person?.id)
  const account = useAccountOverview(context.policy || context.person ? undefined : context.account?.id)
  const q = context.policy ? policy : context.person ? client : account
  if (!context.policy && !context.person && !context.account) {
    return (
      <EmptyState title="Records open here">
        Ask for a client, account or policy, or pick one with @. Each result opens here: overviews, policies, history and saved notes with their references.
      </EmptyState>
    )
  }
  if (q.isLoading) return <LoadingState />
  if (q.error) return <EmptyState title="Record unavailable">{(q.error as Error).message}</EmptyState>
  if (context.policy && policy.data) return <PolicyDetailView data={policy.data} />
  if (context.person && client.data) return <ClientOverviewView data={client.data} />
  if (account.data) return <AccountOverviewView data={account.data} />
  return null
}

function SavedRecord({ step }: { step: StepResult }) {
  const policy = usePolicyDetail(step.policy?.id ?? (step.receipt?.record_type === 'life_application' ? step.receipt.open_path.split('/').pop() : undefined))
  const client = useClientOverview(step.policy ? undefined : step.subject?.record_type === 'client' ? step.subject.id : undefined)
  if (policy.data) return <PolicyDetailView data={policy.data} />
  if (client.data) return <ClientOverviewView data={client.data} />
  return <p className="text-sm text-navy-600">Saved. Open the record to see it in place.</p>
}

/** The editor side of the copilot workspace (about 60%): the record a step retrieved or saved, or the selected record. */
export function RecordPane({ step, context }: { step: StepResult | null; context: TurnContext }) {
  if (!step) return <ContextRecord context={context} />
  if (step.intent.startsWith('sales_') || step.job?.startsWith('sales.')) {
    const view = <SalesStepView step={step} />
    if (step.status === 'saved' || step.status === 'retrieved') return view
  }
  const d = step.data
  if (isFranchiseStep(step)) return <FranchiseStepView step={step} />
  if (step.status === 'saved') return <SavedRecord step={step} />
  if ((step.intent === 'find' || step.intent === 'overview') && d && typeof d === 'object') {
    const rec = d as ClientOverview | AccountOverview
    return rec.record_type === 'client' ? <ClientOverviewView data={rec} /> : <AccountOverviewView data={rec as AccountOverview} />
  }
  if (step.intent === 'policies' && Array.isArray(d)) return <PolicyTable policies={d as PolicyRef[]} />
  if (step.intent === 'history' && Array.isArray(d)) return <HistoryTimeline items={d as HistoryItem[]} />
  if (step.intent === 'schemes' && Array.isArray(d)) return d.length ? <SchemesTable schemes={d as AccountOverview['schemes']} /> : <EmptyState title="No group schemes" />
  if (step.intent === 'members' && Array.isArray(d)) return <MembersTable members={d as Parameters<typeof MembersTable>[0]['members']} />
  if (step.intent === 'life_application_get' && d) return <PolicyDetailView data={d as PolicyDetail} />
  return <ContextRecord context={context} />
}
