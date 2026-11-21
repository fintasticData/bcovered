import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Building2, Camera, Car, Loader2, Package, Trash2, Upload } from 'lucide-react'
import { INCIDENT_TYPES } from '@/broker/claims/claimLabels'
import { proposeClaimFromNotes } from '@/broker/claims/proposeFromNotes'
import { resolveCoverOnLossDate } from '@/broker/claims/resolveCoverOnLossDate'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { zar } from '@/broker/shared/ui'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { coverSectionLabel } from '@/api/concierge'
import type { CustomerPageDto, CustomerPageItem } from '@/api/customerPage'
import {
  insuredItemPhotoUrl,
  newKey,
  policyClaimsApi,
  useMyCover,
  usePersonInsuredItems,
  usePolicyClaimsMutation,
  usePolicyDetail,
  type InsuredItemRow,
} from '@/copilot/policyClaimsApi'
import { uploadMediaMany, type MediaUploadResult } from '@/lib/supabase/media'
import type { DataCategory } from '@/lib/supabase/category'
import { isSampleBookPortalEmail } from '@/lib/demo/samplePortal'
import { useSupabaseAuth } from '@/lib/supabase/client'

const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const MAX_PHOTO_BYTES = 25 * 1024 * 1024
/** Short enough for demos; still blocks empty submit. */
const MIN_DESCRIPTION = 5

export type ReportClaimTarget = {
  policyId?: string | null
  itemId?: string | null
  personId?: string | null
  itemLabel?: string | null
}

/** In-context incident report — stays on Cover / Customer Area via RightSlideout. */
export function ReportClaimSlideout({
  open,
  onClose,
  mode = 'customer',
  dto,
  target,
  onDone,
  /** Portal/demo must pass `sample` — workspace localStorage may still be `live`. */
  category: categoryProp,
}: {
  open: boolean
  onClose: () => void
  mode?: 'customer' | 'broker'
  /** Customer My Page book (policies + items). Required for customer mode. */
  dto?: Pick<CustomerPageDto, 'items' | 'policies' | 'person_id' | 'full_name' | 'data_category'>
  target?: ReportClaimTarget | null
  onDone?: (result: { claim_id?: string; reference?: string }) => void
  category?: DataCategory | null
}) {
  const auth = useSupabaseAuth()
  const personId = target?.personId ?? dto?.person_id ?? ''
  const prefPolicy = target?.policyId ?? ''
  const prefItem = target?.itemId ?? ''
  const category = useMemo((): DataCategory | null => {
    if (mode === 'customer' && isSampleBookPortalEmail(auth.email)) return 'sample'
    return categoryProp ?? dto?.data_category ?? null
  }, [mode, auth.email, categoryProp, dto?.data_category])

  const cover = useMyCover(mode === 'customer' ? category : null)
  const personItems = usePersonInsuredItems(mode === 'broker' && personId ? personId : null)
  const policy = usePolicyDetail(mode === 'broker' && prefPolicy ? prefPolicy : null)
  const customerCreate = usePolicyClaimsMutation(policyClaimsApi.customerCreateClaim, category)
  const brokerCreate = usePolicyClaimsMutation(policyClaimsApi.createClaim, category)
  const create = mode === 'broker' ? brokerCreate : customerCreate

  const [tab, setTab] = useState('details')
  const [notes, setNotes] = useState('')
  const [form, setForm] = useState({
    policy_id: prefPolicy || '',
    incident_date: '',
    incident_time: '',
    time_unknown: mode === 'customer',
    incident_type: 'motor_accident',
    description: '',
    item_ids: prefItem ? [prefItem] : ([] as string[]),
  })
  const [confirmed, setConfirmed] = useState(false)
  const [photos, setPhotos] = useState<MediaUploadResult[]>([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const items: InsuredItemRow[] = useMemo(() => {
    if (mode === 'broker') {
      return personItems.data?.rows ?? []
    }
    if (cover.data?.rows?.length) {
      const seen = new Set<string>()
      return cover.data.rows.filter((row) => {
        if (seen.has(row.id)) return false
        seen.add(row.id)
        return true
      })
    }
    return (dto?.items ?? []).map(customerItemToInsured)
  }, [mode, personItems.data?.rows, cover.data?.rows, dto?.items])

  const policyOptions = useMemo(() => {
    const map = new Map<string, string>()
    if (dto?.policies) {
      for (const p of dto.policies) {
        map.set(p.id, [p.policy_number, p.insurer_name, p.reference].filter(Boolean).join(' · ') || p.id)
      }
    }
    for (const i of items) {
      if (!i.policy_id || map.has(i.policy_id)) continue
      const label =
        [i.policy_number, i.insurer_name, i.display_label].filter(Boolean).join(' · ') || i.display_label
      map.set(i.policy_id, label)
    }
    return [...map.entries()]
  }, [dto?.policies, items])

  const tenantId = cover.data?.tenant_id ?? null

  const coverPreview = useMemo(() => {
    if (mode !== 'broker' || !prefPolicy || !form.incident_date || !policy.data?.versions?.length) return null
    const incidentAt =
      form.time_unknown || !form.incident_time
        ? `${form.incident_date}T12:00:00`
        : `${form.incident_date}T${form.incident_time}:00`
    return resolveCoverOnLossDate(
      policy.data.versions,
      new Date(incidentAt).toISOString(),
      form.time_unknown || !form.incident_time,
    )
  }, [mode, prefPolicy, form.incident_date, form.incident_time, form.time_unknown, policy.data?.versions])

  useEffect(() => {
    if (!open) return
    setTab('details')
    setNotes('')
    setConfirmed(false)
    setPhotos([])
    setPhotoError(null)
    setForm({
      policy_id: prefPolicy || '',
      incident_date: '',
      incident_time: '',
      time_unknown: mode === 'customer',
      incident_type: 'motor_accident',
      description: '',
      item_ids: prefItem ? [prefItem] : [],
    })
    customerCreate.reset()
    brokerCreate.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when slideout opens / target changes
  }, [open, prefPolicy, prefItem, mode])

  const resetAndClose = () => {
    onClose()
  }

  const applyNotes = () => {
    const draft = proposeClaimFromNotes(notes, items)
    setForm((f) => ({
      ...f,
      ...draft,
      item_ids: draft.item_ids?.length ? draft.item_ids : f.item_ids,
      description: draft.description || f.description,
      policy_id: f.policy_id || prefPolicy || '',
    }))
  }

  const toggleItem = (id: string) => {
    setForm((f) => ({
      ...f,
      item_ids: f.item_ids.includes(id) ? f.item_ids.filter((x) => x !== id) : [...f.item_ids, id],
    }))
  }

  const uploadPhotos = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (!files.length || !tenantId) return
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      const tooBig = files.filter((f) => f.size > MAX_PHOTO_BYTES)
      if (tooBig.length) {
        throw new Error(`Each photo must be under 25 MB (${tooBig.map((f) => f.name).join(', ')})`)
      }
      const { uploaded, errors } = await uploadMediaMany({
        tenantId,
        files,
        purpose: 'claim_evidence:Photos of damage',
      })
      if (uploaded.length) setPhotos((prev) => [...prev, ...uploaded])
      if (errors.length) {
        setPhotoError(errors.map((e) => `${e.file}: ${e.message}`).join(' · '))
      } else if (!uploaded.length) {
        setPhotoError('No photos were uploaded')
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setPhotoBusy(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!confirmed) return
    if (mode === 'broker' && !personId) return
    const incidentAt =
      form.time_unknown || !form.incident_time
        ? `${form.incident_date}T12:00:00`
        : `${form.incident_date}T${form.incident_time}:00`
    const key = newKey()
    const incident_at = new Date(incidentAt).toISOString()
    const incident_time_unknown = form.time_unknown || !form.incident_time

    if (mode === 'broker') {
      brokerCreate.mutate(
        {
          person_id: personId,
          policy_id: form.policy_id || prefPolicy || null,
          incident_at,
          incident_time_unknown,
          incident_type: form.incident_type,
          description: form.description,
          item_ids: form.item_ids,
          key,
        },
        {
          onSuccess: (res) => {
            onDone?.({ claim_id: res.claim_id, reference: res.reference })
            resetAndClose()
          },
        },
      )
      return
    }

    customerCreate.mutate(
      {
        incident_at,
        incident_time_unknown,
        incident_type: form.incident_type,
        description: form.description,
        policy_id: form.policy_id || null,
        item_ids: form.item_ids,
        photo_media_asset_ids: photos.map((p) => p.id),
        key,
      },
      {
        onSuccess: (res) => {
          onDone?.({ claim_id: res.claim_id, reference: res.reference })
          resetAndClose()
        },
      },
    )
  }

  const subtitleParts = [
    target?.itemLabel,
    mode === 'broker' ? dto?.full_name ?? (personId ? `Person ${personId.slice(0, 8)}…` : null) : null,
    form.policy_id
      ? policyOptions.find(([id]) => id === form.policy_id)?.[1]
      : null,
  ].filter(Boolean)

  const descriptionOk = form.description.trim().length >= MIN_DESCRIPTION
  const blockers = [
    !form.incident_date ? 'Add an incident date on Details.' : null,
    !descriptionOk
      ? `Description needs at least ${MIN_DESCRIPTION} characters (currently ${form.description.trim().length}).`
      : null,
    !confirmed ? 'Tick the confirmation checkbox to submit.' : null,
    mode === 'broker' && !personId ? 'Select a client first.' : null,
    photoBusy ? 'Wait for photo upload to finish.' : null,
  ].filter(Boolean) as string[]
  const canSubmit = blockers.length === 0 && !create.isPending

  if (mode === 'broker' && open && !personId) {
    return (
      <RightSlideout
        open={open}
        onClose={resetAndClose}
        title="Report an incident"
        subtitle="Select a client first"
        size="wide"
        footer={
          <Button size="sm" variant="outline" type="button" onClick={resetAndClose}>
            Close
          </Button>
        }
      >
        <p className="text-sm text-navy-700">
          Open a client in Customer Area, then use Incident form from their Claims tab — or start from a policy.
        </p>
      </RightSlideout>
    )
  }

  return (
    <RightSlideout
      open={open}
      onClose={resetAndClose}
      title="Report an incident"
      subtitle={
        subtitleParts.length
          ? subtitleParts.join(' · ')
          : 'Describe what happened. Your broker receives the same claim form.'
      }
      size="wide"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" type="button" onClick={resetAndClose}>
            Cancel
          </Button>
          {tab !== 'review' ? (
            <Button
              size="sm"
              variant="accent"
              type="button"
              onClick={() => setTab(tab === 'details' ? 'photos' : 'review')}
            >
              Continue
            </Button>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
              {blockers[0] && (
                <p className="w-full text-right text-[11px] text-amber-800" role="status">
                  {blockers[0]}
                </p>
              )}
              <Button
                size="sm"
                variant="accent"
                type="submit"
                form="report-claim-form"
                disabled={!canSubmit}
              >
                {create.isPending ? <Loader2 className="animate-spin" /> : null}
                Submit report
              </Button>
            </div>
          )}
        </div>
      }
    >
      <form id="report-claim-form" className="space-y-3" onSubmit={submit}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-3 space-y-3">
            <div className="space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/40 p-3">
              <p className="text-xs font-semibold text-navy-800">
                {mode === 'broker' ? 'Russ · draft from notes' : 'Describe the incident'}
              </p>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm"
                placeholder={
                  mode === 'broker'
                    ? 'e.g. Client called: rear-ended in the Polo on 12 Nov 2026 around 14:30.'
                    : 'e.g. I was rear-ended in my Polo on 12 Nov 2026 around 14:30.'
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button type="button" size="sm" variant="outline" onClick={applyNotes} disabled={!notes.trim()}>
                {mode === 'broker' ? 'Fill form from notes' : 'Fill details from my description'}
              </Button>
            </div>

            {policyOptions.length > 0 && (
              <label className="block text-xs font-semibold text-navy-600">
                Policy (if known)
                <select
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  value={form.policy_id}
                  onChange={(e) => setForm({ ...form, policy_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {policyOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-navy-600">
                Incident date
                <input
                  required
                  type="date"
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  value={form.incident_date}
                  onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Time (if known)
                <input
                  type="time"
                  disabled={form.time_unknown}
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  value={form.incident_time}
                  onChange={(e) =>
                    setForm({ ...form, incident_time: e.target.value, time_unknown: false })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-navy-700">
              <input
                type="checkbox"
                checked={form.time_unknown}
                onChange={(e) =>
                  setForm({ ...form, time_unknown: e.target.checked, incident_time: '' })
                }
              />
              Time unknown
            </label>

            {coverPreview && (
              <div
                className={
                  coverPreview.review_needed
                    ? 'rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950'
                    : 'rounded-xl border border-navy-800/10 bg-navy-50/50 px-3 py-2 text-sm text-navy-900'
                }
              >
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                  Applicable on loss date
                </p>
                {coverPreview.review_needed ? (
                  <>
                    <p className="mt-0.5 font-semibold">Schedule review required</p>
                    <p className="text-xs">Excess unresolved. {coverPreview.reason}</p>
                  </>
                ) : (
                  <p className="mt-0.5">
                    {(coverPreview.item_labels.length
                      ? coverPreview.item_labels.join(', ')
                      : 'Covered items') +
                      ' · excess '}
                    {coverPreview.excess != null ? zar(coverPreview.excess, true) : '—'}
                  </p>
                )}
              </div>
            )}

            <label className="block text-xs font-semibold text-navy-600">
              Type
              <select
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                value={form.incident_type}
                onChange={(e) => setForm({ ...form, incident_type: e.target.value })}
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-navy-600">
              Description
              <textarea
                required
                minLength={MIN_DESCRIPTION}
                rows={4}
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                placeholder="What happened? Include place, other vehicles, and injuries if any."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <span
                className={`mt-1 block text-[11px] ${descriptionOk ? 'text-navy-500' : 'text-amber-800'}`}
              >
                {form.description.trim().length}/{MIN_DESCRIPTION} characters minimum
              </span>
            </label>

            {items.length > 0 && (
              <fieldset>
                <legend className="text-xs font-semibold text-navy-600">Affected items</legend>
                <ul className="mt-2 space-y-2">
                  {items.map((i) => (
                    <li key={i.id}>
                      <AffectedItemOption
                        item={i}
                        checked={form.item_ids.includes(i.id)}
                        onToggle={() => toggleItem(i.id)}
                        compact={mode === 'broker'}
                      />
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
          </TabsContent>

          <TabsContent value="photos" className="mt-3 space-y-3">
            <div className="space-y-2 rounded-xl border border-navy-800/10 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-navy-800">Photos of damage</p>
                  <p className="mt-0.5 text-[11px] text-navy-500">
                    {mode === 'broker'
                      ? 'Optional now — evidence can also be added on the claim desk.'
                      : 'Upload to the BCovered media bucket. Photos attach when you submit.'}
                  </p>
                </div>
                <Camera className="h-4 w-4 shrink-0 text-navy-400" />
              </div>
              {mode === 'customer' && tenantId ? (
                <>
                  {photos.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {photos.map((p) => (
                        <li key={p.id} className="relative">
                          <img
                            src={p.public_url ?? p.url}
                            alt={p.file_name}
                            className="h-16 w-16 rounded-lg object-cover ring-1 ring-navy-800/10"
                          />
                          <button
                            type="button"
                            className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-navy-900 text-white"
                            onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                            aria-label={`Remove ${p.file_name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    className="sr-only"
                    accept={PHOTO_ACCEPT}
                    multiple
                    disabled={photoBusy}
                    onChange={(e) => void uploadPhotos(e.target.files)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoBusy ? <Loader2 className="animate-spin" /> : <Upload />}
                    {photos.length ? 'Add more photos' : 'Upload photos'}
                  </Button>
                  {photoError && <p className="text-xs text-red-600">{photoError}</p>}
                </>
              ) : mode === 'customer' ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Photo upload needs your brokerage link. You can still submit and add photos later.
                </p>
              ) : (
                <p className="text-xs text-navy-600">
                  Continue to Review to submit. Add evidence from the claim desk after creation.
                </p>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setTab('review')}>
              Continue to review
            </Button>
          </TabsContent>

          <TabsContent value="review" className="mt-3 space-y-3">
            <dl className="grid gap-2 rounded-xl border border-navy-800/10 bg-navy-50/30 p-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">When</dt>
                <dd className="mt-0.5 text-navy-900">
                  {form.incident_date || '—'}
                  {!form.time_unknown && form.incident_time ? ` · ${form.incident_time}` : ' · time unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Type</dt>
                <dd className="mt-0.5 capitalize text-navy-900">
                  {INCIDENT_TYPES.find((t) => t.value === form.incident_type)?.label ?? form.incident_type}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Description</dt>
                <dd className="mt-0.5">
                  <textarea
                    rows={3}
                    minLength={MIN_DESCRIPTION}
                    className="w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm text-navy-800"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                  {!descriptionOk && (
                    <p className="mt-1 text-[11px] text-amber-800">
                      Add a bit more detail — at least {MIN_DESCRIPTION} characters.
                    </p>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Items</dt>
                <dd className="mt-0.5 text-navy-800">
                  {form.item_ids.length
                    ? form.item_ids
                        .map((id) => items.find((i) => i.id === id)?.display_label ?? id)
                        .join(', ')
                    : 'None selected'}
                </dd>
              </div>
              {mode === 'customer' && (
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Photos</dt>
                  <dd className="mt-0.5 text-navy-800">{photos.length} attached</dd>
                </div>
              )}
            </dl>
            <label className="flex items-start gap-2 text-xs text-navy-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have reviewed these details and want to submit this incident report to B-Covered.
            </label>
            {blockers.length > 0 && (
              <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {create.error && (
              <p className="text-xs text-red-700" role="alert">
                {friendlyClaimError((create.error as Error).message)}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </form>
    </RightSlideout>
  )
}

function friendlyClaimError(raw: string): string {
  const msg = raw.trim().toLowerCase()
  if (msg.includes('claim_policy_not_on_cover')) {
    return 'That policy is not on your cover book for this demo. Pick an item from Items & cover, then report again.'
  }
  if (msg.includes('claim_missing_tenant') || msg.includes('claim_no_person_link')) {
    return 'Your demo login is missing a cover link. Refresh /demo/my, or ask your broker to re-open the sample portal.'
  }
  if (msg.includes('claim_not_a_customer') || msg.includes('claim_category_denied')) {
    return 'This login cannot report a claim here. Use the demo customer portal (/demo/my).'
  }
  if (msg === 'forbidden' || msg.includes('403') || msg.includes('42501')) {
    return 'Could not create this claim for your cover book (demo sample vs production mismatch, or the policy is not linked to your login). Try again from /demo/my, or ask your broker to open the incident form.'
  }
  return raw
}

function customerItemToInsured(item: CustomerPageItem): InsuredItemRow {
  return {
    id: item.id,
    item_type: item.item_type,
    status: item.cover_status,
    display_label: item.display_label,
    details: item.details ?? {},
    policy_id: item.policy_id,
    photo_url: item.photo_url,
    insurer_name: item.insurer_name ?? null,
    policy_number: item.policy_reference,
  }
}

function AffectedItemOption({
  item,
  checked,
  onToggle,
  compact,
}: {
  item: InsuredItemRow
  checked: boolean
  onToggle: () => void
  compact?: boolean
}) {
  if (compact) {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        {item.display_label}
      </label>
    )
  }
  const photo = insuredItemPhotoUrl(item)
  const section = coverSectionLabel(item.section_code, null, item.item_type)
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
        checked ? 'border-brand-400 bg-brand-50/50' : 'border-navy-800/10 bg-white hover:border-navy-300'
      }`}
    >
      <input type="checkbox" className="shrink-0" checked={checked} onChange={onToggle} />
      {photo ? (
        <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-500">
          <ItemTypeIcon type={item.item_type} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-navy-950">{item.display_label}</span>
        <span className="mt-0.5 block text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          {item.section_code ? `${item.section_code} · ` : null}
          {section}
          {item.policy_number ? ` · ${item.policy_number}` : null}
        </span>
      </span>
    </label>
  )
}

function ItemTypeIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5'
  if (type === 'vehicle') return <Car className={cls} />
  if (type === 'building') return <Building2 className={cls} />
  if (type === 'equipment') return <Camera className={cls} />
  return <Package className={cls} />
}
