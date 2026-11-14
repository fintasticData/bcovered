import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FieldDef } from '@/server/onboarding/config'

const ORIGIN: Record<string, { label: string; tone: 'warning' | 'info' | 'success'; title: string }> = {
  demo: { label: 'Demo data', tone: 'warning', title: 'Fictional records seeded for the demo' },
  imported: { label: 'Imported', tone: 'info', title: 'Imported from your client book, with its source reference' },
  live: { label: 'Live', tone: 'success', title: 'Captured on the platform or from a live integration' },
}

/** Where a record came from: demo seed, a client-book import, or live platform or integration data. */
export function OriginBadge({ origin, className }: { origin: string; className?: string }) {
  const o = ORIGIN[origin] ?? ORIGIN.live
  return (
    <Badge tone={o.tone} title={o.title} className={className}>
      {o.label}
    </Badge>
  )
}

export function NotAuthorisation({ className }: { className?: string }) {
  return (
    <p className={cn('rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900', className)}>
      Platform approval lets a brokerage use B-Covered. It is <strong>not regulatory authorisation</strong>: licence details and
      documents are declared by the brokerage and reviewed for platform access only.
    </p>
  )
}

export function FieldShell({ label, hint, error, required, highlight, htmlFor, children }: { label: string; hint?: string; error?: string; required?: boolean; highlight?: boolean; htmlFor: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl p-2 transition', highlight && 'bg-amber-50 ring-2 ring-amber-300')}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-navy-800">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-navy-500">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  )
}

const input = 'w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-navy-50'

export function FieldInput({
  def,
  value,
  onChange,
  disabled,
  error,
  highlight,
  idPrefix,
}: {
  def: FieldDef
  value: string | string[] | boolean | null | undefined
  onChange: (v: string | string[] | boolean | null) => void
  disabled?: boolean
  error?: string
  highlight?: boolean
  idPrefix: string
}) {
  const id = `${idPrefix}-${def.key}`
  if (def.type === 'checkbox') {
    return (
      <div className={cn('rounded-xl p-2', highlight && 'bg-amber-50 ring-2 ring-amber-300')}>
        <label className="flex items-start gap-2 text-sm text-navy-800">
          <input id={id} type="checkbox" className="mt-1" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          <span>{def.label}</span>
        </label>
        {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
      </div>
    )
  }
  return (
    <FieldShell label={def.label} hint={def.hint} error={error} required={def.required} highlight={highlight} htmlFor={id}>
      {def.type === 'textarea' ? (
        <textarea id={id} rows={3} className={input} value={(value as string) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === 'select' ? (
        <select id={id} className={input} value={(value as string) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choose…</option>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === 'multi' ? (
        <div id={id} className="flex flex-wrap gap-2" role="group" aria-label={def.label}>
          {def.options?.map((o) => {
            const list = Array.isArray(value) ? value : []
            const on = list.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onChange(on ? list.filter((v) => v !== o.value) : [...list, o.value])}
                className={cn('cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed', on ? 'bg-navy-800 text-white ring-navy-800' : 'bg-white text-navy-700 ring-navy-800/15 hover:ring-navy-800/40')}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      ) : (
        <input id={id} type={def.type === 'email' ? 'email' : def.type === 'tel' ? 'tel' : 'text'} className={input} value={(value as string) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldShell>
  )
}

export const textInput = input

/** The reason recorded with a decision, suspension or reinstatement, if the audit event carries one. */
export const auditReason = (after: unknown): string | null => {
  const reason = after && typeof after === 'object' ? (after as { reason?: unknown }).reason : null
  return typeof reason === 'string' && reason ? reason : null
}

export function downloadText(fileName: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function openBase64(fileName: string, mime: string | null, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime ?? 'application/octet-stream' }))
  const w = window.open(url, '_blank', 'noopener')
  if (!w) {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
