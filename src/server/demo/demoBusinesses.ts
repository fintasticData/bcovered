import type { ActivityKind, AssetClass, BusinessLocation, BusinessProfile, FieldSource, ValueBasis } from '../db/commercialSchema'
import { SEED_IDS } from '../db/seed'
import { db, type Repo } from '../db/store'

const id = (n: number) => `a0000000-0000-4000-8000-000000000${String(n).padStart(3, '0')}`

interface DemoBusiness {
  customer_id: string
  profile_id: string
  entity_id: string
  email: string
  phone: string
  region: string
  profile: Omit<BusinessProfile, 'id' | 'tenant_id' | 'customer_id' | 'status' | 'assigned_broker_id' | 'is_synthetic' | 'created_by' | 'created_at' | 'updated_at' | 'missing_info'>
  locations: Array<Omit<BusinessLocation, 'tenant_id' | 'business_profile_id' | 'legal_entity_id' | 'created_at' | 'updated_at'>>
  activities: Array<{ id: string; location: number | null; kind: ActivityKind; name: string; share_of_revenue: number | null; source: FieldSource }>
  assets: Array<{ id: string; location: number | null; asset_class: AssetClass; description: string; quantity: number; declared_value: number | null; value_basis: ValueBasis; source: FieldSource }>
}

const site = (
  locId: string,
  name: string,
  suburb: string,
  city: string,
  province: string,
  occupancy: string,
  extra: Partial<BusinessLocation> = {},
): DemoBusiness['locations'][number] => ({
  id: locId,
  name,
  suburb,
  city,
  province,
  occupancy,
  ownership: 'leased',
  construction: null,
  fire_protection: [],
  security: [],
  backup_power: null,
  public_access: false,
  seating_capacity: null,
  source: 'declared',
  ...extra,
})

/** Synthetic demo businesses with fixed IDs, so loading them is repeatable. Every company and person is fictional. */
export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    customer_id: id(801),
    profile_id: id(811),
    entity_id: id(812),
    email: 'operations@thalihouse.example.demo',
    phone: '0215550171',
    region: 'Western Cape',
    profile: {
      registered_name: 'Thali House Restaurants (Pty) Ltd',
      trading_name: 'Thali House',
      registration_number: '2018/402311/07',
      vat_number: null,
      industry_key: 'restaurants_hospitality',
      activities_summary: 'Two Indian restaurants in Cape Town with dine-in, takeaway and online delivery.',
      years_trading: 7,
      annual_turnover: 14_500_000,
      employee_count: 46,
      operating_regions: ['Western Cape'],
      primary_contact: { name: 'Anil Pillay', email: 'operations@thalihouse.example.demo', phone: '0215550171', role: 'Managing director' },
      existing_cover: { insurer: 'Protea Insure', policy_count: 1, renewal_month: 'July', notes: 'One commercial package for both sites' },
      loss_history: { claims_last_5_years: 1, notes: 'Extraction fire at Woodstock (2024), contained by suppression system' },
      field_sources: {
        registered_name: 'verified',
        trading_name: 'declared',
        registration_number: 'verified',
        industry_key: 'declared',
        years_trading: 'declared',
        annual_turnover: 'declared',
        employee_count: 'declared',
        operating_regions: 'declared',
        existing_cover: 'declared',
        loss_history: 'declared',
      },
    },
    locations: [
      site(id(813), 'Woodstock restaurant', 'Woodstock', 'Cape Town', 'Western Cape', 'Restaurant with commercial kitchen', {
        fire_protection: ['Wet-chemical suppression over cooking line', 'Hand-held extinguishers'],
        security: ['Alarm with armed response', 'CCTV'],
        backup_power: true,
        public_access: true,
        seating_capacity: 80,
      }),
      site(id(814), 'Claremont restaurant', 'Claremont', 'Cape Town', 'Western Cape', 'Restaurant with commercial kitchen', {
        fire_protection: ['Hand-held extinguishers'],
        security: ['Alarm with armed response'],
        backup_power: false,
        public_access: true,
        seating_capacity: 60,
      }),
    ],
    activities: [
      { id: id(815), location: 0, kind: 'operation', name: 'Commercial kitchen food preparation', share_of_revenue: null, source: 'declared' },
      { id: id(816), location: null, kind: 'revenue_stream', name: 'Dine-in', share_of_revenue: 0.65, source: 'declared' },
      { id: id(817), location: null, kind: 'revenue_stream', name: 'Takeaway and delivery apps', share_of_revenue: 0.35, source: 'declared' },
      { id: id(818), location: null, kind: 'supplier_dependency', name: 'Spice and produce wholesaler (single source)', share_of_revenue: null, source: 'declared' },
    ],
    assets: [
      { id: id(819), location: 0, asset_class: 'machinery', description: 'Kitchen equipment, extraction and cold room', quantity: 1, declared_value: 520_000, value_basis: 'replacement', source: 'declared' },
      { id: id(820), location: 1, asset_class: 'machinery', description: 'Kitchen equipment and refrigeration', quantity: 1, declared_value: 380_000, value_basis: 'unknown', source: 'declared' },
      { id: id(821), location: null, asset_class: 'stock', description: 'Perishable food stock across both sites', quantity: 1, declared_value: 90_000, value_basis: 'unknown', source: 'declared' },
      { id: id(822), location: null, asset_class: 'electronic_equipment', description: 'POS terminals and card machines', quantity: 6, declared_value: 75_000, value_basis: 'replacement', source: 'declared' },
    ],
  },
  {
    customer_id: id(831),
    profile_id: id(841),
    entity_id: id(842),
    email: 'fleet@swiftfreight.example.demo',
    phone: '0115550184',
    region: 'Gauteng',
    profile: {
      registered_name: 'Swift Freight Logistics (Pty) Ltd',
      trading_name: 'Swift Freight',
      registration_number: '2012/118844/07',
      vat_number: '4987654321',
      industry_key: 'transport_logistics',
      activities_summary: 'Road freight and warehousing for FMCG clients between Gauteng and KwaZulu-Natal.',
      years_trading: 13,
      annual_turnover: 62_000_000,
      employee_count: 85,
      operating_regions: ['Gauteng', 'KwaZulu-Natal'],
      primary_contact: { name: 'Lerato Molefe', email: 'fleet@swiftfreight.example.demo', phone: '0115550184', role: 'Operations director' },
      existing_cover: { insurer: 'Baobab General', policy_count: 2, renewal_month: 'October', notes: 'Fleet policy plus goods in transit' },
      loss_history: { claims_last_5_years: 3, notes: 'Two truck accidents on the N3 (2022, 2024); one hijacking with cargo loss (2025)' },
      field_sources: {
        registered_name: 'verified',
        trading_name: 'declared',
        registration_number: 'verified',
        vat_number: 'verified',
        industry_key: 'declared',
        years_trading: 'declared',
        annual_turnover: 'declared',
        employee_count: 'declared',
        operating_regions: 'declared',
        existing_cover: 'declared',
        loss_history: 'declared',
      },
    },
    locations: [
      site(id(843), 'Isando depot and warehouse', 'Isando', 'Kempton Park', 'Gauteng', 'Freight depot and bonded warehouse', {
        ownership: 'leased',
        construction: 'Steel portal frame, concrete floor, IBR roof',
        fire_protection: ['Hand-held extinguishers', 'Hose reels'],
        security: ['24/7 guarding', 'CCTV', 'Electric fence'],
        backup_power: true,
      }),
    ],
    activities: [
      { id: id(844), location: 0, kind: 'operation', name: 'Fleet operations', share_of_revenue: null, source: 'declared' },
      { id: id(845), location: 0, kind: 'operation', name: 'Warehousing', share_of_revenue: null, source: 'declared' },
      { id: id(846), location: null, kind: 'revenue_stream', name: 'Line-haul freight Gauteng to Durban', share_of_revenue: 0.6, source: 'declared' },
      { id: id(847), location: 0, kind: 'revenue_stream', name: 'Warehousing and distribution', share_of_revenue: 0.4, source: 'declared' },
      { id: id(848), location: null, kind: 'customer_dependency', name: 'Largest FMCG client', share_of_revenue: 0.55, source: 'declared' },
    ],
    assets: [
      { id: id(849), location: null, asset_class: 'vehicle', description: 'Truck tractors and trailers', quantity: 14, declared_value: 21_000_000, value_basis: 'market', source: 'declared' },
      { id: id(850), location: 0, asset_class: 'contents', description: 'Warehouse racking and forklifts', quantity: 1, declared_value: 2_400_000, value_basis: 'book', source: 'declared' },
      { id: id(851), location: 0, asset_class: 'electronic_equipment', description: 'Telematics and warehouse management system', quantity: 1, declared_value: 650_000, value_basis: 'replacement', source: 'declared' },
    ],
  },
  {
    customer_id: id(861),
    profile_id: id(871),
    entity_id: id(872),
    email: 'practice@mokoenapartners.example.demo',
    phone: '0125550136',
    region: 'Gauteng',
    profile: {
      registered_name: 'Mokoena & Partners Inc.',
      trading_name: 'Mokoena & Partners',
      registration_number: '2009/076512/21',
      vat_number: null,
      industry_key: 'professional_services',
      activities_summary: 'Commercial law firm advising mid-sized companies, with client trust accounts.',
      years_trading: 16,
      annual_turnover: 28_000_000,
      employee_count: 32,
      operating_regions: ['Gauteng'],
      primary_contact: { name: 'Kagiso Mokoena', email: 'practice@mokoenapartners.example.demo', phone: '0125550136', role: 'Managing partner' },
      existing_cover: null,
      loss_history: { claims_last_5_years: 0, notes: null },
      field_sources: {
        registered_name: 'verified',
        trading_name: 'declared',
        registration_number: 'verified',
        industry_key: 'declared',
        years_trading: 'declared',
        annual_turnover: 'declared',
        employee_count: 'declared',
        operating_regions: 'declared',
        loss_history: 'declared',
      },
    },
    locations: [
      site(id(873), 'Menlyn office', 'Menlyn', 'Pretoria', 'Gauteng', 'Professional offices', {
        security: ['Building access control', 'Alarm'],
        backup_power: true,
      }),
    ],
    activities: [
      { id: id(874), location: 0, kind: 'operation', name: 'Client advisory work', share_of_revenue: null, source: 'declared' },
      { id: id(875), location: null, kind: 'revenue_stream', name: 'Commercial and corporate advisory', share_of_revenue: 0.8, source: 'declared' },
      { id: id(876), location: null, kind: 'revenue_stream', name: 'Litigation', share_of_revenue: 0.2, source: 'declared' },
    ],
    assets: [
      { id: id(877), location: 0, asset_class: 'contents', description: 'Office furniture and fittings', quantity: 1, declared_value: 850_000, value_basis: 'unknown', source: 'declared' },
      { id: id(878), location: 0, asset_class: 'electronic_equipment', description: 'Laptops, servers and document management system', quantity: 1, declared_value: 1_200_000, value_basis: 'replacement', source: 'declared' },
    ],
  },
]

/** Inserts any demo business whose fixed IDs are missing. Running it again changes nothing. */
export function insertDemoBusinesses(repo: Repo): { inserted: number; profile_ids: string[] } {
  let inserted = 0
  db.transaction(() => DEMO_BUSINESSES.forEach((b) => {
    if (repo.get('business_profiles', b.profile_id)) return
    inserted++
    if (!repo.get('customers', b.customer_id)) {
      repo.insert('customers', {
        id: b.customer_id,
        customer_type: 'commercial',
        full_name: b.profile.registered_name,
        email: b.email,
        phone: b.phone,
        region: b.region,
        status: 'active',
        is_synthetic: true,
        created_by: null,
      })
      repo.insert('customer_consents', {
        customer_id: b.customer_id,
        purpose: 'processing',
        granted: true,
        source: 'web_form',
        notice_version: 'privacy-2026-01',
        captured_at: new Date().toISOString(),
        revoked_at: null,
      })
    }
    const base = { business_profile_id: b.profile_id }
    repo.insert('business_profiles', {
      ...b.profile,
      id: b.profile_id,
      customer_id: b.customer_id,
      missing_info: [],
      status: 'active',
      assigned_broker_id: SEED_IDS.users.broker,
      is_synthetic: true,
      created_by: null,
    })
    repo.insert('business_legal_entities', {
      ...base,
      id: b.entity_id,
      legal_name: b.profile.registered_name,
      registration_number: b.profile.registration_number,
      role: 'primary',
      source: 'verified',
    })
    const locIds = b.locations.map((l) => repo.insert('business_locations', { ...l, ...base, legal_entity_id: b.entity_id }).id)
    const at = (i: number | null) => (i === null ? null : locIds[i])
    b.activities.forEach(({ location, ...a }) => repo.insert('business_activities', { ...a, ...base, location_id: at(location), description: null }))
    b.assets.forEach(({ location, ...a }) => repo.insert('commercial_assets', { ...a, ...base, location_id: at(location), valuation_date: null }))
  }))
  return { inserted, profile_ids: DEMO_BUSINESSES.map((b) => b.profile_id) }
}
