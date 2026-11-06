import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AdviceNotice } from '@/components/commercial/badges'
import { COVER_CLASSES, type CoverClass } from '@/server/domain/commercial/coverClasses'
import { BusinessSubnav } from './BusinessSubnav'

const GROUPS: Array<{ key: CoverClass['group']; title: string }> = [
  { key: 'property', title: 'Property and equipment' },
  { key: 'interruption', title: 'Business interruption' },
  { key: 'liability', title: 'Liability' },
  { key: 'motor_transit', title: 'Motor, transit and cargo' },
  { key: 'specialist', title: 'Specialist cover' },
  { key: 'special_risk', title: 'South African special risks' },
]

export default function BusinessCoverPage() {
  return (
    <>
      <BusinessSubnav />
      <div className="container-x py-12">
        <p className="eyebrow">Commercial coverage catalogue</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-navy-900">{COVER_CLASSES.length} insurance sections a broker may consider</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/70">
          A business can hold several policies with different insurers. Each section has its own sums insured, limits, excesses, conditions and
          exclusions, so cover is never assumed to sit under one policy.
        </p>
        <AdviceNotice className="mt-4 max-w-3xl">
          These are potential insurance classes, not a promise that any exposure is insurable or included. Sasria special-risk cover must be
          checked for each underlying class.
        </AdviceNotice>

        <div className="mt-8 space-y-8">
          {GROUPS.map((g) => (
            <section key={g.key}>
              <h2 className="mb-3 text-sm font-semibold text-navy-900">{g.title}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {COVER_CLASSES.filter((c) => c.group === g.key).map((c) => (
                  <div key={c.key} className="card p-4">
                    <p className="font-semibold text-navy-900">{c.label}</p>
                    <p className="mt-1 text-xs text-ink/70">{c.description}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/business/risk-review" className="btn-primary">
            Find out which sections to discuss <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  )
}
