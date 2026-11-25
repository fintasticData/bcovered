import { Link } from 'react-router-dom'
import { MIGRATION_BASE } from '../content/site'

type Crumb = { label: string; to?: string }

export function PageHero({ title, crumbs }: { title: string; crumbs: Crumb[] }) {
  return (
    <section className="mig-page-hero">
      <div className="mig-wrap mig-page-hero-inner">
        <h1>{title}</h1>
        <nav className="mig-breadcrumb" aria-label="Breadcrumb">
          <Link to={MIGRATION_BASE}>Home</Link>
          {crumbs.map((c) => (
            <span key={c.label} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <span aria-hidden>»</span>
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>
    </section>
  )
}
