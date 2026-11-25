import { FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { PageHero } from './components/PageHero'
import { MIGRATION_BASE, products, type ProductSlug } from './content/site'
import {
  enquiryErrorMessage,
  splitName,
  submitWebsiteEnquiry,
  type WebsiteEnquiryResult,
} from './lib/submitEnquiry'

export default function MigrationProductPage() {
  const { pathname } = useLocation()
  const slug = pathname.split('/').filter(Boolean).pop() as ProductSlug | undefined
  const product = products.find((p) => p.slug === slug)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WebsiteEnquiryResult | null>(null)

  if (!product) return <Navigate to={MIGRATION_BASE} replace />

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const fullName = String(fd.get('name') ?? '')
    const { first_names, surname } = splitName(fullName)
    const coverSlug = String(fd.get('cover') || product.slug) as ProductSlug
    const coverLabel = products.find((p) => p.slug === coverSlug)?.label ?? product.label
    setPending(true)
    try {
      const res = await submitWebsiteEnquiry({
        first_names,
        surname,
        phone: String(fd.get('phone') ?? ''),
        email: String(fd.get('email') ?? ''),
        interest: coverLabel,
        message: 'Public website Quick Quote (migration clone)',
        consent: fd.get('consent') === 'on',
        channel: 'quick_quote',
        category: 'sample',
      })
      setResult(res)
    } catch (err) {
      setError(enquiryErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHero title={product.label} crumbs={[{ label: product.label }]} />

      <section className="mig-section">
        <div className="mig-wrap mig-split">
          <div className="mig-panel" aria-hidden />
          <div>
            <span className="mig-eyebrow">{product.eyebrow}</span>
            <h2 className="mig-title">{product.title}</h2>
            <p className="mig-lead" style={{ margin: '0 0 1.25rem', textAlign: 'left', maxWidth: 'none' }}>
              {product.body}
            </p>
            <a className="mig-btn mig-btn-navy" href="#quote">
              Compare quotes <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <section className="mig-section mig-section-mist" id="quote">
        <div className="mig-wrap" style={{ maxWidth: 720 }}>
          <span className="mig-eyebrow">Quick Quote</span>
          <h2 className="mig-title">Start your {product.shortLabel.toLowerCase()} comparison</h2>
          <p className="mig-lead" style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
            Your details create a <strong>Sample</strong> Customer prospect on the BCovered sales book (not a live
            policy). A broker can follow up from Customer Area. Quotes remain indicative until an insurer confirms.
          </p>

          {result ? (
            <div className="mig-notice">
              <strong>Thank you — enquiry {result.reference} received.</strong>
              <br />
              {result.referrer_name} at {result.brokerage} has your Sample enquiry about {product.label.toLowerCase()}.
              {result.category === 'sample' && (
                <>
                  <br />
                  <span style={{ fontSize: '0.86rem' }}>Demo record only — labelled Sample in the brokerage book.</span>
                </>
              )}
            </div>
          ) : (
            <form className="mig-form mig-quote-box" onSubmit={onSubmit}>
              <div className="mig-field">
                <label htmlFor="q-name">Full name</label>
                <input id="q-name" name="name" required autoComplete="name" />
              </div>
              <div className="mig-field">
                <label htmlFor="q-email">Email</label>
                <input id="q-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="mig-field">
                <label htmlFor="q-phone">Phone</label>
                <input id="q-phone" name="phone" type="tel" required autoComplete="tel" />
              </div>
              <div className="mig-field">
                <label htmlFor="q-cover">Cover</label>
                <select id="q-cover" name="cover" defaultValue={product.slug as ProductSlug}>
                  {products.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="mig-checkrow">
                <input type="checkbox" name="consent" required />
                <span>
                  I consent to BCovered processing my information to contact me about indicative quotes. See{' '}
                  <Link to={`${MIGRATION_BASE}/pi`}>Personal Information</Link>.
                </span>
              </label>
              {error && (
                <div className="mig-notice" style={{ background: '#fee2e2', color: '#7f1d1d' }}>
                  {error}
                </div>
              )}
              <div className="mig-form-actions">
                <button type="submit" className="mig-btn mig-btn-mint" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      Request quotes <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
