import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ImagePlus, Loader2, Plus, Trash2, UserRound } from 'lucide-react'
import { useMe } from '@/api/hooks'
import { copilotApi, type EntityRef } from '@/copilot/api'
import { useDataCategory } from '@/lib/supabase/category'
import { uploadMediaMany } from '@/lib/supabase/media'
import {
  newServiceKey,
  useServiceProvider,
  useServiceProviderMutations,
  useServiceTradeTypes,
} from '@/api/serviceProviders'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RightSlideout } from '../shared/RightSlideout'
import { QeSuburbSelect } from '@/components/qe/QeSuburbSelect'

const MAX_PHOTO_BYTES = 25 * 1024 * 1024
const PHOTO_PURPOSE = 'service_job:site_photos'

type StagedPhoto = {
  key: string
  file: File
  previewUrl: string
}

type Props = {
  open: boolean
  onClose: () => void
  /** Pre-bound customer (from Customer Area). */
  personId?: string | null
  personName?: string | null
  /** Pre-bound claim — creates a claim-linked repair job (requires insurer acceptance). */
  claimId?: string | null
  claimReference?: string | null
  incidentType?: string | null
  /** Pre-bound provider (from directory). */
  providerId?: string | null
  /** Suggested trade type id from claim incident mapping. */
  preferredTradeTypeId?: string | null
  onCreated?: (jobId: string) => void
}

/** Create a service job from a customer and/or a directory provider (Fintastic Add-in-context). */
export function CreateServiceJobPanel({
  open,
  onClose,
  personId: lockedPersonId,
  personName: lockedPersonName,
  claimId: lockedClaimId,
  claimReference,
  incidentType,
  providerId,
  preferredTradeTypeId,
  onCreated,
}: Props) {
  const category = useDataCategory()
  const { data: me } = useMe()
  const tenantId = me?.organisation?.id ?? null
  const trades = useServiceTradeTypes()
  const mut = useServiceProviderMutations()
  const provider = useServiceProvider(providerId ?? undefined)

  const customerInputId = useId()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const customerRootRef = useRef<HTMLDivElement>(null)
  const photosRef = useRef<StagedPhoto[]>([])

  const [personQ, setPersonQ] = useState('')
  const [personHits, setPersonHits] = useState<EntityRef[]>([])
  const [personOpen, setPersonOpen] = useState(false)
  const [personLoading, setPersonLoading] = useState(false)
  const [personId, setPersonId] = useState<string | null>(lockedPersonId ?? null)
  const [personLabel, setPersonLabel] = useState(lockedPersonName ?? '')
  const [tradeTypeId, setTradeTypeId] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [urgency, setUrgency] = useState('same_day')
  const [allocate, setAllocate] = useState(Boolean(providerId))
  const [photos, setPhotos] = useState<StagedPhoto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [doneJobId, setDoneJobId] = useState<string | null>(null)

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    if (!open) return
    setError(null)
    setDoneJobId(null)
    setPersonId(lockedPersonId ?? null)
    setPersonLabel(lockedPersonName ?? '')
    setPersonQ('')
    setPersonHits([])
    setPersonOpen(false)
    setDescription('')
    setAddress('')
    setAllocate(Boolean(providerId))
    setPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl)
      return []
    })
    const preferred =
      preferredTradeTypeId ||
      provider.data?.trades?.[0]?.id ||
      (trades.data ?? []).find((t) => t.code === 'appliance_repair' || t.label.toLowerCase().includes('appliance'))?.id ||
      ''
    setTradeTypeId(preferred)
    if (provider.data?.address_formatted) setAddress(provider.data.address_formatted)
  }, [
    open,
    lockedPersonId,
    lockedPersonName,
    lockedClaimId,
    preferredTradeTypeId,
    providerId,
    provider.data?.id,
    provider.data?.address_formatted,
    trades.data,
  ])

  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl)
    }
  }, [])

  useEffect(() => {
    if (!open || lockedPersonId || !personOpen || !category) {
      if (!personOpen) setPersonHits([])
      return
    }
    const q = personQ.trim()
    if (q.length < 2) {
      setPersonHits([])
      setPersonLoading(false)
      return
    }
    setPersonLoading(true)
    const t = window.setTimeout(() => {
      void copilotApi
        .search(q, category, ['client'])
        .then((rows) => setPersonHits(rows.filter((r) => r.record_type === 'client').slice(0, 8)))
        .catch(() => setPersonHits([]))
        .finally(() => setPersonLoading(false))
    }, 220)
    return () => window.clearTimeout(t)
  }, [personQ, open, lockedPersonId, category, personOpen])

  useEffect(() => {
    if (!personOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!customerRootRef.current?.contains(e.target as Node)) setPersonOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [personOpen])

  const pickCustomer = (h: EntityRef) => {
    setPersonId(h.id)
    setPersonLabel(h.name)
    setPersonQ('')
    setPersonHits([])
    setPersonOpen(false)
  }

  const stagePhotos = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const tooBig = files.filter((f) => f.size > MAX_PHOTO_BYTES)
    if (tooBig.length) {
      setError(`Each photo must be under 25 MB (${tooBig.map((f) => f.name).join(', ')})`)
      return
    }
    setError(null)
    setPhotos((prev) => [
      ...prev,
      ...files.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ])
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const removePhoto = (key: string) => {
    setPhotos((prev) => {
      const hit = prev.find((p) => p.key === key)
      if (hit) URL.revokeObjectURL(hit.previewUrl)
      return prev.filter((p) => p.key !== key)
    })
  }

  const save = async () => {
    if (doneJobId) {
      onClose()
      return
    }
    if (!personId && !lockedClaimId) {
      setError('Choose a customer for this job.')
      return
    }
    if (!tradeTypeId || !description.trim()) {
      setError('Trade and work description are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const job = await mut.createJob.mutateAsync({
        personId: lockedClaimId ? null : personId,
        claimId: lockedClaimId ?? null,
        tradeTypeId,
        workDescription: description.trim(),
        urgency,
        serviceAddress: address.trim() || 'Address to confirm',
        paymentResponsibility: lockedClaimId ? 'insurer' : 'unconfirmed',
        authorityStatus: lockedClaimId ? 'recorded' : 'pending',
        key: newServiceKey(),
      })
      if (allocate && providerId) {
        await mut.allocate.mutateAsync({
          jobId: job.id,
          providerId,
          key: newServiceKey(),
        })
      }

      let photoWarn: string | null = null
      if (photos.length) {
        if (!tenantId) {
          photoWarn = 'Job created, but photos could not be uploaded (no brokerage workspace). Add them on the job detail.'
        } else {
          const { errors } = await uploadMediaMany({
            tenantId,
            files: photos.map((p) => p.file),
            purpose: PHOTO_PURPOSE,
            ownerTable: 'service_jobs',
            ownerId: job.id,
          })
          if (errors.length) {
            photoWarn = `Job created, but some photos failed (${errors.map((e) => e.file).join(', ')}). Add them on the job detail.`
          }
        }
      }

      onCreated?.(job.id)
      if (photoWarn) {
        setDoneJobId(job.id)
        setPhotos((prev) => {
          for (const p of prev) URL.revokeObjectURL(p.previewUrl)
          return []
        })
        setError(photoWarn)
        return
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create job')
    } finally {
      setSaving(false)
    }
  }

  const qTooShort = personQ.trim().length > 0 && personQ.trim().length < 2

  return (
    <RightSlideout
      open={open}
      onClose={onClose}
      title={claimReference ? `Create job · ${claimReference}` : 'Create service job'}
      subtitle={
        claimReference
          ? `Claim-linked repair${incidentType ? ` · ${incidentType.replace(/_/g, ' ')}` : ''}${personLabel ? ` · ${personLabel}` : ''}`
          : provider.data
            ? `Working on · ${provider.data.trading_name}`
            : personLabel
              ? `Working on · ${personLabel}`
              : 'Customer + trade · optional provider'
      }
      size="default"
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" variant="outline" type="button" onClick={onClose}>
            {doneJobId ? 'Close' : 'Cancel'}
          </Button>
          {!doneJobId && (
            <Button className="flex-1" variant="accent" type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              {allocate && providerId ? 'Create & allocate' : 'Create job'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {lockedClaimId && (
          <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-950">
            Quotes are linked to claim <span className="font-semibold">{claimReference ?? lockedClaimId}</span>.
            Insurer acceptance is required before the job can be saved.
          </p>
        )}
        {!lockedPersonId ? (
          <div className="block space-y-1">
            <label htmlFor={customerInputId} className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              Customer *
            </label>
            {personId ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-navy-800/10 bg-white px-3 py-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium text-navy-900">
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-navy-400" />
                  <span className="truncate">{personLabel || 'Selected customer'}</span>
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-700 underline"
                  disabled={Boolean(doneJobId)}
                  onClick={() => {
                    setPersonId(null)
                    setPersonLabel('')
                    setPersonOpen(true)
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div ref={customerRootRef} className="relative">
                <div className="relative">
                  <input
                    id={customerInputId}
                    className="field w-full pr-9"
                    value={personQ}
                    disabled={Boolean(doneJobId)}
                    onChange={(e) => {
                      setPersonQ(e.target.value)
                      setPersonOpen(true)
                    }}
                    onFocus={() => setPersonOpen(true)}
                    placeholder="Search customer name…"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={personOpen}
                    aria-controls={`${customerInputId}-list`}
                    aria-autocomplete="list"
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
                    aria-label={personOpen ? 'Close customer list' : 'Open customer list'}
                    disabled={Boolean(doneJobId)}
                    onClick={() => setPersonOpen((o) => !o)}
                  >
                    {personLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', personOpen && 'rotate-180')} />
                    )}
                  </button>
                </div>
                {personOpen && (
                  <ul
                    id={`${customerInputId}-list`}
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-navy-800/10 bg-white py-1 shadow-lg"
                  >
                    {personQ.trim().length < 2 ? (
                      <li className="px-3 py-2 text-sm text-navy-500">
                        {qTooShort ? 'Keep typing — at least 2 letters' : 'Type at least 2 letters to find a customer'}
                      </li>
                    ) : personLoading && personHits.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-navy-500">Searching…</li>
                    ) : personHits.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-navy-500">No customers match “{personQ.trim()}”</li>
                    ) : (
                      personHits.map((h) => (
                        <li key={h.id} role="option">
                          <button
                            type="button"
                            className="flex w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                            onClick={() => pickCustomer(h)}
                          >
                            <span className="min-w-0">
                              <span className="block font-medium text-navy-900">{h.name}</span>
                              {h.number ? <span className="block text-xs text-navy-500">{h.number}</span> : null}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-navy-800/10 bg-navy-50/70 px-3 py-2 text-sm">
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Customer</p>
            <p className="font-medium text-navy-900">{personLabel || lockedPersonName || 'Selected customer'}</p>
          </div>
        )}

        {provider.data && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-3 py-2 text-sm">
            <p className="text-[11px] font-semibold tracking-wide text-brand-800 uppercase">Provider</p>
            <p className="font-medium text-navy-900">{provider.data.trading_name}</p>
            <label className="mt-2 flex items-center gap-2 text-xs text-navy-700">
              <input
                type="checkbox"
                checked={allocate}
                disabled={Boolean(doneJobId)}
                onChange={(e) => setAllocate(e.target.checked)}
              />
              Allocate this provider when creating the job
            </label>
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Trade *</span>
          <select
            className="field"
            value={tradeTypeId}
            disabled={Boolean(doneJobId)}
            onChange={(e) => setTradeTypeId(e.target.value)}
          >
            <option value="">Select trade</option>
            {(trades.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Work description *</span>
          <textarea
            className="field min-h-[72px]"
            value={description}
            disabled={Boolean(doneJobId)}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs doing?"
          />
        </label>

        <QeSuburbSelect
          label="Service area / address"
          value={address}
          valueMode="area"
          onChange={setAddress}
          placeholder="Suburb or full address"
          disabled={Boolean(doneJobId)}
        />

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Urgency</span>
          <select
            className="field"
            value={urgency}
            disabled={Boolean(doneJobId)}
            onChange={(e) => setUrgency(e.target.value)}
          >
            <option value="emergency">Emergency</option>
            <option value="same_day">Same day</option>
            <option value="standard">Standard</option>
          </select>
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Photos (optional)</p>
              <p className="text-[11px] text-navy-500">Site / appliance photos for the provider. Up to 25 MB each.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(doneJobId) || saving}
              onClick={() => photoInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Add
            </Button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => stagePhotos(e.target.files)}
            />
          </div>
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <li key={p.key} className="relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-navy-800/10">
                  <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 rounded bg-white/90 p-0.5 text-navy-600 shadow hover:text-rose-700"
                    aria-label={`Remove ${p.file.name}`}
                    disabled={Boolean(doneJobId) || saving}
                    onClick={() => removePhoto(p.key)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className={cn('text-xs', doneJobId ? 'text-amber-800' : 'text-rose-700')}>
            {error}
            {doneJobId ? (
              <button type="button" className="ml-2 font-semibold underline" onClick={onClose}>
                Close
              </button>
            ) : null}
          </p>
        )}
      </div>
    </RightSlideout>
  )
}
