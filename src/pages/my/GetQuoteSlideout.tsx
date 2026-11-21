import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus } from 'lucide-react'
import {
  newCustomerPageKey,
  useCustomerPageRequestQuote,
  useCustomerPageUpdateItem,
  type CustomerPageDto,
  type CustomerPageItem,
  type CustomerQuoteRequest,
} from '@/api/customerPage'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { Button } from '@/components/ui/button'
import type { DataCategory } from '@/lib/supabase/category'
import { missingRequiredFields, parseVehicleLabel } from '@/pages/my/itemRequirements'
import { moneyOrNotSupplied } from '@/pages/my/portalFormat'
import { QuoteActiveStepView } from '@/fintastic-ux'

type Step = 'choose' | 'details' | 'review' | 'done'

export function GetQuoteSlideout({
  open,
  onClose,
  dto,
  category,
  preselectedIds = [],
  onDone,
  initialRequest,
  initialNotes = '',
  /** Fintastic = centre journey shell; classic = right slideout. */
  variant = 'slideout',
  onAskAva,
}: {
  open: boolean
  onClose: () => void
  dto: CustomerPageDto
  category: DataCategory
  preselectedIds?: string[]
  onDone?: (requestId: string) => void
  initialRequest?: CustomerQuoteRequest | null
  /** Prefill notes (e.g. Russ invoice attach from fleet hub). */
  initialNotes?: string
  variant?: 'slideout' | 'journey'
  onAskAva?: () => void
}) {
  const requestQuote = useCustomerPageRequestQuote(category)
  const updateItem = useCustomerPageUpdateItem(category)
  const [step, setStep] = useState<Step>('choose')
  const [selected, setSelected] = useState<string[]>([])
  const [cover, setCover] = useState('Comprehensive')
  const [notes, setNotes] = useState('')
  const [key, setKey] = useState(newCustomerPageKey)
  const [confirm, setConfirm] = useState<{ id: string; reference: string; summary: string } | null>(null)
  const [detailDrafts, setDetailDrafts] = useState<Record<string, Record<string, string>>>({})

  const eligible = useMemo(
    () => dto.items.filter((i) => i.customer_status !== 'removed' && i.customer_status !== 'replaced'),
    [dto.items],
  )

  useEffect(() => {
    if (!open) return
    if (initialRequest) {
      setStep('done')
      setConfirm({ id: initialRequest.id, reference: initialRequest.reference, summary: initialRequest.next_step })
      setSelected(initialRequest.item_ids ?? [])
      return
    }
    setStep('choose')
    setSelected(preselectedIds.length ? preselectedIds : [])
    setCover('Comprehensive')
    setNotes(initialNotes)
    setKey(newCustomerPageKey())
    setConfirm(null)
    setDetailDrafts({})
  }, [open, preselectedIds.join(','), initialRequest?.id, initialNotes])

  const selectedItems = eligible.filter((i) => selected.includes(i.id))

  const gaps = selectedItems.flatMap((item) =>
    missingRequiredFields({
      item_type: item.item_type,
      display_label: item.display_label,
      insured_value: item.insured_value,
      details: { ...(item.details ?? {}), ...(detailDrafts[item.id] ?? {}) },
    }).map((f) => ({ item, field: f })),
  )

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const saveDetailsThenContinue = async () => {
    for (const item of selectedItems) {
      const draft = detailDrafts[item.id]
      if (!draft || Object.keys(draft).length === 0) continue
      const parsed = item.item_type === 'vehicle' ? parseVehicleLabel(item.display_label) : {}
      const details = {
        ...parsed,
        ...draft,
      }
      const declared = draft.declared_value ? Number(draft.declared_value) : undefined
      await updateItem.mutateAsync({
        item_id: item.id,
        declared_value: declared ?? null,
        description: draft.description ?? null,
        details,
      })
    }
    setStep('review')
  }

  const continueFromChoose = () => {
    const needDetails = selectedItems.some(
      (item) =>
        missingRequiredFields({
          item_type: item.item_type,
          display_label: item.display_label,
          insured_value: item.insured_value,
          details: item.details,
        }).length > 0,
    )
    setStep(needDetails ? 'details' : 'review')
  }

  const submit = () => {
    if (selected.length === 0) return
    requestQuote.mutate(
      {
        item_ids: selected,
        cover_requested: cover,
        notes: notes.trim() || null,
        key,
      },
      {
        onSuccess: (r) => {
          setConfirm({ id: r.request_id, reference: r.reference, summary: r.summary })
          setStep('done')
          onDone?.(r.request_id)
        },
      },
    )
  }

  const chooseBody = (
    <div className="space-y-4">
      <p className="text-sm text-navy-600">Choose what to insure. You can select several eligible items.</p>
      <ul className="space-y-2">
        {eligible.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-800/10 bg-white px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-navy-900">{item.display_label}</span>
                <span className="block text-xs capitalize text-navy-500">
                  {item.item_type} · {moneyOrNotSupplied(item.insured_value)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {eligible.length === 0 && (
        <p className="text-sm text-navy-600">No items yet. Add an item first, then request a quote.</p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" variant="accent" disabled={selected.length === 0} onClick={continueFromChoose}>
          Continue
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )

  const detailsBody = (
    <div className="space-y-4">
      <p className="text-sm text-navy-600">Only missing details needed for a quote are asked here.</p>
      {selectedItems.map((item) => (
        <ItemDetailFields
          key={item.id}
          item={item}
          draft={detailDrafts[item.id] ?? {}}
          onChange={(next) => setDetailDrafts((d) => ({ ...d, [item.id]: next }))}
        />
      ))}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={() => setStep('choose')}>
          Back
        </Button>
        <Button
          size="sm"
          variant="accent"
          disabled={updateItem.isPending}
          onClick={() => void saveDetailsThenContinue()}
        >
          {updateItem.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </div>
      {updateItem.error && (
        <p className="text-xs text-red-700">{(updateItem.error as Error).message}</p>
      )}
    </div>
  )

  if (!open) return null

  if (variant === 'journey') {
    return (
      <div className="rounded-2xl border border-navy-800/10 bg-white/80 p-4 shadow-sm sm:p-5">
        <QuoteActiveStepView
          greetingName={dto.greeting_name || 'there'}
          brokerageName={dto.brokerage.trading_name}
          brokerName={dto.broker?.name}
          phase={step}
          selectedLabels={selectedItems.map((i) => i.display_label)}
          cover={cover}
          notes={notes}
          onCoverChange={setCover}
          onNotesChange={setNotes}
          onBack={() => setStep(gaps.length ? 'details' : 'choose')}
          onSubmit={submit}
          submitting={requestQuote.isPending}
          submitError={requestQuote.error ? (requestQuote.error as Error).message : null}
          confirm={confirm}
          onDone={onClose}
          onAskAva={onAskAva}
          chooseBody={chooseBody}
          detailsBody={detailsBody}
        />
      </div>
    )
  }

  const title =
    step === 'done'
      ? 'Quote request'
      : step === 'review'
        ? 'Review and submit'
        : step === 'details'
          ? 'Check details'
          : 'Get a quote'

  return (
    <RightSlideout
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        step === 'done'
          ? confirm?.reference
          : 'Request options from your broker — track progress on My quotes.'
      }
      size="wide"
      footer={null}
    >
      {step === 'choose' && chooseBody}
      {step === 'details' && detailsBody}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-navy-800/10 bg-white p-3 text-sm">
            <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Items</p>
            <ul className="mt-1 space-y-1">
              {selectedItems.map((i) => (
                <li key={i.id} className="font-semibold text-navy-900">
                  {i.display_label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Cover requested</label>
            <select
              className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
            >
              <option>Comprehensive</option>
              <option>Third party, fire &amp; theft</option>
              <option>Third party only</option>
              <option>Household contents</option>
              <option>Buildings</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Notes for broker</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <p className="text-xs text-navy-600">
            Your broker {dto.broker?.name ? `(${dto.broker.name})` : ''} at {dto.brokerage.trading_name} will receive
            this request.
          </p>
          {requestQuote.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              {(requestQuote.error as Error).message}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setStep(gaps.length ? 'details' : 'choose')}>
              Back
            </Button>
            <Button size="sm" variant="accent" disabled={requestQuote.isPending} onClick={submit}>
              <Plus /> {requestQuote.isPending ? 'Submitting…' : 'Submit quote request'}
            </Button>
          </div>
        </div>
      )}
      {step === 'done' && confirm && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {confirm.summary}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Reference</dt>
              <dd className="mt-0.5 font-mono text-navy-900">{confirm.reference}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Status</dt>
              <dd className="mt-0.5 text-navy-900">Submitted · with broker</dd>
            </div>
          </dl>
          <p className="text-sm text-navy-600">This request appears on My quotes and against each linked item.</p>
          <Button size="sm" variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </RightSlideout>
  )
}

function ItemDetailFields({
  item,
  draft,
  onChange,
}: {
  item: CustomerPageItem
  draft: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const missing = missingRequiredFields({
    item_type: item.item_type,
    display_label: item.display_label,
    insured_value: item.insured_value,
    details: { ...(item.details ?? {}), ...draft },
  })
  const parsed = item.item_type === 'vehicle' ? parseVehicleLabel(item.display_label) : {}

  const set = (key: string, value: string) => onChange({ ...draft, [key]: value })

  if (missing.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950">
        {item.display_label} — details look complete.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-navy-800/10 bg-white p-3">
      <p className="text-sm font-semibold text-navy-900">{item.display_label}</p>
      {missing.map((f) => (
        <div key={f.key}>
          <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{f.label}</label>
          <input
            className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
            value={draft[f.key] ?? (f.key in parsed ? String((parsed as Record<string, string>)[f.key] ?? '') : '')}
            onChange={(e) => set(f.key, e.target.value)}
            type={f.key === 'declared_value' || f.key === 'year' ? 'number' : 'text'}
            placeholder={f.label}
          />
        </div>
      ))}
    </div>
  )
}
