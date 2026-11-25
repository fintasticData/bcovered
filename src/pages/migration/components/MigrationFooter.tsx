import { Link } from 'react-router-dom'
import { brand, MIGRATION_BASE, products } from '../content/site'

export function MigrationFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mig-footer">
      <div className="mig-wrap mig-footer-grid">
        <div>
          <Link to={MIGRATION_BASE} className="mig-logo" style={{ marginBottom: '1rem' }}>
            <img src="/migration/logo-dark.png" alt={brand.name} width={72} height={63} />
          </Link>
          <p style={{ margin: 0, maxWidth: 280, lineHeight: 1.55 }}>{brand.tagline}</p>
        </div>
        <div>
          <h4>Our Solutions</h4>
          {products.map((p) => (
            <div key={p.slug}>
              <Link to={p.href}>{p.label}</Link>
            </div>
          ))}
          <div>
            <Link to={`${MIGRATION_BASE}/about-us`}>About Us</Link>
          </div>
          <div>
            <Link to={`${MIGRATION_BASE}/news`}>News</Link>
          </div>
        </div>
        <div>
          <h4>Contact Us</h4>
          <div>
            <a href={`mailto:${brand.email}`}>Email</a>
          </div>
          <div>
            <a href={`mailto:${brand.email}`}>{brand.email}</a>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <a href={brand.instagram} target="_blank" rel="noreferrer">
              Instagram
            </a>
          </div>
        </div>
      </div>
      <div className="mig-wrap mig-footer-bottom">
        <span>© {year} B Covered</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem' }}>
          <Link to={`${MIGRATION_BASE}/pi`}>Personal Information</Link>
          <Link to={`${MIGRATION_BASE}/terms`}>Terms & Conditions</Link>
          <Link to={`${MIGRATION_BASE}/sitemap`}>Sitemap</Link>
        </div>
      </div>
    </footer>
  )
}
