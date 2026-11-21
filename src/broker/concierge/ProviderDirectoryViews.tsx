import {
  Building2,
  Clock,
  MapPin,
  Phone,
  Star,
  Wrench,
} from 'lucide-react'
import type { ServiceProviderSummary } from '@/api/serviceProviders'
import { StatusBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

function areaLabels(p: ServiceProviderSummary): string {
  if (!p.areas?.length) return ''
  if (typeof p.areas[0] === 'string') return (p.areas as string[]).join(', ')
  return (p.areas as Array<{ area_label: string }>).map((a) => a.area_label).join(', ')
}

function displayAddress(p: ServiceProviderSummary): string {
  return (
    p.address_formatted ||
    [p.street_address, p.suburb, p.city].filter(Boolean).join(', ') ||
    areaLabels(p) ||
    ''
  )
}

function tradeIconTone(code?: string) {
  const c = (code ?? '').toLowerCase()
  if (c.includes('lock')) return 'from-amber-500/15 to-amber-600/5 text-amber-800'
  if (c.includes('plumb')) return 'from-sky-500/15 to-sky-600/5 text-sky-800'
  if (c.includes('electric')) return 'from-yellow-400/20 to-yellow-500/5 text-yellow-900'
  if (c.includes('appliance')) return 'from-violet-500/15 to-violet-600/5 text-violet-800'
  if (c.includes('glaz') || c.includes('glass')) return 'from-cyan-500/15 to-cyan-600/5 text-cyan-900'
  return 'from-brand-500/15 to-brand-700/5 text-brand-800'
}

export function ProviderCard({
  p,
  selected,
  onOpen,
}: {
  p: ServiceProviderSummary
  selected?: boolean
  onOpen: () => void
}) {
  const primaryTrade = p.trades?.[0]
  const address = displayAddress(p)
  const contact = p.phone ?? p.email ?? p.website ?? null

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition',
        'hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-md',
        selected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-navy-800/10',
      )}
    >
      <div className={cn('flex items-center gap-3 border-b border-navy-800/5 bg-gradient-to-br px-4 py-3', tradeIconTone(primaryTrade?.code))}>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/80 shadow-sm">
          <Wrench className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-display text-base font-bold text-navy-950">{p.trading_name}</p>
            {p.preferred && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                <Star className="h-2.5 w-2.5 fill-current" /> Preferred
              </span>
            )}
          </div>
          <p className="truncate text-xs text-navy-600">
            {primaryTrade?.label ?? 'Trade services'}
            {p.contact_person ? ` · ${p.contact_person}` : ''}
          </p>
        </div>
        <StatusBadge status={p.active ? 'active' : 'inactive'} />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 py-3">
        {address ? (
          <p className="flex items-start gap-2 text-sm text-navy-700">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
            <span className="line-clamp-2">{address}</span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-navy-400">
            <MapPin className="h-3.5 w-3.5" /> No address on file
          </p>
        )}
        {contact ? (
          <p className="flex items-center gap-2 text-sm font-medium text-navy-900">
            <Phone className="h-3.5 w-3.5 shrink-0 text-navy-400" />
            <span className="truncate">{contact}</span>
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {(p.trades ?? []).slice(0, 3).map((t) => (
            <span key={t.id} className="rounded-md bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-800">
              {t.label}
            </span>
          ))}
          {p.after_hours_available && (
            <span className="inline-flex items-center gap-1 rounded-md bg-navy-900/5 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
              <Clock className="h-3 w-3" /> After-hours
            </span>
          )}
          {p.standard_callout_fee_zar != null && (
            <span className="ml-auto text-[11px] font-semibold text-navy-600">
              Call-out R {p.standard_callout_fee_zar}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export function ProviderListRow({
  p,
  selected,
  onOpen,
}: {
  p: ServiceProviderSummary
  selected?: boolean
  onOpen: () => void
}) {
  const address = displayAddress(p)
  const primaryTrade = p.trades?.[0]

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition',
        'hover:border-brand-400/40 hover:bg-brand-50/30',
        selected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-navy-800/10',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy-950">{p.trading_name}</p>
            <p className="truncate text-xs text-navy-500">
              {primaryTrade?.label ?? '—'}
              {p.preferred ? ' · Preferred' : ''}
            </p>
          </div>
        </div>
      </div>
      <div className="min-w-0 text-sm text-navy-700">
        <p className="flex items-start gap-1.5 truncate">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" />
          <span className="truncate">{address || '—'}</span>
        </p>
      </div>
      <div className="min-w-0 text-sm font-medium text-navy-900">
        <p className="flex items-center gap-1.5 truncate">
          <Phone className="h-3.5 w-3.5 shrink-0 text-navy-400" />
          <span className="truncate">{p.phone ?? p.email ?? '—'}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 justify-self-end">
        {p.after_hours_available && (
          <span className="hidden rounded-md bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700 sm:inline">
            After-hours
          </span>
        )}
        <StatusBadge status={p.active ? 'active' : 'inactive'} />
      </div>
    </button>
  )
}
