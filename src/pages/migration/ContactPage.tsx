import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Headset, Loader2 } from 'lucide-react'
import { PageHero } from './components/PageHero'
import { brand, MIGRATION_BASE, products } from './content/site'
import {
  enquiryErrorMessage,
  submitWebsiteEnquiry,
  type WebsiteEnquiryResult,
} from './lib/submitEnquiry'

export default function MigrationContactPage() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WebsiteEnquiryResult | null>(null)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const coverSlug = String(fd.get('cover') ?? '')
    const coverLabel =
      products.find((p) => p.slug === coverSlug)?.label ??
      (coverSlug === 'other' ? 'General enquiry' : 'Contact form')
    setPending(true)
    try {
      const res = await submitWebsiteEnquiry({
        first_names: String(fd.get('name') ?? ''),
        surname: String(fd.get('surname') ?? ''),
        phone: String(fd.get('phone') ?? ''),
        email: String(fd.get('email') ?? ''),
        interest: coverLabel,
        message: String(fd.get('comments') ?? ''),
        consent: fd.get('consent') === 'on',
        channel: 'contact',
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
      <PageHero title="Contact Us" crumbs={[{ label: 'Contact Us' }]} />
      <section className="mig-section">
        <div className="mig-wrap mig-split">
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <Headset color="var(--mig-mint-deep)" />
              <div>
                <h3 style={{ margin: '0 0 0.35rem', color: 'var(--mig-navy)' }}>Contact Us</h3>
                <p style={{ margin: 0, color: 'var(--mig-muted)' }}>
                  Email:{' '}
                  <a href={`mailto:${brand.email}`} style={{ color: 'var(--mig-navy)', fontWeight: 700 }}>
                    {brand.email}
                  </a>
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <Clock color="var(--mig-mint-deep)" />
              <div>
                <h3 style={{ margin: '0 0 0.35rem', color: 'var(--mig-navy)' }}>Office Hours</h3>
                <p style={{ margin: 0, color: 'var(--mig-muted)' }}>{brand.officeHours}</p>
              </div>
            </div>
          </div>

          <div>
            {result ? (
              <div className="mig-notice">
                <strong>Thank you — enquiry {result.reference} received.</strong>
                <br />
                {result.referrer_name} at {result.brokerage} will follow up.
                {result.category === 'sample' && (
                  <>
                    <br />
                    <span style={{ fontSize: '0.86rem' }}>Sample / demo record in the brokerage Customer book.</span>
                  </>
                )}
              </div>
            ) : (
              <form className="mig-form" onSubmit={onSubmit}>
                <div className="mig-field">
                  <label htmlFor="c-name">Name</label>
                  <input id="c-name" name="name" required />
                </div>
                <div className="mig-field">
                  <label htmlFor="c-surname">Surname</label>
                  <input id="c-surname" name="surname" required />
                </div>
                <div className="mig-field">
                  <label htmlFor="c-phone">Phone Number</label>
                  <input id="c-phone" name="phone" type="tel" required />
                </div>
                <div className="mig-field">
                  <label htmlFor="c-email">Email</label>
                  <input id="c-email" name="email" type="email" required />
                </div>
                <div className="mig-field">
                  <label htmlFor="c-cover">Cover</label>
                  <select id="c-cover" name="cover" defaultValue="">
                    <option value="" disabled>
                      Select cover
                    </option>
                    {products.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.label}
                      </option>
                    ))}
                    <option value="other">Other / general</option>
                  </select>
                </div>
                <div className="mig-field">
                  <label htmlFor="c-comments">Comments</label>
                  <textarea id="c-comments" name="comments" />
                </div>
                <label className="mig-checkrow">
                  <input type="checkbox" name="consent" required />
                  <span>
                    Consent to process my information. Details at{' '}
                    <Link to={`${MIGRATION_BASE}/pi`}>{MIGRATION_BASE}/pi</Link>.
                  </span>
                </label>
                <label className="mig-checkrow">
                  <input type="checkbox" name="marketing" />
                  <span>
                    Consent to marketing. See <Link to={`${MIGRATION_BASE}/pi`}>Personal Information</Link>.
                  </span>
                </label>
                {error && (
                  <div className="mig-notice" style={{ background: '#fee2e2', color: '#7f1d1d' }}>
                    {error}
                  </div>
                )}
                <div className="mig-form-actions">
                  <button type="submit" className="mig-btn mig-btn-navy" disabled={pending}>
                    {pending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Sending…
                      </>
                    ) : (
                      'Submit'
                    )}
                  </button>
                  <button type="reset" className="mig-btn mig-btn-ghost" disabled={pending}>
                    Reset
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
