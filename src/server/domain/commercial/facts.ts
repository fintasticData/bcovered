import type { ContactDetails } from '../../db/schema'
import type {
  ActivityKind,
  AssetClass,
  BusinessLocation,
  ContactPerson,
  ExistingCover,
  FieldSource,
  LossHistory,
  ValueBasis,
} from '../../db/commercialSchema'

/** What the Business Discovery Agent has heard so far. Everything here is a customer declaration. */
export interface BusinessFacts {
  industry_key?: string
  registered_name?: string
  trading_name?: string
  location_count?: number
  city?: string
  same_entity?: boolean
  single_policy?: boolean
  location_names?: string[]
  ownership?: 'owned' | 'leased' | 'mixed'
  annual_turnover?: number
  employee_count?: number
  equipment_value_per_location?: number
  stock_value_per_location?: number
  backup_power?: 'all' | 'partial' | 'none'
  backup_power_locations?: string[]
  fire_suppression?: boolean
  fire_notes?: string
  security?: string[]
  vehicle_count?: number
  vehicle_type?: string
  vehicle_location?: string
  seating_per_location?: number
  card_payments?: boolean
  online_orders?: boolean
  current_insurer?: string
  renewal_month?: string
  claims_last_5_years?: number
  claims_notes?: string
}

export interface ProfileDraft {
  registered_name: string
  trading_name: string | null
  registration_number: string | null
  vat_number: string | null
  industry_key: string
  activities_summary: string | null
  years_trading: number | null
  annual_turnover: number | null
  employee_count: number | null
  operating_regions: string[]
  primary_contact: ContactPerson | null
  existing_cover: ExistingCover | null
  loss_history: LossHistory | null
  field_sources: Record<string, FieldSource>
  missing_info: string[]
  legal_entities: Array<{ legal_name: string; registration_number: string | null; role: 'primary' | 'subsidiary' | 'property_owner' | 'other'; source: FieldSource }>
  locations: Array<Omit<BusinessLocation, 'id' | 'tenant_id' | 'business_profile_id' | 'legal_entity_id' | 'created_at' | 'updated_at'>>
  activities: Array<{ location_index: number | null; kind: ActivityKind; name: string; description: string | null; share_of_revenue: number | null; source: FieldSource }>
  assets: Array<{
    location_index: number | null
    asset_class: AssetClass
    description: string
    quantity: number
    declared_value: number | null
    value_basis: ValueBasis
    source: FieldSource
  }>
}

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  registered_name: 'Registered name',
  trading_name: 'Trading name',
  registration_number: 'Company registration number',
  vat_number: 'VAT number',
  industry_key: 'Industry',
  years_trading: 'Years trading',
  annual_turnover: 'Annual turnover',
  employee_count: 'Employees',
  operating_regions: 'Operating regions',
  existing_cover: 'Current insurance',
  loss_history: 'Claims history',
}

const PROVINCE: Record<string, string> = {
  johannesburg: 'Gauteng',
  pretoria: 'Gauteng',
  germiston: 'Gauteng',
  'cape town': 'Western Cape',
  stellenbosch: 'Western Cape',
  durban: 'KwaZulu-Natal',
  gqeberha: 'Eastern Cape',
  bloemfontein: 'Free State',
}
export const provinceOf = (city?: string | null) => (city ? (PROVINCE[city.toLowerCase()] ?? null) : null)

export const FOOD_SERVICE = ['restaurants_hospitality', 'tourism']
const PUBLIC_FACING = ['restaurants_hospitality', 'retail', 'tourism', 'education', 'healthcare_practices']

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const countWord = (n: number) => words[n] ?? String(n)

function occupancyFor(industry: string): string {
  if (industry === 'restaurants_hospitality') return 'Restaurant with commercial kitchen'
  if (industry === 'retail') return 'Retail shop'
  if (industry === 'manufacturing') return 'Factory'
  if (industry === 'tourism') return 'Guest accommodation'
  return 'Business premises'
}

/** Turns discovery facts into a structured profile draft, marking where every value came from. */
export function factsToProfileDraft(facts: BusinessFacts, contact: ContactDetails, industryName: string): ProfileDraft {
  const industry = facts.industry_key ?? 'professional_services'
  const registered = facts.registered_name ?? facts.trading_name ?? `${contact.full_name ?? 'Unnamed'} business`
  const count = Math.max(1, facts.location_count ?? facts.location_names?.length ?? 1)
  const names = [...(facts.location_names ?? [])]
  while (names.length < count) names.push(`Site ${names.length + 1}`)
  const kitchen = industry === 'restaurants_hospitality'
  const province = provinceOf(facts.city)

  const backupFor = (name: string): boolean | null => {
    if (!facts.backup_power) return null
    if (facts.backup_power === 'all') return true
    if (facts.backup_power === 'none') return false
    return (facts.backup_power_locations ?? []).some((l) => l.toLowerCase() === name.toLowerCase())
  }

  const locations: ProfileDraft['locations'] = names.slice(0, count).map((name) => ({
    name: `${name} ${kitchen ? 'restaurant' : 'site'}`,
    suburb: name.startsWith('Site ') ? null : name,
    city: facts.city ?? null,
    province,
    occupancy: occupancyFor(industry),
    ownership: facts.ownership === 'owned' ? 'owned' : facts.ownership === 'leased' ? 'leased' : 'unknown',
    construction: null,
    fire_protection: facts.fire_suppression
      ? [`${kitchen ? 'Kitchen fire suppression system' : 'Fire suppression'} (declared${facts.fire_notes ? `, ${facts.fire_notes}` : ''})`]
      : [],
    security: facts.security ?? [],
    backup_power: backupFor(name),
    public_access: PUBLIC_FACING.includes(industry) || Boolean(facts.seating_per_location),
    seating_capacity: facts.seating_per_location ?? null,
    source: 'declared',
  }))

  const activities: ProfileDraft['activities'] = []
  if (kitchen) {
    activities.push({ location_index: null, kind: 'operation', name: 'Commercial kitchen food preparation', description: null, share_of_revenue: null, source: 'inferred' })
    activities.push({ location_index: null, kind: 'operation', name: 'Sit-down dining', description: null, share_of_revenue: null, source: facts.seating_per_location ? 'declared' : 'inferred' })
  } else {
    activities.push({ location_index: null, kind: 'operation', name: `${industryName} operations`, description: null, share_of_revenue: null, source: 'inferred' })
  }
  if (facts.vehicle_count || facts.online_orders) {
    activities.push({ location_index: null, kind: 'operation', name: 'Delivery and online orders', description: null, share_of_revenue: null, source: 'declared' })
  }
  locations.forEach((l, i) =>
    activities.push({
      location_index: i,
      kind: 'revenue_stream',
      name: `${l.suburb ?? l.name} ${kitchen ? 'dine-in' : 'site'} revenue`,
      description: count > 1 ? 'Equal split across sites assumed until branch figures are provided' : null,
      share_of_revenue: Math.round((1 / count) * 1000) / 1000,
      source: count > 1 ? 'inferred' : 'declared',
    }),
  )
  if (facts.online_orders) {
    activities.push({ location_index: null, kind: 'revenue_stream', name: 'Online and delivery orders', description: null, share_of_revenue: null, source: 'declared' })
  }
  if (kitchen || facts.stock_value_per_location) {
    activities.push({ location_index: null, kind: 'supplier_dependency', name: kitchen ? 'Perishable food suppliers' : 'Key stock suppliers', description: null, share_of_revenue: null, source: 'inferred' })
  }
  if (facts.backup_power && facts.backup_power !== 'all') {
    activities.push({ location_index: null, kind: 'supplier_dependency', name: 'Municipal electricity supply', description: 'Refrigeration depends on grid power where no backup is installed', share_of_revenue: null, source: 'inferred' })
  }
  if (facts.card_payments || facts.online_orders) {
    activities.push({ location_index: null, kind: 'supplier_dependency', name: 'Card payment and online ordering platforms', description: null, share_of_revenue: null, source: 'inferred' })
  }

  const assets: ProfileDraft['assets'] = []
  locations.forEach((_, i) => {
    if (facts.equipment_value_per_location !== undefined) {
      assets.push({
        location_index: i,
        asset_class: 'machinery',
        description: kitchen ? 'Kitchen and refrigeration equipment' : 'Equipment and machinery',
        quantity: 1,
        declared_value: facts.equipment_value_per_location,
        value_basis: 'replacement',
        source: 'declared',
      })
    }
    if (facts.stock_value_per_location !== undefined) {
      assets.push({
        location_index: i,
        asset_class: 'stock',
        description: kitchen ? 'Perishable stock (cold rooms)' : 'Stock',
        quantity: 1,
        declared_value: facts.stock_value_per_location,
        value_basis: 'unknown',
        source: 'declared',
      })
    }
  })
  if (facts.vehicle_count) {
    const at = facts.vehicle_location ? names.findIndex((n) => n.toLowerCase() === facts.vehicle_location!.toLowerCase()) : -1
    assets.push({
      location_index: at >= 0 ? at : null,
      asset_class: 'vehicle',
      description: `Delivery ${facts.vehicle_type ?? 'vehicle'}${facts.vehicle_count > 1 ? 's' : ''}`,
      quantity: facts.vehicle_count,
      declared_value: null,
      value_basis: 'unknown',
      source: 'declared',
    })
  }
  if (facts.card_payments) {
    assets.push({ location_index: null, asset_class: 'electronic_equipment', description: 'POS terminals and card machines (all sites)', quantity: count, declared_value: null, value_basis: 'unknown', source: 'inferred' })
  }

  const sources: Record<string, FieldSource> = {
    registered_name: facts.registered_name ? 'declared' : 'inferred',
    trading_name: facts.trading_name ? 'declared' : 'missing',
    registration_number: 'missing',
    vat_number: 'missing',
    industry_key: 'inferred',
    years_trading: 'missing',
    annual_turnover: facts.annual_turnover !== undefined ? 'declared' : 'missing',
    employee_count: facts.employee_count !== undefined ? 'declared' : 'missing',
    operating_regions: facts.city ? 'inferred' : 'missing',
    existing_cover: facts.current_insurer !== undefined ? 'declared' : 'missing',
    loss_history: facts.claims_last_5_years !== undefined ? 'declared' : 'missing',
  }
  const missing = Object.entries(sources)
    .filter(([k, s]) => s === 'missing' && k !== 'trading_name')
    .map(([k]) => PROFILE_FIELD_LABELS[k])
  if (facts.same_entity === false) missing.push('Names of the other legal entities')
  if (facts.ownership === 'mixed') missing.push('Which premises are owned and which are leased')

  return {
    registered_name: registered,
    trading_name: facts.trading_name ?? null,
    registration_number: null,
    vat_number: null,
    industry_key: industry,
    activities_summary: `${countWord(count).replace(/^\w/, (c) => c.toUpperCase())} ${kitchen ? (count > 1 ? 'restaurants' : 'restaurant') : count > 1 ? 'sites' : 'site'}${facts.city ? ` in ${facts.city}` : ''}${kitchen ? ' with commercial kitchens' : ''}${facts.online_orders || facts.vehicle_count ? ', dine-in and delivery' : ''}.`,
    years_trading: null,
    annual_turnover: facts.annual_turnover ?? null,
    employee_count: facts.employee_count ?? null,
    operating_regions: province ? [province] : [],
    primary_contact: contact.full_name ? { name: contact.full_name, email: contact.email ?? null, phone: contact.phone ?? null, role: null } : null,
    existing_cover: facts.current_insurer
      ? {
          insurer: facts.current_insurer,
          policy_count: facts.single_policy ? 1 : null,
          renewal_month: facts.renewal_month ?? null,
          notes: facts.single_policy ? 'Customer says one policy covers all sites' : null,
        }
      : null,
    loss_history: facts.claims_last_5_years !== undefined ? { claims_last_5_years: facts.claims_last_5_years, notes: facts.claims_notes ?? null } : null,
    field_sources: sources,
    missing_info: missing,
    legal_entities: [{ legal_name: registered, registration_number: null, role: 'primary', source: facts.registered_name ? 'declared' : 'inferred' }],
    locations,
    activities,
    assets,
  }
}
