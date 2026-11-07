import type {
  BusinessDependencyLink,
  CompletenessItem,
  CompletenessStatus,
  CoverageFinding,
  InsurancePolicy,
  PolicySection,
  RiskAssessmentRecord,
  RiskExposure,
} from '../../db/commercialSchema'
import type { ProfileSnapshot } from './exposureRules'

export interface CompletenessInput {
  snapshot: ProfileSnapshot
  links: BusinessDependencyLink[]
  policies: InsurancePolicy[]
  sections: PolicySection[]
  exposures: RiskExposure[]
  coverage: CoverageFinding[]
  assessment: Pick<RiskAssessmentRecord, 'status'> | null
}

const status = (missing: number, total: number): CompletenessStatus => (total === 0 ? 'missing' : missing === 0 ? 'complete' : missing >= total ? 'missing' : 'partial')

/** How complete the information is. A data-completeness measure, not an insurance risk score. */
export function assessCompleteness(i: CompletenessInput): CompletenessItem[] {
  const p = i.snapshot.profile
  const businessFields: Array<[string, unknown]> = [
    ['Registration number', p.registration_number],
    ['Industry', p.industry_key],
    ['Annual turnover', p.annual_turnover],
    ['Number of employees', p.employee_count],
    ['Years trading', p.years_trading],
    ['Current insurer', p.existing_cover?.insurer],
    ['Claims history', p.loss_history?.claims_last_5_years],
  ]
  const businessMissing = businessFields.filter(([, v]) => v === null || v === undefined || v === '').map(([k]) => k)

  const locationMissing = i.snapshot.locations.flatMap((l) => [
    ...(l.construction ? [] : [`${l.name}: construction`]),
    ...(l.fire_protection.length ? [] : [`${l.name}: fire protection`]),
    ...(l.security.length ? [] : [`${l.name}: security`]),
    ...(l.backup_power === null ? [`${l.name}: backup power`] : []),
  ])

  const assetMissing = i.snapshot.assets.flatMap((a) => [
    ...(a.declared_value === null ? [`${a.description}: value`] : []),
    ...(a.value_basis !== 'replacement' && a.asset_class !== 'vehicle' ? [`${a.description}: replacement value (recorded as ${a.value_basis})`] : []),
  ])

  const streams = i.snapshot.activities.filter((a) => a.kind === 'revenue_stream')
  const active = i.links.filter((l) => l.status === 'active')
  const keyAssets = i.snapshot.assets.filter((a) => ['machinery', 'vehicle', 'electronic_equipment'].includes(a.asset_class))
  const dependencyMissing = [
    ...streams.filter((s) => s.share_of_revenue === null).map((s) => `${s.name}: share of revenue`),
    ...(streams.length ? [] : ['Revenue streams']),
    ...keyAssets.filter((a) => !active.some((l) => l.from_id === a.id)).map((a) => `${a.description}: which operations depend on it`),
    ...(active.some((l) => l.source === 'inferred') ? [`${active.filter((l) => l.source === 'inferred').length} AI-inferred links awaiting confirmation`] : []),
  ]

  const unreviewed = i.exposures.filter((e) => !i.coverage.some((c) => c.exposure_id === e.id))
  const insuranceMissing = !i.policies.length
    ? ['Current policy schedule']
    : [
        ...(i.sections.length ? [] : ['Policy sections and sums insured']),
        ...(unreviewed.length ? [`Coverage evidence for ${unreviewed.length} of ${i.exposures.length} exposures`] : []),
      ]

  const brokerStatus: CompletenessStatus = i.assessment?.status === 'approved' ? 'complete' : 'pending'
  return [
    { key: 'business', label: 'Business information', status: status(businessMissing.length, businessFields.length), missing: businessMissing },
    {
      key: 'locations',
      label: 'Locations',
      status: i.snapshot.locations.length ? status(locationMissing.length, i.snapshot.locations.length * 4) : 'missing',
      missing: i.snapshot.locations.length ? locationMissing : ['At least one location'],
    },
    {
      key: 'assets',
      label: 'Assets',
      status: i.snapshot.assets.length ? status(assetMissing.length, i.snapshot.assets.length * 2) : 'missing',
      missing: i.snapshot.assets.length ? assetMissing : ['Asset register'],
    },
    {
      key: 'dependencies',
      label: 'Revenue and operational dependencies',
      status: streams.length || keyAssets.length ? status(dependencyMissing.length, streams.length + keyAssets.length + 1) : 'missing',
      missing: dependencyMissing,
    },
    {
      key: 'insurance',
      label: 'Insurance evidence',
      status: !i.policies.length ? 'missing' : insuranceMissing.length ? 'partial' : 'complete',
      missing: insuranceMissing,
    },
    {
      key: 'broker_review',
      label: 'Broker review',
      status: brokerStatus,
      missing: brokerStatus === 'complete' ? [] : [i.assessment?.status === 'awaiting_review' ? 'Broker sign-off of the assessment' : 'A completed assessment for broker sign-off'],
    },
  ]
}
