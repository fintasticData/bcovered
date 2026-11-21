import { useEffect, useState } from 'react'
import {
  useServiceProviderMutations,
  useServiceTradeTypes,
  type ServiceProviderDetail,
} from '@/api/serviceProviders'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: (providerId: string, provider?: ServiceProviderDetail) => void
  initial?: Partial<ServiceProviderDetail> | null
  defaultTradeTypeId?: string | null
  defaultArea?: string | null
}

export function ProviderFormDialog({
  open,
  onClose,
  onSaved,
  initial,
  defaultTradeTypeId,
  defaultArea,
}: Props) {
  const trades = useServiceTradeTypes()
  const mut = useServiceProviderMutations()
  const [tradingName, setTradingName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [suburb, setSuburb] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [afterHours, setAfterHours] = useState(false)
  const [preferred, setPreferred] = useState(false)
  const [active, setActive] = useState(true)
  const [standardFee, setStandardFee] = useState('')
  const [afterHoursFee, setAfterHoursFee] = useState('')
  const [notes, setNotes] = useState('')
  const [tradeIds, setTradeIds] = useState<string[]>([])
  const [areasText, setAreasText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<ServiceProviderDetail['duplicate_warnings']>([])

  useEffect(() => {
    if (!open) return
    setTradingName(initial?.trading_name ?? '')
    setContactPerson(initial?.contact_person ?? '')
    setPhone(initial?.phone ?? '')
    setEmail(initial?.email ?? '')
    setWebsite(initial?.website ?? '')
    setStreetAddress(initial?.street_address ?? '')
    setSuburb(initial?.suburb ?? '')
    setCity(initial?.city ?? '')
    setProvince(initial?.province ?? '')
    setPostalCode(initial?.postal_code ?? '')
    setAfterHours(initial?.after_hours_available ?? false)
    setPreferred(initial?.preferred ?? false)
    setActive(initial?.active ?? true)
    setStandardFee(initial?.standard_callout_fee_zar != null ? String(initial.standard_callout_fee_zar) : '')
    setAfterHoursFee(
      initial?.after_hours_callout_fee_zar != null ? String(initial.after_hours_callout_fee_zar) : '',
    )
    setNotes(initial?.internal_notes ?? '')
    setTradeIds(initial?.trades?.map((t) => t.id) ?? (defaultTradeTypeId ? [defaultTradeTypeId] : []))
    const areas =
      initial?.areas?.map((a) => (typeof a === 'string' ? a : a.area_label)).join(', ') ??
      defaultArea ??
      ''
    setAreasText(areas)
    setError(null)
    setWarnings([])
  }, [open, initial, defaultTradeTypeId, defaultArea])

  if (!open) return null

  const toggleTrade = (id: string) => {
    setTradeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const save = async () => {
    setError(null)
    try {
      const areas = areasText
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((area_label) => ({ area_label, area_kind: 'suburb' }))
      const result = await mut.upsert.mutateAsync({
        providerId: initial?.id ?? null,
        tradingName,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        streetAddress: streetAddress || null,
        suburb: suburb || null,
        city: city || null,
        province: province || null,
        postalCode: postalCode || null,
        afterHoursAvailable: afterHours,
        preferred,
        active,
        standardCalloutFeeZar: standardFee ? Number(standardFee) : null,
        afterHoursCalloutFeeZar: afterHoursFee ? Number(afterHoursFee) : null,
        internalNotes: notes || null,
        tradeTypeIds: tradeIds,
        areas,
        panels: initial?.panels?.map((p) => ({
          insurer_id: p.insurer_id,
          trade_type_id: p.trade_type_id,
          active: p.active,
        })),
      })
      if (result.duplicate_warnings?.length) setWarnings(result.duplicate_warnings)
      onSaved(result.id, result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save provider')
    }
  }

  const tradeList = trades.data ?? []

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-navy-950/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-navy-800/10 bg-white p-5 shadow-xl">
        <h2 className="font-display text-lg font-bold text-navy-950">
          {initial?.id ? 'Edit provider' : 'Add provider'}
        </h2>
        <p className="mt-1 text-sm text-navy-600">
          Need a trading name, phone/email/website, one trade and one service area. Email is optional.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Trading name *</span>
            <input className="field" value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Contact person</span>
            <input className="field" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Phone</span>
              <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Email</span>
              <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Website</span>
            <input className="field" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Street address</span>
            <input className="field" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Suburb</span>
              <input className="field" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">City</span>
              <input className="field" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Province</span>
              <input className="field" value={province} onChange={(e) => setProvince(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Postal code</span>
              <input className="field" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </label>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Services offered *</p>
            {trades.isLoading && <p className="text-sm text-navy-600">Loading trades…</p>}
            {trades.error && (
              <p className="text-sm text-rose-700">Could not load trades: {trades.error.message}</p>
            )}
            {!trades.isLoading && tradeList.length === 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                No trade types yet for this Sample/Live workspace. Refresh once, or switch category and try again.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {tradeList.map((t) => {
                const on = tradeIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTrade(t.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                      on
                        ? 'border-brand-500 bg-brand-50 text-brand-900'
                        : 'border-navy-800/15 bg-white text-navy-700 hover:border-navy-800/30',
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              Areas served * <span className="font-normal normal-case text-navy-500">(comma-separated)</span>
            </span>
            <textarea
              className="field min-h-[70px]"
              value={areasText}
              onChange={(e) => setAreasText(e.target.value)}
              placeholder="Parkhurst, Rosebank, Sandton"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Standard call-out (R)</span>
              <input className="field" value={standardFee} onChange={(e) => setStandardFee(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">After-hours call-out (R)</span>
              <input className="field" value={afterHoursFee} onChange={(e) => setAfterHoursFee(e.target.value)} />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-navy-800">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={afterHours} onChange={(e) => setAfterHours(e.target.checked)} />
              After-hours call-outs
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={preferred} onChange={(e) => setPreferred(e.target.checked)} />
              Preferred by brokerage
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Internal notes</span>
            <textarea
              className="field min-h-[70px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Broker-only notes — never shown to customers"
            />
          </label>
        </div>

        {warnings && warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Possible duplicates: {warnings.map((w) => w.trading_name).join(', ')}. You can still save.
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2 border-t border-navy-800/10 pt-4">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={mut.upsert.isPending} onClick={() => void save()}>
            {mut.upsert.isPending ? 'Saving…' : 'Save provider'}
          </Button>
        </div>
      </div>
    </div>
  )
}
