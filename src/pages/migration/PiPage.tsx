import { FormEvent, useState } from 'react'
import { PageHero } from './components/PageHero'
import { brand } from './content/site'

export default function MigrationPiPage() {
  const [lookupMsg, setLookupMsg] = useState<string | null>(null)

  const onLookup = (e: FormEvent) => {
    e.preventDefault()
    setLookupMsg(
      'Identity verification is required before any personal information can be shown or changed. Email/phone lookup alone will never reveal customer records on this platform.',
    )
  }

  return (
    <>
      <PageHero title="Personal Information" crumbs={[{ label: 'Personal Information' }]} />
      <section className="mig-section">
        <div className="mig-wrap mig-prose">
          <h2>Are we storing your personal information?</h2>
          <p>
            We value the personal data of all our website visitors. We adhere to all regulations and guarantee that none
            of your information will be used unlawfully or unethically. For full transparency, you can request a review
            of whether we hold your details. From there, and after verification, you may view, edit and remove your
            consent if you wish.
          </p>

          <form className="mig-form mig-quote-box" onSubmit={onLookup} style={{ maxWidth: 480 }}>
            <div className="mig-field">
              <label htmlFor="pi-email">Email or cell number</label>
              <input id="pi-email" name="lookup" required placeholder="Email or cell number" />
            </div>
            <button type="submit" className="mig-btn mig-btn-navy">
              Request secure review
            </button>
            {lookupMsg && <div className="mig-notice">{lookupMsg}</div>}
          </form>

          <h3>Responsible Party</h3>
          <p>
            <strong>{brand.legalName}</strong>
            <br />
            {brand.address}
            <br />
            Tel: <em>Confirm with BCovered — live site still shows unresolved placeholder text.</em>
            <br />
            Email:{' '}
            <a href={`mailto:${brand.email}`} style={{ color: 'var(--mig-navy)', fontWeight: 700 }}>
              {brand.email}
            </a>
          </p>
          <p className="mig-fine" style={{ textAlign: 'left', maxWidth: 'none' }}>
            Note: the production page currently renders literal placeholders <code>popiaphone</code> and{' '}
            <code>popiamail</code>. This clone uses the verified contact email from the live Contact page instead of
            shipping those placeholders as working contacts.
          </p>

          <h3>3rd Party Operators</h3>
          <p>
            We utilize the services of 3rd party software service providers to process your personal information. Please
            contact the Responsible Party for a list of these.
          </p>

          <h3>Duration</h3>
          <p>
            We will remove your personal information after 365 days, unless you purchase from us, in which case we may
            need to keep your information for warranty and service purposes, or you consent to receive marketing
            communication.
          </p>

          <h3>Overseas</h3>
          <p>
            At times we use overseas software service providers to process your information. These operators are
            contracted to abide by POPIA regulations.
          </p>

          <h3>Information Regulator</h3>
          <p>
            The Protection of Personal Information Act, 2013 (POPI Act) aims to promote the protection of personal
            information processed by public and private bodies.
          </p>
          <p>
            Physical address: JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001
            <br />
            Postal address: Box 31533, Braamfontein, Johannesburg, 2017
            <br />
            Complaints: complaints.IR@justice.gov.za
            <br />
            General enquiries: inforeg@justice.gov.za
          </p>

          <h3>Promotion of Access to Information Act (PAIA)</h3>
          <p>
            Form 02: Request for Access to Record [Regulation 7]
            <br />
            Form 03: Outcome of request and of fees payable [Regulation 8]
            <br />
            Form 04: Internal Appeal Form [Regulation 9]
          </p>
        </div>
      </section>
    </>
  )
}
