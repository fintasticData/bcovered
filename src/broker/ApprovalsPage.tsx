import { useState } from 'react'
import { useApprovals } from '@/api/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApprovalCard } from './ApprovalCard'
import { EmptyState, ErrorState, LoadingState, PageHeader } from './PageHeader'

export default function ApprovalsPage() {
  const [tab, setTab] = useState('pending')
  const pending = useApprovals(['pending'])
  const decided = useApprovals(['approved', 'rejected', 'changes_requested', 'cancelled'])

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title="Approvals"
        description="Regulated or consequential actions wait here for a licensed person. Agents cannot approve, and the backend re-checks every approval before acting."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-5 space-y-5">
          {pending.isLoading && <LoadingState />}
          {pending.error && <ErrorState message={pending.error.message} />}
          {pending.data?.length === 0 && (
            <EmptyState title="Nothing is waiting for approval">Run Scenario 1 in Demo Studio, or ask the Copilot to create a comparison.</EmptyState>
          )}
          {pending.data?.map((v) => <ApprovalCard key={v.approval.id} view={v} />)}
        </TabsContent>
        <TabsContent value="decided" className="mt-5 space-y-5">
          {decided.data?.length === 0 && <EmptyState title="No decisions yet" />}
          {decided.data?.map((v) => <ApprovalCard key={v.approval.id} view={v} compact />)}
        </TabsContent>
      </Tabs>
    </div>
  )
}
