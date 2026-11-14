// Demo Studio sample data for broker onboarding: extra fictional brokerages at every review stage, sample client-book
// files and sample supporting documents. Fixed ids, so loading twice adds nothing; Reset demo data removes them.
import { documentFixture, SAMPLE_FACTS, toBase64, type FixtureFacts } from '../db/onboardingSeed'
import type { ApplicationStatus, BrokerageType, ItemStatus, MemberRole, ProductModule } from '../db/onboardingSchema'
import { db, identity, Repo } from '../db/store'
import { hashPayload } from '../lib/hash'
import { REQUIREMENTS } from '../onboarding/config'
import { syncItems } from '../onboarding/domain'

const cid = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const REVIEWER = 'b0000000-0000-4000-8000-000000000102'

export interface SampleBrokerage {
  key: string
  name: string
  legal_name: string
  type: BrokerageType
  modules: ProductModule[]
  status: ApplicationStatus
  owner: { name: string; email: string }
  rep: { name: string; email: string } | null
  facts: Omit<FixtureFacts, 'legal_name'>
  phone: string
  package_key: string
  /** Requirement keys left outstanding (drafts only). */
  missing?: string[]
  /** One item sent back to the brokerage, with the reviewer's feedback and internal note. */
  correction?: { requirement: string; feedback: string; note: string }
  decline_reason?: string
  summary: string
}

export const SAMPLE_BROKERAGES: SampleBrokerage[] = [
  {
    key: 'karoo-gateway',
    name: 'Karoo Gateway Brokers',
    legal_name: 'Karoo Gateway Brokers (Pty) Ltd',
    type: 'sole_proprietor',
    modules: ['personal_lines'],
    status: 'draft',
    owner: { name: 'Lwazi Ndaba', email: 'lwazi@karoogateway.example.demo' },
    rep: null,
    facts: { registration_number: '2021/118204/07', fsp_number: '52018', key_individual: 'Lwazi Ndaba', address: '14 Donkin Street, Beaufort West, 6970', compliance_officer: 'Moja Compliance (Pty) Ltd' },
    phone: '0235550401',
    package_key: 'starter',
    missing: ['doc_fsp_licence', 'doc_pi_cover', 'doc_fica', 'commercial_terms', 'profile_key_individual'],
    summary: 'Draft, about half complete: FSP licence, PI schedule and FICA still to upload, terms not agreed.',
  },
  {
    key: 'bay-risk',
    name: 'Bay Risk Advisers',
    legal_name: 'Bay Risk Advisers (Pty) Ltd',
    type: 'independent',
    modules: ['personal_lines', 'commercial'],
    status: 'under_review',
    owner: { name: 'Charlene Jacobs', email: 'charlene@bayrisk.example.demo' },
    rep: { name: 'Themba Mthethwa', email: 'themba@bayrisk.example.demo' },
    facts: { registration_number: '2015/330917/07', fsp_number: '47720', key_individual: 'Charlene Jacobs', address: '22 Main Road, Gqeberha, 6001', compliance_officer: 'Coastal Compliance CC' },
    phone: '0415550402',
    package_key: 'growth',
    summary: 'Under review by Pieter Botha: every item submitted, none decided yet.',
  },
  {
    key: 'limpopo-commercial',
    name: 'Limpopo Commercial Brokers',
    legal_name: 'Limpopo Commercial Brokers (Pty) Ltd',
    type: 'independent',
    modules: ['commercial', 'group_risk'],
    status: 'information_required',
    owner: { name: 'Tshepo Maluleke', email: 'tshepo@limpopocommercial.example.demo' },
    rep: { name: 'Rendani Netshitenzhe', email: 'rendani@limpopocommercial.example.demo' },
    facts: { registration_number: '2011/090412/07', fsp_number: '41188', key_individual: 'Tshepo Maluleke', address: '5 Thabo Mbeki Street, Polokwane, 0699', compliance_officer: 'Northern Compliance Partners' },
    phone: '0155550403',
    package_key: 'growth',
    correction: {
      requirement: 'doc_life_mandate',
      feedback: 'The intermediary agreement is not signed by the insurer. Upload the countersigned copy.',
      note: 'Called the insurer: agreement was countersigned in October, broker uploaded the draft.',
    },
    summary: 'Information required: the long-term intermediary agreement was sent back for a countersigned copy.',
  },
  {
    key: 'garden-route',
    name: 'Garden Route Cover',
    legal_name: 'Garden Route Cover (Pty) Ltd',
    type: 'independent',
    modules: ['personal_lines', 'individual_life'],
    status: 'approved',
    owner: { name: 'Pieter-Jan de Villiers', email: 'pj@gardenroutecover.example.demo' },
    rep: { name: 'Nokuthula Sithole', email: 'nokuthula@gardenroutecover.example.demo' },
    facts: { registration_number: '2017/552061/07', fsp_number: '49105', key_individual: 'Pieter-Jan de Villiers', address: '9 York Street, George, 6529', compliance_officer: 'Southern Cape Compliance' },
    phone: '0445550404',
    package_key: 'growth',
    summary: 'Approved and waiting for the separate activation step.',
  },
  {
    key: 'vaal-benefits',
    name: 'Vaal Benefit Consultants',
    legal_name: 'Vaal Benefit Consultants (Pty) Ltd',
    type: 'corporate_broker',
    modules: ['group_risk', 'retirement'],
    status: 'declined',
    owner: { name: 'Mandla Zwane', email: 'mandla@vaalbenefits.example.demo' },
    rep: { name: 'Lerato Mofokeng', email: 'lerato@vaalbenefits.example.demo' },
    facts: { registration_number: '2019/771530/07', fsp_number: '50311', key_individual: 'Mandla Zwane', address: '31 Voortrekker Street, Vereeniging, 1930', compliance_officer: 'Mandla Zwane' },
    phone: '0165550405',
    package_key: 'network',
    decline_reason: 'The declared FSP licence does not include pension fund benefits, which the retirement module requires. Reapply once the licence category is in place.',
    summary: 'Declined with a reason the brokerage can see.',
  },
]

const PATH: ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'information_required', 'approved']

/** Adds the sample brokerages that are not there yet. Returns how many were added. */
export function loadOnboardingSamples(): { added: number; total: number } {
  let added = 0
  SAMPLE_BROKERAGES.forEach((s, i) => {
    const orgId = cid(i * 100 + 1)
    if (identity.organisation(orgId)) return
    db.transaction(() => createSample(s, orgId, i))
    added++
  })
  return { added, total: SAMPLE_BROKERAGES.length }
}

function createSample(s: SampleBrokerage, orgId: string, i: number) {
  // Seeds reviewer notes too, which only a platform repository may write.
  const repo = new Repo(orgId, { platform: true })
  const ts = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  const ownerId = cid(i * 100 + 2)
  const repId = cid(i * 100 + 3)
  const appId = cid(i * 100 + 4)
  const closed = s.status === 'declined'
  repo.insert('organisations', {
    id: orgId,
    name: s.name,
    slug: s.key,
    fsp_number: s.facts.fsp_number,
    fsp_verified: false,
    is_demo: true,
    kind: 'brokerage',
    legal_name: s.legal_name,
    trading_name: s.name,
    registration_number: s.facts.registration_number,
    brokerage_type: s.type,
    lifecycle_status: closed ? 'closed' : 'onboarding',
    status_reason: closed ? 'Application declined' : null,
    activated_at: null,
    suspended_at: null,
    retention_until: closed ? new Date(Date.now() + 5 * 365 * 86_400_000).toISOString().slice(0, 10) : null,
  })
  const person = (id: string, p: { name: string; email: string }, role: MemberRole) => {
    repo.insert('app_users', { id, email: p.email, full_name: p.name, role: role === 'brokerage_owner' ? 'manager' : 'broker', customer_id: null, active_organisation_id: orgId })
    repo.insert('organisation_memberships', { user_id: id, role, status: 'active', invited_by: role === 'brokerage_owner' ? null : ownerId })
  }
  person(ownerId, s.owner, 'brokerage_owner')
  if (s.rep) person(repId, s.rep, 'representative')

  const draft = s.status === 'draft'
  const missingKey = (k: string) => draft && s.missing?.includes(k)
  const sections = {
    organisation: {
      legal_name: s.legal_name,
      trading_name: s.name,
      registration_number: s.facts.registration_number,
      vat_number: null,
      brokerage_type: s.type,
      registered_address: s.facts.address,
      operating_address: null,
      primary_contact_name: s.owner.name,
      primary_contact_email: s.owner.email,
      primary_contact_phone: s.phone,
      finance_contact_email: null,
    },
    profile: {
      fsp_number: s.facts.fsp_number,
      licence_categories: s.modules.some((m) => m === 'individual_life' || m === 'group_risk') ? ['st_personal', 'lt_b1'] : ['st_personal', 'st_commercial'],
      key_individual: missingKey('profile_key_individual') ? null : s.facts.key_individual,
      compliance_officer: missingKey('profile_key_individual') ? null : s.facts.compliance_officer,
      service_scope: null,
    },
    products: { modules: s.modules },
    migration: { choice: 'import', source_system: 'Spreadsheet', estimated_clients: '350', transfer_attestation: true },
  }
  const reached = closed ? 2 : PATH.indexOf(s.status)
  const app = repo.insert('brokerage_applications', {
    id: appId,
    route: 'application',
    invitation_id: null,
    status: 'draft',
    status_reason: null,
    brokerage_type: s.type,
    sections,
    current_section: draft ? 'documents' : 'readiness',
    declared_modules: s.modules,
    migration_choice: 'import',
    assigned_reviewer: reached >= 2 ? REVIEWER : null,
    revision: reached >= 1 ? 1 : 0,
    submitted_at: reached >= 1 ? ts(6) : null,
    approved_at: s.status === 'approved' ? ts(1) : null,
    approved_by: s.status === 'approved' ? REVIEWER : null,
    activated_at: null,
    activated_by: null,
  })
  for (const module of s.modules) {
    repo.insert('organisation_product_modules', { module, status: s.status === 'approved' ? 'approved' : 'declared', decided_by: s.status === 'approved' ? REVIEWER : null, decided_at: s.status === 'approved' ? ts(1) : null })
  }
  if (!missingKey('commercial_terms')) {
    repo.insert('organisation_commercial_terms', { package_key: s.package_key, terms: { version: 'platform-terms-draft-2026-11', note: 'Indicative until B-Covered agrees its commercial model' }, status: 'agreed', agreed_by: ownerId, agreed_at: ts(7) })
  }
  repo.insert('insurer_access', {
    insurer_id: 'a0000000-0000-4000-8000-000000000101',
    product_module: s.modules.includes('personal_lines') ? 'personal_lines' : s.modules[0],
    intermediary_code: `${s.key.slice(0, 3).toUpperCase()}-PR-${4400 + i}`,
    mandate: {},
    integration_key: s.modules.includes('personal_lines') ? 'demo_adapter' : null,
    status: 'not_configured',
    status_reason: null,
    last_test_at: null,
    last_test_result: null,
    enabled_by: null,
    enabled_at: null,
  })

  // Checklist items from the configured requirements, then one fixture document per required document.
  syncItems(repo, app)
  const facts: FixtureFacts = { ...s.facts, legal_name: s.legal_name }
  for (const item of repo.list('onboarding_items', (x) => x.application_id === appId)) {
    const req = REQUIREMENTS.find((r) => r.key === item.requirement_key)
    if (req?.kind !== 'document' || missingKey(req.key)) continue
    const fixture = documentFixture(req.key, facts)
    if (!fixture) continue
    const docId = cid(i * 100 + 10 + repo.list('documents').length)
    const path = `${orgId}/brokerage_applications/${appId}/${docId}-${fixture.file_name}`
    repo.insert('documents', {
      id: docId,
      owner_table: 'brokerage_applications',
      owner_id: appId,
      doc_type: req.key,
      file_name: fixture.file_name,
      mime_type: 'text/plain',
      file_size: fixture.text.length,
      sha256: hashPayload(fixture.text),
      storage_path: path,
      review_status: s.status === 'approved' ? 'accepted' : reached >= 2 ? 'in_review' : 'uploaded',
      data_origin: 'demo',
      uploaded_by: ownerId,
    })
    repo.insert('storage_objects', { path, mime_type: 'text/plain', size: fixture.text.length, content_base64: toBase64(fixture.text) })
    repo.update('onboarding_items', item.id, { document_id: docId })
  }
  syncItems(repo, repo.require('brokerage_applications', appId))

  // Reviewer decisions for the stage this sample has reached.
  const decide = (status: ItemStatus) => {
    for (const item of repo.list('onboarding_items', (x) => x.application_id === appId)) {
      const required = REQUIREMENTS.find((r) => r.key === item.requirement_key)?.is_required
      const next: ItemStatus = item.status === 'outstanding' ? (required ? 'outstanding' : 'waived') : status
      repo.update('onboarding_items', item.id, { status: next, reviewed_by: REVIEWER, reviewed_at: ts(1) })
    }
  }
  if (s.status === 'approved') decide('accepted')
  if (s.correction) {
    decide('accepted')
    const item = repo.find('onboarding_items', (x) => x.application_id === appId && x.requirement_key === s.correction!.requirement)
    if (item) {
      repo.update('onboarding_items', item.id, { status: 'correction_requested' })
      if (item.document_id) repo.update('documents', item.document_id, { review_status: 'rejected' })
      repo.insert('onboarding_feedback', { application_id: appId, item_id: item.id, body: s.correction.feedback, author_id: REVIEWER, resolved_at: null })
      repo.insert('onboarding_internal_notes', { application_id: appId, item_id: item.id, body: s.correction.note, author_id: REVIEWER })
    }
  }

  // Status history up to the sample's stage.
  const steps: Array<[ApplicationStatus | null, ApplicationStatus, string, 'user' | 'platform', string | null]> = [[null, 'draft', ownerId, 'user', 'Applied through Join as a broker']]
  if (reached >= 1) steps.push(['draft', 'submitted', ownerId, 'user', null])
  if (reached >= 2) steps.push(['submitted', 'under_review', REVIEWER, 'platform', null])
  if (s.status === 'information_required') steps.push(['under_review', 'information_required', REVIEWER, 'platform', 'Countersigned intermediary agreement needed'])
  if (s.status === 'approved') steps.push(['under_review', 'approved', REVIEWER, 'platform', 'Application approved. Platform approval is not regulatory authorisation.'])
  if (closed) steps.push(['under_review', 'declined', REVIEWER, 'platform', s.decline_reason ?? null])
  steps.forEach(([from, to, actor, type, reason]) => {
    repo.insert('onboarding_status_events', { application_id: appId, from_status: from, to_status: to, reason, actor_id: actor, actor_type: type })
    repo.insert('audit_events', {
      actor_type: 'user',
      actor_id: actor,
      action: `onboarding.${to}`,
      entity_table: 'brokerage_applications',
      entity_id: appId,
      before: from ? { status: from } : null,
      after: { status: to, reason },
      job_id: null,
      actor_scope: type === 'platform' ? 'platform' : 'tenant',
    })
  })
  repo.update('brokerage_applications', appId, { status: s.status, status_reason: steps[steps.length - 1][4] })
}

// ------------------------------------------------------------------ sample files

/**
 * Sample client book for Acacia Cover Brokers: 12 clients, of which two have errors (bad email, missing type), one
 * repeats a reference and one is a possible duplicate of Acacia's existing client Zodwa Nkosi.
 */
export const SAMPLE_CLIENTS_CSV = [
  'Client No,Type,Name,Email,Mobile,ID Number,Province,Status',
  'ACA-1001,personal,Kabelo Dlamini,kabelo.dlamini@example.demo,0825551001,8503125800081,Gauteng,active',
  'ACA-1002,personal,Megan Smith,megan.smith@example,0825551002,,Western Cape,active',
  'ACA-1003,personal,Zodwa Nkosi,zodwa.nkosi@example.demo,0825550301,,Gauteng,active',
  'ACA-1004,commercial,Highveld Panelbeaters CC,accounts@hvpanel.example.demo,0115551004,2009/112233/23,Gauteng,active',
  'ACA-1005,personal,Johan Botha,johan.botha@example.demo,0835551005,7808015800082,Free State,active',
  'ACA-1006,,Ayesha Patel,ayesha.patel@example.demo,0845551006,,KwaZulu-Natal,prospect',
  'ACA-1007,personal,Sipho Mahlangu,sipho.mahlangu@example.demo,0725551007,9001015800083,Mpumalanga,active',
  'ACA-1008,commercial,Magalies Fresh Produce (Pty) Ltd,office@magaliesfresh.example.demo,0125551008,2016/440011/07,North West,active',
  'ACA-1009,personal,Karin van Zyl,karin.vanzyl@example.demo,0615551009,,Western Cape,lapsed',
  'ACA-1004,commercial,Highveld Panelbeaters (duplicate row),accounts@hvpanel.example.demo,0115551004,,Gauteng,active',
  'ACA-1011,personal,Neo Molefe,neo.molefe@example.demo,0795551011,9507075800084,Gauteng,active',
  'ACA-1012,personal,Fatima Davids,fatima.davids@example.demo,0825551012,,Western Cape,active',
].join('\n')

/** Policies for the sample clients. One names an insurer not on the platform; one references a client not imported. */
export const SAMPLE_POLICIES_CSV = [
  'Policy Ref,Client No,Insurer,Line,Policy Number,Status,Premium,Frequency,Inception Date',
  'ACA-P-5001,ACA-1001,Protea Insure,personal,PRO-MV-501001,in_force,1185.00,monthly,2024-03-01',
  'ACA-P-5002,ACA-1004,Baobab General,commercial,BG-CP-502004,in_force,6420.50,monthly,2023-07-01',
  'ACA-P-5003,ACA-1005,Karoo Mutual,personal,KM-HH-503005,in_force,540.00,monthly,2025-01-15',
  'ACA-P-5004,ACA-1007,Protea Insure,personal,PRO-MV-504007,lapsed,980.00,monthly,2022-11-01',
  'ACA-P-5005,ACA-1008,Unknown Underwriters Ltd,commercial,UU-0001,in_force,3200.00,monthly,2024-05-01',
  'ACA-P-5006,ACA-9999,Protea Insure,personal,PRO-MV-506999,in_force,870.00,monthly,2024-08-01',
  'ACA-P-5007,ACA-1011,Baobab General,personal,BG-HH-507011,in_force,410.00,monthly,2025-04-01',
].join('\n')

export interface SampleFile {
  file_name: string
  label: string
  detail: string
  mime: string
  content: string
}

export function sampleFiles(): SampleFile[] {
  const docs = ['doc_cipc', 'doc_fsp_licence', 'doc_pi_cover', 'doc_fica', 'doc_life_mandate', 'doc_compliance_report'].flatMap((key) => {
    const f = documentFixture(key, SAMPLE_FACTS)
    return f ? [{ file_name: `Umhlanga ${f.file_name}`, label: f.file_name.replace('.txt', ''), detail: 'Text document for Umhlanga Brokers; Russ reads its labelled lines', mime: 'text/plain', content: f.text }] : []
  })
  return [
    { file_name: 'acacia-sample-clients.csv', label: 'Sample client book (12 clients)', detail: 'Upload as Anele Mahlangu (Acacia). Includes 2 errors, 1 repeated reference and 1 possible duplicate', mime: 'text/csv', content: SAMPLE_CLIENTS_CSV },
    { file_name: 'acacia-sample-policies.csv', label: 'Sample policies (7 policies)', detail: 'Import after the clients. Includes an unknown insurer and an unknown client reference', mime: 'text/csv', content: SAMPLE_POLICIES_CSV },
    ...docs,
  ]
}
