import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  JOB_STATUS_LABEL,
  newServiceKey,
  useServiceProviderMutations,
  useServiceTradeTypes,
  type ServiceJob,
  type ServiceProviderMatch,
} from '@/api/serviceProviders'
import type { ConciergeRequestDetail } from '@/api/concierge'
import { Button } from '@/components/ui/button'
import { ProviderFormDialog } from './ProviderFormDialog'
import { cn } from '@/lib/utils'

type Step = 'describe' | 'match' | 'confirm' | 'manage'

type Props = {
  request: ConciergeRequestDetail
  open: boolean
  onClose: () => void
  jobId?: string | null
  claimId?: string | null
}

export function AllocateProviderPanel({ request, open, onClose, jobId: focusJobId, claimId }: Props) {
  const trades = useServiceTradeTypes()
  const mut = useServiceProviderMutations()
  const [params, setParams] = useSearchParams()
  const [step, setStep] = useState<Step>('describe')
  const [job, setJob] = useState<ServiceJob | null>(null)
  const [tradeTypeId, setTradeTypeId] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState('same_day')
  const [address, setAddress] = useState('')
  const [windowNote, setWindowNote] = useState('')
  const [authority, setAuthority] = useState('pending')
  const [payer, setPayer] = useState('unconfirmed')
  const [matches, setMatches] = useState<ServiceProviderMatch[]>([])
  const [broaden, setBroaden] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [quotedFee, setQuotedFee] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointmentLocal, setAppointmentLocal] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [outcome, setOutcome] = useState('')

  const jobs = request.service_jobs ?? []
  const areaHint = (address || request.item_address || '').split(',')[0]?.trim() || ''

  useEffect(() => {
    if (!open) return
    setError(null)
    setAddress(request.item_address || '')
    const preselect = params.get('preselectProvider')
    const existing = focusJobId ? jobs.find((j) => j.id === focusJobId) : null
    if (existing) {
      setJob(existing)
      setTradeTypeId(existing.trade_type_id)
      setDescription(existing.work_description)
      setAddress(existing.service_address)
      setStep(existing.current_allocation ? 'manage' : 'match')
      if (preselect) {
        setSelectedProviderId(preselect)
        setStep('confirm')
      }
    } else {
      setJob(null)
      setStep('describe')
      setTradeTypeId('')
      setDescription('')
      setSelectedProviderId(preselect)
      if (preselect) setStep('match')
    }
  }, [open, focusJobId, request.id])

  useEffect(() => {
    if (!open || step !== 'match' || !tradeTypeId) return
    void (async () => {
      try {
        const rows = await mut.match.mutateAsync({
          tradeTypeId,
          area: areaHint,
          insurerId: request.servicing_insurer_id,
          broaden,
        })
        setMatches(rows)
        if (selectedProviderId && !rows.some((r) => r.id === selectedProviderId)) {
          // keep selection even if not in narrowed list
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Match failed')
      }
    })()
  }, [open, step, tradeTypeId, broaden, areaHint, request.servicing_insurer_id])

  if (!open) return null

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    }
  }

  const createJob = () =>
    run(async () => {
      const created = await mut.createJob.mutateAsync({
        requestId: request.id,
        claimId: claimId ?? null,
        tradeTypeId,
        workDescription: description,
        urgency,
        preferredWindow: windowNote ? { note: windowNote } : {},
        serviceAddress: address || request.item_address || 'Address to confirm',
        authorityStatus: authority,
        paymentResponsibility: payer,
        key: newServiceKey(),
      })
      setJob(created)
      setStep('match')
    })

  const confirmAllocate = () =>
    run(async () => {
      if (!job || !selectedProviderId) return
      const updated = await mut.allocate.mutateAsync({
        jobId: job.id,
        providerId: selectedProviderId,
        quotedCalloutFeeZar: quotedFee ? Number(quotedFee) : null,
        key: newServiceKey(),
      })
      setJob(updated)
      setStep('manage')
      if (params.get('preselectProvider')) {
        params.delete('preselectProvider')
        setParams(params, { replace: true })
      }
    })

  const selected = matches.find((m) => m.id === selectedProviderId) ?? null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/40" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-navy-800/10 px-4 py-3">
          <div>
            <h2 className="font-display text-lg font-bold text-navy-950">Allocate provider</h2>
            <p className="text-xs text-navy-600">{request.reference} · {request.customer_name}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex gap-2 border-b border-navy-800/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
          {(['describe', 'match', 'confirm', 'manage'] as Step[]).map((s) => (
            <span key={s} className={cn(step === s ? 'text-brand-700' : '')}>
              {s}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {jobs.length > 0 && step === 'describe' && !job && (
            <section className="rounded-xl border border-navy-800/10 bg-navy-50/60 p-3">
              <h3 className="text-sm font-semibold text-navy-900">Jobs on this request</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2">
                    <span>
                      {j.trade_label} · {JOB_STATUS_LABEL[j.status]}
                      {j.current_allocation?.provider_name ? ` · ${j.current_allocation.provider_name}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setJob(j)
                        setTradeTypeId(j.trade_type_id)
                        setStep(j.current_allocation ? 'manage' : 'match')
                      }}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {step === 'describe' && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-navy-900">Describe the job</h3>
              <select className="field" value={tradeTypeId} onChange={(e) => setTradeTypeId(e.target.value)}>
                <option value="">Trade required *</option>
                {(trades.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <textarea
                className="field min-h-[80px]"
                placeholder="Work description *"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <select className="field" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="emergency">Emergency</option>
                <option value="same_day">Same day</option>
                <option value="standard">Standard</option>
                <option value="scheduled">Scheduled</option>
              </select>
              <input
                className="field"
                placeholder="Service address *"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <input
                className="field"
                placeholder="Preferred visit window"
                value={windowNote}
                onChange={(e) => setWindowNote(e.target.value)}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select className="field" value={authority} onChange={(e) => setAuthority(e.target.value)}>
                  <option value="pending">Authority pending</option>
                  <option value="recorded">Authority recorded</option>
                  <option value="not_required">Authority not required</option>
                </select>
                <select className="field" value={payer} onChange={(e) => setPayer(e.target.value)}>
                  <option value="unconfirmed">Payer unconfirmed</option>
                  <option value="customer">Customer pays</option>
                  <option value="insurer">Insurer pays</option>
                </select>
              </div>
              <Button
                className="w-full"
                disabled={!tradeTypeId || !description.trim() || mut.createJob.isPending}
                onClick={() => void createJob()}
              >
                Continue to find provider
              </Button>
            </section>
          )}

          {step === 'match' && job && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-navy-900">Find a provider</h3>
              <p className="text-xs text-navy-600">
                Matching {(trades.data ?? []).find((t) => t.id === tradeTypeId)?.label ?? 'trade'} near {areaHint || 'any area'}
              </p>
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    'w-full rounded-xl border p-3 text-left text-sm',
                    selectedProviderId === m.id ? 'border-brand-500 bg-brand-50' : 'border-navy-800/10 bg-white',
                  )}
                  onClick={() => {
                    setSelectedProviderId(m.id)
                    setQuotedFee(m.standard_callout_fee_zar != null ? String(m.standard_callout_fee_zar) : '')
                  }}
                >
                  <p className="font-semibold text-navy-950">
                    {m.trading_name}
                    {m.preferred ? ' · Preferred' : ''}
                  </p>
                  <p className="text-xs text-navy-600">
                    {m.phone ?? m.email} · {(m.match_reasons ?? []).join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-navy-700">
                    {m.after_hours_available ? 'After-hours yes' : 'Business hours'}
                    {m.on_insurer_panel ? ' · On panel' : ''}
                    {m.standard_callout_fee_zar != null ? ` · Call-out R ${m.standard_callout_fee_zar}` : ''}
                  </p>
                </button>
              ))}
              {matches.length === 0 && (
                <p className="text-sm text-navy-600">No active providers match. Broaden search or add a new provider.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setBroaden(true)}>
                  Broaden search
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                  Add new provider
                </Button>
                <Button size="sm" disabled={!selectedProviderId} onClick={() => setStep('confirm')}>
                  Continue
                </Button>
              </div>
            </section>
          )}

          {step === 'confirm' && job && selectedProviderId && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-navy-900">Confirm assignment</h3>
              <p className="text-sm text-navy-800">
                <strong>{selected?.trading_name ?? 'Provider'}</strong> will handle{' '}
                <strong>{job.trade_label}</strong> at <strong>{job.service_address}</strong> for{' '}
                <strong>{request.customer_name}</strong>.
              </p>
              <p className="text-xs text-navy-600">
                Customer phone/email will be shared with the provider for this visit. Panel listing does not mean authority
                or payment is confirmed (authority: {authority}; payer: {payer}).
              </p>
              <input
                className="field"
                placeholder="Quoted / agreed call-out (R)"
                value={quotedFee}
                onChange={(e) => setQuotedFee(e.target.value)}
              />
              <Button className="w-full" disabled={mut.allocate.isPending} onClick={() => void confirmAllocate()}>
                Confirm allocation
              </Button>
            </section>
          )}

          {step === 'manage' && job && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-navy-900">Manage visit</h3>
              <p className="text-sm text-navy-800">
                {job.trade_label} · {JOB_STATUS_LABEL[job.status]}
                {job.current_allocation?.provider_name ? ` · ${job.current_allocation.provider_name}` : ''}
              </p>
              {job.appointment_at && (
                <p className="text-sm font-medium text-navy-900">
                  Appointment: {new Date(job.appointment_at).toLocaleString('en-ZA')}
                </p>
              )}
              {(job.allocations ?? []).length > 1 && (
                <div className="rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy-700">
                  Allocation attempts:{' '}
                  {job.allocations.map((a) => `#${a.attempt_no} ${a.provider_name} (${a.status})`).join(' · ')}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mut.recordResponse.isPending}
                  onClick={() =>
                    void run(async () => {
                      const updated = await mut.recordResponse.mutateAsync({
                        jobId: job.id,
                        response: 'notified',
                        markNotified: true,
                        key: newServiceKey(),
                      })
                      setJob(updated)
                    })
                  }
                >
                  Provider notified
                </Button>
                <Button
                  size="sm"
                  disabled={mut.recordResponse.isPending}
                  onClick={() =>
                    void run(async () => {
                      const updated = await mut.recordResponse.mutateAsync({
                        jobId: job.id,
                        response: 'accepted',
                        channel: 'phone',
                        key: newServiceKey(),
                      })
                      setJob(updated)
                    })
                  }
                >
                  Accepted
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      const updated = await mut.recordResponse.mutateAsync({
                        jobId: job.id,
                        response: 'declined',
                        declineReason: declineReason || 'Declined',
                        key: newServiceKey(),
                      })
                      setJob(updated)
                      setStep('match')
                      setSelectedProviderId(null)
                    })
                  }
                >
                  Declined
                </Button>
              </div>
              <input
                className="field"
                placeholder="Decline reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="field"
                  type="datetime-local"
                  value={appointmentLocal}
                  onChange={(e) => setAppointmentLocal(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!appointmentLocal || mut.schedule.isPending}
                  onClick={() =>
                    void run(async () => {
                      const iso = new Date(appointmentLocal).toISOString()
                      const updated = await mut.schedule.mutateAsync({
                        jobId: job.id,
                        appointmentAt: iso,
                        key: newServiceKey(),
                      })
                      setJob(updated)
                    })
                  }
                >
                  Schedule
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      setJob(await mut.setStatus.mutateAsync({ jobId: job.id, status: 'in_progress', key: newServiceKey() }))
                    })
                  }
                >
                  In progress
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      setJob(
                        await mut.setStatus.mutateAsync({
                          jobId: job.id,
                          status: 'completed',
                          outcomeSummary: outcome || 'Completed',
                          key: newServiceKey(),
                        }),
                      )
                    })
                  }
                >
                  Completed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setStep('match')
                    setSelectedProviderId(null)
                  }}
                >
                  Reassign
                </Button>
              </div>
              <textarea
                className="field min-h-[60px]"
                placeholder="Outcome / notes"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
              <Button size="sm" variant="outline" className="w-full" onClick={() => { setJob(null); setStep('describe') }}>
                Add another job on this request
              </Button>
            </section>
          )}

          {error && <p className="text-sm text-rose-700">{error}</p>}
        </div>
      </div>

      <ProviderFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultTradeTypeId={tradeTypeId || null}
        defaultArea={areaHint || null}
        onSaved={(id) => {
          setAddOpen(false)
          setSelectedProviderId(id)
          params.set('preselectProvider', id)
          setParams(params, { replace: true })
          setBroaden(true)
          setStep('confirm')
        }}
      />
    </div>
  )
}
