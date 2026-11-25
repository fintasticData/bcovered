import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Car, Check, Home, Shield } from 'lucide-react'
import {
  about,
  benefits,
  faqs,
  howItWorks,
  MIGRATION_BASE,
  newsItems,
  partners,
  products,
  reviews,
} from './content/site'

const coverIcons = {
  'car-insurance': Car,
  'home-contents-insurance': Home,
  'building-insurance': Building2,
} as const

export default function MigrationHomePage() {
  return (
    <>
      <section className="mig-hero">
        <div className="mig-hero-bg" aria-hidden>
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
            <rect width="1440" height="900" fill="#1a2b56" />
            <path
              fill="#8ed8c1"
              d="M980,0
                 C1120,120 1240,280 1440,380
                 L1440,900
                 L760,900
                 C860,620 900,220 980,0 Z"
            />
            <path
              fill="#ffffff"
              d="M1040,0
                 C1180,140 1300,300 1440,420
                 L1440,900
                 L820,900
                 C920,640 960,240 1040,0 Z"
            />
          </svg>
        </div>
        <div className="mig-wrap mig-hero-grid">
          <div className="mig-hero-copy">
            <h1>Insurance as simple as</h1>
            <div className="mig-abc" aria-hidden>
              <span className="mig-abc-tile">A</span>
              <span className="mig-abc-tile">B</span>
              <span className="mig-abc-word">Covered.</span>
            </div>
            <Link className="mig-btn mig-btn-mint mig-btn-hero" to={`${MIGRATION_BASE}/car-insurance#quote`}>
              Compare quotes in under 3 minutes <ArrowRight size={18} />
            </Link>
          </div>
          <div className="mig-hero-spacer" aria-hidden />
        </div>
      </section>

      <section className="mig-section mig-section-mist" id="cover">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">Cover Options</span>
          <h2 className="mig-title">Choose Your Cover</h2>
          <p className="mig-lead">What type of insurance do you want to compare?</p>
          <div className="mig-cover-grid">
            {products.map((p) => {
              const Icon = coverIcons[p.slug]
              return (
                <Link key={p.slug} to={p.href} className="mig-cover-card">
                  <div className="mig-cover-icon">
                    <Icon size={42} strokeWidth={1.6} />
                  </div>
                  <h3>{p.shortLabel}</h3>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mig-section">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">Our trusted partners</span>
          <div className="mig-partners">
            {partners.map((p) => (
              <div key={p.name} className="mig-partner-chip" style={{ color: p.color }}>
                {p.name}
              </div>
            ))}
          </div>
          <p className="mig-fine">
            Every insurance partner we work with holds a valid FSP license and undergoes a thorough internal vetting
            process to ensure they align with our compliance requirements and quality benchmarks.
          </p>
        </div>
      </section>

      <section className="mig-section mig-section-mist">
        <div className="mig-wrap mig-split">
          <div className="mig-panel" aria-hidden />
          <div>
            <span className="mig-eyebrow">{about.eyebrow}</span>
            <h2 className="mig-title">{about.title}</h2>
            <p className="mig-lead" style={{ margin: '0 0 1.25rem', textAlign: 'left', maxWidth: 'none' }}>
              {about.body}
            </p>
            <Link className="mig-btn mig-btn-navy" to={`${MIGRATION_BASE}/about-us`}>
              More <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="mig-section">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">What We Do</span>
          <h2 className="mig-title">{about.trustTitle}</h2>
          <p className="mig-lead">{about.trustBody}</p>
          <h3 style={{ marginTop: '2.5rem', color: 'var(--mig-navy)' }}>Read Our Latest Reviews</h3>
          <div className="mig-reviews">
            {reviews.map((r) => (
              <blockquote key={r.name} className="mig-review">
                <p>“{r.quote}”</p>
                <strong>{r.name}</strong>
              </blockquote>
            ))}
          </div>
          <div className="mig-benefit-grid">
            {benefits.map((b) => (
              <div key={b} className="mig-benefit">
                <span className="mig-check">
                  <Check size={16} strokeWidth={3} />
                </span>
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mig-section mig-section-navy">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">How It Works</span>
          <h2 className="mig-title">Four simple steps</h2>
          <div className="mig-steps">
            {howItWorks.map((s) => (
              <article key={s.step} className="mig-step">
                <div className="mig-step-num">{s.step}</div>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mig-section">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">Our Solutions</span>
          <p className="mig-lead" style={{ marginBottom: '1.5rem' }}>
            {about.solutionsBody}
          </p>
          <Link className="mig-btn mig-btn-mint" to={`${MIGRATION_BASE}/car-insurance#quote`}>
            Compare quotes in under 3 minutes <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="mig-section mig-section-mist">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">FAQ</span>
          <h2 className="mig-title">Got Questions?</h2>
          <div className="mig-faq">
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mig-section">
        <div className="mig-wrap mig-center">
          <span className="mig-eyebrow">Our Blog</span>
          <h2 className="mig-title">Read Our Latest News & Blog</h2>
          <p className="mig-lead">Keep up to date with our latest news & blog articles.</p>
          <div className="mig-news-grid">
            {newsItems.slice(0, 6).map((n) => (
              <Link key={n.id} to={`${MIGRATION_BASE}/news#${n.id}`} className="mig-news-card">
                <div className="mig-news-thumb" />
                <div className="mig-news-body">
                  <time>{n.date}</time>
                  <h5>{n.title}</h5>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: '1.75rem' }}>
            <Link className="mig-btn mig-btn-ghost" to={`${MIGRATION_BASE}/news`}>
              VIEW ALL
            </Link>
          </div>
        </div>
      </section>

      <section className="mig-section mig-section-mist" aria-hidden>
        <div className="mig-wrap mig-center">
          <Shield size={28} color="var(--mig-mint-deep)" style={{ marginInline: 'auto' }} />
          <p className="mig-fine" style={{ marginTop: '0.75rem' }}>
            Indicative quotes only. Final underwriting and policy issue sit with your selected insurer.
          </p>
        </div>
      </section>
    </>
  )
}
