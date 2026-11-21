import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { newKey, policyClaimsApi, usePolicyClaimsMutation } from '@/copilot/policyClaimsApi'
import { useDataCategory } from '@/lib/supabase/category'

type ClaimSel = {
  id: string
  reference: string
  customer_name: string
  person_id: string
  status: string
  incident_at: string | null
  due_at: string | null
}

type RowResult = {
  claim_id: string
  reference: string
  customer_name: string
  outcome: 'ok' | 'skipped' | 'failed'
  message: string
  link?: string | null
  draft?: string | null
}

type RussAction = 'summarise_cover' | 'list_evidence' | 'create_followups'

export function ClaimsRussSlideout({
  open,
  onClose,
  selected,
  onCleared,
}: {
  open: boolean
  onClose: () => void
  selected: ClaimSel[]
  onCleared?: () => void
}) {
  const category = useDataCategory()
  const draft = usePolicyClaimsMutation(policyClaimsApi.russDraftUpdate)
  const evidence = usePolicyClaimsMutation(policyClaimsApi.russCheckEvidence)
  const summarise = usePolicyClaimsMutation(policyClaimsApi.russSummariseCover)
  const createTasks = usePolicyClaimsMutation(policyClaimsApi.russCreateFollowUps)
  const [action, setAction] = useState<RussAction>('create_followups')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<RowResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const demo = category === 'sample'

  const run = async () => {
    if (!selected.length) return
    setBusy(true)
    setError(null)
    const out: RowResult[] = []
    try {
      for (const row of selected) {
        try {
          if (action === 'list_evidence') {
            const res = await evidence.mutateAsync({ claim_id: row.id, approve: false, key: newKey() })
            out.push({
              claim_id: row.id,
              reference: row.reference,
              customer_name: row.customer_name,
              outcome: 'ok',
              message: res.summary ?? res.draft ?? 'Evidence checked',
              draft: res.draft ?? null,
              link: `/broker/claims/${row.id}`,
            })
          } else if (action === 'summarise_cover') {
            const res = await summarise.mutateAsync({
              claim_id: row.id,
              loss_at: row.incident_at,
              key: newKey(),
            })
            out.push({
              claim_id: row.id,
              reference: row.reference,
              customer_name: row.customer_name,
              outcome: res.outcome === 'skipped' ? 'skipped' : 'ok',
              message: res.summary,
              link: res.schedule_path ?? `/broker/claims/${row.id}`,
            })
          } else {
            const task = await createTasks.mutateAsync({ claim_id: row.id, key: newKey() })
            if (task.outcome === 'skipped') {
              out.push({
                claim_id: row.id,
                reference: row.reference,
                customer_name: row.customer_name,
                outcome: 'skipped',
                message: task.summary,
                link: `/broker/claims/${row.id}`,
              })
            } else {
              const res = await draft.mutateAsync({ claim_id: row.id, share: false, key: newKey() })
              out.push({
                claim_id: row.id,
                reference: row.reference,
                customer_name: row.customer_name,
                outcome: 'ok',
                message: task.summary,
                draft: res.draft ?? res.summary,
                link: `/broker/claims/${row.id}`,
              })
            }
          }
        } catch (e) {
          out.push({
            claim_id: row.id,
            reference: row.reference,
            customer_name: row.customer_name,
            outcome: 'failed',
            message: e instanceof Error ? e.message : 'Failed',
            link: `/broker/claims/${row.id}`,
          })
        }
      }
      setResults(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch failed')
    } finally {
      setBusy(false)
    }
  }

  const ok = results?.filter((r) => r.outcome === 'ok').length ?? 0
  const total = results?.length ?? 0

  return (
    <RightSlideout
      open={open}
      onClose={onClose}
      title="Russ · claims actions"
      demo={demo}
      subtitle={`${selected.length} selected · apply one action to the selection`}
      footer={
        <div className="flex flex-col gap-2">
          {results && (
            <p className="text-center text-xs font-semibold text-emerald-800">
              {ok} of {total} complete
            </p>
          )}
          <Button className="w-full" variant="accent" type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Action</label>
          <select
            className="w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as RussAction)
              setResults(null)
            }}
          >
            <option value="summarise_cover">Summarise cover on the loss date</option>
            <option value="list_evidence">List missing evidence</option>
            <option value="create_followups">Create follow-up tasks</option>
          </select>
          <Button className="w-full" size="sm" variant="accent" disabled={busy || !selected.length} onClick={() => void run()}>
            {busy ? 'Running…' : 'Run on selection'}
          </Button>
        </div>

        {error && <p className="text-xs text-red-700">{error}</p>}

        {results && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-navy-800">
              {ok} of {total} complete
              {results.some((r) => r.outcome === 'skipped') ? ' · some skipped' : ''}
            </p>
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.claim_id} className="rounded-lg border border-navy-800/10 bg-navy-50/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link className="font-semibold text-brand-700 hover:underline" to={r.link ?? `/broker/claims/${r.claim_id}`}>
                      {r.customer_name} · {r.reference}
                    </Link>
                    <span
                      className={
                        r.outcome === 'ok'
                          ? 'font-semibold text-emerald-700'
                          : r.outcome === 'skipped'
                            ? 'text-amber-800'
                            : 'text-red-700'
                      }
                    >
                      {r.outcome}
                    </span>
                  </div>
                  <p className="mt-1 text-navy-700">{r.message}</p>
                  {r.draft && <pre className="mt-2 max-h-24 overflow-auto rounded bg-white p-2 whitespace-pre-wrap">{r.draft}</pre>}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="cursor-pointer text-[11px] font-semibold text-navy-600 hover:underline"
              onClick={() => {
                setResults(null)
                onCleared?.()
              }}
            >
              Clear selection
            </button>
          </div>
        )}

        {!results && (
          <ul className="space-y-1.5 text-xs text-navy-700">
            {selected.map((r) => (
              <li key={r.id} className="rounded-lg border border-navy-800/10 px-2 py-1.5">
                {r.customer_name} · {r.reference}
              </li>
            ))}
          </ul>
        )}
      </div>
    </RightSlideout>
  )
}
