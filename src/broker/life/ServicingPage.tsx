import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useBulkTasks, useLifeServicing, useRunServicing } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, Table, Td } from '../shared/ui'

export default function ServicingPage() {
  const { data, isLoading, error } = useLifeServicing()
  const run = useRunServicing()
  const bulk = useBulkTasks()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const rows = useMemo(() => data ?? [], [data])
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  const act = (status: 'done' | 'cancelled') => bulk.mutate({ task_ids: [...selected], status }, { onSuccess: () => setSelected(new Set()) })

  return (
    <Page>
      <PageHeader
        title="Life servicing"
        description="Missing beneficiaries, anniversaries, outstanding underwriting, cover shortfalls and missing advice records, found by the Life Servicing and Compliance agents. Each finding is one task, never duplicated on a rerun."
        actions={
          <>
            <Button size="sm" variant="outline" disabled={!selected.size || bulk.isPending} onClick={() => act('done')}>
              Mark {selected.size || ''} done
            </Button>
            <Button size="sm" variant="ghost" disabled={!selected.size || bulk.isPending} onClick={() => act('cancelled')}>
              Dismiss
            </Button>
            <Button size="sm" variant="accent" disabled={run.isPending} onClick={() => run.mutate()}>
              <RefreshCw /> Run servicing scan
            </Button>
          </>
        }
      />
      {isLoading && <LoadingState />}
      {(error || run.error) && <ErrorState message={(error ?? run.error)!.message} />}
      {data && !rows.length && <EmptyState title="Nothing outstanding">Run the servicing scan to check every life policy and needs analysis.</EmptyState>}
      {rows.length > 0 && (
        <div className="panel">
          <Table head={['', 'Finding', 'Client', 'Found by', 'Due']} minWidth={760}>
            {rows.map((r) => (
              <tr key={r.task.id} className="hover:bg-mist/60">
                <Td>
                  <input type="checkbox" checked={selected.has(r.task.id)} onChange={() => toggle(r.task.id)} aria-label={`Select ${r.task.title}`} />
                </Td>
                <Td>
                  {r.link ? (
                    <Link to={r.link} className="font-medium text-navy-900 hover:text-brand-600">
                      {r.task.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-navy-900">{r.task.title}</span>
                  )}
                  <p className="text-xs text-navy-600">{r.task.detail}</p>
                </Td>
                <Td className="text-xs">{r.customer ?? '–'}</Td>
                <Td className="text-xs">{r.agent}</Td>
                <Td className="text-xs">{formatDate(r.task.due_date)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
