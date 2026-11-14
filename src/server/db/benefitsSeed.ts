// Synthetic fixtures for Life & Benefits, Controls, Funds & Investments and Specialist modules.
// Every person, employer, fund, provider and amount here is fictional. Amounts are labelled "reported" only in the sense
// that they stand in for third-party data in this demo.
import { ageOn, idLast4, idLookupHash, makeSaId } from '../domain/life/identity'
import type { BenefitsTables, SchemeRules } from './benefitsSchema'
import type { ControlsTables } from './controlsSchema'
import type { LifeTables, ProductRules } from './lifeSchema'
import type { AppUser, Customer, CustomerConsent, Insurer } from './schema'
import type { SpecialistTables } from './specialistSchema'

export const bid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const BX = {
  users: { lerato: bid(1), hrKaroo: bid(2), cellOwner: bid(3) },
  customers: { karoo: bid(11), dental: bid(12), thandeka: bid(13) },
  providers: { fynbos: bid(21), highveld: bid(22), kalahari: bid(23), marula: bid(24), aloe: bid(25), protea: bid(26) },
  products: { familyProtector: bid(101), lifeCarePlus: bid(102), funeralAssist: bid(103), groupRiskCore: bid(104), umbrellaProvident: bid(105) },
  versions: { familyProtector: bid(111), lifeCarePlus: bid(112), funeralAssist: bid(113), groupRiskCore: bid(114), umbrellaProvident: bid(115) },
  persons: { johan: bid(201), anika: bid(202), lize: bid(203), ayanda: bid(204) },
  policies: { johanExisting: bid(221) },
  schemes: { karooLife: bid(301), dentalLife: bid(302) },
  funds: { kalahari: bid(311), dentalFund: bid(312) },
  participations: { karoo: bid(313), dental: bid(314) },
  sources: { karooPayroll: bid(321), kalahariContrib: bid(322), kalahariHoldings: bid(323), marulaHoldings: bid(324), aloeCell: bid(325), dentalPayroll: bid(326) },
  recon: { payrollContrib: bid(331), holdings: bid(332), rollforward: bid(333), transfer: bid(334) },
  portfolio: bid(8001),
  transfer: bid(8301),
  cell: bid(9001),
} as const

export const DEMO_PERIOD = '2026-10-01'
const ts0 = '2026-10-08T08:00:00.000Z'

// ------------------------------------------------------------------ roster

export interface RosterEntry {
  employer: 'karoo' | 'dental'
  n: number
  first_names: string
  surname: string
  female: boolean
  dob: string
  id_number: string
  employee_number: string
  member_number: string
  category: 'general' | 'management'
  monthly_salary: number
  start_date: string
  person_id: string
  employment_id: string
  salary_id: string
  scheme_membership_id: string
  fund_membership_id: string
}

const FIRST_F = ['Thandiwe', 'Lerato', 'Ayesha', 'Marike', 'Nomvula', 'Precious', 'Fatima', 'Anele', 'Charlene', 'Zodwa', 'Elmarie', 'Palesa', 'Refilwe', 'Nadia', 'Busisiwe']
const FIRST_M = ['Sipho', 'Pieter', 'Thabo', 'Mohammed', 'Kagiso', 'Johannes', 'Lwazi', 'Ruan', 'Tshepo', 'Bongani', 'Riaan', 'Siyabonga', 'Imran', 'Mandla', 'Vusi']
const SURNAMES = ['Nkosi', 'Botha', 'Mokoena', 'Pillay', 'Dlamini', 'Van Wyk', 'Ndlovu', 'Naidoo', 'Khumalo', 'Jacobs', 'Mahlangu', 'Smit', 'Zulu', 'Govender', 'Mthembu', 'Pretorius', 'Molefe', 'Adams', 'Sithebe', 'Coetzee', 'Maseko', 'Daniels', 'Radebe', 'Fourie']

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function rosterEntry(employer: 'karoo' | 'dental', n: number): RosterEntry {
  const r = rng(n * 7919 + (employer === 'karoo' ? 17 : 911))
  const female = r() < 0.45
  const first = female ? FIRST_F[Math.floor(r() * FIRST_F.length)] : FIRST_M[Math.floor(r() * FIRST_M.length)]
  const surname = SURNAMES[Math.floor(r() * SURNAMES.length)]
  const dob = `${1966 + Math.floor(r() * 37)}-${pad2(1 + Math.floor(r() * 12))}-${pad2(1 + Math.floor(r() * 28))}`
  const management = employer === 'karoo' ? n % 12 === 0 : n <= 3
  const salary = management ? 55_000 + Math.floor((r() * 65_000) / 50) * 50 : 12_000 + Math.floor((r() * 26_000) / 50) * 50
  const start = `${2010 + Math.floor(r() * 16)}-${pad2(1 + Math.floor(r() * 12))}-01`
  const base = employer === 'karoo' ? 1000 : 7000
  return {
    employer,
    n,
    first_names: first,
    surname,
    female,
    dob,
    id_number: makeSaId(dob, n * 13 + (employer === 'karoo' ? 1 : 7), female),
    employee_number: `${employer === 'karoo' ? 'KL' : 'UD'}${String(n).padStart(4, '0')}`,
    member_number: employer === 'karoo' ? `KUP-${100000 + n}` : `UDP-${5000 + n}`,
    category: management ? 'management' : 'general',
    monthly_salary: salary,
    start_date: start > '2026-06-01' ? '2025-06-01' : start,
    person_id: bid(base + n),
    employment_id: bid(base + 100 * (employer === 'karoo' ? 10 : 1) + n),
    salary_id: bid(base + (employer === 'karoo' ? 2000 : 200) + n),
    scheme_membership_id: bid(base + (employer === 'karoo' ? 3000 : 300) + n),
    fund_membership_id: bid(base + (employer === 'karoo' ? 4000 : 400) + n),
  }
}

/** Karoo Logistics: 120 employees, all in the group life scheme and the Kalahari umbrella provident fund. */
export const karooRoster = (): RosterEntry[] => Array.from({ length: 120 }, (_, i) => rosterEntry('karoo', i + 1))
/** Umhlanga Dental Group: 15 employees in their own group life scheme and a standalone fund transferring under Section 14. */
export const dentalRoster = (): RosterEntry[] => Array.from({ length: 15 }, (_, i) => rosterEntry('dental', i + 1))
/** The October 2026 new joiner at Karoo Logistics: on the payroll, not yet on any register. */
export const karooJoiner = (): RosterEntry => ({ ...rosterEntry('karoo', 121), start_date: '2026-10-01' })

/** Deliberate October 2026 differences between the Karoo payroll and the administrator schedule. */
export const OCTOBER_SCENARIO = {
  salaryIncreases: [5, 17, 42],
  leaver: 37,
  duplicate: 63,
  idTypoOnAdminSchedule: 88,
  categoryChange: 99,
}

// ------------------------------------------------------------------ products

const FAMILY_PROTECTOR: ProductRules = {
  min_entry_age: 18,
  max_entry_age: 65,
  rates_per_1000: {
    life: [{ max_age: 30, rate: 1.1 }, { max_age: 40, rate: 1.6 }, { max_age: 50, rate: 3.2 }, { max_age: 60, rate: 7.4 }, { max_age: 70, rate: 12 }],
    disability_lump_sum: [{ max_age: 30, rate: 0.9 }, { max_age: 40, rate: 1.3 }, { max_age: 50, rate: 2.6 }, { max_age: 60, rate: 5.8 }, { max_age: 70, rate: 9.5 }],
    critical_illness: [{ max_age: 30, rate: 1.2 }, { max_age: 40, rate: 1.9 }, { max_age: 50, rate: 4.1 }, { max_age: 60, rate: 9 }, { max_age: 70, rate: 14 }],
  },
  smoker_loading_pct: 60,
  monthly_policy_fee: 15,
  underwriting: [
    { above_sum_assured: 0, requirement: 'Medical questionnaire' },
    { above_sum_assured: 1_500_000, requirement: 'Nurse screening and blood tests' },
    { above_sum_assured: 5_000_000, requirement: 'Full medical examination and financial underwriting' },
  ],
  documents: ['Certified copy of ID', 'Proof of income for cover above R3 million'],
}

const LIFECARE_PLUS: ProductRules = {
  min_entry_age: 18,
  max_entry_age: 60,
  rates_per_1000: {
    life: [{ max_age: 30, rate: 1.25 }, { max_age: 40, rate: 1.75 }, { max_age: 50, rate: 3 }, { max_age: 60, rate: 7 }, { max_age: 70, rate: 12.5 }],
    disability_lump_sum: [{ max_age: 30, rate: 1 }, { max_age: 40, rate: 1.4 }, { max_age: 50, rate: 2.4 }, { max_age: 60, rate: 5.5 }, { max_age: 70, rate: 9 }],
    income_protection: [{ max_age: 30, rate: 9 }, { max_age: 40, rate: 12 }, { max_age: 50, rate: 20 }, { max_age: 60, rate: 38 }, { max_age: 70, rate: 55 }],
  },
  smoker_loading_pct: 50,
  monthly_policy_fee: 12.5,
  underwriting: [
    { above_sum_assured: 0, requirement: 'Medical questionnaire' },
    { above_sum_assured: 1_000_000, requirement: 'Nurse screening and blood tests' },
    { above_sum_assured: 4_000_000, requirement: 'Full medical examination and financial underwriting' },
  ],
  documents: ['Certified copy of ID', 'Latest three payslips for income protection'],
}

const FUNERAL_ASSIST: ProductRules = {
  min_entry_age: 18,
  max_entry_age: 75,
  rates_per_1000: { funeral: [{ max_age: 30, rate: 6 }, { max_age: 40, rate: 7 }, { max_age: 50, rate: 9 }, { max_age: 60, rate: 14 }, { max_age: 80, rate: 22 }] },
  smoker_loading_pct: 0,
  monthly_policy_fee: 5,
  underwriting: [],
  documents: ['Certified copy of ID'],
}

const KAROO_SCHEME: SchemeRules = {
  salary_definition: 'pensionable',
  categories: { general: { multiple: 3 }, management: { multiple: 4 } },
  max_cover: 10_000_000,
  free_cover_limit: 3_000_000,
  eligibility_min_age: 18,
  eligibility_max_age: 65,
  waiting_period_months: 0,
  premium_rate_pct: 0.62,
  continuation_option: true,
}

const DENTAL_SCHEME: SchemeRules = { ...KAROO_SCHEME, categories: { general: { multiple: 2 }, management: { multiple: 3 } }, free_cover_limit: 2_000_000, premium_rate_pct: 0.71 }

const groupCover = (rules: SchemeRules, e: RosterEntry) => Math.min(rules.max_cover, rules.categories[e.category].multiple * e.monthly_salary * 12)

// ------------------------------------------------------------------ seed

export interface BenefitsSeedRefs {
  johanCustomer: string
  ayandaCustomer: string
  brokerUser: string
  managerUser: string
}

export interface BenefitsSeed {
  insurers: Insurer[]
  app_users: AppUser[]
  customers: Customer[]
  customer_consents: CustomerConsent[]
  tables: LifeTables & ControlsTables & BenefitsTables & SpecialistTables
}

const cents = (n: number) => Math.round(n * 100) / 100

export function benefitsSeed(t: string, refs: BenefitsSeedRefs): BenefitsSeed {
  const P = BX.persons
  const at = (d: string) => `${d}T08:00:00.000Z`
  const karoo = karooRoster()
  const dental = dentalRoster()

  const insurers: Insurer[] = [
    { id: BX.providers.fynbos, name: 'Fynbos Life', provider_type: 'insurer', is_fictional: true, created_at: ts0 },
    { id: BX.providers.highveld, name: 'Highveld Life Assurance', provider_type: 'insurer', is_fictional: true, created_at: ts0 },
    { id: BX.providers.kalahari, name: 'Kalahari Fund Administrators', provider_type: 'fund_administrator', is_fictional: true, created_at: ts0 },
    { id: BX.providers.marula, name: 'Marula Asset Managers', provider_type: 'investment_manager', is_fictional: true, created_at: ts0 },
    { id: BX.providers.aloe, name: 'Aloe Cell Insurers', provider_type: 'cell_captive_insurer', is_fictional: true, created_at: ts0 },
    { id: BX.providers.protea, name: 'Protea Benefit Administrators', provider_type: 'fund_administrator', is_fictional: true, created_at: ts0 },
  ]

  const user = (id: string, email: string, full_name: string, role: AppUser['role'], customer_id: string | null): AppUser => ({
    id,
    tenant_id: t,
    email,
    full_name,
    role,
    customer_id,
    created_at: ts0,
    updated_at: ts0,
  })
  const app_users = [
    user(BX.users.lerato, 'lerato.dube@bcovered.demo', 'Lerato Dube', 'broker', null),
    user(BX.users.hrKaroo, 'karabo.sithole@karoologistics.example.demo', 'Karabo Sithole', 'customer', BX.customers.karoo),
    user(BX.users.cellOwner, 'mpho.radebe@thandekamotor.example.demo', 'Mpho Radebe', 'customer', BX.customers.thandeka),
  ]

  const company = (id: string, full_name: string, email: string, phone: string, region: string): Customer => ({
    id,
    tenant_id: t,
    customer_type: 'commercial',
    full_name,
    email,
    phone,
    region,
    status: 'active',
    is_synthetic: true,
    created_by: null,
    created_at: ts0,
    updated_at: ts0,
  })
  const customers = [
    company(BX.customers.karoo, 'Karoo Logistics (Pty) Ltd', 'hr@karoologistics.example.demo', '0215550190', 'Western Cape'),
    company(BX.customers.dental, 'Umhlanga Dental Group', 'admin@umhlangadental.example.demo', '0315550111', 'KwaZulu-Natal'),
    company(BX.customers.thandeka, 'Thandeka Motor Club (Pty) Ltd', 'finance@thandekamotor.example.demo', '0115550133', 'Gauteng'),
  ]
  const customer_consents: CustomerConsent[] = customers.map((c, i) => ({
    id: bid(41 + i),
    tenant_id: t,
    customer_id: c.id,
    purpose: 'processing',
    granted: true,
    source: 'service_agreement',
    notice_version: 'privacy-2026-01',
    captured_at: ts0,
    revoked_at: null,
  }))

  // ---------------------------------------------------------------- life
  const johanId = makeSaId('1984-03-14', 412, false)
  const person = (id: string, first_names: string, surname: string, dob: string, female: boolean, idNumber: string | null) => ({
    id,
    tenant_id: t,
    first_names,
    surname,
    preferred_name: null,
    date_of_birth: dob,
    gender: (female ? 'female' : 'male') as 'female' | 'male',
    id_type: idNumber ? ('sa_id' as const) : null,
    id_lookup_hash: idNumber ? idLookupHash(idNumber) : null,
    id_last4: idNumber ? idLast4(idNumber) : null,
    date_of_death: null,
    is_synthetic: true,
    created_at: ts0,
    updated_at: ts0,
  })
  const employeePeople = [...karoo, ...dental].map((e) => person(e.person_id, e.first_names, e.surname, e.dob, e.female, e.id_number))

  const productRow = (id: string, provider_id: string, line: 'individual_life' | 'group_risk' | 'retirement', name: string, code: string, fais: 'lt_a' | 'lt_b1' | 'pension_fund_benefits') => ({
    id,
    provider_id,
    line,
    name,
    product_code: code,
    fais_category: fais,
    is_active: true,
    created_at: ts0,
    updated_at: ts0,
  })
  const versionRow = (id: string, product_id: string, rules: ProductRules, ref: string) => ({
    id,
    product_id,
    version: 1,
    effective_from: '2026-01-01',
    effective_to: null,
    rules,
    source: 'provider_document' as const,
    source_reference: ref,
    created_at: ts0,
  })
  const benefitRow = (n: number, version: string, key: string, kind: 'core' | 'rider', max: number | null, cease: number | null, waiting: number | null = null, exclusions: string[] = []) => ({
    id: bid(n),
    product_version_id: version,
    benefit_type_key: key,
    kind,
    min_cover: key === 'funeral' ? 5_000 : 100_000,
    max_cover: max,
    min_entry_age: 18,
    max_entry_age: key === 'funeral' ? 75 : 60,
    cease_age: cease,
    waiting_period_months: waiting,
    exclusions,
  })

  const benefit_types = (
    [
      ['life', 'individual_life', 'Life cover'],
      ['funeral', 'individual_life', 'Funeral cover'],
      ['disability_lump_sum', 'individual_life', 'Disability lump sum'],
      ['income_protection', 'individual_life', 'Income protection'],
      ['critical_illness', 'individual_life', 'Critical illness'],
      ['credit_life', 'individual_life', 'Credit life'],
      ['endowment', 'individual_life', 'Endowment'],
      ['retirement_annuity', 'retirement', 'Retirement annuity'],
      ['group_life', 'group_risk', 'Group life'],
      ['group_funeral', 'group_risk', 'Group funeral'],
      ['group_disability_lump_sum', 'group_risk', 'Group disability lump sum'],
      ['group_income_protection', 'group_risk', 'Group income protection'],
      ['spouse_life', 'group_risk', 'Spouse and dependant life'],
      ['group_critical_illness', 'group_risk', 'Group critical illness'],
    ] as const
  ).map(([key, line, label]) => ({ id: key, key, line, label }))

  const johanPolicy = BX.policies.johanExisting

  const life: LifeTables = {
    persons: [
      person(P.johan, 'Johan', 'van der Merwe', '1984-03-14', false, johanId),
      person(P.anika, 'Anika', 'van der Merwe', '1986-07-22', true, makeSaId('1986-07-22', 77, true)),
      person(P.lize, 'Lize', 'van der Merwe', '2015-02-10', true, null),
      person(P.ayanda, 'Ayanda', 'Khumalo', '1999-05-03', true, makeSaId('1999-05-03', 233, true)),
      ...employeePeople,
    ],
    customer_persons: [
      { id: bid(361), tenant_id: t, customer_id: refs.johanCustomer, person_id: P.johan, role: 'self', is_primary: true, effective_from: '2024-01-01', effective_to: null, created_at: ts0 },
      { id: bid(362), tenant_id: t, customer_id: refs.johanCustomer, person_id: P.anika, role: 'spouse', is_primary: false, effective_from: '2024-01-01', effective_to: null, created_at: ts0 },
      { id: bid(363), tenant_id: t, customer_id: refs.johanCustomer, person_id: P.lize, role: 'dependant', is_primary: false, effective_from: '2024-01-01', effective_to: null, created_at: ts0 },
      { id: bid(364), tenant_id: t, customer_id: refs.ayandaCustomer, person_id: P.ayanda, role: 'self', is_primary: true, effective_from: '2026-10-01', effective_to: null, created_at: ts0 },
    ],
    person_relationships: [
      { id: bid(371), tenant_id: t, person_id: P.johan, related_person_id: P.anika, relationship: 'spouse', is_financial_dependant: false, effective_from: '2012-04-01', effective_to: null, source: 'declared', created_at: ts0 },
      { id: bid(372), tenant_id: t, person_id: P.johan, related_person_id: P.lize, relationship: 'child', is_financial_dependant: true, effective_from: '2015-02-10', effective_to: null, source: 'declared', created_at: ts0 },
    ],
    financial_profiles: [
      {
        id: bid(381),
        tenant_id: t,
        person_id: P.johan,
        version: 1,
        status: 'current',
        occupation: 'Agricultural engineer',
        employment_status: 'employed',
        gross_monthly_income: 78_000,
        net_monthly_income: 54_000,
        monthly_obligations: 31_000,
        outstanding_debt: 1_850_000,
        objectives: ['Protect the family’s income if Johan dies or is disabled', 'Settle the home loan on death'],
        risk_profile: null,
        field_sources: { occupation: 'declared', gross_monthly_income: 'declared', net_monthly_income: 'declared', monthly_obligations: 'declared', outstanding_debt: 'declared' },
        captured_by: refs.brokerUser,
        job_id: null,
        created_at: ts0,
      },
    ],
    adviser_authorisations: [
      ...(['lt_a', 'lt_b1', 'lt_b1a', 'retail_pension', 'pension_fund_benefits', 'st_personal'] as const).map((c, i) => ({
        id: bid(351 + i),
        tenant_id: t,
        user_id: BX.users.lerato,
        fsp_rep_number: 'REP-DEMO-0042',
        product_category: c,
        status: 'active' as const,
        supervisor_id: null,
        effective_from: '2023-02-01',
        effective_to: null,
        verified_by: refs.managerUser,
        verified_at: ts0,
        created_at: ts0,
        updated_at: ts0,
      })),
      ...(['st_personal', 'st_commercial'] as const).map((c, i) => ({
        id: bid(358 + i),
        tenant_id: t,
        user_id: refs.brokerUser,
        fsp_rep_number: 'REP-DEMO-0017',
        product_category: c,
        status: 'active' as const,
        supervisor_id: null,
        effective_from: '2021-06-01',
        effective_to: null,
        verified_by: refs.managerUser,
        verified_at: ts0,
        created_at: ts0,
        updated_at: ts0,
      })),
      ...(['lt_a', 'lt_b1', 'lt_b1a', 'retail_pension', 'pension_fund_benefits', 'st_personal', 'st_commercial'] as const).map((c, i) => ({
        id: bid(361 + 100 + i),
        tenant_id: t,
        user_id: refs.managerUser,
        fsp_rep_number: 'KI-DEMO-0001',
        product_category: c,
        status: 'active' as const,
        supervisor_id: null,
        effective_from: '2019-01-01',
        effective_to: null,
        verified_by: refs.managerUser,
        verified_at: ts0,
        created_at: ts0,
        updated_at: ts0,
      })),
    ],
    access_grants: [
      { id: bid(341), tenant_id: t, user_id: BX.users.hrKaroo, scope_type: 'employer', scope_id: BX.customers.karoo, granted_by: refs.managerUser, revoked_at: null, created_at: ts0 },
      { id: bid(342), tenant_id: t, user_id: BX.users.cellOwner, scope_type: 'cell', scope_id: BX.cell, granted_by: refs.managerUser, revoked_at: null, created_at: ts0 },
    ],
    benefit_types,
    products: [
      productRow(BX.products.familyProtector, BX.providers.fynbos, 'individual_life', 'Family Protector', 'FL-FP', 'lt_b1'),
      productRow(BX.products.lifeCarePlus, BX.providers.highveld, 'individual_life', 'LifeCare Plus', 'HV-LCP', 'lt_b1'),
      productRow(BX.products.funeralAssist, BX.providers.fynbos, 'individual_life', 'Funeral Assist', 'FL-FA', 'lt_a'),
      productRow(BX.products.groupRiskCore, BX.providers.highveld, 'group_risk', 'Group Risk Core', 'HV-GRC', 'lt_b1'),
      productRow(BX.products.umbrellaProvident, BX.providers.kalahari, 'retirement', 'Kalahari Umbrella Provident Fund', 'KUP', 'pension_fund_benefits'),
    ],
    product_versions: [
      versionRow(BX.versions.familyProtector, BX.products.familyProtector, FAMILY_PROTECTOR, 'Fynbos Life rate guide 2026 (synthetic)'),
      versionRow(BX.versions.lifeCarePlus, BX.products.lifeCarePlus, LIFECARE_PLUS, 'Highveld Life adviser rate card 2026 (synthetic)'),
      versionRow(BX.versions.funeralAssist, BX.products.funeralAssist, FUNERAL_ASSIST, 'Fynbos Life funeral tariff 2026 (synthetic)'),
      versionRow(BX.versions.groupRiskCore, BX.products.groupRiskCore, { ...LIFECARE_PLUS, rates_per_1000: {} }, 'Highveld group risk quotation basis (synthetic)'),
      versionRow(BX.versions.umbrellaProvident, BX.products.umbrellaProvident, { ...FUNERAL_ASSIST, rates_per_1000: {}, underwriting: [] }, 'Kalahari special rules 2026 (synthetic)'),
    ],
    product_benefits: [
      benefitRow(121, BX.versions.familyProtector, 'life', 'core', 20_000_000, null, null, ['Suicide within 24 months of inception']),
      benefitRow(122, BX.versions.familyProtector, 'disability_lump_sum', 'rider', 15_000_000, 65),
      benefitRow(123, BX.versions.familyProtector, 'critical_illness', 'rider', 5_000_000, 70, 3),
      benefitRow(124, BX.versions.lifeCarePlus, 'life', 'core', 25_000_000, null, null, ['Suicide within 24 months of inception']),
      benefitRow(125, BX.versions.lifeCarePlus, 'disability_lump_sum', 'rider', 15_000_000, 65),
      benefitRow(126, BX.versions.lifeCarePlus, 'income_protection', 'rider', 1_800_000, 65, 1),
      benefitRow(127, BX.versions.funeralAssist, 'funeral', 'core', 100_000, null, 6),
    ],
    needs_analyses: [],
    life_quotes: [],
    life_quote_options: [],
    records_of_advice: [],
    policies: [
      {
        id: johanPolicy,
        tenant_id: t,
        customer_id: refs.johanCustomer,
        line: 'individual_life',
        provider_id: BX.providers.highveld,
        product_version_id: null,
        record_of_advice_id: null,
        adviser_id: null,
        policy_number: 'HVL-77120934',
        origin: 'existing_declared',
        status: 'in_force',
        underwriting_status: 'decided',
        premium_amount: 640,
        premium_frequency: 'monthly',
        inception_date: '2019-12-01',
        anniversary_month: 12,
        source: 'declared',
        job_id: null,
        created_at: ts0,
        updated_at: ts0,
      },
    ],
    policy_parties: (['policyholder', 'life_insured', 'premium_payer'] as const).map((role, i) => ({
      id: bid(223 + i),
      tenant_id: t,
      policy_id: johanPolicy,
      person_id: P.johan,
      role,
      share_pct: null,
      effective_from: '2019-12-01',
      effective_to: null,
      created_at: ts0,
    })),
    policy_benefits: [
      {
        id: bid(222),
        tenant_id: t,
        policy_id: johanPolicy,
        life_insured_person_id: P.johan,
        benefit_type_key: 'life',
        kind: 'core',
        sum_assured: 1_500_000,
        monthly_benefit: null,
        premium: 640,
        loading_pct: null,
        exclusions: [],
        status: 'active',
        effective_from: '2019-12-01',
        effective_to: null,
        source: 'declared',
        created_at: ts0,
        updated_at: ts0,
      },
    ],
    policy_status_events: [
      { id: bid(226), tenant_id: t, policy_id: johanPolicy, status: 'in_force', reported_by: 'broker', note: 'Existing cover declared by the client at onboarding; not yet confirmed with Highveld Life.', document_ref: null, actor_user_id: refs.brokerUser, occurred_at: ts0, created_at: ts0 },
    ],
    underwriting_requirements: [],
  }

  // ---------------------------------------------------------------- group risk and funds
  const employments = [...karoo, ...dental].map((e) => ({
    id: e.employment_id,
    tenant_id: t,
    person_id: e.person_id,
    employer_customer_id: e.employer === 'karoo' ? BX.customers.karoo : BX.customers.dental,
    employee_number: e.employee_number,
    category: e.category,
    status: 'active' as const,
    start_date: e.start_date,
    end_date: null,
    created_at: ts0,
    updated_at: ts0,
  }))
  const salary_history = [...karoo, ...dental].map((e) => ({
    id: e.salary_id,
    tenant_id: t,
    employment_id: e.employment_id,
    employer_customer_id: e.employer === 'karoo' ? BX.customers.karoo : BX.customers.dental,
    salary_type: 'pensionable' as const,
    annual_amount: e.monthly_salary * 12,
    effective_from: '2026-03-01',
    effective_to: null,
    source_batch_id: null,
    source: 'declared' as const,
    value_basis: 'reported' as const,
    created_at: ts0,
  }))
  const scheme_memberships = [...karoo, ...dental].map((e) => {
    const rules = e.employer === 'karoo' ? KAROO_SCHEME : DENTAL_SCHEME
    const cover = groupCover(rules, e)
    return {
      id: e.scheme_membership_id,
      tenant_id: t,
      scheme_id: e.employer === 'karoo' ? BX.schemes.karooLife : BX.schemes.dentalLife,
      employment_id: e.employment_id,
      employer_customer_id: e.employer === 'karoo' ? BX.customers.karoo : BX.customers.dental,
      person_id: e.person_id,
      status: 'active' as const,
      joined_on: e.start_date,
      exited_on: null,
      cover_amount: cover,
      above_free_cover_limit: cover > rules.free_cover_limit,
      underwriting_status: cover > rules.free_cover_limit ? ('accepted' as const) : ('not_required' as const),
      created_at: ts0,
      updated_at: ts0,
    }
  })
  const fund_memberships = [...karoo, ...dental].map((e) => ({
    id: e.fund_membership_id,
    tenant_id: t,
    fund_id: e.employer === 'karoo' ? BX.funds.kalahari : BX.funds.dentalFund,
    participation_id: e.employer === 'karoo' ? BX.participations.karoo : BX.participations.dental,
    employment_id: e.employment_id,
    employer_customer_id: e.employer === 'karoo' ? BX.customers.karoo : BX.customers.dental,
    person_id: e.person_id,
    member_number: e.member_number,
    category: e.category,
    status: 'active' as const,
    joined_on: e.start_date < '2018-07-01' ? '2018-07-01' : e.start_date,
    exited_on: null,
    created_at: ts0,
    updated_at: ts0,
  }))

  const valuation = (e: RosterEntry, n: number) => {
    const years = Math.max(1, Math.min(15, ageOn(e.start_date, '2024-08-31')))
    const rate = e.category === 'management' ? 0.175 : 0.15
    const vestedAt2024 = cents(e.monthly_salary * 12 * years * rate * 1.35)
    const seed = cents(Math.min(30_000, vestedAt2024 * 0.1))
    const since = cents(e.monthly_salary * rate * 25)
    const savings = cents(seed + since / 3)
    const retirement = cents((since * 2) / 3)
    const vested = cents(vestedAt2024 - seed)
    return {
      id: bid(n),
      tenant_id: t,
      fund_membership_id: e.fund_membership_id,
      fund_id: e.employer === 'karoo' ? BX.funds.kalahari : BX.funds.dentalFund,
      employer_customer_id: e.employer === 'karoo' ? BX.customers.karoo : BX.customers.dental,
      person_id: e.person_id,
      valuation_date: '2026-09-30',
      vested_component: vested,
      savings_component: savings,
      retirement_component: retirement,
      total_value: cents(vested + savings + retirement),
      source_batch_id: null,
      source_reference: `${e.employer === 'karoo' ? 'Kalahari' : 'Protea'} member statement 30 Sep 2026 (synthetic)`,
      value_basis: 'reported' as const,
      created_at: ts0,
    }
  }

  // The participation statement closes at the sum of the reported member values; the opening balance is backed out so the
  // roll-forward is short by a deliberate, unexplained R1 240,55 for the reconciliation to find.
  const closingCents = karoo.reduce((s, e) => s + Math.round(valuation(e, 0).total_value * 100), 0)
  const statementFlows = { contributions: 1_428_606, transfersIn: 0, transfersOut: 312_450.1, withdrawals: 186_220, benefits: 0, returns: 1_105_874.33, fees: 61_230.12 }
  const netFlowCents =
    Math.round(statementFlows.contributions * 100) +
    Math.round(statementFlows.transfersIn * 100) -
    Math.round(statementFlows.transfersOut * 100) -
    Math.round(statementFlows.withdrawals * 100) -
    Math.round(statementFlows.benefits * 100) +
    Math.round(statementFlows.returns * 100) -
    Math.round(statementFlows.fees * 100)
  const statementBase = { ...statementFlows, opening: (closingCents + 124_055 - netFlowCents) / 100 }
  const closing = closingCents / 100

  const transferValues = dental.map((e, i) => {
    const v = valuation(e, 0)
    const received = i < 12 ? v.total_value : i === 12 ? cents(v.total_value - 412.3) : null
    return {
      id: bid(7500 + e.n),
      tenant_id: t,
      transfer_id: BX.transfer,
      person_id: e.person_id,
      fund_membership_id: e.fund_membership_id,
      transfer_value_reported: v.total_value,
      value_received: received,
      vested_component: v.vested_component,
      savings_component: v.savings_component,
      retirement_component: v.retirement_component,
      status: 'pending' as const,
      created_at: ts0,
      updated_at: ts0,
    }
  })

  const monthEnds = ['2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30']
  const portfolioReturns = [0.012, -0.004, 0.018, 0.009, -0.011, 0.015, 0.007, 0.003, 0.013, -0.006, 0.01, 0.008]
  const benchmarkReturns = [0.009, -0.002, 0.014, 0.008, -0.006, 0.011, 0.007, 0.006, 0.009, -0.003, 0.008, 0.007]
  const flows = [1_200_000, 1_150_000, 1_310_000, 900_000, 1_240_000, 1_180_000, -2_400_000, 1_260_000, 1_210_000, 1_190_000, 1_230_000, 1_270_000]
  let mv = 248_000_000
  const valuations = [{ date: monthEnds[0], mv, flow: 0 }]
  portfolioReturns.forEach((r, i) => {
    mv = cents((mv + flows[i]) * (1 + r))
    valuations.push({ date: monthEnds[i + 1], mv, flow: flows[i] })
  })

  // Instrument, asset class, manager units, manager price, administrator units (null = same), administrator price (-1 = missing).
  const holdings: Array<[string, string, number, number, number | null, number]> = [
    ['SA Equity Fund A', 'equities', 1_250_000, 41.256, null, 41.256],
    ['Global Equity Feeder', 'offshore', 640_000, 58.9012, 638_500, 58.9012],
    ['SA Bond Fund', 'bonds', 2_100_000, 12.441, null, 12.439],
    ['Listed Property Fund', 'property', 410_000, 9.8735, null, -1],
    ['Money Market Fund', 'cash', 3_800_000, 1, null, 1],
    ['Inflation-Linked Bond Fund', 'bonds', 920_000, 15.2208, null, 15.2208],
  ]

  const benefits: BenefitsTables = {
    group_schemes: [
      { id: BX.schemes.karooLife, tenant_id: t, employer_customer_id: BX.customers.karoo, provider_id: BX.providers.fynbos, name: 'Karoo Logistics Group Life', benefit_type_key: 'group_life', policy_number: 'FL-GL-30114', status: 'active', effective_from: '2021-03-01', renewal_date: '2027-03-01', created_at: ts0, updated_at: ts0 },
      { id: BX.schemes.dentalLife, tenant_id: t, employer_customer_id: BX.customers.dental, provider_id: BX.providers.highveld, name: 'Umhlanga Dental Group Life', benefit_type_key: 'group_life', policy_number: 'HV-GL-88412', status: 'active', effective_from: '2022-07-01', renewal_date: '2027-07-01', created_at: ts0, updated_at: ts0 },
    ],
    scheme_rule_versions: [
      { id: bid(303), tenant_id: t, scheme_id: BX.schemes.karooLife, employer_customer_id: BX.customers.karoo, version: 1, effective_from: '2026-03-01', effective_to: null, rules: KAROO_SCHEME, created_at: ts0 },
      { id: bid(304), tenant_id: t, scheme_id: BX.schemes.dentalLife, employer_customer_id: BX.customers.dental, version: 1, effective_from: '2026-07-01', effective_to: null, rules: DENTAL_SCHEME, created_at: ts0 },
    ],
    employments,
    salary_history,
    scheme_memberships,
    retirement_funds: [
      { id: BX.funds.kalahari, tenant_id: t, name: 'Kalahari Umbrella Provident Fund', fund_type: 'umbrella_provident', registration_number: '12/8/DEMO/001', administrator_id: BX.providers.kalahari, status: 'active', created_at: ts0, updated_at: ts0 },
      { id: BX.funds.dentalFund, tenant_id: t, name: 'Umhlanga Dental Staff Provident Fund', fund_type: 'provident', registration_number: '12/8/DEMO/014', administrator_id: BX.providers.protea, status: 'active', created_at: ts0, updated_at: ts0 },
    ],
    fund_participations: [
      { id: BX.participations.karoo, tenant_id: t, fund_id: BX.funds.kalahari, employer_customer_id: BX.customers.karoo, participation_number: 'KUP-P-0291', effective_from: '2018-07-01', effective_to: null, status: 'active', created_at: ts0 },
      { id: BX.participations.dental, tenant_id: t, fund_id: BX.funds.dentalFund, employer_customer_id: BX.customers.dental, participation_number: null, effective_from: '2012-03-01', effective_to: null, status: 'active', created_at: ts0 },
    ],
    fund_memberships,
    contribution_rule_versions: [
      {
        id: bid(315),
        tenant_id: t,
        participation_id: BX.participations.karoo,
        employer_customer_id: BX.customers.karoo,
        version: 2,
        effective_from: '2026-03-01',
        effective_to: null,
        rules: { salary_definition: 'pensionable', categories: { general: { employer_pct: 7.5, employee_pct: 7.5 }, management: { employer_pct: 10, employee_pct: 7.5 } }, contribution_holiday: null },
        created_at: ts0,
      },
      {
        id: bid(316),
        tenant_id: t,
        participation_id: BX.participations.dental,
        employer_customer_id: BX.customers.dental,
        version: 1,
        effective_from: '2020-03-01',
        effective_to: null,
        rules: { salary_definition: 'pensionable', categories: { general: { employer_pct: 6, employee_pct: 6 }, management: { employer_pct: 8, employee_pct: 6 } }, contribution_holiday: null },
        created_at: ts0,
      },
    ],
    member_movements: [],
    benefit_events: [
      {
        id: bid(9301),
        tenant_id: t,
        arrangement: 'retirement_fund',
        scheme_id: null,
        fund_id: BX.funds.kalahari,
        policy_id: null,
        person_id: karoo[36].person_id,
        employer_customer_id: BX.customers.karoo,
        event_type: 'resignation',
        event_date: '2026-09-30',
        broker_status: 'documents_outstanding',
        provider_decision: 'pending',
        provider_decision_date: null,
        provider_reference: null,
        amount_claimed: null,
        amount_paid: null,
        section_37c: false,
        tax_directive_status: 'requested',
        outstanding_requirements: ['Withdrawal claim form signed by the member', 'Bank account confirmation'],
        notes: 'Member resigned at the end of September. Options explained: preserve, transfer or withdraw (subject to tax).',
        created_at: ts0,
        updated_at: ts0,
      },
      {
        id: bid(9302),
        tenant_id: t,
        arrangement: 'group_scheme',
        scheme_id: BX.schemes.karooLife,
        fund_id: null,
        policy_id: null,
        person_id: karoo[57].person_id,
        employer_customer_id: BX.customers.karoo,
        event_type: 'death',
        event_date: '2026-09-12',
        broker_status: 'submitted',
        provider_decision: 'pending',
        provider_decision_date: null,
        provider_reference: 'FL-CLM-55120',
        amount_claimed: groupCover(KAROO_SCHEME, karoo[57]),
        amount_paid: null,
        section_37c: false,
        tax_directive_status: 'not_required',
        outstanding_requirements: ['Certified death certificate'],
        notes: null,
        created_at: ts0,
        updated_at: ts0,
      },
      {
        id: bid(9303),
        tenant_id: t,
        arrangement: 'retirement_fund',
        scheme_id: null,
        fund_id: BX.funds.kalahari,
        policy_id: null,
        person_id: karoo[57].person_id,
        employer_customer_id: BX.customers.karoo,
        event_type: 'death',
        event_date: '2026-09-12',
        broker_status: 'with_provider',
        provider_decision: 'pending',
        provider_decision_date: null,
        provider_reference: 'KUP-DB-2026-118',
        amount_claimed: null,
        amount_paid: null,
        section_37c: true,
        tax_directive_status: 'not_required',
        outstanding_requirements: ['Trustee investigation of dependants under Section 37C', 'Beneficiary nomination form (a guide for the trustees, not binding)'],
        notes: 'Distribution is decided by the trustees under Section 37C. Nominations do not determine the final allocation.',
        created_at: ts0,
        updated_at: ts0,
      },
      {
        id: bid(9304),
        tenant_id: t,
        arrangement: 'retirement_fund',
        scheme_id: null,
        fund_id: BX.funds.kalahari,
        policy_id: null,
        person_id: karoo[73].person_id,
        employer_customer_id: BX.customers.karoo,
        event_type: 'savings_withdrawal',
        event_date: '2026-08-20',
        broker_status: 'closed',
        provider_decision: 'paid',
        provider_decision_date: '2026-09-04',
        provider_reference: 'KUP-SW-2026-4412',
        amount_claimed: 9_800,
        amount_paid: 7_350,
        section_37c: false,
        tax_directive_status: 'issued',
        outstanding_requirements: [],
        notes: 'Paid net of tax per the SARS directive, as reported by the administrator.',
        created_at: ts0,
        updated_at: ts0,
      },
      {
        id: bid(9305),
        tenant_id: t,
        arrangement: 'group_scheme',
        scheme_id: BX.schemes.dentalLife,
        fund_id: null,
        policy_id: null,
        person_id: dental[3].person_id,
        employer_customer_id: BX.customers.dental,
        event_type: 'disability',
        event_date: '2026-06-02',
        broker_status: 'with_provider',
        provider_decision: 'admitted',
        provider_decision_date: '2026-10-21',
        provider_reference: 'HV-DIS-3021',
        amount_claimed: groupCover(DENTAL_SCHEME, dental[3]),
        amount_paid: null,
        section_37c: false,
        tax_directive_status: 'not_required',
        outstanding_requirements: [],
        notes: null,
        created_at: ts0,
        updated_at: ts0,
      },
    ],
    administrator_valuations: [...karoo.map((e) => valuation(e, 6000 + e.n)), ...dental.map((e) => valuation(e, 7600 + e.n))],
    fund_balance_statements: [
      {
        id: bid(391),
        tenant_id: t,
        fund_id: BX.funds.kalahari,
        employer_customer_id: BX.customers.karoo,
        period_start: '2026-07-01',
        period_end: '2026-09-30',
        opening_balance: statementBase.opening,
        contributions: statementBase.contributions,
        transfers_in: statementBase.transfersIn,
        transfers_out: statementBase.transfersOut,
        withdrawals: statementBase.withdrawals,
        benefit_payments: statementBase.benefits,
        investment_returns: statementBase.returns,
        fees: statementBase.fees,
        closing_balance: closing,
        source_reference: 'Kalahari participation statement Q3 2026 (synthetic)',
        value_basis: 'reported',
        created_at: ts0,
      },
    ],
    investment_portfolios: [
      {
        id: BX.portfolio,
        tenant_id: t,
        fund_id: BX.funds.kalahari,
        manager_id: BX.providers.marula,
        name: 'Kalahari Balanced Portfolio',
        mandate: {
          benchmark: 'CPI + 5% composite (synthetic)',
          asset_ranges: { equities: { min: 25, max: 60 }, offshore: { min: 0, max: 45 }, bonds: { min: 10, max: 40 }, property: { min: 0, max: 15 }, cash: { min: 0, max: 15 } },
        },
        status: 'active',
        created_at: ts0,
        updated_at: ts0,
      },
    ],
    investment_holdings: holdings.flatMap(([instrument, asset_class, units, price, adminUnits, adminPrice], i) => {
      const managerRow = {
        id: bid(8010 + i),
        tenant_id: t,
        portfolio_id: BX.portfolio,
        source_kind: 'investment_manager' as const,
        instrument,
        asset_class,
        units,
        unit_price: price,
        market_value: cents(units * price),
        valuation_date: '2026-09-30',
        source_batch_id: null,
        source_reference: 'Marula holdings report 30 Sep 2026 (synthetic)',
        value_basis: 'reported' as const,
        created_at: ts0,
      }
      const aUnits = adminUnits ?? units
      const aPrice = adminPrice < 0 ? null : adminPrice
      const adminRow = {
        ...managerRow,
        id: bid(8030 + i),
        source_kind: 'administrator' as const,
        units: aUnits,
        unit_price: aPrice,
        market_value: aPrice === null ? null : cents(aUnits * aPrice),
        source_reference: 'Kalahari unit register 30 Sep 2026 (synthetic)',
      }
      return [managerRow, adminRow]
    }),
    investment_valuations: valuations.map((v, i) => ({
      id: bid(8100 + i),
      tenant_id: t,
      portfolio_id: BX.portfolio,
      valuation_date: v.date,
      market_value: v.mv,
      net_cash_flow: v.flow,
      source_reference: 'Marula monthly valuation (synthetic)',
      value_basis: 'reported' as const,
      created_at: ts0,
    })),
    investment_benchmarks: benchmarkReturns.map((r, i) => ({
      id: bid(8200 + i),
      tenant_id: t,
      portfolio_id: BX.portfolio,
      period_end: monthEnds[i + 1],
      benchmark_return: r,
      source_reference: 'Benchmark provider monthly return (synthetic)',
      created_at: ts0,
    })),
    fund_transfers: [
      {
        id: BX.transfer,
        tenant_id: t,
        transfer_type: 'section_14',
        transferor_fund_id: BX.funds.dentalFund,
        transferee_fund_id: BX.funds.kalahari,
        employer_customer_id: BX.customers.dental,
        stage: 'confirm_allocations',
        effective_date: '2026-09-01',
        milestones: [
          { stage: 'initiate', completed_at: at('2026-05-04'), by: 'Lerato Dube', note: 'Employer resolution to move to the umbrella fund', evidence_ref: 'Board resolution (synthetic)' },
          { stage: 'validate', completed_at: at('2026-05-20'), by: 'Lerato Dube', note: '15 members validated against the transferor register', evidence_ref: null },
          { stage: 'prepare_schedules', completed_at: at('2026-06-10'), by: 'Lerato Dube', note: 'Member schedule prepared with two-pot components', evidence_ref: null },
          { stage: 'reconcile', completed_at: at('2026-06-30'), by: 'Lerato Dube', note: 'Schedule reconciled to the transferor administrator values', evidence_ref: null },
          { stage: 'obtain_approvals', completed_at: at('2026-08-14'), by: 'Lerato Dube', note: 'Approvals recorded from the funds and the regulator', evidence_ref: 'Section 14 approval reference S14-DEMO-0412 (synthetic)' },
          { stage: 'submit', completed_at: at('2026-08-21'), by: 'Lerato Dube', note: 'Submitted to both administrators', evidence_ref: null },
          { stage: 'monitor', completed_at: at('2026-10-02'), by: 'Lerato Dube', note: 'Assets and cash transferred, as reported by the administrators', evidence_ref: null },
        ],
        status: 'open',
        created_at: ts0,
        updated_at: ts0,
      },
    ],
    transfer_members: transferValues,
  }

  // ---------------------------------------------------------------- controls
  const source = (id: string, name: string, kind: 'employer_payroll' | 'fund_administrator' | 'investment_manager' | 'cell_captive_insurer', dataset: 'payroll_schedule' | 'contribution_schedule' | 'investment_holdings' | 'cell_financials', mapping: Record<string, string>, customer_id: string | null, provider_id: string | null) => ({
    id,
    tenant_id: t,
    name,
    source_kind: kind,
    provider_id,
    customer_id,
    channel: 'csv' as const,
    dataset,
    mapping,
    mapping_version: 1,
    is_active: true,
    created_at: ts0,
    updated_at: ts0,
  })
  const payrollMapping = { employee_number: 'Employee No', id_number: 'ID Number', surname: 'Surname', first_names: 'First Names', date_of_birth: 'Date of Birth', category: 'Category', monthly_salary: 'Pensionable Salary', period: 'Period' }
  const controls: ControlsTables = {
    data_sources: [
      source(BX.sources.karooPayroll, 'Karoo Logistics payroll (CSV)', 'employer_payroll', 'payroll_schedule', payrollMapping, BX.customers.karoo, null),
      source(BX.sources.dentalPayroll, 'Umhlanga Dental payroll (CSV)', 'employer_payroll', 'payroll_schedule', payrollMapping, BX.customers.dental, null),
      source(BX.sources.kalahariContrib, 'Kalahari contribution schedule (CSV)', 'fund_administrator', 'contribution_schedule', { member_number: 'Member No', id_number: 'ID Number', surname: 'Surname', employer_contribution: 'Employer Contribution', employee_contribution: 'Employee Contribution', period: 'Period' }, BX.customers.karoo, BX.providers.kalahari),
      source(BX.sources.kalahariHoldings, 'Kalahari unit register (CSV)', 'fund_administrator', 'investment_holdings', { instrument: 'Instrument', units: 'Units', unit_price: 'Price' }, null, BX.providers.kalahari),
      source(BX.sources.marulaHoldings, 'Marula holdings report (CSV)', 'investment_manager', 'investment_holdings', { instrument: 'Instrument', units: 'Units', unit_price: 'Price' }, null, BX.providers.marula),
      source(BX.sources.aloeCell, 'Aloe cell management accounts (CSV)', 'cell_captive_insurer', 'cell_financials', {}, BX.customers.thandeka, BX.providers.aloe),
    ],
    import_batches: [],
    import_rows: [],
    reconciliation_definitions: [
      { id: BX.recon.payrollContrib, tenant_id: t, key: 'payroll_vs_admin_contributions', name: 'Expected contributions (payroll × rules) vs administrator schedule', version: 1, left_dataset: 'payroll_schedule', right_dataset: 'contribution_schedule', match_keys: ['person_id'], compare_fields: ['employer_contribution', 'employee_contribution'], tolerances: { employer_contribution: 100, employee_contribution: 100 }, is_active: true, created_at: ts0, updated_at: ts0 },
      { id: BX.recon.holdings, tenant_id: t, key: 'admin_vs_manager_holdings', name: 'Administrator unit register vs investment manager holdings', version: 1, left_dataset: 'investment_holdings:administrator', right_dataset: 'investment_holdings:investment_manager', match_keys: ['instrument'], compare_fields: ['units', 'market_value'], tolerances: { units: 0.0001, market_value: 50_000 }, is_active: true, created_at: ts0, updated_at: ts0 },
      { id: BX.recon.rollforward, tenant_id: t, key: 'fund_balance_rollforward', name: 'Opening to closing balance roll-forward', version: 1, left_dataset: 'fund_balance_statement:calculated', right_dataset: 'fund_balance_statement:reported', match_keys: ['component'], compare_fields: ['closing_balance'], tolerances: { closing_balance: 100 }, is_active: true, created_at: ts0, updated_at: ts0 },
      { id: BX.recon.transfer, tenant_id: t, key: 'transfer_values', name: 'Transferor values vs transferee allocations', version: 1, left_dataset: 'transfer_schedule:transferor', right_dataset: 'transfer_schedule:transferee', match_keys: ['person_id'], compare_fields: ['value'], tolerances: { value: 100 }, is_active: true, created_at: ts0, updated_at: ts0 },
    ],
    reconciliation_runs: [],
    reconciliation_items: [],
    financial_exceptions: [],
    exception_resolutions: [],
    audit_evidence: [],
    correction_schedules: [],
  }

  // ---------------------------------------------------------------- specialist
  const cellMonths: Array<[string, number, number, number, number, number, number]> = [
    // period end, GWP, claims paid, OCR movement, IBNR movement, investment income, UPR movement
    ['2026-04-30', 1_420_000, 610_000, 40_000, 12_000, 38_500, 22_000],
    ['2026-05-31', 1_455_000, 655_000, -15_000, 11_000, 39_200, 18_000],
    ['2026-06-30', 1_470_000, 1_480_000, 260_000, 30_000, 40_100, 12_000],
    ['2026-07-31', 1_490_000, 702_000, -120_000, 9_000, 41_000, 15_000],
    ['2026-08-31', 1_512_000, 690_000, 10_000, 10_000, 41_900, 16_500],
    ['2026-09-30', 1_530_000, 640_000, -20_000, 9_500, 42_600, 14_000],
  ]
  const specialist: SpecialistTables = {
    cell_arrangements: [
      {
        id: BX.cell,
        tenant_id: t,
        cell_owner_customer_id: BX.customers.thandeka,
        insurer_id: BX.providers.aloe,
        name: 'Thandeka Motor Club cell',
        agreement_reference: 'ACI-CELL-0107 (synthetic)',
        terms: { profit_share_pct: 80, deficit_carry_forward: true, management_fee_pct: 7.5, reporting_basis: 'earned' },
        status: 'active',
        created_at: ts0,
        updated_at: ts0,
      },
    ],
    cell_financial_periods: cellMonths.map(([period_end, gwp, paid, ocr, ibnr, inv, upr], i) => ({
      id: bid(9010 + i),
      tenant_id: t,
      cell_id: BX.cell,
      cell_owner_customer_id: BX.customers.thandeka,
      period_end,
      gross_written_premium: gwp,
      reinsurance_premium: cents(gwp * 0.12),
      unearned_premium_movement: upr,
      claims_paid: paid,
      outstanding_claims_movement: ocr,
      ibnr_movement: ibnr,
      acquisition_costs: cents(gwp * 0.1),
      management_expenses: cents(gwp * 0.075),
      investment_income: inv,
      capital_requirement: 2_400_000,
      reserves_held: 3_050_000 + i * 40_000,
      source_batch_id: null,
      source_reference: `Aloe management accounts ${period_end} (synthetic)`,
      value_basis: 'reported',
      created_at: ts0,
    })),
    governance_items: [
      { id: bid(9101), tenant_id: t, fund_id: BX.funds.kalahari, kind: 'meeting', title: 'Q3 2026 management committee meeting (Karoo Logistics participation)', detail: 'Contribution compliance, investment performance and two benefit claims reviewed.', status: 'done', owner: null, due_date: '2026-10-15', decided_by_trustees: null, recorded_by: refs.managerUser, created_at: ts0, updated_at: ts0 },
      { id: bid(9102), tenant_id: t, fund_id: BX.funds.kalahari, kind: 'decision', title: 'Revised investment policy statement noted', detail: null, status: 'noted', owner: null, due_date: '2026-10-15', decided_by_trustees: 'Board of trustees, 15 Oct 2026 (recorded from minutes)', recorded_by: refs.managerUser, created_at: ts0, updated_at: ts0 },
      { id: bid(9103), tenant_id: t, fund_id: BX.funds.kalahari, kind: 'action_item', title: 'Follow up late contribution schedules from participating employers', detail: null, status: 'open', owner: 'B-Covered (broker)', due_date: '2026-11-15', decided_by_trustees: null, recorded_by: refs.managerUser, created_at: ts0, updated_at: ts0 },
      { id: bid(9104), tenant_id: t, fund_id: BX.funds.kalahari, kind: 'risk', title: 'Contribution reconciliation exceptions above R50 000 remain unresolved for more than 30 days', detail: 'Likelihood medium, impact high. Mitigation: monthly reconciliation with exception ageing.', status: 'open', owner: 'Management committee', due_date: null, decided_by_trustees: null, recorded_by: refs.managerUser, created_at: ts0, updated_at: ts0 },
    ],
    trustee_packs: [],
    investigations: [],
    investigation_findings: [],
    commission_records: [
      ...['2026-09-01', '2026-10-01'].map((period, i) => ({ id: bid(9201 + i), tenant_id: t, customer_id: refs.johanCustomer, policy_id: johanPolicy, scheme_id: null, fund_id: null, provider_id: BX.providers.highveld, period, commission_type: 'ongoing' as const, amount: 48, source_reference: `Highveld commission statement ${period.slice(0, 7)} (synthetic)`, value_basis: 'reported' as const, created_at: ts0 })),
      ...['2026-09-01', '2026-10-01'].map((period, i) => ({ id: bid(9211 + i), tenant_id: t, customer_id: BX.customers.karoo, policy_id: null, scheme_id: BX.schemes.karooLife, fund_id: null, provider_id: BX.providers.fynbos, period, commission_type: 'fee' as const, amount: 3_250, source_reference: `Fynbos broker fee statement ${period.slice(0, 7)} (synthetic)`, value_basis: 'reported' as const, created_at: ts0 })),
      ...['2026-09-01', '2026-10-01'].map((period, i) => ({ id: bid(9221 + i), tenant_id: t, customer_id: BX.customers.karoo, policy_id: null, scheme_id: null, fund_id: BX.funds.kalahari, provider_id: BX.providers.kalahari, period, commission_type: 'fee' as const, amount: 5_800, source_reference: `Kalahari adviser fee schedule ${period.slice(0, 7)} (synthetic)`, value_basis: 'reported' as const, created_at: ts0 })),
    ],
  }

  return { insurers, app_users, customers, customer_consents, tables: { ...life, ...controls, ...benefits, ...specialist } }
}
