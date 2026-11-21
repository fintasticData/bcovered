import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, MapPin, X } from 'lucide-react'
import {
  formatQeAreaLabel,
  formatQeSuburbLabel,
  lookupQeSuburbs,
  type QeSuburbHit,
} from '@/lib/qe/addressLookup'
import { cn } from '@/lib/utils'

type Props = {
  /** Free-text query shown in the input (suburb name, or area label for Concierge). */
  value: string
  onChange: (value: string) => void
  /** When a catalog/API hit is chosen — use this to fill QE suburb + postalCode together. */
  onSelectHit?: (hit: QeSuburbHit) => void
  /** How the chosen hit is written into `value`. */
  valueMode?: 'suburb' | 'area' | 'label'
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
  label?: string
  error?: string
  inputClassName?: string
}

export function QeSuburbSelect({
  value,
  onChange,
  onSelectHit,
  valueMode = 'suburb',
  placeholder = 'Search suburb or postal code…',
  disabled,
  required,
  className,
  id,
  label,
  error,
  inputClassName,
}: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [hits, setHits] = useState<QeSuburbHit[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      setLoading(true)
      void lookupQeSuburbs(query, { signal: ctrl.signal, limit: 10 })
        .then((rows) => {
          if (!ctrl.signal.aborted) setHits(rows)
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setHits([])
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false)
        })
    }, 160)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const writeValue = (hit: QeSuburbHit) => {
    if (valueMode === 'area') return formatQeAreaLabel(hit)
    if (valueMode === 'label') return formatQeSuburbLabel(hit)
    return hit.suburb
  }

  const pick = (hit: QeSuburbHit) => {
    const next = writeValue(hit)
    setQuery(next)
    onChange(next)
    onSelectHit?.(hit)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(0, hits.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      pick(hits[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          {label}
          {required ? ' *' : ''}
        </label>
      ) : null}
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
        <input
          id={inputId}
          className={cn('field w-full pr-8 pl-8', error && 'border-red-400', inputClassName)}
          value={query}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-list`}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
            aria-label="Clear suburb"
            disabled={disabled}
            onClick={() => {
              setQuery('')
              onChange('')
              setOpen(true)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : loading ? (
          <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-navy-400" />
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      {open && (
        <ul
          id={`${inputId}-list`}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-navy-800/10 bg-white py-1 shadow-lg"
        >
          {hits.length === 0 && !loading ? (
            <li className="px-3 py-2 text-sm text-navy-500">
              No match in the quote-engine suburb list — keep typing or enter the suburb manually
            </li>
          ) : (
            hits.map((hit, i) => (
              <li key={hit.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
                    i === active ? 'bg-brand-50 text-navy-950' : 'hover:bg-navy-50',
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(hit)}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
                  <span className="min-w-0">
                    <span className="block font-medium text-navy-900">{formatQeSuburbLabel(hit)}</span>
                    <span className="block text-xs text-navy-500">
                      {[hit.province, 'QE address'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
