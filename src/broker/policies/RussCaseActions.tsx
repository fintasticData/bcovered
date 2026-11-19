import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { newKey, policyClaimsApi, usePolicyClaimsMutation } from '@/copilot/policyClaimsApi'

/** Russ actions for a selected policy service request or claim. */
export function RussCaseActions({
  claimId,
  requestId,
  onChanged,
}: {
  claimId?: string | null
  requestId?: string | null
  onChanged?: () => void
}) {
  const prepare = usePolicyClaimsMutation(policyClaimsApi.russPrepareEndorsement)
  const evidence = usePolicyClaimsMutation(policyClaimsApi.russCheckEvidence)
  const draft = usePolicyClaimsMutation(policyClaimsApi.russDraftUpdate)
  const transition = usePolicyClaimsMutation(policyClaimsApi.transitionClaim)
  const compare = usePolicyClaimsMutation(policyClaimsApi.russCompareSchedule)
  const [preview, setPreview] = useState<string | null>(null)
  const [mode, setMode] = useState<'none' | 'evidence' | 'update' | 'endorsement' | 'schedule'>('none')
  const [busy, setBusy] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    make: '',
    model: '',
    year: '',
    registration: '',
    premium: '',
    excess: '',
    effective_at: '',
  })
  const [diffs, setDiffs] = useState<Array<{ field: string; requested: string; proposed: string }> | null>(null)

  if (!claimId && !requestId) {
    return <p className="text-xs text-navy-500">Select a policy request or claim to use Russ on that case.</p>
  }

  const requestEvidence = async () => {
    if (!claimId) return
    setBusy(true)
    try {
      const ev = await evidence.mutateAsync({ claim_id: claimId, approve: true, key: newKey() })
      await transition.mutateAsync({
        claim_id: claimId,
        to_status: 'awaiting_evidence',
        note: ev.draft ?? 'Missing evidence requested',
        key: newKey(),
      })
      const shared = await draft.mutateAsync({
        claim_id: claimId,
        share: true,
        key: newKey(),
      })
      setPreview(
        [
          ev.draft ?? ev.summary,
          'Status set to awaiting evidence.',
          shared.draft ?? shared.summary,
        ].join('\n\n'),
      )
      setMode('none')
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  const runCompare = (approve: boolean) => {
    if (!requestId) return
    const proposed = {
      replacement: {
        make: scheduleForm.make || null,
        model: scheduleForm.model || null,
        year: scheduleForm.year ? Number(scheduleForm.year) : null,
        registration: scheduleForm.registration || null,
      },
      premium: scheduleForm.premium ? Number(scheduleForm.premium) : null,
      excess: scheduleForm.excess ? Number(scheduleForm.excess) : null,
      effective_at: scheduleForm.effective_at || null,
    }
    compare.mutate(
      { request_id: requestId, proposed, approve, key: newKey() },
      {
        onSuccess: (r) => {
          setDiffs(r.diffs ?? [])
          setPreview(r.summary)
          setMode('schedule')
          if (approve) onChanged?.()
        },
      },
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-navy-800/10 bg-navy-50/50 p-3">
      <p className="text-xs font-semibold text-navy-800">Russ · case actions</p>
      <div className="flex flex-wrap gap-2">
        {requestId && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={prepare.isPending}
              onClick={() =>
                prepare.mutate(
                  { request_id: requestId, approve: false, key: newKey() },
                  {
                    onSuccess: (r) => {
                      setPreview(r.draft ?? r.summary)
                      setMode('endorsement')
                    },
                  },
                )
              }
            >
              Prepare endorsement request
            </Button>
            {mode === 'endorsement' && preview && (
              <Button
                size="sm"
                variant="accent"
                disabled={prepare.isPending}
                onClick={() =>
                  prepare.mutate(
                    { request_id: requestId, approve: true, key: newKey() },
                    {
                      onSuccess: (r) => {
                        setPreview(r.summary)
                        onChanged?.()
                      },
                    },
                  )
                }
              >
                Approve endorsement draft
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={draft.isPending}
              onClick={() =>
                draft.mutate(
                  { request_id: requestId, share: false, key: newKey() },
                  {
                    onSuccess: (r) => {
                      setPreview(r.draft ?? r.summary)
                      setMode('update')
                    },
                  },
                )
              }
            >
              Draft customer update
            </Button>
            {mode === 'update' && preview && (
              <Button
                size="sm"
                variant="accent"
                disabled={draft.isPending}
                onClick={() =>
                  draft.mutate(
                    { request_id: requestId, share: true, key: newKey() },
                    {
                      onSuccess: (r) => {
                        setPreview(r.summary)
                        onChanged?.()
                      },
                    },
                  )
                }
              >
                Share update with customer
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setMode('schedule')}>
              Compare revised schedule
            </Button>
          </>
        )}
        {claimId && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={evidence.isPending}
              onClick={() =>
                evidence.mutate(
                  { claim_id: claimId, approve: false, key: newKey() },
                  {
                    onSuccess: (r) => {
                      setPreview(r.draft ?? r.summary)
                      setMode('evidence')
                    },
                  },
                )
              }
            >
              Check missing claim evidence
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={draft.isPending}
              onClick={() =>
                draft.mutate(
                  { claim_id: claimId, share: false, key: newKey() },
                  {
                    onSuccess: (r) => {
                      setPreview(r.draft ?? r.summary)
                      setMode('update')
                    },
                  },
                )
              }
            >
              Draft customer update
            </Button>
            {mode === 'update' && preview && (
              <Button
                size="sm"
                variant="accent"
                disabled={draft.isPending}
                onClick={() =>
                  draft.mutate(
                    { claim_id: claimId, share: true, key: newKey() },
                    {
                      onSuccess: (r) => {
                        setPreview(r.summary)
                        onChanged?.()
                      },
                    },
                  )
                }
              >
                Share update with customer
              </Button>
            )}
            {mode === 'evidence' && preview && (
              <Button size="sm" variant="accent" disabled={busy || evidence.isPending || transition.isPending || draft.isPending} onClick={() => void requestEvidence()}>
                Approve and request evidence
              </Button>
            )}
          </>
        )}
      </div>

      {requestId && mode === 'schedule' && (
        <div className="space-y-2 rounded-lg border border-navy-800/10 bg-white p-3">
          <p className="text-xs font-semibold text-navy-800">Revised schedule fields (from insurer document)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['make', 'Make'],
                ['model', 'Model'],
                ['year', 'Year'],
                ['registration', 'Registration'],
                ['premium', 'Premium'],
                ['excess', 'Excess'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-[11px] font-semibold text-navy-600">
                {label}
                <input
                  className="mt-1 w-full rounded-lg border p-1.5 text-sm"
                  value={scheduleForm[key]}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="text-[11px] font-semibold text-navy-600">
              Effective at
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border p-1.5 text-sm"
                value={scheduleForm.effective_at}
                onChange={(e) => setScheduleForm({ ...scheduleForm, effective_at: e.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={compare.isPending} onClick={() => runCompare(false)}>
              Compare with request
            </Button>
            {diffs && (
              <Button size="sm" variant="accent" disabled={compare.isPending} onClick={() => runCompare(true)}>
                Record comparison on case
              </Button>
            )}
          </div>
          {diffs && diffs.length > 0 && (
            <ul className="space-y-1 text-xs text-navy-800">
              {diffs.map((d) => (
                <li key={d.field} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  <span className="font-semibold">{d.field}</span>: requested {d.requested || '—'} → schedule {d.proposed || '—'}
                </li>
              ))}
            </ul>
          )}
          {diffs && diffs.length === 0 && (
            <p className="text-xs text-emerald-800">No material differences against the requested change.</p>
          )}
        </div>
      )}

      {preview && (
        <pre className="max-h-40 overflow-auto rounded-lg bg-white p-2 text-xs text-navy-800 whitespace-pre-wrap">{preview}</pre>
      )}
      {(evidence.error || draft.error || transition.error || prepare.error || compare.error) && (
        <p className="text-xs text-red-700">
          {(evidence.error || draft.error || transition.error || prepare.error || compare.error) instanceof Error
            ? ((evidence.error || draft.error || transition.error || prepare.error || compare.error) as Error).message
            : 'Action failed'}
        </p>
      )}
    </div>
  )
}
