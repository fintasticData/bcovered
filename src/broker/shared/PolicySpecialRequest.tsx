import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useCreatePolicySpecialRequest, type PolicySpecialRequestType } from '@/api/hooks'
import { Button } from '@/components/ui/button'

const TYPES: Array<{ value: PolicySpecialRequestType; label: string }> = [
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'certificate', label: 'Certificate of insurance' },
  { value: 'cancellation_assist', label: 'Cancellation assist' },
  { value: 'claim_assist', label: 'Claim assist' },
]

/** Policy management is a special request from a policy — not a sidebar destination. */
export function PolicySpecialRequest({ policyId, evidencePath }: { policyId: string; evidencePath: string }) {
  const create = useCreatePolicySpecialRequest()
  const [open, setOpen] = useState(false)
  const [requestType, setRequestType] = useState<PolicySpecialRequestType>('endorsement')
  const [note, setNote] = useState('')
  const [doneId, setDoneId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const approval = await create.mutateAsync({
        policy_id: policyId,
        request_type: requestType,
        note,
        evidence_path: evidencePath,
      })
      setDoneId(approval.id)
      setOpen(false)
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not raise special request')
    }
  }

  if (doneId) {
    return (
      <p className="text-xs text-emerald-800">
        Special request sent for approval.{' '}
        <Link to="/broker/approvals" className="font-semibold underline-offset-2 hover:underline">
          Open Approvals
        </Link>
      </p>
    )
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Special request
      </Button>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm rounded-xl border border-navy-800/10 bg-white p-3 text-left shadow-sm">
      <p className="text-xs font-semibold text-navy-900">Policy special request</p>
      <p className="mt-0.5 text-[11px] text-navy-500">Goes to Approvals for a licensed person. Does not change the policy until approved.</p>
      <label className="mt-2 block text-[11px] font-medium text-navy-600">
        Type
        <select
          className="mt-1 w-full rounded-lg border border-navy-800/15 px-2 py-1.5 text-sm"
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as PolicySpecialRequestType)}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-[11px] font-medium text-navy-600">
        Note
        <textarea
          required
          minLength={5}
          rows={3}
          className="mt-1 w-full rounded-lg border border-navy-800/15 px-2 py-1.5 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What should happen on this policy?"
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={create.isPending}>
          {create.isPending ? 'Sending…' : 'Send to Approvals'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
