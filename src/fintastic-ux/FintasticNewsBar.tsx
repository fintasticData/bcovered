import { Link } from 'react-router-dom'
import { Newspaper } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FINTASTIC_CENTRE_LINKS,
  FINTASTIC_DEMO_LINKS,
  FINTASTIC_DRAWER_LINKS,
} from './fintasticDemoLinks'

export { FINTASTIC_DEMO_LINKS, FINTASTIC_CENTRE_LINKS, FINTASTIC_DRAWER_LINKS }

/** Lightweight news reader — single row with horizontal scroll. */
export function FintasticNewsBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'scroll-x flex flex-nowrap items-center gap-x-3 bg-brand-900 px-3 py-1.5 text-xs text-brand-100 sm:px-5',
        className,
      )}
      role="navigation"
      aria-label="Fintastic demos"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-white">
        <Newspaper className="h-3.5 w-3.5 shrink-0 text-gold-300" aria-hidden />
        <span className="hidden sm:inline">What’s new · Fintastic</span>
        <span className="sm:hidden">Fintastic</span>
      </span>
      <DemoLinkGroup label="Centre" links={FINTASTIC_CENTRE_LINKS} />
      <DemoLinkGroup label="Drawers" links={FINTASTIC_DRAWER_LINKS} />
      <Link
        to="/updates#fintastic-drawers"
        className="shrink-0 font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline"
      >
        Details →
      </Link>
    </div>
  )
}

function DemoLinkGroup({
  label,
  links,
}: {
  label: string
  links: typeof FINTASTIC_CENTRE_LINKS
}) {
  return (
    <ul className="flex shrink-0 flex-nowrap items-center gap-x-1">
      <li className="hidden text-brand-300 sm:inline" aria-hidden>
        ·
      </li>
      <li className="hidden shrink-0 font-semibold text-brand-200 sm:inline">{label}</li>
      {links.map((link) => (
        <li key={link.id} className="inline-flex shrink-0 items-center gap-1">
          <span className="text-brand-400/80" aria-hidden>
            ·
          </span>
          <Link
            to={link.to}
            className="rounded px-1.5 py-0.5 font-semibold whitespace-nowrap text-gold-300 hover:bg-white/10 hover:text-gold-200"
            title={link.hint}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
