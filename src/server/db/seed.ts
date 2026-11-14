import { INDUSTRY_TEMPLATES } from '../domain/commercial/industryTemplates'
import { benefitsSeed, BX } from './benefitsSeed'
import type { CommercialTables } from './commercialSchema'
import { onboardingSeed } from './onboardingSeed'
import type { Customer, CustomerConsent, Lead, Tables } from './schema'

export const TENANT_ID = 'a0000000-0000-4000-8000-000000000001'

export const SEED_IDS = {
  insurers: {
    protea: 'a0000000-0000-4000-8000-000000000101',
    karoo: 'a0000000-0000-4000-8000-000000000102',
    baobab: 'a0000000-0000-4000-8000-000000000103',
  },
  users: {
    broker: 'a0000000-0000-4000-8000-000000000201',
    manager: 'a0000000-0000-4000-8000-000000000202',
    johan: 'a0000000-0000-4000-8000-000000000203',
    ayanda: 'a0000000-0000-4000-8000-000000000204',
  },
  customers: {
    johan: 'a0000000-0000-4000-8000-000000000301',
    ayanda: 'a0000000-0000-4000-8000-000000000302',
    priya: 'a0000000-0000-4000-8000-000000000303',
    lindiwe: 'a0000000-0000-4000-8000-000000000304',
    ubuntu: 'a0000000-0000-4000-8000-000000000305',
  },
  business: {
    ubuntu: 'a0000000-0000-4000-8000-000000000601',
    ubuntuEntity: 'a0000000-0000-4000-8000-000000000602',
    ubuntuFactory: 'a0000000-0000-4000-8000-000000000603',
  },
  leads: {
    johan: 'a0000000-0000-4000-8000-000000000401',
    ayanda: 'a0000000-0000-4000-8000-000000000402',
    priya: 'a0000000-0000-4000-8000-000000000403',
    lindiwe: 'a0000000-0000-4000-8000-000000000404',
  },
} as const

const daysAgo = (base: number, d: number) => new Date(base - d * 86_400_000).toISOString()

/** Reproducible synthetic fixtures. Every person and company here is fictional. */
export function seedTables(now = Date.now()): Tables {
  const t = TENANT_ID
  const ts = daysAgo(now, 30)
  const C = SEED_IDS.customers
  const L = SEED_IDS.leads

  const customer = (
    id: string,
    full_name: string,
    email: string,
    phone: string,
    region: string,
    status: Customer['status'],
    customer_type: Customer['customer_type'] = 'personal',
    age = 20,
  ): Customer => ({
    id,
    tenant_id: t,
    customer_type,
    full_name,
    email,
    phone,
    region,
    status,
    is_synthetic: true,
    created_by: null,
    created_at: daysAgo(now, age),
    updated_at: daysAgo(now, age),
  })

  const consent = (customer_id: string, age: number): CustomerConsent => ({
    id: `${customer_id.slice(0, -3)}9${customer_id.slice(-2)}`,
    tenant_id: t,
    customer_id,
    purpose: 'processing',
    granted: true,
    source: 'web_form',
    notice_version: 'privacy-2026-01',
    captured_at: daysAgo(now, age),
    revoked_at: null,
  })

  const lead = (
    id: string,
    customer_id: string,
    product_category: string,
    status: Lead['status'],
    qualification: Lead['qualification'],
    missing_info: string[],
    age: number,
    line: Lead['line'] = 'personal',
    urgency: Lead['urgency'] = 'medium',
  ): Lead => ({
    id,
    tenant_id: t,
    customer_id,
    conversation_id: null,
    line,
    product_category,
    status,
    urgency,
    qualification,
    missing_info,
    source: 'web_form',
    created_by: null,
    created_at: daysAgo(now, age),
    updated_at: daysAgo(now, age),
  })

  const benefits = benefitsSeed(t, {
    johanCustomer: C.johan,
    ayandaCustomer: C.ayanda,
    brokerUser: SEED_IDS.users.broker,
    managerUser: SEED_IDS.users.manager,
  })

  const onboarding = onboardingSeed(now, {
    bcoveredTenant: t,
    bcoveredOwner: SEED_IDS.users.manager,
    bcoveredReps: [SEED_IDS.users.broker, BX.users.lerato],
    insurers: { ...SEED_IDS.insurers, fynbos: BX.providers.fynbos },
  })

  return {
    ...benefits.tables,
    ...onboarding.tables,
    policies: [...benefits.tables.policies, ...onboarding.policies],
    organisations: [
      {
        id: t,
        name: 'BCovered',
        slug: 'bcovered',
        fsp_number: null,
        fsp_verified: false,
        is_demo: true,
        kind: 'brokerage',
        legal_name: 'BCovered (Pty) Ltd (fictional)',
        trading_name: 'BCovered',
        registration_number: null,
        brokerage_type: 'independent',
        lifecycle_status: 'active',
        status_reason: null,
        activated_at: ts,
        suspended_at: null,
        retention_until: null,
        created_at: ts,
        updated_at: ts,
      },
      ...onboarding.organisations,
    ],
    insurers: [
      { id: SEED_IDS.insurers.protea, name: 'Protea Insure', provider_type: 'insurer', is_fictional: true, created_at: ts },
      { id: SEED_IDS.insurers.karoo, name: 'Karoo Mutual', provider_type: 'insurer', is_fictional: true, created_at: ts },
      { id: SEED_IDS.insurers.baobab, name: 'Baobab General', provider_type: 'insurer', is_fictional: true, created_at: ts },
      ...benefits.insurers,
    ],
    app_users: [
      {
        id: SEED_IDS.users.broker,
        tenant_id: t,
        email: 'thabo.nkosi@bcovered.demo',
        full_name: 'Thabo Nkosi',
        role: 'broker',
        customer_id: null,
        created_at: ts,
        updated_at: ts,
      },
      {
        id: SEED_IDS.users.manager,
        tenant_id: t,
        email: 'naledi.mokoena@bcovered.demo',
        full_name: 'Naledi Mokoena',
        role: 'manager',
        customer_id: null,
        created_at: ts,
        updated_at: ts,
      },
      {
        id: SEED_IDS.users.johan,
        tenant_id: t,
        email: 'johan.vdmerwe@example.demo',
        full_name: 'Johan van der Merwe',
        role: 'customer',
        customer_id: C.johan,
        created_at: ts,
        updated_at: ts,
      },
      {
        id: SEED_IDS.users.ayanda,
        tenant_id: t,
        email: 'ayanda.khumalo@example.demo',
        full_name: 'Ayanda Khumalo',
        role: 'customer',
        customer_id: C.ayanda,
        created_at: ts,
        updated_at: ts,
      },
      ...benefits.app_users,
      ...onboarding.app_users,
    ],
    customers: [
      customer(C.johan, 'Johan van der Merwe', 'johan.vdmerwe@example.demo', '0825550101', 'Western Cape', 'active', 'personal', 28),
      customer(C.ayanda, 'Ayanda Khumalo', 'ayanda.khumalo@example.demo', '0735550188', 'Gauteng', 'prospect', 'personal', 6),
      customer(C.priya, "Priya's Spice Café (Priya Naidoo)", 'priya@spicecafe.example.demo', '0315550123', 'KwaZulu-Natal', 'prospect', 'commercial', 3),
      customer(C.lindiwe, 'Lindiwe Mthembu', 'lindiwe.m@example.demo', '0615550177', 'Gauteng', 'prospect', 'personal', 1),
      customer(C.ubuntu, 'Ubuntu Foods (Pty) Ltd', 'sipho.ndlovu@ubuntufoods.example.demo', '0115550160', 'Gauteng', 'active', 'commercial', 40),
      ...benefits.customers,
      ...onboarding.customers,
    ],
    customer_consents: [consent(C.johan, 28), consent(C.ayanda, 6), consent(C.priya, 3), consent(C.lindiwe, 1), consent(C.ubuntu, 40), ...benefits.customer_consents],
    conversations: [],
    conversation_messages: [],
    leads: [
      lead(
        L.johan,
        C.johan,
        'motor',
        'won',
        {
          vehicle: { make: 'Ford', model: 'Ranger', year: 2021, value: 465000, usage: 'private', cover_type: 'comprehensive' },
          summary: 'Existing client. Motor cover placed after last review.',
        },
        [],
        28,
      ),
      lead(
        L.ayanda,
        C.ayanda,
        'motor',
        'qualified',
        {
          vehicle: {
            make: 'Volkswagen',
            model: 'Polo',
            year: 2019,
            value: 185000,
            condition: 'used',
            usage: 'private',
            parking: 'secure_complex',
            tracker: false,
            driver_age: 27,
            licence_years: 6,
            claims_last_3_years: 0,
            cover_type: 'comprehensive',
          },
          summary: 'Web form enquiry. Wants comprehensive cover on a used 2019 Polo. No comparison prepared yet.',
        },
        [],
        6,
      ),
      lead(
        L.priya,
        C.priya,
        'business_property',
        'new',
        { summary: 'Small restaurant in Durban asking about business property and liability cover.' },
        ['Annual turnover', 'Sum insured for equipment and stock', 'Fire suppression in kitchen'],
        3,
        'commercial',
        'high',
      ),
      lead(
        L.lindiwe,
        C.lindiwe,
        'household_contents',
        'qualifying',
        { summary: 'First-time renter wanting contents cover for a Johannesburg apartment.' },
        ['Estimated contents value', 'Security features'],
        1,
        'personal',
        'low',
      ),
      ...onboarding.leads,
    ],
    quotes: [],
    quote_options: [],
    jobs: [],
    job_steps: [],
    agent_runs: [],
    agent_tool_calls: [],
    approval_requests: [],
    communications: [],
    route_runs: [],
    route_action_results: [],
    ...commercialSeed(now),
    audit_events: [
      {
        id: 'a0000000-0000-4000-8000-000000000501',
        tenant_id: t,
        actor_type: 'system',
        actor_id: 'demo_seed',
        action: 'demo.seeded',
        entity_table: 'organisations',
        entity_id: t,
        before: null,
        after: { note: 'Synthetic BCovered demo data loaded' },
        job_id: null,
        created_at: ts,
      },
      ...onboarding.audit_events,
    ],
  }
}

/** Industry templates plus Ubuntu Foods, an existing fictional food manufacturer with a partial profile and no Risk Twin yet. */
function commercialSeed(now: number): CommercialTables {
  const t = TENANT_ID
  const ts = daysAgo(now, 40)
  const B = SEED_IDS.business
  const id = (n: number) => `a0000000-0000-4000-8000-000000000${String(n).padStart(3, '0')}`
  const base = { tenant_id: t, business_profile_id: B.ubuntu, created_at: ts }

  return {
    industry_risk_templates: INDUSTRY_TEMPLATES.map((tpl, i) => ({ ...tpl, id: id(701 + i), tenant_id: t, is_active: true, created_at: ts, updated_at: ts })),
    business_profiles: [
      {
        id: B.ubuntu,
        tenant_id: t,
        customer_id: SEED_IDS.customers.ubuntu,
        registered_name: 'Ubuntu Foods (Pty) Ltd',
        trading_name: 'Ubuntu Foods',
        registration_number: '2015/123456/07',
        vat_number: '4123456789',
        industry_key: 'manufacturing',
        activities_summary: 'Frozen ready-meal manufacturer supplying national retail chains from one factory in Germiston.',
        years_trading: 11,
        annual_turnover: 96_000_000,
        employee_count: 140,
        operating_regions: ['Gauteng'],
        primary_contact: { name: 'Sipho Ndlovu', email: 'sipho.ndlovu@ubuntufoods.example.demo', phone: '0115550160', role: 'Financial director' },
        existing_cover: { insurer: 'Karoo Mutual', policy_count: 2, renewal_month: 'January', notes: 'Commercial package plus a separate fleet policy' },
        loss_history: { claims_last_5_years: 2, notes: 'Blast freezer breakdown (2023); hijacking of one delivery truck (2025)' },
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
        missing_info: [],
        status: 'active',
        assigned_broker_id: SEED_IDS.users.broker,
        is_synthetic: true,
        created_by: null,
        created_at: ts,
        updated_at: ts,
      },
    ],
    business_legal_entities: [
      { ...base, id: B.ubuntuEntity, legal_name: 'Ubuntu Foods (Pty) Ltd', registration_number: '2015/123456/07', role: 'primary', source: 'verified' },
    ],
    business_locations: [
      {
        ...base,
        id: B.ubuntuFactory,
        legal_entity_id: B.ubuntuEntity,
        name: 'Germiston factory',
        suburb: 'Germiston',
        city: 'Germiston',
        province: 'Gauteng',
        occupancy: 'Food manufacturing factory and cold store',
        ownership: 'owned',
        construction: 'Brick walls, steel portal frame, IBR sheet roof',
        fire_protection: ['Sprinklers in the warehouse (declared)', 'Hand-held extinguishers'],
        security: ['24/7 guarding', 'CCTV', 'Alarm'],
        backup_power: true,
        public_access: false,
        seating_capacity: null,
        source: 'declared',
        updated_at: ts,
      },
    ],
    business_activities: [
      { ...base, id: id(611), location_id: B.ubuntuFactory, kind: 'operation', name: 'Ready-meal production line', description: null, share_of_revenue: null, source: 'declared' },
      { ...base, id: id(612), location_id: B.ubuntuFactory, kind: 'operation', name: 'Cold storage and dispatch', description: null, share_of_revenue: null, source: 'declared' },
      { ...base, id: id(613), location_id: B.ubuntuFactory, kind: 'revenue_stream', name: 'Retail chain supply contracts', description: null, share_of_revenue: 0.7, source: 'declared' },
      { ...base, id: id(614), location_id: B.ubuntuFactory, kind: 'revenue_stream', name: 'Independent stores and online', description: null, share_of_revenue: 0.3, source: 'declared' },
      { ...base, id: id(615), location_id: null, kind: 'customer_dependency', name: 'Two national retail chains', description: null, share_of_revenue: 0.7, source: 'declared' },
      { ...base, id: id(616), location_id: null, kind: 'supplier_dependency', name: 'Packaging supplier (single source)', description: null, share_of_revenue: null, source: 'declared' },
    ],
    commercial_assets: [
      { ...base, id: id(621), location_id: B.ubuntuFactory, asset_class: 'buildings', description: 'Factory buildings', quantity: 1, declared_value: 18_500_000, value_basis: 'replacement', valuation_date: daysAgo(now, 520), source: 'verified', updated_at: ts },
      { ...base, id: id(622), location_id: B.ubuntuFactory, asset_class: 'machinery', description: 'Production line machinery', quantity: 1, declared_value: 6_800_000, value_basis: 'book', valuation_date: null, source: 'declared', updated_at: ts },
      { ...base, id: id(623), location_id: B.ubuntuFactory, asset_class: 'machinery', description: 'Blast freezers and cold rooms', quantity: 1, declared_value: 2_100_000, value_basis: 'replacement', valuation_date: null, source: 'declared', updated_at: ts },
      { ...base, id: id(624), location_id: B.ubuntuFactory, asset_class: 'stock', description: 'Raw materials and frozen finished meals', quantity: 1, declared_value: 1_400_000, value_basis: 'unknown', valuation_date: null, source: 'declared', updated_at: ts },
      { ...base, id: id(625), location_id: B.ubuntuFactory, asset_class: 'vehicle', description: 'Refrigerated delivery trucks', quantity: 4, declared_value: 3_200_000, value_basis: 'market', valuation_date: null, source: 'declared', updated_at: ts },
    ],
    business_risk_profiles: [],
    risk_dependencies: [],
    risk_exposures: [],
    risk_assessments: [],
    risk_assessment_findings: [],
    business_dependency_links: (
      [
        ['commercial_assets', 623, 'business_activities', 612, 'supports', 'Blast freezing and cold rooms hold every finished meal before dispatch'],
        ['commercial_assets', 623, 'commercial_assets', 624, 'stores', 'Frozen finished meals are held in the cold rooms'],
        ['commercial_assets', 622, 'business_activities', 611, 'supports', null],
        ['business_activities', 616, 'business_activities', 611, 'supplies', 'Single packaging supplier'],
        ['business_activities', 611, 'business_activities', 612, 'feeds', null],
        ['commercial_assets', 625, 'business_activities', 612, 'supports', 'Refrigerated trucks deliver to retail distribution centres'],
        ['business_activities', 612, 'business_activities', 613, 'feeds', null],
        ['business_activities', 612, 'business_activities', 614, 'feeds', null],
        ['business_activities', 613, 'business_activities', 615, 'serves', null],
      ] as const
    ).map(([fromTable, from, toTable, to, relation, note], i) => ({
      ...base,
      id: id(631 + i),
      from_table: fromTable,
      from_id: id(from),
      to_table: toTable,
      to_id: id(to),
      relation,
      note,
      source: 'declared' as const,
      status: 'active' as const,
      confirmed_by: null,
      updated_at: ts,
    })),
    business_documents: [],
    insurance_policies: [],
    policy_sections: [],
    coverage_findings: [],
    twin_update_proposals: [],
    risk_twin_change_events: [],
    commercial_submissions: [],
    submission_sections: [],
    tasks: [],
  }
}
