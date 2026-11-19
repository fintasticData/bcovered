import { useMemo, useState, type FormEvent } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { useCreateCommercialClient, useIndustries } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { useDataCategory } from '@/lib/supabase/category'
import { CategoryBadge, Dialog, ErrorText, Field, inputClass } from '../book/bits'
import { coverLabel, coversByGroup, relatedForCover } from './commercialInterests'

export type BusinessPrefill = {
  trading_name?: string
  contact_name?: string
  phone?: string
  email?: string
  note?: string
  /** When opened after a personal “Business cover” enquiry. */
  fromPersonName?: string
}

export function AddBusinessDialog({
  onClose,
  onCreated,
  prefill,
}: {
  onClose: () => void
  onCreated: (profileId: string) => void
  prefill?: BusinessPrefill
}) {
  const category = useDataCategory()
  const industries = useIndustries()
  const create = useCreateCommercialClient()
  const [f, setF] = useState({
    trading_name: prefill?.trading_name ?? '',
    registered_name: '',
    industry_key: '',
    contact_name: prefill?.contact_name ?? '',
    contact_role: '',
    phone: prefill?.phone ?? '',
    email: prefill?.email ?? '',
    note: prefill?.note ?? '',
  })
  const [interests, setInterests] = useState<string[]>(['public_liability'])
  const [relatedChecked, setRelatedChecked] = useState<string[]>([])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const groups = useMemo(() => coversByGroup(), [])
  const related = useMemo(
    () =>
      interests.flatMap((key) =>
        relatedForCover(key).map((label) => ({
          key: `${key}:${label}`,
          label,
          product: coverLabel(key),
        })),
      ),
    [interests],
  )

  const toggle = (id: string) => {
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const valid = f.trading_name.trim().length >= 2 && interests.length > 0

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid || create.isPending) return
    const name = (f.registered_name.trim() || f.trading_name.trim()).trim()
    const trading = f.trading_name.trim()
    const relatedNote = relatedChecked
      .map((key) => key.split(':').slice(1).join(':'))
      .filter(Boolean)
    const noteParts = [f.note.trim(), relatedNote.length ? `Related items next: ${relatedNote.join('; ')}` : ''].filter(Boolean)
    create.mutate(
      {
        name,
        trading_name: trading !== name ? trading : null,
        industry_key: f.industry_key || undefined,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        contact_name: f.contact_name.trim() || null,
        contact_role: f.contact_role.trim() || null,
        note: noteParts.join('\n') || null,
        cover_interests: interests.map((key) => ({
          key,
          related: relatedChecked.filter((r) => r.startsWith(`${key}:`)).map((r) => r.slice(key.length + 1)),
        })),
      },
      {
        onSuccess: (row) => {
          onCreated(row.profile.id)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog
      title="Add business client"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-business" variant="accent" disabled={!valid || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Building2 />} Save as prospect
          </Button>
        </>
      }
    >
      <form id="add-business" onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-navy-600">
          Saved as a commercial <strong>Prospect</strong> in <CategoryBadge category={category} />. Industry, contact and cover
          interests can be completed later.
        </div>
        {prefill?.fromPersonName && (
          <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
            Opening a business from <strong>{prefill.fromPersonName}</strong>’s Business cover enquiry. Link them as the
            primary contact below.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Trading name" htmlFor="ab-trading">
            <input id="ab-trading" className={inputClass} value={f.trading_name} onChange={set('trading_name')} autoFocus placeholder="e.g. Benoni Motors" />
          </Field>
          <Field label="Registered name (optional)" htmlFor="ab-registered" hint="Defaults to the trading name if blank.">
            <input id="ab-registered" className={inputClass} value={f.registered_name} onChange={set('registered_name')} placeholder="e.g. Benoni Motors (Pty) Ltd" />
          </Field>
          <Field label="Industry" htmlFor="ab-industry" hint="Inferred from the name if left blank.">
            <select id="ab-industry" className={inputClass} value={f.industry_key} onChange={set('industry_key')}>
              <option value="">Infer from name</option>
              {(industries.data ?? []).map((ind) => (
                <option key={ind.key} value={ind.key}>
                  {ind.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Primary contact (optional)" htmlFor="ab-contact">
            <input id="ab-contact" className={inputClass} value={f.contact_name} onChange={set('contact_name')} placeholder="Name" />
          </Field>
          <Field label="Contact role (optional)" htmlFor="ab-role">
            <input id="ab-role" className={inputClass} value={f.contact_role} onChange={set('contact_role')} placeholder="e.g. Owner / FD" />
          </Field>
          <Field label="Mobile" htmlFor="ab-phone">
            <input id="ab-phone" className={inputClass} value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="082 555 0101" />
          </Field>
          <Field label="Email" htmlFor="ab-email">
            <input id="ab-email" type="email" className={inputClass} value={f.email} onChange={set('email')} />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-navy-800/10 bg-white p-3">
            <p className="text-xs font-semibold text-navy-900">
              Interested in <span className="font-normal text-navy-500">(commercial · multi-select)</span>
            </p>
            {groups.map((g) => (
              <fieldset key={g.group} className="space-y-1.5">
                <legend className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{g.label}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((p) => {
                    const on = interests.includes(p.key)
                    return (
                      <button
                        key={p.key}
                        type="button"
                        aria-pressed={on}
                        title={p.description}
                        onClick={() => toggle(p.key)}
                        className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                          on ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-navy-800/15 bg-white text-navy-700 hover:border-navy-400'
                        }`}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            {interests.length === 0 && <p className="text-[11px] text-amber-800">Select at least one cover type.</p>}
          </div>
          <div className="space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/50 p-3">
            <p className="text-xs font-semibold text-navy-900">Related items next</p>
            <p className="text-[11px] text-navy-600">Tick what you will capture on the business record after saving.</p>
            {related.length === 0 ? (
              <p className="text-[11px] text-navy-500">Select covers on the left to see related items.</p>
            ) : (
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {related.map((item) => {
                  const on = relatedChecked.includes(item.key)
                  return (
                    <li key={item.key}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-xs text-navy-800 hover:bg-white/80">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={on}
                          onChange={() =>
                            setRelatedChecked((prev) => (on ? prev.filter((x) => x !== item.key) : [...prev, item.key]))
                          }
                        />
                        <span>
                          <span className="font-medium">{item.label}</span>
                          <span className="block text-[10px] text-navy-500 capitalize">{item.product}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <Field label="Note (optional)" htmlFor="ab-note">
          <textarea id="ab-note" rows={2} className={inputClass} value={f.note} onChange={set('note')} placeholder="What they asked for" />
        </Field>
        <ErrorText error={create.error} />
      </form>
    </Dialog>
  )
}
