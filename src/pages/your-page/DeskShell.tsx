import type { ReactNode } from 'react'
import { ArrowRight, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { deskTabClass } from '@/pages/your-page/deskTabStyles'

export type DeskTabItem = { id: string; label: string }

/** Shared chrome for My Page / My Business Page: banners, header, tabs, attention. */
export function DeskShell({
  readOnly,
  readOnlyMessage = 'Read-only preview — submissions are disabled.',
  isSample,
  sampleLabel = 'Sample page',
  hideChrome = false,
  /** Hide greeting / logo header (Cover desk layout already owns identity). */
  hideHeader = false,
  eyebrow,
  title,
  subtitle,
  logoUrl,
  icon,
  actions,
  beforeTabs,
  tabs,
  activeTab,
  onTabChange,
  tablistLabel,
  attention,
  /** Compact one-line attention chip (default card for broker embeds). */
  attentionVariant = 'card',
  children,
}: {
  readOnly?: boolean
  readOnlyMessage?: string
  isSample?: boolean
  sampleLabel?: string
  /** When true (e.g. broker embed locked to one panel), hide banners/header/tabs. */
  hideChrome?: boolean
  hideHeader?: boolean
  eyebrow?: string
  title: string
  subtitle?: string
  logoUrl?: string | null
  icon?: ReactNode
  actions?: ReactNode
  beforeTabs?: ReactNode
  tabs: DeskTabItem[]
  activeTab: string
  onTabChange: (id: string) => void
  tablistLabel: string
  attention?: {
    label: string
    /** Prefer `onContinue` for in-page actions; `href` for navigation. */
    href?: string
    onContinue?: () => void
    continueDisabled?: boolean
  } | null
  attentionVariant?: 'card' | 'chip'
  children: ReactNode
}) {
  const showHeader = !hideChrome && !hideHeader

  const attentionActions =
    attention &&
    (attention.continueDisabled ? (
      <Button size="sm" variant="accent" disabled>
        Open
      </Button>
    ) : attention.onContinue ? (
      <Button size="sm" variant="accent" type="button" onClick={attention.onContinue}>
        Continue <ArrowRight />
      </Button>
    ) : attention.href ? (
      <Button size="sm" variant="accent" asChild>
        <Link to={attention.href}>
          Continue <ArrowRight />
        </Link>
      </Button>
    ) : null)

  return (
    <div className="space-y-4">
      {!hideChrome && readOnly && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900" role="status">
          {readOnlyMessage}
        </p>
      )}
      {!hideChrome && isSample && (
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950" role="status">
          {sampleLabel} <SimulatedBadge className="align-middle" /> — demo data, not live cover.
        </p>
      )}

      {showHeader && (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-12 w-12 rounded-xl border border-navy-800/10 bg-white object-contain"
              />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
                {icon ?? <Building2 className="h-5 w-5" />}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{eyebrow}</p>
              )}
              <h1 className="font-display text-2xl font-bold text-navy-900">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-navy-600">{subtitle}</p>}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      )}

      {!hideChrome && beforeTabs}

      {!hideChrome && tabs.length > 0 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={tablistLabel}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={deskTabClass(activeTab === t.id)}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {attention && attentionVariant === 'chip' && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2"
          role="status"
          aria-label="Needs your attention"
        >
          <p className="min-w-0 text-sm font-semibold text-navy-900">
            <span className="mr-1.5 text-[10px] font-bold tracking-wide text-amber-900 uppercase">Needs attention</span>
            {attention.label}
          </p>
          {attentionActions}
        </div>
      )}

      {attention && attentionVariant === 'card' && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4" aria-label="Needs your attention">
          <p className="text-[10px] font-semibold tracking-wide text-amber-900 uppercase">Needs your attention</p>
          <p className="mt-1 text-base font-semibold text-navy-900">{attention.label}</p>
          <div className="mt-3">{attentionActions}</div>
        </section>
      )}

      {children}
    </div>
  )
}
