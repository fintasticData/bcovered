import { useId, useState, type FormEvent } from 'react'
import { Plus, ShieldCheck, Upload } from 'lucide-react'
import { newCustomerPageKey, useCustomerPageRequestItem, type CustomerPageDto } from '@/api/customerPage'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DataCategory } from '@/lib/supabase/category'

/** Compact right-slide form — Item details · Photos & documents. */
export function AddItemSlideout({
  open,
  onClose,
  dto,
  category,
  readOnly,
  onDone,
  onSavedAndQuote,
  title = 'Add an item to insure',
  subtitle = 'Save to your asset register. Request a quote when you are ready.',
}: {
  open: boolean
  onClose: () => void
  dto: Pick<CustomerPageDto, 'items' | 'business'>
  category: DataCategory
  readOnly?: boolean
  onDone?: (itemId?: string) => void
  onSavedAndQuote?: (itemId: string) => void
  title?: string
  subtitle?: string
}) {
  const labelId = useId()
  const request = useCustomerPageRequestItem(category)
  const [tab, setTab] = useState('details')
  const [key, setKey] = useState(newCustomerPageKey)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [itemType, setItemType] = useState(dto.business ? 'equipment' : 'vehicle')
  const [value, setValue] = useState('')
  const [locationId, setLocationId] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const locations = dto.business?.locations ?? []

  const reset = () => {
    setLabel('')
    setDescription('')
    setValue('')
    setPhotoUrl('')
    setLocationId('')
    setConfirm(null)
    setTab('details')
    setKey(newCustomerPageKey())
  }

  const persist = (thenQuote: boolean) => {
    if (readOnly || !label.trim()) return
    request.mutate(
      {
        display_label: label.trim(),
        item_type: itemType,
        description: description.trim() || null,
        declared_value: value ? Number(value) : null,
        location_id: locationId || null,
        photo_url: photoUrl.trim() || null,
        key,
      },
      {
        onSuccess: (r) => {
          setConfirm(r.summary)
          setLabel('')
          setDescription('')
          setValue('')
          setPhotoUrl('')
          setKey(newCustomerPageKey())
          onDone?.(r.item_id)
          if (thenQuote) onSavedAndQuote?.(r.item_id)
          else onClose()
        },
      },
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    persist(false)
  }

  return (
    <RightSlideout
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={title}
      subtitle={subtitle}
      demo={false}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="accent"
            type="button"
            disabled={readOnly || !label.trim() || request.isPending}
            onClick={() => persist(false)}
          >
            <Plus /> {request.isPending ? 'Saving…' : 'Save item'}
          </Button>
          {onSavedAndQuote && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={readOnly || !label.trim() || request.isPending}
              onClick={() => persist(true)}
            >
              Save and get a quote
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
        </div>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="details">Item details</TabsTrigger>
            <TabsTrigger value="photos">Photos & documents</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="mt-3 space-y-3">
            <div>
              <label htmlFor={labelId} className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                Item
              </label>
              <input
                id={labelId}
                className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={dto.business ? 'e.g. Generator at Main depot' : 'e.g. Toyota Corolla 2019'}
                disabled={readOnly || request.isPending}
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Type</label>
                <select
                  className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                  disabled={readOnly || request.isPending}
                >
                  <option value="vehicle">Vehicle</option>
                  <option value="contents">Home contents</option>
                  <option value="building">Building</option>
                  <option value="equipment">Equipment / business asset</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Declared value</label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm text-right"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Optional"
                  disabled={readOnly || request.isPending}
                />
              </div>
            </div>
            {locations.length > 0 && (
              <div>
                <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Premises</label>
                <select
                  className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  disabled={readOnly || request.isPending}
                >
                  <option value="">Select where it is kept</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.city ? ` · ${l.city}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Notes</label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly || request.isPending}
              />
            </div>
          </TabsContent>
          <TabsContent value="photos" className="mt-3 space-y-3">
            <div>
              <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Photo URL</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="Optional link to a photo or document"
                  disabled={readOnly || request.isPending}
                />
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-500" aria-hidden>
                  <Upload className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-xs text-navy-500">Upload from camera or files will land here in a later release.</p>
            </div>
          </TabsContent>
        </Tabs>
        {confirm && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900" role="status">
            <ShieldCheck className="h-4 w-4" /> {confirm}
          </p>
        )}
        {request.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            {(request.error as Error).message}. Your details are still here — try again.
          </p>
        )}
      </form>
    </RightSlideout>
  )
}
