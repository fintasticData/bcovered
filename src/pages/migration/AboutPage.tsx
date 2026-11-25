import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PageHero } from './components/PageHero'
import { about, MIGRATION_BASE } from './content/site'

export default function MigrationAboutPage() {
  return (
    <>
      <PageHero title="About Us" crumbs={[{ label: 'About Us' }]} />
      <section className="mig-section">
        <div className="mig-wrap mig-split">
          <div className="mig-panel" aria-hidden />
          <div>
            <span className="mig-eyebrow">About Us</span>
            <h2 className="mig-title">{about.pageTitle}</h2>
            <p className="mig-lead" style={{ margin: 0, textAlign: 'left', maxWidth: 'none' }}>
              {about.pageBody}
            </p>
          </div>
        </div>
      </section>
      <section className="mig-section mig-section-mist">
        <div className="mig-wrap mig-center">
          <h2 className="mig-title">{about.trustTitle}</h2>
          <p className="mig-lead">{about.trustBody}</p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link className="mig-btn mig-btn-mint" to={`${MIGRATION_BASE}/car-insurance#quote`}>
              Compare quotes in under 3 minutes <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
