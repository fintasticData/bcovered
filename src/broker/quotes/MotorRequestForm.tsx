import type { FormEvent } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldShell } from '@/onboarding/ui'
import { COVER_OPTIONS, type MotorFormErrors, type MotorQuoteForm, type QeMotorRequest } from '@/lib/qe/types'
import { Section } from '../shared/ui'
import { DemoSampleBadge } from './shared'

const input =
  'w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none aria-[invalid=true]:border-red-400'

type Field = keyof MotorQuoteForm
export type MotorFormSection = 'policyholder' | 'address' | 'vehicle' | 'cover'
const ALL_SECTIONS: MotorFormSection[] = ['policyholder', 'address', 'vehicle', 'cover']

export function MotorRequestForm({
  form,
  errors,
  starter,
  onChange,
  onSubmit,
  sections = ALL_SECTIONS,
  submitLabel = 'Get quotes',
  busy = false,
}: {
  /** Cover may be empty while the broker has not chosen it yet. */
  form: Omit<MotorQuoteForm, 'cover'> & { cover: string }
  errors: MotorFormErrors
  starter: Readonly<QeMotorRequest>
  onChange: (field: Field, value: string) => void
  onSubmit: () => void
  /** Limits the form to some sections, e.g. a Route step that only reviews the vehicle. */
  sections?: MotorFormSection[]
  submitLabel?: string
  busy?: boolean
}) {
  const full = sections.length === ALL_SECTIONS.length
  const has = (s: MotorFormSection) => sections.includes(s)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }

  const text = (field: Field, label: string, opts: { type?: string; inputMode?: 'numeric' | 'tel' | 'email'; autoComplete?: string; hint?: string } = {}) => (
    <FieldShell label={label} htmlFor={`qe-${field}`} error={errors[field]} hint={opts.hint} required>
      <input
        id={`qe-${field}`}
        type={opts.type ?? 'text'}
        inputMode={opts.inputMode}
        autoComplete={opts.autoComplete ?? 'off'}
        className={input}
        value={form[field]}
        aria-invalid={Boolean(errors[field])}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </FieldShell>
  )

  const p = starter.policyholder
  const v = starter.vehicles[0]
  const preserved: Array<[string, string]> = [
    ['ID number', p.idNumber],
    ['Licence code', p.licence?.code ? `${p.licence.code} (Code B)` : '–'],
    ['Licence issued', p.licence?.issueDate ?? '–'],
    ['No-claim years', String(p.noClaim?.noClaimYears ?? '–')],
    ['Insured years', String(p.noClaim?.insuredYears ?? '–')],
    ['Vehicle colour', v.colour ?? '–'],
    ['Source', starter.source ?? '–'],
    ['ITC consent', starter.hasITCConsent ? 'Yes (fictional sample value)' : 'No'],
  ]

  const errorCount = Object.keys(errors).length

  return (
    <form onSubmit={submit} noValidate className={full ? 'grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]' : 'space-y-4'}>
      <div className="space-y-4">
        {errorCount > 0 && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            Fix {errorCount === 1 ? 'the highlighted field' : `the ${errorCount} highlighted fields`} {full ? 'before getting quotes' : 'to continue'}.
          </p>
        )}
        {has('policyholder') && (
          <Section title="Policyholder" actions={<DemoSampleBadge />}>
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              {text('name', 'Name', { autoComplete: 'given-name' })}
              {text('surname', 'Surname', { autoComplete: 'family-name' })}
              {text('mobile', 'Mobile', { type: 'tel', inputMode: 'tel' })}
              {text('email', 'Email', { type: 'email', inputMode: 'email' })}
            </div>
          </Section>
        )}
        {has('address') && (
          <Section title="Address">
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[2fr_1.5fr_1fr]">
              {text('street', 'Street')}
              {text('suburb', 'Suburb')}
              {text('postalCode', 'Postal code', { inputMode: 'numeric' })}
            </div>
          </Section>
        )}
        {(has('vehicle') || has('cover')) && (
          <Section title={has('vehicle') ? 'Private vehicle' : 'Cover'} actions={full ? undefined : <DemoSampleBadge />}>
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
              {has('vehicle') && text('meadCode', 'M&M code', { inputMode: 'numeric', hint: 'Mead & McGrouther code, 8 digits' })}
              {has('vehicle') && text('year', 'Model year', { inputMode: 'numeric' })}
              {has('cover') && (
                <FieldShell label="Cover" htmlFor="qe-cover" error={errors.cover} required>
                  <select id="qe-cover" className={input} value={form.cover} aria-invalid={Boolean(errors.cover)} onChange={(e) => onChange('cover', e.target.value)}>
                    {form.cover === '' && <option value="">Choose cover</option>}
                    {COVER_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              )}
            </div>
          </Section>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="accent" size={full ? 'lg' : 'md'} disabled={busy}>
            {full && <Search />} {submitLabel}
          </Button>
        </div>
      </div>

      {full && (
        <aside className="space-y-4">
          <Section title="Sample data kept in the request">
            <p className="mb-3 text-[11px] text-navy-500">Supporting QE fields from the sample client. Fictional values, not editable in this demo.</p>
            <dl className="space-y-1.5 text-xs">
              {preserved.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-navy-500">{k}</dt>
                  <dd className="text-right font-medium text-navy-900">{val}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </aside>
      )}
    </form>
  )
}
