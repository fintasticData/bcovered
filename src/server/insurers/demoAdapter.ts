import { calculateOffers } from '@/lib/quote'
import type { CoverageItem, Insurer, MotorDetails } from '../db/schema'

export const DEMO_ADAPTER_SOURCE = 'demo_adapter_v1'

export interface DemoOptionSpec {
  insurer_id: string
  option_label: string
  monthly_premium: number
  excess: number
  sum_insured: number
  inclusions: CoverageItem[]
  exclusions: string[]
  conditions: string[]
  assumptions: string[]
}

interface InsurerProfile {
  name: string
  label: string
  factor: number
  coverage: CoverageItem[]
  exclusions: string[]
}

const PROFILES: InsurerProfile[] = [
  {
    name: 'Protea Insure',
    label: 'Option A',
    factor: 1,
    coverage: [
      { key: 'vehicle_cover', label: 'Vehicle cover', included: true, detail: 'Retail value; accident, fire and weather damage' },
      { key: 'theft_hijacking', label: 'Theft and hijacking', included: true, detail: 'Included; tracker must be active' },
      { key: 'windscreen', label: 'Windscreen', included: true, detail: 'Included with R750 windscreen excess' },
      { key: 'roadside', label: 'Roadside assistance', included: true, detail: '24/7, towing up to 100 km' },
      { key: 'courtesy_vehicle', label: 'Courtesy vehicle', included: false, detail: 'Optional extra, not included in this premium' },
    ],
    exclusions: ['Driving without a valid licence', 'Wear and tear and mechanical breakdown', 'Use for hire or reward'],
  },
  {
    name: 'Karoo Mutual',
    label: 'Option B',
    factor: 1.12,
    coverage: [
      { key: 'vehicle_cover', label: 'Vehicle cover', included: true, detail: 'Retail value; accident, fire and weather damage' },
      { key: 'theft_hijacking', label: 'Theft and hijacking', included: true, detail: 'Included' },
      { key: 'windscreen', label: 'Windscreen', included: true, detail: 'Included, no windscreen excess' },
      { key: 'roadside', label: 'Roadside assistance', included: true, detail: '24/7, towing up to 150 km' },
      { key: 'courtesy_vehicle', label: 'Courtesy vehicle', included: true, detail: 'Group B car for up to 14 days after a valid claim' },
    ],
    exclusions: ['Driving without a valid licence', 'Wear and tear and mechanical breakdown', 'Racing or speed trials'],
  },
  {
    name: 'Baobab General',
    label: 'Option C',
    factor: 0.92,
    coverage: [
      { key: 'vehicle_cover', label: 'Vehicle cover', included: true, detail: 'Market value; accident, fire and weather damage' },
      { key: 'theft_hijacking', label: 'Theft and hijacking', included: true, detail: 'Included; 25% additional excess if no tracker' },
      { key: 'windscreen', label: 'Windscreen', included: true, detail: 'Included with R1,000 windscreen excess' },
      { key: 'roadside', label: 'Roadside assistance', included: true, detail: 'Towing up to 50 km' },
      { key: 'courtesy_vehicle', label: 'Courtesy vehicle', included: false, detail: 'Not available on this product' },
    ],
    exclusions: ['Driving without a valid licence', 'Wear and tear and mechanical breakdown', 'Unattended vehicle left unlocked'],
  },
]

/** The headline demo fixture (2022 Toyota Corolla, R245,000) returns the brief's fixed figures. */
const FIXTURE: Record<string, { monthly: number; excess: number }> = {
  'Option A': { monthly: 1180, excess: 5000 },
  'Option B': { monthly: 1340, excess: 3500 },
  'Option C': { monthly: 1090, excess: 7500 },
}

export function isHeadlineFixture(d: MotorDetails) {
  return d.make?.toLowerCase() === 'toyota' && d.model?.toLowerCase() === 'corolla' && d.year === 2022 && d.value === 245000
}

const round10 = (n: number) => Math.round(n / 10) * 10
const round250 = (n: number) => Math.round(n / 250) * 250

function conditionsFor(d: MotorDetails): string[] {
  const out = ['All drivers must hold a valid South African or recognised licence']
  if (d.tracker) out.push('Approved tracking device must be fitted and active')
  if (d.parking === 'garage') out.push('Vehicle must be kept in a locked garage overnight')
  if (d.parking === 'secure_complex') out.push('Vehicle must be kept in a secure complex overnight')
  out.push('Material changes in use or drivers must be disclosed')
  return out
}

function assumptionsFor(d: MotorDetails): string[] {
  return [
    `${d.year ?? 'Unknown year'} ${d.make ?? ''} ${d.model ?? ''}, ${d.condition ?? 'condition not stated'}`.replace(/\s+/g, ' ').trim(),
    `${d.usage === 'business' ? 'Business' : 'Private'} use`,
    `Regular driver aged ${d.driver_age ?? 'unknown'}, licensed ${d.licence_years ?? 'unknown'} years`,
    `${d.claims_last_3_years ?? 0} claims in the last 3 years`,
    'Simulated premium from the demo insurer adapter. This is not an insurer quotation and cannot be accepted as cover.',
  ]
}

export function getDemoOptions(details: MotorDetails, insurers: Insurer[]): DemoOptionSpec[] {
  const value = details.value ?? 200000
  const fixture = isHeadlineFixture(details)

  const base = calculateOffers({
    product: 'car',
    value,
    age: details.driver_age ?? 35,
    province: 'Gauteng',
    claimsLast3Years: details.claims_last_3_years ?? 0,
    excess: 'standard',
    security: Boolean(details.tracker) || details.parking === 'garage',
  })
  const baseline = base.reduce((s, o) => s + o.monthly, 0) / base.length
  const baseExcess = base.reduce((s, o) => s + o.excess, 0) / base.length

  return PROFILES.flatMap((p) => {
    const insurer = insurers.find((i) => i.name === p.name)
    if (!insurer) return []
    const fixed = fixture ? FIXTURE[p.label] : undefined
    const monthly = fixed?.monthly ?? round10(baseline * p.factor)
    const excess = fixed?.excess ?? Math.max(2500, round250(baseExcess * (2 - p.factor * 1.2)))
    return [
      {
        insurer_id: insurer.id,
        option_label: p.label,
        monthly_premium: monthly,
        excess,
        sum_insured: value,
        inclusions: p.coverage,
        exclusions: p.exclusions,
        conditions: conditionsFor(details),
        assumptions: assumptionsFor(details),
      },
    ]
  })
}
