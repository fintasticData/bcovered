import { Link, useNavigate } from 'react-router-dom'
import { Newspaper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FINTASTIC_CENTRE_LINKS, FINTASTIC_DRAWER_LINKS } from './fintasticDemoLinks'

/**
 * Surface split (do not mix):
 *
 * Centre-first Fintastic views — full main workspace, above/below the list when a
 * row is focused (SelectedItemHub, ChangeReview, ReferenceComparison, ActiveStep).
 * Open via navigation to the host page — never crush these into a right slide-out.
 *
 * Right-hand modes — record work drawer (complete), focused-item inspect (thin),
 * task form (create / edit / claim / quote). See fintastic-ux skill.
 */

/** News bar → centre-first hosts and the three right-hand drawer modes. */
export function FintasticDemoHost({ className }: { className?: string }) {
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 bg-brand-900 px-3 py-1.5 text-xs text-brand-100 sm:px-5',
        className,
      )}
      role="navigation"
      aria-label="Fintastic demos"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-white">
        <Newspaper className="h-3.5 w-3.5 shrink-0 text-gold-300" aria-hidden />
        <span className="hidden sm:inline">What’s new · Fintastic</span>
        <span className="sm:hidden">Fintastic</span>
      </span>
      <DemoNavGroup
        label="Centre"
        links={FINTASTIC_CENTRE_LINKS}
        onNavigate={(to) => navigate(to)}
      />
      <DemoNavGroup
        label="Drawers"
        links={FINTASTIC_DRAWER_LINKS}
        onNavigate={(to) => navigate(to)}
      />
      <Link
        to="/updates#fintastic-drawers"
        className="shrink-0 font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline"
      >
        Details →
      </Link>
    </div>
  )
}

function DemoNavGroup({
  label,
  links,
  onNavigate,
}: {
  label: string
  links: typeof FINTASTIC_CENTRE_LINKS
  onNavigate: (to: string) => void
}) {
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
      <li className="hidden text-brand-300 sm:inline" aria-hidden>
        ·
      </li>
      <li className="hidden font-semibold text-brand-200 sm:inline">{label}</li>
      {links.map((link) => (
        <li key={link.id} className="inline-flex items-center gap-1">
          <span className="text-brand-400/80" aria-hidden>
            ·
          </span>
          <button
            type="button"
            title={link.hint}
            className="cursor-pointer rounded px-1.5 py-0.5 font-semibold text-gold-300 hover:bg-white/10 hover:text-gold-200"
            onClick={() => onNavigate(link.to)}
          >
            {link.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
