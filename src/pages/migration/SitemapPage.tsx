import { Link } from 'react-router-dom'
import { PageHero } from './components/PageHero'
import { MIGRATION_BASE, products } from './content/site'

const links = [
  { to: MIGRATION_BASE, label: 'Home' },
  { to: `${MIGRATION_BASE}/about-us`, label: 'About Us' },
  ...products.map((p) => ({ to: p.href, label: p.label })),
  { to: `${MIGRATION_BASE}/news`, label: 'News' },
  { to: `${MIGRATION_BASE}/contact-us`, label: 'Contact Us' },
  { to: `${MIGRATION_BASE}/pi`, label: 'Personal Information' },
  { to: `${MIGRATION_BASE}/terms`, label: 'Terms & Conditions' },
  { to: `${MIGRATION_BASE}/sitemap`, label: 'Sitemap' },
]

export default function MigrationSitemapPage() {
  return (
    <>
      <PageHero title="Sitemap" crumbs={[{ label: 'Sitemap' }]} />
      <section className="mig-section">
        <div className="mig-wrap mig-prose">
          <p>
            View our website sitemap below. This is where you can find the list of pages available within our migration
            clone of the public BCovered site.
          </p>
          <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.9 }}>
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} style={{ color: 'var(--mig-navy)', fontWeight: 600 }}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
