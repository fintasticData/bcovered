import { Link } from 'react-router-dom'

export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="BCovered home">
      <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? '#ffffff' : '#0f3d3e'} />
        <path d="M16 6l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V9z" fill="#f5b841" />
        <path d="M12.5 15.5l2.5 2.5 4.5-5" stroke={light ? '#0f3d3e' : '#0f3d3e'} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`font-display text-2xl font-bold tracking-tight ${light ? 'text-white' : 'text-brand-800'}`}>
        B<span className="text-gold-500">Covered</span>
      </span>
    </Link>
  )
}
