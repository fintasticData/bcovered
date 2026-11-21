import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { newConciergeKey, useConciergeHome, useConciergeMutations } from '@/api/concierge'
import { useMe } from '@/api/hooks'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'
import { MediaField } from '@/components/MediaField'
import { usePortalCategory } from '@/pages/my/CustomerLayout'
import { ConciergeShell } from './ConciergeShell'

const ITEM_TYPES = [
  { value: 'equipment', label: 'Equipment', code: 'PAV' },
  { value: 'contents', label: 'Home contents', code: 'HCAT' },
  { value: 'vehicle', label: 'Vehicle', code: 'MOT' },
  { value: 'building', label: 'Building', code: 'HOB' },
] as const

export default function ConciergeNewRequestPage() {
  const [params] = useSearchParams()
  const kind = params.get('kind') ?? (params.get('itemId') ? 'assist' : 'assist')
  const itemId = params.get('itemId')
  const { data: me, isLoading: meLoading } = useMe()
  const category = usePortalCategory()
  const isCustomer = me?.role === 'customer'
  const home = useConciergeHome({
    enabled: isCustomer,
    authEmail: me?.email,
    categoryOverride: category,
  })
  const mut = useConciergeMutations()
  const navigate = useNavigate()
  const [message, setMessage] = useState(
    kind === 'callback'
      ? 'Please call me about this.'
      : kind === 'add_item'
        ? 'I would like to add this item to my cover.'
        : 'Please help with this item.',
  )
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState('equipment')
  const [declaredValue, setDeclaredValue] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tenantId = home.data?.brokerage?.id ?? null

  const selectedItem = useMemo(
    () => (home.data?.items ?? []).find((i) => i.id === itemId) ?? null,
    [home.data?.items, itemId],
  )

  if (meLoading) {
    return (
      <ConciergeShell>
        <LoadingState label="Preparing request…" />
      </ConciergeShell>
    )
  }

  if (!isCustomer) {
    return <Navigate to="/broker/concierge" replace />
  }

  if (home.isLoading) {
    return (
      <ConciergeShell>
        <LoadingState label="Preparing request…" />
      </ConciergeShell>
    )
  }

  if (!home.data?.enabled) {
    return (
      <ConciergeShell>
        <ErrorState message="Concierge is not enabled for this account." />
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="outline" asChild>
            <Link to="/my">Back to My Page</Link>
          </Button>
        </div>
      </ConciergeShell>
    )
  }

  const title =
    kind === 'callback'
      ? 'Request a call'
      : kind === 'add_item'
        ? 'Add an item to insure'
        : selectedItem
          ? `Ask my concierge · ${selectedItem.display_label}`
          : 'Ask my concierge'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const typeMeta = ITEM_TYPES.find((t) => t.value === newType)
      const result = await mut.create.mutateAsync({
        kind: kind === 'add_item' ? 'add_item' : kind === 'callback' ? 'callback' : 'assist',
        title:
          kind === 'add_item'
            ? `Add ${newLabel || 'item'} to cover`
            : kind === 'callback'
              ? `Call about ${selectedItem?.display_label ?? 'my cover'}`
              : selectedItem
                ? `Help with ${selectedItem.display_label}`
                : 'Ask my concierge',
        itemId: selectedItem?.id ?? null,
        message,
        details: {
          ...(selectedItem?.details ?? {}),
          ...(kind === 'add_item'
            ? {
                section_code: typeMeta?.code ?? null,
                photo_url: photoUrl || null,
              }
            : {}),
        },
        key: newConciergeKey(),
        newItemLabel: kind === 'add_item' ? newLabel : null,
        newItemType: kind === 'add_item' ? newType : null,
        declaredValue: kind === 'add_item' && declaredValue ? Number(declaredValue) : null,
      })
      navigate(`/my/concierge/requests/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create request')
    }
  }

  const conciergeFirst = home.data.concierge?.name?.split(' ')[0] ?? 'your concierge'

  return (
    <ConciergeShell>
      <div className="mx-auto max-w-xl">
        <p className="eyebrow">
          <Link to="/my/concierge" className="hover:text-brand-700">
            VIP Concierge
          </Link>
          {' · '}New request
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-brand-900">{title}</h1>
        <p className="mt-2 text-sm text-navy-600">
          {kind === 'add_item'
            ? `${conciergeFirst} will pick this up and get a quote path started for you.`
            : `Send a clear note to ${conciergeFirst} — they will reply on your Concierge desk.`}
        </p>

        {selectedItem && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-800/10 bg-white p-3 shadow-sm">
            {selectedItem.photo_url ? (
              <img src={selectedItem.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
                {selectedItem.section_code ?? 'ITEM'}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-brand-900">{selectedItem.display_label}</p>
              <p className="text-xs text-navy-600">
                {selectedItem.section_code ? `${selectedItem.section_code} · ` : null}
                {selectedItem.policy_number || selectedItem.policy_id
                  ? `${selectedItem.policy_number ?? 'Policy linked'}${selectedItem.insurer_name ? ` · ${selectedItem.insurer_name}` : ''}`
                  : 'No policy yet'}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5 sm:p-6">
          {kind === 'add_item' && (
            <>
              <label className="block">
                <span className="field-label">What are you insuring?</span>
                <input
                  className="field"
                  required
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Camera equipment"
                />
              </label>

              <fieldset>
                <legend className="field-label">Type</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {ITEM_TYPES.map((t) => {
                    const active = newType === t.value
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setNewType(t.value)}
                        className={
                          active
                            ? 'rounded-xl border border-brand-500 bg-brand-50 px-3 py-2.5 text-left shadow-sm'
                            : 'rounded-xl border border-brand-800/15 bg-white px-3 py-2.5 text-left hover:border-brand-400'
                        }
                      >
                        <span className="block text-[11px] font-semibold tracking-wide text-brand-600 uppercase">
                          {t.code}
                        </span>
                        <span className="text-sm font-semibold text-brand-900">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <label className="block">
                <span className="field-label">Declared value (optional)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-navy-400">
                    R
                  </span>
                  <input
                    className="field pl-8"
                    type="number"
                    min={0}
                    value={declaredValue}
                    onChange={(e) => setDeclaredValue(e.target.value)}
                    placeholder="45 000"
                  />
                </div>
              </label>

              {tenantId ? (
                <MediaField
                  label="Item photo"
                  hint="Upload a photo — saved to the BCovered media bucket; the public URL is stored on the item."
                  tenantId={tenantId}
                  purpose="concierge_item_photo"
                  kind="image"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  value={photoUrl}
                  onChange={setPhotoUrl}
                />
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Photo upload needs your Concierge brokerage link. Refresh if this stays empty.
                </p>
              )}
            </>
          )}

          <label className="block">
            <span className="field-label">Message for {conciergeFirst}</span>
            <textarea
              className="field min-h-[110px]"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="submit"
              size="sm"
              className="bg-brand-800 text-white hover:bg-brand-900"
              disabled={mut.create.isPending}
            >
              {mut.create.isPending ? 'Sending…' : 'Send request'}
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to="/my/concierge">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </ConciergeShell>
  )
}
