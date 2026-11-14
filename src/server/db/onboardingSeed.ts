// Fictional brokerages, people and client books for onboarding, isolation and activation. Every name is synthetic.
import { applicableRequirements, REQUIREMENTS, TERMS_VERSION } from '../onboarding/config'
import { hashPayload } from '../lib/hash'
import type { Policy } from './lifeSchema'
import type {
  ApplicationStatus,
  BrokerageApplication,
  BrokerageType,
  Document,
  InsurerAccess,
  ItemStatus,
  MemberRole,
  OnboardingItem,
  OnboardingStatusEvent,
  OnboardingTables,
  OrganisationMembership,
  ProductModule,
  StorageObject,
} from './onboardingSchema'
import type { AppUser, AuditEvent, Customer, Lead, Organisation } from './schema'

const ob = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const OB = {
  orgs: { platform: ob(1), acacia: ob(2), coastline: ob(3), highveld: ob(4), umhlanga: ob(5) },
  users: {
    platformAdmin: ob(101),
    reviewer: ob(102),
    acaciaOwner: ob(111),
    acaciaRep: ob(112),
    acaciaReadOnly: ob(113),
    sharedRep: ob(114),
    coastlineOwner: ob(121),
    coastlineAdmin: ob(122),
    coastlineCompliance: ob(123),
    coastlineOps: ob(124),
    highveldOwner: ob(131),
    highveldRep: ob(132),
  },
  customers: {
    acaciaZodwa: ob(201),
    acaciaVenter: ob(202),
    acaciaBongani: ob(203),
    acaciaLerato: ob(204),
    acaciaMooiRiver: ob(205),
    coastlineZodwa: ob(211),
    coastlineAhmed: ob(212),
    coastlineKitchens: ob(213),
    coastlineNicole: ob(214),
  },
  applications: { acacia: ob(301), coastline: ob(302), highveld: ob(303), umhlanga: ob(304) },
  leads: { acaciaLerato: ob(650) },
  invitations: { umhlanga: ob(401), coastline: ob(402) },
} as const

/** The seeded owner invitation token for Umhlanga Brokers. Only its hash is stored, exactly like real invitations. */
export const DEMO_INVITE_TOKEN = 'demo-invite-umhlanga-2026'
export const DEMO_INVITE_EMAIL = 'owner@umhlangabrokers.example.demo'

export const hashToken = (token: string) => hashPayload({ invitation: token })

export const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
const encode = toBase64

export interface FixtureFacts {
  legal_name: string
  registration_number: string
  fsp_number: string
  key_individual: string
  address: string
  compliance_officer: string
}

/** The sample brokerage used by "Use a sample document" in the onboarding documents section. */
export const SAMPLE_FACTS: FixtureFacts = {
  legal_name: 'Umhlanga Brokers (Pty) Ltd',
  registration_number: '2019/551208/07',
  fsp_number: '50644',
  key_individual: 'Ayesha Govender',
  address: '3 Lighthouse Road, Umhlanga Rocks, 4319',
  compliance_officer: 'Ridge Compliance Partners',
}

/** Text fixtures for demo documents. Russ's deterministic extraction reads the labelled lines. */
export function documentFixture(key: string, f: FixtureFacts): { file_name: string; text: string } | null {
  const lines: Record<string, [string, string[]]> = {
    doc_cipc: [
      'CIPC certificate.txt',
      ['COMPANIES AND INTELLECTUAL PROPERTY COMMISSION', 'Certificate of incorporation', `Enterprise name: ${f.legal_name}`, `Registration number: ${f.registration_number}`, `Registered address: ${f.address}`],
    ],
    doc_fsp_licence: [
      'FSP licence.txt',
      ['FINANCIAL SECTOR CONDUCT AUTHORITY', 'Licence to act as a financial services provider', `Name: ${f.legal_name}`, `FSP number: ${f.fsp_number}`, `Key individual: ${f.key_individual}`, 'Categories: Short-term personal lines; Long-term category B1'],
    ],
    doc_pi_cover: ['PI and fidelity schedule.txt', ['Professional indemnity and fidelity schedule', `Insured: ${f.legal_name}`, 'Limit of indemnity: R5,000,000', 'Period: 2026-07-01 to 2027-06-30']],
    doc_fica: ['Proof of address.txt', ['Municipal account', `Account holder: ${f.legal_name}`, `Address: ${f.address}`, `Director: ${f.key_individual}`]],
    doc_life_mandate: ['Fynbos Life intermediary agreement.txt', ['Intermediary agreement', 'Insurer: Fynbos Life', `Intermediary: ${f.legal_name}`, 'Commencement: 2025-02-01']],
    doc_compliance_report: ['Compliance officer report 2026.txt', ['Annual compliance report', `FSP: ${f.legal_name}`, `Compliance officer: ${f.compliance_officer}`, 'Findings: none material']],
  }
  const entry = lines[key]
  return entry ? { file_name: entry[0], text: entry[1].join('\n') } : null
}

interface Refs {
  bcoveredTenant: string
  bcoveredOwner: string
  bcoveredReps: string[]
  insurers: { protea: string; karoo: string; baobab: string; fynbos: string }
}

export interface OnboardingSeed {
  organisations: Organisation[]
  app_users: AppUser[]
  customers: Customer[]
  policies: Policy[]
  leads: Lead[]
  audit_events: AuditEvent[]
  tables: OnboardingTables
}

export function onboardingSeed(now: number, refs: Refs): OnboardingSeed {
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString()
  const ts = iso(60)
  const O = OB.orgs
  const U = OB.users
  const C = OB.customers
  const A = OB.applications

  const org = (id: string, name: string, slug: string, extra: Partial<Organisation>): Organisation => ({
    id,
    name,
    slug,
    fsp_number: null,
    fsp_verified: false,
    is_demo: true,
    kind: 'brokerage',
    legal_name: null,
    trading_name: name,
    registration_number: null,
    brokerage_type: null,
    lifecycle_status: 'onboarding',
    status_reason: null,
    activated_at: null,
    suspended_at: null,
    retention_until: null,
    created_at: ts,
    updated_at: ts,
    ...extra,
  })

  const organisations: Organisation[] = [
    org(O.platform, 'B-Covered Platform', 'bcovered-platform', { kind: 'platform', lifecycle_status: 'active', activated_at: ts, legal_name: 'B-Covered Platform (demo)' }),
    org(O.acacia, 'Acacia Cover Brokers', 'acacia-cover', {
      legal_name: 'Acacia Cover Brokers (Pty) Ltd',
      registration_number: '2012/204118/07',
      fsp_number: '51207',
      brokerage_type: 'independent',
      lifecycle_status: 'active',
      activated_at: iso(40),
    }),
    org(O.coastline, 'Coastline Risk Partners', 'coastline-risk', {
      legal_name: 'Coastline Risk Partners (Pty) Ltd',
      registration_number: '2018/377020/07',
      fsp_number: '49931',
      brokerage_type: 'juristic_representative_network',
      lifecycle_status: 'active',
      activated_at: iso(25),
    }),
    org(O.highveld, 'Highveld Advisory', 'highveld-advisory', { brokerage_type: 'independent', created_at: iso(9), updated_at: iso(2) }),
    org(O.umhlanga, 'Umhlanga Brokers', 'umhlanga-brokers', { created_at: iso(1), updated_at: iso(1) }),
  ]

  const user = (id: string, tenant_id: string, email: string, full_name: string, role: AppUser['role']): AppUser => ({
    id,
    tenant_id,
    email,
    full_name,
    role,
    customer_id: null,
    active_organisation_id: tenant_id,
    created_at: ts,
    updated_at: ts,
  })

  const app_users: AppUser[] = [
    user(U.platformAdmin, O.platform, 'nomvula.khoza@bcovered-platform.demo', 'Nomvula Khoza', 'visitor'),
    user(U.reviewer, O.platform, 'pieter.botha@bcovered-platform.demo', 'Pieter Botha', 'visitor'),
    user(U.acaciaOwner, O.acacia, 'anele.mahlangu@acaciacover.example.demo', 'Anele Mahlangu', 'manager'),
    user(U.acaciaRep, O.acacia, 'ruan.pretorius@acaciacover.example.demo', 'Ruan Pretorius', 'broker'),
    user(U.acaciaReadOnly, O.acacia, 'fatima.essop@acaciacover.example.demo', 'Fatima Essop', 'broker'),
    user(U.sharedRep, O.acacia, 'sam.pillay@brokers.example.demo', 'Sam Pillay', 'broker'),
    user(U.coastlineOwner, O.coastline, 'thandiwe.zulu@coastlinerisk.example.demo', 'Thandiwe Zulu', 'manager'),
    user(U.coastlineAdmin, O.coastline, 'marco.rossi@coastlinerisk.example.demo', 'Marco Rossi', 'manager'),
    user(U.coastlineCompliance, O.coastline, 'grace.mokoena@coastlinerisk.example.demo', 'Grace Mokoena', 'broker'),
    user(U.coastlineOps, O.coastline, 'sipho.khumalo@coastlinerisk.example.demo', 'Sipho Khumalo', 'broker'),
    user(U.highveldOwner, O.highveld, 'kagiso.molefe@highveldadvisory.example.demo', 'Kagiso Molefe', 'manager'),
    user(U.highveldRep, O.highveld, 'neo.sebego@highveldadvisory.example.demo', 'Neo Sebego', 'broker'),
  ]

  let mid = 500
  const member = (tenant_id: string, user_id: string, role: MemberRole, invited_by: string | null = null): OrganisationMembership => ({
    id: ob(mid++),
    tenant_id,
    user_id,
    role,
    status: 'active',
    invited_by,
    created_at: ts,
    updated_at: ts,
  })
  const organisation_memberships: OrganisationMembership[] = [
    member(refs.bcoveredTenant, refs.bcoveredOwner, 'brokerage_owner'),
    ...refs.bcoveredReps.map((id) => member(refs.bcoveredTenant, id, 'representative', refs.bcoveredOwner)),
    member(O.acacia, U.acaciaOwner, 'brokerage_owner'),
    member(O.acacia, U.acaciaRep, 'representative', U.acaciaOwner),
    member(O.acacia, U.acaciaReadOnly, 'read_only', U.acaciaOwner),
    member(O.acacia, U.sharedRep, 'representative', U.acaciaOwner),
    member(O.coastline, U.coastlineOwner, 'brokerage_owner'),
    member(O.coastline, U.coastlineAdmin, 'brokerage_admin', U.coastlineOwner),
    member(O.coastline, U.coastlineCompliance, 'compliance_reviewer', U.coastlineOwner),
    member(O.coastline, U.coastlineOps, 'operations_admin', U.coastlineOwner),
    member(O.coastline, U.sharedRep, 'representative', U.coastlineOwner),
    member(O.highveld, U.highveldOwner, 'brokerage_owner'),
    member(O.highveld, U.highveldRep, 'representative', U.highveldOwner),
  ]

  const customer = (id: string, tenant_id: string, full_name: string, email: string, phone: string, region: string, type: Customer['customer_type'] = 'personal'): Customer => ({
    id,
    tenant_id,
    customer_type: type,
    full_name,
    email,
    phone,
    region,
    status: 'active',
    is_synthetic: true,
    created_by: null,
    data_origin: 'demo',
    created_at: ts,
    updated_at: ts,
  })
  // Zodwa Nkosi is a client of both brokerages with the same email address. The records are never merged.
  const customers: Customer[] = [
    customer(C.acaciaZodwa, O.acacia, 'Zodwa Nkosi', 'zodwa.nkosi@example.demo', '0825550301', 'Gauteng'),
    customer(C.acaciaVenter, O.acacia, 'Pieter and Annelie Venter', 'venter.family@example.demo', '0835550302', 'Free State'),
    customer(C.acaciaBongani, O.acacia, 'Bongani Motors CC', 'accounts@bonganimotors.example.demo', '0115550303', 'Gauteng', 'commercial'),
    customer(C.acaciaLerato, O.acacia, 'Lerato Sithebe', 'lerato.sithebe@example.demo', '0725550304', 'Gauteng'),
    customer(C.acaciaMooiRiver, O.acacia, 'Mooi River Dairy (Pty) Ltd', 'office@mooiriverdairy.example.demo', '0335550305', 'KwaZulu-Natal', 'commercial'),
    customer(C.coastlineZodwa, O.coastline, 'Zodwa Nkosi', 'zodwa.nkosi@example.demo', '0825550301', 'Gauteng'),
    customer(C.coastlineAhmed, O.coastline, 'Ahmed Patel', 'ahmed.patel@example.demo', '0845550312', 'KwaZulu-Natal'),
    customer(C.coastlineKitchens, O.coastline, 'Coastal Kitchens (Pty) Ltd', 'finance@coastalkitchens.example.demo', '0315550313', 'KwaZulu-Natal', 'commercial'),
    customer(C.coastlineNicole, O.coastline, 'Nicole van Wyk', 'nicole.vanwyk@example.demo', '0615550314', 'Western Cape'),
  ]

  let pid = 600
  const policy = (tenant_id: string, customer_id: string, line: Policy['line'], provider_id: string, policy_number: string, premium: number, adviser: string): Policy => ({
    id: ob(pid++),
    tenant_id,
    customer_id,
    line,
    provider_id,
    product_version_id: null,
    record_of_advice_id: null,
    adviser_id: adviser,
    policy_number,
    origin: 'existing_declared',
    status: 'in_force',
    underwriting_status: null,
    premium_amount: premium,
    premium_frequency: 'monthly',
    inception_date: iso(400).slice(0, 10),
    anniversary_month: new Date(now - 400 * 86_400_000).getUTCMonth() + 1,
    source: 'declared',
    job_id: null,
    data_origin: 'demo',
    created_at: ts,
    updated_at: ts,
  })
  const I = refs.insurers
  const policies: Policy[] = [
    policy(O.acacia, C.acaciaZodwa, 'short_term_personal', I.protea, 'PRO-MV-118204', 1180, U.acaciaRep),
    policy(O.acacia, C.acaciaVenter, 'short_term_personal', I.karoo, 'KM-HH-552019', 640, U.acaciaRep),
    policy(O.acacia, C.acaciaBongani, 'short_term_commercial', I.baobab, 'BG-CP-90311', 4850, U.sharedRep),
    policy(O.acacia, C.acaciaMooiRiver, 'short_term_commercial', I.baobab, 'BG-CP-90477', 7320, U.acaciaOwner),
    policy(O.coastline, C.coastlineZodwa, 'short_term_personal', I.baobab, 'BG-HH-30988', 455, U.sharedRep),
    policy(O.coastline, C.coastlineAhmed, 'individual_life', I.fynbos, 'FL-0044871', 890, U.coastlineOwner),
    policy(O.coastline, C.coastlineKitchens, 'short_term_commercial', I.baobab, 'BG-CP-91204', 6120, U.coastlineAdmin),
  ]

  const leads: Lead[] = [
    {
      id: OB.leads.acaciaLerato,
      tenant_id: O.acacia,
      customer_id: C.acaciaLerato,
      conversation_id: null,
      line: 'personal',
      product_category: 'motor',
      status: 'qualified',
      urgency: 'medium',
      qualification: {
        vehicle: { make: 'Toyota', model: 'Corolla', year: 2022, value: 320000, condition: 'used', usage: 'private', parking: 'garage', tracker: true, driver_age: 31, licence_years: 9, claims_last_3_years: 0, cover_type: 'comprehensive' },
        summary: 'Existing client asking to compare motor cover on a 2022 Corolla.',
      },
      missing_info: [],
      source: 'broker',
      created_by: U.acaciaRep,
      created_at: iso(3),
      updated_at: iso(3),
    },
  ]

  // ------------------------------------------------------------------ applications and checklist items
  const sectionsFor = (o: {
    legal: string
    trading: string
    reg: string
    type: BrokerageType
    address: string
    contact: [string, string, string]
    fsp: string
    categories: string[]
    keyIndividual: string
    compliance: string
    modules: ProductModule[]
    migration: 'import' | 'empty'
  }): BrokerageApplication['sections'] => ({
    organisation: {
      legal_name: o.legal,
      trading_name: o.trading,
      registration_number: o.reg,
      vat_number: null,
      brokerage_type: o.type,
      registered_address: o.address,
      operating_address: null,
      primary_contact_name: o.contact[0],
      primary_contact_email: o.contact[1],
      primary_contact_phone: o.contact[2],
      finance_contact_email: null,
    },
    profile: { fsp_number: o.fsp, licence_categories: o.categories, key_individual: o.keyIndividual, compliance_officer: o.compliance, service_scope: null },
    products: { modules: o.modules },
    migration: { choice: o.migration, source_system: o.migration === 'import' ? 'Spreadsheet' : null, estimated_clients: null, transfer_attestation: o.migration === 'import' },
  })

  const application = (
    id: string,
    tenant_id: string,
    route: BrokerageApplication['route'],
    status: ApplicationStatus,
    type: BrokerageType | null,
    modules: ProductModule[],
    sections: BrokerageApplication['sections'],
    times: { created: number; submitted?: number; approved?: number; activated?: number },
    extra: Partial<BrokerageApplication> = {},
  ): BrokerageApplication => ({
    id,
    tenant_id,
    route,
    invitation_id: null,
    status,
    status_reason: null,
    brokerage_type: type,
    sections,
    current_section: status === 'draft' ? 'organisation' : 'readiness',
    declared_modules: modules,
    migration_choice: (sections.migration?.choice as 'import' | 'empty' | undefined) ?? null,
    assigned_reviewer: null,
    revision: times.submitted !== undefined ? 1 : 0,
    submitted_at: times.submitted !== undefined ? iso(times.submitted) : null,
    approved_at: times.approved !== undefined ? iso(times.approved) : null,
    approved_by: times.approved !== undefined ? U.reviewer : null,
    activated_at: times.activated !== undefined ? iso(times.activated) : null,
    activated_by: times.activated !== undefined ? U.platformAdmin : null,
    created_at: iso(times.created),
    updated_at: iso(times.activated ?? times.submitted ?? times.created),
    ...extra,
  })

  const brokerage_applications: BrokerageApplication[] = [
    application(
      A.acacia,
      O.acacia,
      'application',
      'active',
      'independent',
      ['personal_lines', 'commercial'],
      sectionsFor({
        legal: 'Acacia Cover Brokers (Pty) Ltd',
        trading: 'Acacia Cover Brokers',
        reg: '2012/204118/07',
        type: 'independent',
        address: '41 Church Street, Pretoria, 0002',
        contact: ['Anele Mahlangu', 'anele.mahlangu@acaciacover.example.demo', '0125550111'],
        fsp: '51207',
        categories: ['st_personal', 'st_commercial'],
        keyIndividual: 'Anele Mahlangu',
        compliance: 'Moja Compliance (Pty) Ltd',
        modules: ['personal_lines', 'commercial'],
        migration: 'import',
      }),
      { created: 50, submitted: 46, approved: 42, activated: 40 },
      { assigned_reviewer: U.reviewer },
    ),
    application(
      A.coastline,
      O.coastline,
      'invitation',
      'active',
      'juristic_representative_network',
      ['personal_lines', 'individual_life'],
      sectionsFor({
        legal: 'Coastline Risk Partners (Pty) Ltd',
        trading: 'Coastline Risk Partners',
        reg: '2018/377020/07',
        type: 'juristic_representative_network',
        address: '8 Marine Drive, Umhlanga Rocks, 4319',
        contact: ['Thandiwe Zulu', 'thandiwe.zulu@coastlinerisk.example.demo', '0315550121'],
        fsp: '49931',
        categories: ['st_personal', 'lt_b1'],
        keyIndividual: 'Thandiwe Zulu',
        compliance: 'Grace Mokoena',
        modules: ['personal_lines', 'individual_life'],
        migration: 'import',
      }),
      { created: 35, submitted: 31, approved: 27, activated: 25 },
      { assigned_reviewer: U.reviewer, invitation_id: OB.invitations.coastline },
    ),
    application(
      A.highveld,
      O.highveld,
      'application',
      'submitted',
      'independent',
      ['personal_lines', 'individual_life'],
      sectionsFor({
        legal: 'Highveld Advisory (Pty) Ltd',
        trading: 'Highveld Advisory',
        reg: '2016/482913/07',
        type: 'independent',
        address: '12 Jan Smuts Avenue, Rosebank, Johannesburg, 2196',
        contact: ['Kagiso Molefe', 'kagiso.molefe@highveldadvisory.example.demo', '0115550131'],
        fsp: '48817',
        categories: ['st_personal', 'lt_b1'],
        keyIndividual: 'Kagiso Molefe',
        compliance: 'Mthunzi Compliance Services',
        modules: ['personal_lines', 'individual_life'],
        migration: 'empty',
      }),
      { created: 9, submitted: 2 },
    ),
    application(A.umhlanga, O.umhlanga, 'invitation', 'draft', null, [], { organisation: { trading_name: 'Umhlanga Brokers' } }, { created: 1 }, { invitation_id: OB.invitations.umhlanga }),
  ]

  let did = 700
  const documents: Document[] = []
  const storage_objects: StorageObject[] = []
  const addDocument = (app: BrokerageApplication, key: string, by: string, review: Document['review_status'], age: number) => {
    const s = app.sections
    const fixture = documentFixture(key, {
      legal_name: String(s.organisation?.legal_name ?? ''),
      registration_number: String(s.organisation?.registration_number ?? ''),
      fsp_number: String(s.profile?.fsp_number ?? ''),
      key_individual: String(s.profile?.key_individual ?? ''),
      address: String(s.organisation?.registered_address ?? ''),
      compliance_officer: String(s.profile?.compliance_officer ?? ''),
    })
    if (!fixture) return null
    const tenant_id = app.tenant_id
    const applicationId = app.id
    const id = ob(did++)
    const path = `${tenant_id}/brokerage_applications/${applicationId}/${id}-${fixture.file_name}`
    const content = encode(fixture.text)
    documents.push({
      id,
      tenant_id,
      owner_table: 'brokerage_applications',
      owner_id: applicationId,
      doc_type: key,
      file_name: fixture.file_name,
      mime_type: 'text/plain',
      file_size: fixture.text.length,
      sha256: hashPayload(fixture.text),
      storage_path: path,
      review_status: review,
      data_origin: 'demo',
      uploaded_by: by,
      created_at: iso(age),
      updated_at: iso(age),
    })
    storage_objects.push({ id: ob(did++), tenant_id, path, mime_type: 'text/plain', size: fixture.text.length, content_base64: content, created_at: iso(age) })
    return id
  }

  let iid = 800
  const onboarding_items: OnboardingItem[] = []
  const addItems = (app: BrokerageApplication, status: ItemStatus, by: string | null, age: number, uploader: string, review: Document['review_status']) => {
    for (const r of applicableRequirements(REQUIREMENTS, app.brokerage_type, app.declared_modules)) {
      const documentId = r.kind === 'document' ? addDocument(app, r.key, uploader, review, age + 1) : null
      const itemStatus: ItemStatus = r.kind === 'document' && !documentId ? (r.is_required ? 'outstanding' : 'waived') : status
      onboarding_items.push({
        id: ob(iid++),
        tenant_id: app.tenant_id,
        application_id: app.id,
        requirement_key: r.key,
        status: itemStatus,
        document_id: documentId,
        reviewed_by: by,
        reviewed_at: by ? iso(age) : null,
        created_at: iso(age + 2),
        updated_at: iso(age),
      })
    }
  }
  const [acaciaApp, coastlineApp, highveldApp] = brokerage_applications
  addItems(acaciaApp, 'accepted', U.reviewer, 42, U.acaciaOwner, 'accepted')
  addItems(coastlineApp, 'accepted', U.reviewer, 27, U.coastlineOwner, 'accepted')
  addItems(highveldApp, 'submitted', null, 2, U.highveldOwner, 'uploaded')

  let eid = 900
  const event = (application_id: string, tenant_id: string, from: ApplicationStatus | null, to: ApplicationStatus, actor: string, actor_type: OnboardingStatusEvent['actor_type'], age: number, reason: string | null = null): OnboardingStatusEvent => ({
    id: ob(eid++),
    tenant_id,
    application_id,
    from_status: from,
    to_status: to,
    reason,
    actor_id: actor,
    actor_type,
    created_at: iso(age),
  })
  const onboarding_status_events: OnboardingStatusEvent[] = [
    event(A.acacia, O.acacia, null, 'draft', U.acaciaOwner, 'user', 50),
    event(A.acacia, O.acacia, 'draft', 'submitted', U.acaciaOwner, 'user', 46),
    event(A.acacia, O.acacia, 'submitted', 'under_review', U.reviewer, 'platform', 45),
    event(A.acacia, O.acacia, 'under_review', 'approved', U.reviewer, 'platform', 42),
    event(A.acacia, O.acacia, 'approved', 'active', U.platformAdmin, 'platform', 40),
    event(A.coastline, O.coastline, null, 'draft', U.coastlineOwner, 'user', 35),
    event(A.coastline, O.coastline, 'draft', 'submitted', U.coastlineOwner, 'user', 31),
    event(A.coastline, O.coastline, 'submitted', 'under_review', U.reviewer, 'platform', 30),
    event(A.coastline, O.coastline, 'under_review', 'approved', U.reviewer, 'platform', 27),
    event(A.coastline, O.coastline, 'approved', 'active', U.platformAdmin, 'platform', 25),
    event(A.highveld, O.highveld, null, 'draft', U.highveldOwner, 'user', 9),
    event(A.highveld, O.highveld, 'draft', 'submitted', U.highveldOwner, 'user', 2),
    event(A.umhlanga, O.umhlanga, null, 'draft', U.platformAdmin, 'platform', 1, 'Owner invited by B-Covered'),
  ]

  const brokerage_invitations: OnboardingTables['brokerage_invitations'] = [
    {
      id: OB.invitations.umhlanga,
      tenant_id: O.umhlanga,
      email: DEMO_INVITE_EMAIL,
      role: 'brokerage_owner',
      kind: 'owner',
      token_hash: hashToken(DEMO_INVITE_TOKEN),
      expires_at: new Date(now + 7 * 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      revoked_at: null,
      invited_by: U.platformAdmin,
      created_at: iso(1),
    },
    {
      id: OB.invitations.coastline,
      tenant_id: O.coastline,
      email: 'thandiwe.zulu@coastlinerisk.example.demo',
      role: 'brokerage_owner',
      kind: 'owner',
      token_hash: hashToken('accepted-coastline-invitation'),
      expires_at: iso(29),
      accepted_at: iso(35),
      accepted_by: U.coastlineOwner,
      revoked_at: null,
      invited_by: U.platformAdmin,
      created_at: iso(36),
    },
  ]

  // ------------------------------------------------------------------ products, terms and insurer access
  let xid = 1000
  const modules = (tenant_id: string, list: ProductModule[], status: 'declared' | 'enabled'): OnboardingTables['organisation_product_modules'] =>
    list.map((module) => ({ id: ob(xid++), tenant_id, module, status, decided_by: status === 'enabled' ? U.platformAdmin : null, decided_at: status === 'enabled' ? ts : null, created_at: ts, updated_at: ts }))
  const terms = (tenant_id: string, package_key: string, by: string, age: number): OnboardingTables['organisation_commercial_terms'][number] => ({
    id: ob(xid++),
    tenant_id,
    package_key,
    terms: { version: TERMS_VERSION, billing: 'monthly in advance', note: 'Indicative until B-Covered agrees its commercial model' },
    status: 'agreed',
    agreed_by: by,
    agreed_at: iso(age),
    created_at: iso(age),
  })
  const access = (tenant_id: string, insurer_id: string, product_module: ProductModule, status: InsurerAccess['status'], code: string | null, integration: string | null, reason: string | null = null): InsurerAccess => ({
    id: ob(xid++),
    tenant_id,
    insurer_id,
    product_module,
    intermediary_code: code,
    mandate: code ? { binding_authority: false, classes: product_module === 'commercial' ? ['property', 'liability'] : ['motor', 'household'] } : {},
    integration_key: integration,
    status,
    status_reason: reason,
    last_test_at: status === 'enabled' ? ts : null,
    last_test_result: status === 'enabled' ? 'passed' : null,
    enabled_by: status === 'enabled' ? U.platformAdmin : null,
    enabled_at: status === 'enabled' ? ts : null,
    created_at: ts,
    updated_at: ts,
  })
  const insurer_access: InsurerAccess[] = [
    access(refs.bcoveredTenant, I.protea, 'personal_lines', 'enabled', 'BCV-PR-0001', 'demo_adapter'),
    access(refs.bcoveredTenant, I.karoo, 'personal_lines', 'enabled', 'BCV-KM-0001', 'demo_adapter'),
    access(refs.bcoveredTenant, I.baobab, 'personal_lines', 'enabled', 'BCV-BG-0001', 'demo_adapter'),
    access(O.acacia, I.protea, 'personal_lines', 'enabled', 'ACA-PR-1001', 'demo_adapter'),
    access(O.acacia, I.karoo, 'personal_lines', 'awaiting_credentials', 'ACA-KM-2207', 'demo_adapter', 'Waiting for Karoo Mutual to issue API credentials'),
    access(O.acacia, I.baobab, 'commercial', 'not_configured', null, null),
    access(O.coastline, I.baobab, 'personal_lines', 'enabled', 'CRP-BG-3310', 'demo_adapter'),
    access(O.coastline, I.fynbos, 'individual_life', 'awaiting_credentials', 'CRP-FL-0090', null, 'No Fynbos Life integration exists yet; quotes are prepared on the insurer portal'),
    access(O.highveld, I.protea, 'personal_lines', 'not_configured', 'HVA-PR-7781', null),
  ]
  const acaciaProtea = insurer_access[3]

  const tables: OnboardingTables = {
    organisation_memberships,
    platform_staff: [
      { id: ob(1100), user_id: U.platformAdmin, role: 'platform_admin', granted_by: null, revoked_at: null, created_at: ts },
      { id: ob(1101), user_id: U.reviewer, role: 'onboarding_reviewer', granted_by: U.platformAdmin, revoked_at: null, created_at: ts },
    ],
    auth_identities: [],
    brokerage_invitations,
    brokerage_applications,
    onboarding_status_events,
    onboarding_requirements: REQUIREMENTS.map((r) => ({ ...r })),
    documents,
    storage_objects,
    document_links: [],
    onboarding_items,
    onboarding_feedback: [],
    onboarding_internal_notes: [],
    extracted_field_proposals: [],
    organisation_product_modules: [
      ...modules(refs.bcoveredTenant, ['personal_lines', 'commercial', 'individual_life', 'group_risk', 'retirement'], 'enabled'),
      ...modules(O.acacia, ['personal_lines', 'commercial'], 'enabled'),
      ...modules(O.coastline, ['personal_lines', 'individual_life'], 'enabled'),
      ...modules(O.highveld, ['personal_lines', 'individual_life'], 'declared'),
    ],
    organisation_commercial_terms: [
      terms(refs.bcoveredTenant, 'growth', refs.bcoveredOwner, 60),
      terms(O.acacia, 'growth', U.acaciaOwner, 47),
      terms(O.coastline, 'network', U.coastlineOwner, 32),
      terms(O.highveld, 'starter', U.highveldOwner, 3),
    ],
    insurer_access,
    insurer_access_credentials: [
      { id: ob(1200), tenant_id: O.acacia, insurer_access_id: acaciaProtea.id, vault_secret_id: ob(1201), masked_hint: '••••a7f2', rotated_at: ts, created_at: ts },
    ],
    vault_secrets: [{ id: ob(1201), tenant_id: O.acacia, secret: 'demo-secret-acacia-protea-a7f2', created_at: ts }],
  }

  let aid = 1300
  const audit = (tenant_id: string, action: string, actor: string, entity_table: string, entity_id: string, age: number): AuditEvent => ({
    id: ob(aid++),
    tenant_id,
    actor_type: 'user',
    actor_id: actor,
    action,
    entity_table,
    entity_id,
    before: null,
    after: null,
    job_id: null,
    actor_scope: 'platform',
    created_at: iso(age),
  })

  return {
    organisations,
    app_users,
    customers,
    policies,
    leads,
    audit_events: [
      audit(O.acacia, 'brokerage.activated', U.platformAdmin, 'organisations', O.acacia, 40),
      audit(O.coastline, 'brokerage.activated', U.platformAdmin, 'organisations', O.coastline, 25),
      audit(O.umhlanga, 'invitation.created', U.platformAdmin, 'brokerage_invitations', OB.invitations.umhlanga, 1),
    ],
    tables,
  }
}
