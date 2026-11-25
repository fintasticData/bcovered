import { PageHero } from './components/PageHero'

const sections: { title: string; body: string[] }[] = [
  {
    title: 'Errors & Omissions',
    body: [
      'We take every reasonable effort to ensure that all information on this website is accurate and up to date. However, errors and omissions may occur from time to time, including technical inaccuracies and typographical errors.',
      'We reserve the right to make enhancements, changes, or updates to the content on this website at any time without prior notice.',
      'All information provided on this website is for general guidance purposes only. Users are encouraged to verify all details, including pricing, availability, specifications, and services, directly with the relevant provider before making any decisions.',
      'We, our employees, and hosting providers shall not be held liable for any direct, indirect, incidental, or consequential damages arising from the use of, or reliance on, information contained on this website.',
    ],
  },
  {
    title: 'Product & Service Information',
    body: [
      'Products and services may vary and are subject to change without notice. Any descriptions, specifications, or representations are provided as a general guide and should not be considered definitive.',
      'Variations may occur due to updates, changes in suppliers, or other factors. Users are encouraged to confirm all relevant details prior to purchase or engagement.',
    ],
  },
  {
    title: 'Updates',
    body: [
      'Content on this website is updated periodically. While we aim to keep all information current, there may be delays in reflecting recent changes.',
      'Availability, pricing, specifications, and other details are subject to change without prior notice.',
    ],
  },
  {
    title: 'Images & Visual Content',
    body: [
      'Images used on this website may be for illustrative purposes only. In some cases, representative or similar images may be used where actual images are not available.',
      'Actual products, services, or results may differ from what is shown. Please confirm details with the provider where necessary.',
    ],
  },
  {
    title: 'Pricing & Additional Costs',
    body: [
      'Unless otherwise stated, prices displayed on this website may exclude additional costs such as delivery, administrative fees, or other applicable charges.',
      'Users are encouraged to confirm the full cost before proceeding with any transaction.',
    ],
  },
  {
    title: 'Estimates & Calculators',
    body: [
      'Any tools, calculators, or estimates provided on this website are for illustrative purposes only and are based on assumptions that may not apply to all users.',
      'These tools do not constitute an offer, guarantee, or financial advice. Actual costs, repayments, or outcomes may vary. Users should seek appropriate professional advice before making financial decisions.',
    ],
  },
  {
    title: 'Complaints & Dispute Resolution',
    body: [
      'If you are dissatisfied with any aspect of your experience, please contact us directly using the details provided on this website so that we can investigate and address your concerns.',
    ],
  },
  {
    title: 'Copyright & Ownership',
    body: [
      'All content, trademarks, and data on this website, including but not limited to text, graphics, logos, designs, and software, are the property of the website owner unless otherwise stated.',
      'All rights are reserved. No content may be reproduced, distributed, or used without prior written permission.',
    ],
  },
  {
    title: 'Website Usage',
    body: [
      'By accessing and using this website, you agree to be bound by these terms and conditions and any applicable policies.',
      'Users acknowledge that information transmitted via the internet may be susceptible to monitoring or interception. Users should avoid sharing sensitive or confidential information unless necessary.',
      'No person or entity may link to, frame, or reproduce any part of this website without prior written consent.',
      'This website may include links to third-party websites for convenience. We do not control or endorse these websites and are not responsible for their content or availability.',
    ],
  },
  {
    title: 'Electronic Communications',
    body: [
      'No agreement shall be deemed concluded solely through the sending of a data message. Valid agreements require acknowledgement by the website owner.',
      'The use of automated systems or technologies to extract data from this website is prohibited if it impacts performance or infringes on intellectual property rights.',
      'This website and its content are provided "as is" without any warranties, express or implied. We do not guarantee that the website will be error-free or meet specific performance expectations.',
      'If any provision of these terms is found to be invalid or unenforceable, the remaining provisions will continue to apply.',
    ],
  },
  {
    title: 'Security',
    body: [
      'While reasonable measures are taken to ensure the safety and integrity of this website, we do not guarantee that files, downloads, or content are free from viruses or harmful code.',
      'Unauthorised access, misuse, or interference with the website is strictly prohibited and may result in legal action.',
      'Use of this website is at the user\'s own risk. The website owner, its employees, and affiliates shall not be liable for any loss, damage, or injury arising from the use of this website or reliance on its content.',
    ],
  },
  {
    title: 'Applicable Law',
    body: [
      'This website is governed by the laws of the Republic of South Africa. Any disputes arising from the use of this website will be subject to the jurisdiction of South African courts or resolved through arbitration where applicable.',
      'We respect your privacy and are committed to protecting your personal information. Any data collected will be handled in accordance with our privacy policy.',
    ],
  },
]

export default function MigrationTermsPage() {
  return (
    <>
      <PageHero title="Terms & Conditions" crumbs={[{ label: 'Terms & Conditions' }]} />
      <section className="mig-section">
        <div className="mig-wrap mig-prose">
          <p>
            <strong>BCovered R500 Voucher Compare Incentive Terms and Conditions</strong>
            <br />
            <strong>BCovered R1000 November Competition Terms and Conditions</strong>
          </p>
          {sections.map((s) => (
            <div key={s.title}>
              <h2>{s.title}</h2>
              {s.body.map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
