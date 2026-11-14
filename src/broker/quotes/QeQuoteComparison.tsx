import type { ReactNode } from 'react'
import { ArrowUp, Check, Info, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NO_VALUE, basicExcess, coverLabel, formatQeDate, formatRand, isQuoted, vehicleItem } from '@/lib/qe/sampleQuotes'
import type { QeInsurerQuote, QeMotorRequest, QeResult } from '@/lib/qe/types'
import { cn } from '@/lib/utils'
import { Section } from '../shared/ui'
import { DemoSampleBadge, InsurerMark, OutcomeBadge } from './shared'

export const premiumText = (q: QeInsurerQuote) => (isQuoted(q) ? `${formatRand(q.totalPremium)}/month` : NO_VALUE)

export const excessText = (q: QeInsurerQuote) => {
  const x = isQuoted(q) ? basicExcess(vehicleItem(q)) : undefined
  return x ? formatRand(x.value) : NO_VALUE
}

const premiumOf = (q: QeInsurerQuote) => (isQuoted(q) ? q.totalPremium : null)
const excessOf = (q: QeInsurerQuote) => (isQuoted(q) ? (basicExcess(vehicleItem(q))?.value ?? null) : null)
const lowest = (values: Array<number | null>) => {
  const nums = values.filter((n): n is number => n !== null)
  return nums.length ? Math.min(...nums) : null
}

export function SubmittedRequestSummary({ request, onEdit }: { request: Readonly<QeMotorRequest>; onEdit: () => void }) {
  const p = request.policyholder
  const v = request.vehicles[0]
  const rows: Array<[string, string]> = [
    ['Client', `${p.name} ${p.surname}`],
    ['Mobile', p.mobile ?? '–'],
    ['Email', p.email ?? '–'],
    ['Address', [p.address.street, p.address.suburb, p.address.postalCode].filter(Boolean).join(', ')],
    ['Vehicle M&M code', v.meadCode],
    ['Model year', String(v.year)],
    ['Cover', coverLabel(v.cover)],
  ]
  return (
    <Section
      title="Submitted request"
      actions={
        <>
          <DemoSampleBadge />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Edit request
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([k, val]) => (
          <div key={k} className={k === 'Address' || k === 'Email' ? 'sm:col-span-2' : undefined}>
            <dt className="text-[11px] text-navy-500">{k}</dt>
            <dd className="font-medium break-words text-navy-900">{val}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

const LABEL_CELL = 'sticky left-0 z-10 bg-white px-3 text-left'

/** best: lowest value among quoted offers; higher: quoted but not lowest; ok: positive outcome; none: not quoted. */
type Tone = 'best' | 'higher' | 'ok' | 'none'

const TONE_CELL: Record<Tone, string> = {
  best: 'bg-emerald-50 text-emerald-800',
  higher: 'bg-amber-50 text-amber-900',
  ok: 'text-emerald-700 font-semibold',
  none: 'bg-red-50 text-red-700',
}

const NOT_QUOTED_CELL = 'bg-red-50/40'

function MessageList({ messages, tone }: { messages: string[]; tone: 'danger' | 'neutral' }) {
  if (!messages.length) return <span className="text-navy-400">None</span>
  return (
    <ul className={cn('space-y-1', tone === 'danger' && 'text-red-700')}>
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  )
}

/** A price with its difference from the lowest quoted value. */
function PriceCell({ text, value, min, quotedCount }: { text: string; value: number | null; min: number | null; quotedCount: number }) {
  if (value === null || min === null) return <>{text}</>
  const diff = value - min
  return (
    <>
      <span className="block">{text}</span>
      {diff > 0 ? (
        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-800">
          <ArrowUp className="h-3 w-3" /> {formatRand(diff)} more than lowest
        </span>
      ) : quotedCount > 1 ? (
        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700">
          <Check className="h-3 w-3" /> Lowest
        </span>
      ) : null}
    </>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-3.5 w-3.5 rounded border', className)} />
      {label}
    </span>
  )
}

export function QeQuoteComparison({
  result,
  request,
  onOpen,
}: {
  result: QeResult
  request: Readonly<QeMotorRequest>
  onOpen: (quoteID: number) => void
}) {
  const quotes = result.quotes ?? []
  const quotedCount = quotes.filter(isQuoted).length
  const minPremium = lowest(quotes.map(premiumOf))
  const minExcess = lowest(quotes.map(excessOf))
  const v = request.vehicles[0]

  const priceTone = (value: number | null, min: number | null): Tone => (value === null ? 'none' : value === min ? 'best' : 'higher')

  const tags = (q: QeInsurerQuote) =>
    [
      quotedCount > 1 && premiumOf(q) !== null && premiumOf(q) === minPremium && 'Lowest premium',
      quotedCount > 1 && excessOf(q) !== null && excessOf(q) === minExcess && 'Lowest excess',
    ].filter(Boolean) as string[]

  const group = (label: string) => (
    <tr>
      <th colSpan={quotes.length + 1} scope="colgroup" className="bg-mist px-3 py-1.5 text-left text-[10px] font-semibold tracking-[0.14em] text-navy-500 uppercase">
        {label}
      </th>
    </tr>
  )

  const row = (
    label: string,
    cell: (q: QeInsurerQuote) => ReactNode,
    opts: { emphasis?: boolean; tone?: (q: QeInsurerQuote) => Tone | undefined; compare?: (q: QeInsurerQuote) => string } = {},
  ) => {
    const same = opts.compare ? new Set(quotes.map(opts.compare)).size === 1 : false
    return (
      <tr>
        <th scope="row" className={cn(LABEL_CELL, 'py-2.5 align-top text-xs font-semibold text-navy-700')}>
          {label}
          {same && <span className="mt-0.5 block text-[10px] font-medium text-navy-400">Same for all</span>}
        </th>
        {quotes.map((q) => {
          const tone = opts.tone?.(q)
          return (
            <td
              key={q.quoteID}
              className={cn(
                'px-3 py-2.5 align-top',
                opts.emphasis ? 'text-base font-semibold text-navy-900' : 'text-sm text-navy-800',
                same && 'text-navy-500',
                !tone && !isQuoted(q) && NOT_QUOTED_CELL,
                tone && TONE_CELL[tone],
              )}
            >
              {cell(q)}
            </td>
          )
        })}
      </tr>
    )
  }

  const insurerMessages = (q: QeInsurerQuote) => [...(q.message ? [q.message] : []), ...q.messages.map((m) => m.message)]
  const itemMessages = (q: QeInsurerQuote) => vehicleItem(q)?.messages.map((m) => m.message) ?? []

  return (
    <Section
      title={`${quotedCount} of ${quotes.length} insurers quoted`}
      actions={
        <>
          <span className="text-[11px] text-navy-500">
            Request #{result.requestID} · {result.completedInsurers} of {result.expectedInsurers} insurers responded
          </span>
          <span className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Sample premiums are fixed and do not change when you edit the request.
          </span>
        </>
      }
    >
      <div className="scroll-area relative overflow-x-auto">
        <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-0 [&_td]:border-t [&_td]:border-navy-800/10 [&_th[scope=row]]:border-t [&_th[scope=row]]:border-navy-800/10">
          <colgroup>
            <col className="w-36" />
            {quotes.map((q) => (
              <col key={q.quoteID} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LABEL_CELL}>
                <span className="sr-only">Detail</span>
              </th>
              {quotes.map((q) => (
                <th
                  key={q.quoteID}
                  scope="col"
                  className={cn(
                    'rounded-t-xl border-t-4 px-3 pt-2 pb-3 text-left align-bottom',
                    isQuoted(q) ? 'border-emerald-400' : cn('border-red-300', NOT_QUOTED_CELL),
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <InsurerMark name={q.insurerName} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900">{q.insurerName}</p>
                      <p className="text-[11px] font-normal text-navy-500">Insurer responded</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <OutcomeBadge quote={q} />
                    {tags(q).map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                        <Check className="h-3 w-3" /> {t}
                      </span>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group('Price')}
            {row(
              'Monthly premium',
              (q) => <PriceCell text={premiumText(q)} value={premiumOf(q)} min={minPremium} quotedCount={quotedCount} />,
              { emphasis: true, tone: (q) => priceTone(premiumOf(q), minPremium) },
            )}
            {row(
              'Basic excess',
              (q) => <PriceCell text={excessText(q)} value={excessOf(q)} min={minExcess} quotedCount={quotedCount} />,
              { emphasis: true, tone: (q) => priceTone(excessOf(q), minExcess) },
            )}
            {group('Vehicle and cover')}
            {row(
              'Vehicle',
              () => (
                <>
                  <span className="block">M&M {v.meadCode}</span>
                  <span className="block">
                    {v.year} · {v.colour ?? '–'}
                  </span>
                </>
              ),
              { compare: () => `${v.meadCode}|${v.year}|${v.colour}` },
            )}
            {row('Cover', () => coverLabel(v.cover), { compare: () => v.cover ?? '' })}
            {row('Vehicle outcome', (q) => vehicleItem(q)?.status ?? 'No Quote', {
              tone: (q) => (isQuoted(q) ? 'ok' : 'none'),
              compare: (q) => vehicleItem(q)?.status ?? '',
            })}
            {group('Quote')}
            {row('Insurer reference', (q) => q.insurerReference || '–')}
            {row('QE quote number', (q) => String(q.quoteID))}
            {row('Insurer status', (q) => q.status, { compare: (q) => q.status })}
            {row('Quote date', (q) => (isQuoted(q) ? formatQeDate(q.quoteDate) : 'Not applicable'))}
            {row('Expires', (q) => (isQuoted(q) ? `${formatQeDate(q.quoteExpires)} (${q.validDays} days)` : 'Not applicable'))}
            {group('Messages')}
            {row('Vehicle messages', (q) => <MessageList tone="danger" messages={itemMessages(q)} />, {
              tone: (q) => (itemMessages(q).length ? 'none' : undefined),
            })}
            {row('Insurer messages', (q) => <MessageList tone="neutral" messages={insurerMessages(q)} />, {
              compare: (q) => insurerMessages(q).join('|'),
            })}
            <tr>
              <th scope="row" className={cn(LABEL_CELL, 'py-3')}>
                <span className="sr-only">Actions</span>
              </th>
              {quotes.map((q) => (
                <td key={q.quoteID} className={cn('px-3 py-3', !isQuoted(q) && NOT_QUOTED_CELL)}>
                  <Button variant="outline" size="sm" onClick={() => onOpen(q.quoteID)}>
                    Open offer
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-navy-600">
        <Swatch className="border-emerald-400 bg-emerald-100" label="Lowest among quoted offers" />
        <Swatch className="border-amber-400 bg-amber-100" label="Higher than lowest" />
        <Swatch className="border-red-300 bg-red-100" label="Not quoted" />
        <span className="text-navy-400">Grey rows: same for all insurers</span>
      </div>
      <p className="mt-2 text-[11px] text-navy-500">
        “Insurer responded” and insurer status “Complete” mean the insurer finished processing. Only a <strong>Quoted</strong> vehicle outcome carries a
        premium and excess; anything else shows {NO_VALUE}.
      </p>
    </Section>
  )
}
