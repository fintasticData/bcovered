import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CopilotNudge } from './CopilotNudge'

export type HubSpoke = {
  id: string
  title: string
  body: ReactNode
  onClick?: () => void
}

/** Centre-first selected item (fleet / vehicle / asset) with spokes around the decision.
 * Intended for the main workspace — not a narrow slide-out. */
export function SelectedItemHubView({
  title,
  statusLabel,
  statusTone = 'pending',
  imageUrl,
  imageAlt,
  primaryActionLabel,
  onPrimaryAction,
  spokes,
  copilotMessage,
  copilotAction,
  invoicePreview,
  onClose,
  headerActions,
}: {
  title: string
  statusLabel: string
  statusTone?: 'pending' | 'ok' | 'attention'
  imageUrl?: string
  imageAlt?: string
  primaryActionLabel: string
  onPrimaryAction?: () => void
  spokes: HubSpoke[]
  copilotMessage?: string
  copilotAction?: ReactNode
  invoicePreview?: ReactNode
  onClose?: () => void
  headerActions?: ReactNode
}) {
  const toneClass =
    statusTone === 'ok'
      ? 'bg-emerald-100 text-emerald-900'
      : statusTone === 'attention'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-orange-100 text-orange-900'

  const top = spokes.slice(0, 2)
  const bottom = spokes.slice(2, 4)

  return (
    <section className="rounded-2xl border border-brand-200/80 bg-gradient-to-b from-brand-50/40 to-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Working on</p>
          <h2 className="font-display text-xl font-semibold text-navy-900 sm:text-2xl">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold uppercase', toneClass)}>{statusLabel}</span>
          {headerActions}
          {onClose && (
            <Button size="sm" variant="ghost" type="button" onClick={onClose} aria-label="Close item">
              Close
            </Button>
          )}
        </div>
      </div>

      <div className={cn('mt-4 grid gap-3', invoicePreview && 'xl:grid-cols-[1fr_minmax(16rem,22rem)]')}>
        <div className="space-y-3">
          {/* Wide desktop: spokes around the decision */}
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)_minmax(0,1fr)] lg:items-center lg:gap-4">
            <div className="space-y-3">
              {top[0] && <SpokeCard spoke={top[0]} />}
              {bottom[0] && <SpokeCard spoke={bottom[0]} />}
            </div>
            <div className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
              {imageUrl ? (
                <img src={imageUrl} alt={imageAlt ?? title} className="aspect-[4/3] w-full rounded-xl object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-mist px-3 text-center text-sm text-navy-500">
                  {title}
                </div>
              )}
              {onPrimaryAction && (
                <Button size="sm" variant="accent" className="mt-3 w-full" onClick={onPrimaryAction}>
                  {primaryActionLabel}
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {top[1] && <SpokeCard spoke={top[1]} />}
              {bottom[1] && <SpokeCard spoke={bottom[1]} />}
            </div>
          </div>

          {/* Narrow / tablet: focus → action → spokes (designed stack, not left-column-first) */}
          <div className="space-y-3 lg:hidden">
            <div className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
              {imageUrl && (
                <img src={imageUrl} alt={imageAlt ?? title} className="mb-2 aspect-[16/9] w-full rounded-xl object-cover" />
              )}
              <p className="text-sm font-semibold text-navy-900">{title}</p>
              <p className="text-xs text-navy-500">{statusLabel}</p>
              {onPrimaryAction && (
                <Button size="sm" variant="accent" className="mt-3 w-full" onClick={onPrimaryAction}>
                  {primaryActionLabel}
                </Button>
              )}
            </div>
            {copilotMessage && (
              <CopilotNudge action={copilotAction}>{copilotMessage}</CopilotNudge>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {spokes.map((s) => (
                <SpokeCard key={s.id} spoke={s} />
              ))}
            </div>
          </div>

          {copilotMessage && (
            <div className="hidden lg:block">
              <CopilotNudge action={copilotAction}>{copilotMessage}</CopilotNudge>
            </div>
          )}
        </div>

        {invoicePreview && (
          <aside className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Invoice preview</p>
            <div className="mt-2 text-sm text-navy-800">{invoicePreview}</div>
          </aside>
        )}
      </div>
    </section>
  )
}

function SpokeCard({ spoke }: { spoke: HubSpoke }) {
  const inner = (
    <>
      <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{spoke.title}</p>
      <div className="mt-1 text-sm text-navy-800">{spoke.body}</div>
    </>
  )
  if (spoke.onClick) {
    return (
      <button
        type="button"
        onClick={spoke.onClick}
        className="w-full cursor-pointer rounded-2xl border border-navy-800/10 bg-white p-3 text-left shadow-sm transition hover:border-brand-300"
      >
        {inner}
      </button>
    )
  }
  return <article className="rounded-2xl border border-navy-800/10 bg-white p-3 shadow-sm">{inner}</article>
}
