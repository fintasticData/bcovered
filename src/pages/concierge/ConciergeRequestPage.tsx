import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  newConciergeKey,
  STATUS_LABEL,
  useConciergeMutations,
  useConciergeRequest,
  type ConciergeStatus,
} from '@/api/concierge'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ConciergeShell } from './ConciergeShell'

const STATUS_CLASS: Record<ConciergeStatus, string> = {
  received: 'bg-navy-100 text-navy-800',
  with_concierge: 'bg-brand-100 text-brand-950',
  action_needed: 'bg-orange-100 text-orange-950',
  with_insurer: 'bg-violet-100 text-violet-950',
  completed: 'bg-emerald-100 text-emerald-900',
  withdrawn: 'bg-navy-100 text-navy-600',
}

export default function ConciergeRequestPage() {
  const { requestId } = useParams()
  const detail = useConciergeRequest(requestId)
  const mut = useConciergeMutations()
  const [reply, setReply] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [docLabel, setDocLabel] = useState('Proof of purchase')
  const [error, setError] = useState<string | null>(null)

  if (detail.isLoading) {
    return (
      <ConciergeShell>
        <LoadingState label="Opening request…" />
      </ConciergeShell>
    )
  }

  if (detail.error || !detail.data) {
    return (
      <ConciergeShell>
        <ErrorState message={detail.error?.message ?? 'Request not found'} />
      </ConciergeShell>
    )
  }

  const r = detail.data

  const sendReply = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await mut.message.mutateAsync({ requestId: r.id, body: reply, key: newConciergeKey() })
      setReply('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    }
  }

  const upload = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await mut.uploadDoc.mutateAsync({
        requestId: r.id,
        label: docLabel || 'Document',
        url: docUrl || `https://example.demo/receipt/${r.reference ?? r.id}.pdf`,
        key: newConciergeKey(),
      })
      setDocUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const requestCall = async () => {
    setError(null)
    try {
      await mut.message.mutateAsync({
        requestId: r.id,
        body: 'Please call me about this request.',
        key: newConciergeKey(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request call')
    }
  }

  return (
    <ConciergeShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">
            <Link to="/my/concierge" className="hover:text-brand-700">VIP Concierge</Link>
            {' · '}Request
          </p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-navy-950">{r.title}</h1>
              <p className="mt-1 text-sm text-navy-600">
                {r.reference} · Owner {r.owner_name ?? 'team'}
                {r.item_label ? ` · ${r.item_label}` : ''}
              </p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', STATUS_CLASS[r.status])}>
              {STATUS_LABEL[r.status]}
            </span>
          </div>
          {r.next_action && (
            <p className="mt-3 rounded-xl border border-navy-800/10 bg-white px-3 py-2 text-sm font-medium text-navy-800">
              Next: {r.next_action}
            </p>
          )}
        </div>

        {(r.service_jobs ?? []).length > 0 && (
          <section className="space-y-3">
            {(r.service_jobs ?? []).map((job) => {
              const conciergeFirst = (r.concierge_name ?? r.owner_name ?? 'Your concierge').split(' ')[0]
              const alloc = job.current_allocation
              const arranging =
                !alloc ||
                ['proposed', 'notified'].includes(alloc.status) ||
                job.status === 'seeking_provider'
              const tradeWord = (job.trade_label || 'specialist').toLowerCase()
              return (
                <div
                  key={job.id}
                  className="rounded-2xl border border-brand-200 bg-gradient-to-br from-white to-brand-50/40 p-4 shadow-sm"
                >
                  <h2 className="text-sm font-semibold text-navy-900">Your service visit</h2>
                  {arranging ? (
                    <p className="mt-2 text-sm text-navy-800">
                      {conciergeFirst} is arranging a {tradeWord}.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1 text-sm text-navy-800">
                      <p>
                        <span className="font-semibold">{job.trade_label}</span>
                        {alloc?.provider_name ? ` · ${alloc.provider_name}` : ''}
                      </p>
                      {job.appointment_at && (
                        <p>
                          When:{' '}
                          <span className="font-semibold">
                            {new Date(job.appointment_at).toLocaleString('en-ZA', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </p>
                      )}
                      {(alloc?.provider_phone || alloc?.provider_email) && (
                        <p>
                          Contact:{' '}
                          {[alloc.provider_phone, alloc.provider_email].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="text-xs text-navy-600">
                        Latest: {job.next_action ?? job.status.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() =>
                      setReply((prev) => prev || `Hi ${conciergeFirst}, regarding my ${tradeWord} visit…`)
                    }
                  >
                    Message {conciergeFirst}
                  </Button>
                </div>
              )
            })}
          </section>
        )}

        <section className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-navy-900">Updates</h2>
          <ol className="mt-3 space-y-3">
            {r.events.map((ev) => (
              <li key={ev.id} className="border-l-2 border-brand-200 pl-3">
                <p className="text-sm text-navy-900">{ev.body ?? ev.event_type}</p>
                <p className="mt-0.5 text-[11px] text-navy-500">
                  {ev.author ?? 'System'} · {new Date(ev.created_at).toLocaleString('en-ZA')}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {r.documents.length > 0 && (
          <section className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-navy-900">Documents</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {r.documents.map((d) => (
                <li key={d.id}>
                  {d.url ? (
                    <a href={d.url} className="font-medium text-brand-700 underline" target="_blank" rel="noreferrer">
                      {d.label}
                    </a>
                  ) : (
                    d.label
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.status === 'action_needed' && (
          <form onSubmit={upload} className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
            <h2 className="text-sm font-semibold text-navy-900">Upload what was requested</h2>
            <label className="block text-sm font-semibold text-navy-800">
              Label
              <input className="field mt-1" value={docLabel} onChange={(e) => setDocLabel(e.target.value)} />
            </label>
            <label className="block text-sm font-semibold text-navy-800">
              Document URL (demo)
              <input
                className="field mt-1"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="Leave blank to use a sample receipt URL"
              />
            </label>
            <Button type="submit" size="sm" className="bg-brand-800 text-white hover:bg-brand-900" disabled={mut.uploadDoc.isPending}>
              {mut.uploadDoc.isPending ? 'Uploading…' : 'Upload receipt'}
            </Button>
          </form>
        )}

        <form onSubmit={sendReply} className="space-y-3 rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-navy-900">Reply in this thread</h2>
          <textarea className="field min-h-[80px]" value={reply} onChange={(e) => setReply(e.target.value)} required placeholder="Write a message…" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" className="bg-brand-800 text-white hover:bg-brand-900" disabled={mut.message.isPending}>
              Send reply
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void requestCall()} disabled={mut.message.isPending}>
              Request a call
            </Button>
          </div>
        </form>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </ConciergeShell>
  )
}
