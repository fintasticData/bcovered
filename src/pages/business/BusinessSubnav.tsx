import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/business', label: 'Overview', end: true },
  { to: '/business/industries', label: 'Industries' },
  { to: '/business/cover', label: 'Cover types' },
  { to: '/business/risk-review', label: 'Risk review' },
]

export function BusinessSubnav() {
  return (
    <div className="border-b border-brand-800/10 bg-white">
      <nav className="container-x scroll-x flex gap-1 py-2" aria-label="Business insurance">
        <span className="mr-2 self-center text-xs font-semibold tracking-[0.18em] text-brand-500 uppercase">Business</span>
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              cn('rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition', isActive ? 'bg-brand-50 text-brand-800' : 'text-ink/70 hover:text-brand-800')
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
