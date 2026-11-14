import { beforeEach, describe, expect, it } from 'vitest'
import { getConversation, getSessionUser, listLeads, principal, sendMessage, startConversation, type Auth } from '../api'
import { TENANT_ID } from '../db/seed'
import { russOnboardingTurn } from '../agents/onboardingRuss'
import {
  attestClientBook,
  clientBookErrorReport,
  commitClientBook,
  correctClientBookRow,
  getClientBookImport,
  resolveClientBookDuplicate,
  uploadClientBook,
} from '../clientBookApi'
import { DEMO_INVITE_EMAIL, DEMO_INVITE_TOKEN, OB } from '../db/onboardingSeed'
import { loadOnboardingSamples, sampleFiles } from '../demo/onboardingSamples'
import { db, Repo } from '../db/store'
import { ToolError } from '../lib/errors'
import {
  acceptInvitation,
  activateBrokerage,
  agreeTerms,
  approveApplication,
  createOwnerInvitation,
  createTeamInvitation,
  decideItem,
  enableInsurerAccess,
  getDocumentLink,
  getInvitation,
  getOnboarding,
  getOnboardingReview,
  listInsurerAccess,
  listOnboardingQueue,
  openDocumentLink,
  reinstateBrokerage,
  removeMember,
  requestInformation,
  saveSection,
  setCurrentSection,
  signUp,
  startApplication,
  startReview,
  submitApplication,
  submitInsurerCredentials,
  suspendBrokerage,
  switchWorkspace,
  testInsurerAccess,
  useSampleDocument,
} from '../onboardingApi'
import { invokeTool } from '../tools/registry'

const U = OB.users
const as = (userId: string): Auth => ({ userId })
const admin = as(U.platformAdmin)
const reviewer = as(U.reviewer)
const acaciaOwner = as(U.acaciaOwner)
const acaciaRep = as(U.acaciaRep)
const acaciaReadOnly = as(U.acaciaReadOnly)
const shared = as(U.sharedRep)
const coastlineCompliance = as(U.coastlineCompliance)
const kagiso = as(U.highveldOwner)

const forbidden = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof Error && e.name === 'NotFoundError') return 'not_found'
    expect(e).toBeInstanceOf(ToolError)
    return (e as ToolError).code
  }
  throw new Error('expected the call to be refused')
}

const tool = <T,>(auth: Auth, name: string, input: unknown) => {
  const p = principal(auth)
  return invokeTool<T>(name, input, { repo: p.repo, actor: p.actor })
}

beforeEach(() => db.reset())

describe('brokerage isolation', () => {
  it('scopes records, search and direct lookups to the active brokerage', () => {
    const acacia = principal(acaciaOwner).repo
    expect(acacia.list('customers').map((c) => c.tenant_id)).toEqual(Array(5).fill(OB.orgs.acacia))
    expect(acacia.get('customers', OB.customers.coastlineAhmed)).toBeUndefined()
    // The same person is a client of both brokerages: each brokerage only finds its own record.
    const found = tool<Array<{ id: string }>>(acaciaRep, 'customer.search', { query: 'zodwa' })
    expect(found.map((c) => c.id)).toEqual([OB.customers.acaciaZodwa])
    expect(acacia.list('organisations').map((o) => o.id)).toEqual([OB.orgs.acacia])
  })

  it('refuses another brokerage’s documents and links issued to someone else', () => {
    const highveldDoc = new Repo(OB.orgs.highveld).list('documents')[0]
    expect(forbidden(() => getDocumentLink(acaciaOwner, { document_id: highveldDoc.id }))).toBe('not_found')
    const link = getDocumentLink(kagiso, { document_id: highveldDoc.id })
    expect(openDocumentLink(kagiso, { token: link.token }).content_base64).toBeTruthy()
    expect(forbidden(() => openDocumentLink(acaciaOwner, { token: link.token }))).toBe('forbidden')
  })

  it('keeps Russ inside the caller’s brokerage', () => {
    const reply = russOnboardingTurn(acaciaOwner, { message: 'Who is on my team?' }).reply
    expect(reply).toContain('4 active member(s)')
    expect(russOnboardingTurn(kagiso, { message: 'hello' }).reply).toContain('Highveld Advisory')
    expect(russOnboardingTurn(kagiso, { message: 'hello' }).reply).not.toContain('Acacia')
  })

  it('hides internal reviewer notes from brokerage repositories and business data from platform repositories', () => {
    expect(forbidden(() => principal(kagiso).repo.list('onboarding_internal_notes'))).toBe('forbidden')
    expect(forbidden(() => new Repo(OB.orgs.acacia, { operational: false, platform: true }).list('customers'))).toBe('forbidden')
    expect(JSON.stringify(getOnboarding(kagiso))).not.toContain('internal_notes')
  })
})

describe('invitations', () => {
  it('accepts a valid invitation once, for the invited email only', () => {
    expect(getInvitation({ token: DEMO_INVITE_TOKEN }).state).toBe('valid')
    const other = signUp({ email: 'someone.else@example.demo', password: 'longpassword', full_name: 'Someone Else' })
    expect(forbidden(() => acceptInvitation(as(other.user_id), { token: DEMO_INVITE_TOKEN }))).toBe('forbidden')
    const owner = signUp({ email: DEMO_INVITE_EMAIL, password: 'longpassword', full_name: 'Ayesha Govender' })
    const out = acceptInvitation(as(owner.user_id), { token: DEMO_INVITE_TOKEN })
    expect(out).toMatchObject({ organisation_id: OB.orgs.umhlanga, home: '/onboarding' })
    expect(getSessionUser(as(owner.user_id))?.member_role).toBe('brokerage_owner')
    expect(getInvitation({ token: DEMO_INVITE_TOKEN }).state).toBe('used')
    expect(forbidden(() => acceptInvitation(as(owner.user_id), { token: DEMO_INVITE_TOKEN }))).toBe('forbidden')
  })

  it('refuses an expired invitation', () => {
    const created = createOwnerInvitation(admin, { brokerage_name: 'Karkloof Brokers', email: 'owner@karkloof.example.demo' })
    new Repo(created.organisation_id).update('brokerage_invitations', created.invitation.id, { expires_at: new Date(Date.now() - 1000).toISOString() })
    const owner = signUp({ email: 'owner@karkloof.example.demo', password: 'longpassword', full_name: 'Karkloof Owner' })
    expect(getInvitation({ token: created.token }).state).toBe('expired')
    expect(forbidden(() => acceptInvitation(as(owner.user_id), { token: created.token }))).toBe('forbidden')
  })

  it('only lets platform administrators invite brokerage owners', () => {
    expect(forbidden(() => createOwnerInvitation(reviewer, { brokerage_name: 'X Brokers', email: 'x@example.demo' }))).toBe('forbidden')
    expect(forbidden(() => createOwnerInvitation(acaciaOwner, { brokerage_name: 'X Brokers', email: 'x@example.demo' }))).toBe('forbidden')
  })
})

describe('applications', () => {
  it('lets an applicant leave and resume where they were', () => {
    const user = signUp({ email: 'founder@newbroker.example.demo', password: 'longpassword', full_name: 'New Founder' })
    const auth = as(user.user_id)
    const started = startApplication(auth, { brokerage_name: 'New Broker Co', brokerage_type: 'independent' })
    saveSection(auth, { section: 'organisation', values: { legal_name: 'New Broker Co (Pty) Ltd', registration_number: '2020/1' } })
    setCurrentSection(auth, { section: 'profile' })
    const again = startApplication(auth, { brokerage_name: 'Ignored' })
    expect(again).toMatchObject({ application_id: started.application_id, resumed: true })
    const view = getOnboarding(auth)
    expect(view.application.current_section).toBe('profile')
    expect(view.application.sections.organisation?.legal_name).toBe('New Broker Co (Pty) Ltd')
    expect(view.field_errors.organisation?.registration_number).toContain('CIPC')
    expect(view.application.status).toBe('draft')
    expect(view.readiness.can_submit).toBe(false)
    expect(forbidden(() => submitApplication(auth))).toBe('validation')
  })

  it('filters requirements by product module', () => {
    const user = signUp({ email: 'life@broker.example.demo', password: 'longpassword', full_name: 'Life Founder' })
    const auth = as(user.user_id)
    startApplication(auth, { brokerage_name: 'Life Broker', brokerage_type: 'sole_proprietor' })
    const keys = () => getOnboarding(auth).readiness.checklist.map((c) => c.requirement_key)
    expect(keys()).not.toContain('doc_life_mandate')
    expect(keys()).not.toContain('doc_compliance_report')
    saveSection(auth, { section: 'products', values: { modules: ['individual_life'] } })
    expect(keys()).toContain('doc_life_mandate')
  })
})

describe('review, correction and activation', () => {
  const highveld = OB.applications.highveld
  const itemFor = (key: string) => getOnboardingReview(reviewer, { application_id: highveld }).readiness.checklist.find((c) => c.requirement_key === key)!

  it('lists submitted applications for platform staff only', () => {
    const row = listOnboardingQueue(reviewer).find((r) => r.application_id === highveld)!
    expect(row).toMatchObject({ brokerage: 'Highveld Advisory', status: 'submitted', owner: { name: 'Kagiso Molefe' } })
    expect(forbidden(() => listOnboardingQueue(acaciaOwner))).toBe('forbidden')
  })

  it('runs correction, resubmission, approval and a separate activation', () => {
    expect(forbidden(() => activateBrokerage(reviewer, { application_id: highveld }))).toBe('conflict')
    startReview(reviewer, { application_id: highveld })
    expect(forbidden(() => approveApplication(reviewer, { application_id: highveld }))).toBe('conflict')

    decideItem(reviewer, { item_id: itemFor('doc_pi_cover').item_id, decision: 'request_correction', feedback: 'The schedule has expired; upload the current one.', internal_note: 'Checked with the insurer' })
    requestInformation(reviewer, { application_id: highveld, reason: 'Professional indemnity schedule needs updating' })

    const mine = getOnboarding(kagiso)
    expect(mine.application.status).toBe('information_required')
    expect(mine.feedback[0].body).toContain('expired')
    expect(mine.readiness.can_submit).toBe(false)
    expect(JSON.stringify(mine)).not.toContain('Checked with the insurer')

    useSampleDocument(kagiso, { requirement_key: 'doc_pi_cover' })
    const resubmitted = submitApplication(kagiso)
    expect(resubmitted).toMatchObject({ status: 'submitted', revision: 2 })

    startReview(reviewer, { application_id: highveld })
    for (const c of getOnboardingReview(reviewer, { application_id: highveld }).readiness.checklist) {
      decideItem(reviewer, { item_id: c.item_id, decision: c.status === 'outstanding' ? 'waive' : 'accept' })
    }
    approveApplication(reviewer, { application_id: highveld })
    // Approval alone grants no production access.
    expect(principal(kagiso).organisation?.lifecycle_status).toBe('onboarding')
    expect(forbidden(() => listLeads(kagiso))).toBe('forbidden')

    const terms = new Repo(OB.orgs.highveld).list('organisation_commercial_terms')[0]
    new Repo(OB.orgs.highveld).update('organisation_commercial_terms', terms.id, { status: 'superseded' })
    expect(forbidden(() => activateBrokerage(reviewer, { application_id: highveld }))).toBe('conflict')
    new Repo(OB.orgs.highveld).update('organisation_commercial_terms', terms.id, { status: 'agreed' })

    activateBrokerage(reviewer, { application_id: highveld })
    expect(principal(kagiso).organisation?.lifecycle_status).toBe('active')
    expect(listLeads(kagiso)).toEqual([])
    // Activation does not enable any insurer: quoting stays blocked.
    expect(listInsurerAccess(kagiso).rows.every((r) => r.status !== 'enabled')).toBe(true)

    const actions = new Repo(OB.orgs.highveld).list('audit_events').map((e) => `${e.action}:${e.actor_scope}`)
    expect(actions).toEqual(expect.arrayContaining(['onboarding.item_decided:platform', 'onboarding.approved:platform', 'brokerage.activated:platform', 'document.uploaded:tenant']))
  })
})

describe('client-book import', () => {
  const rows = [
    { 'Client No': 'ACA-9001', Type: 'personal', Name: 'Kabelo Dlamini', Email: 'kabelo@example.demo', Mobile: '0825559001' },
    { 'Client No': 'ACA-9002', Type: 'personal', Name: 'Megan Smith', Email: 'not-an-email', Mobile: '0825559002' },
    { 'Client No': 'ACA-9003', Type: 'personal', Name: 'Zodwa Nkosi', Email: 'zodwa.nkosi@example.demo', Mobile: '0825550301' },
    { 'Client No': 'ACA-9001', Type: 'commercial', Name: 'Repeat Ref (Pty) Ltd', Email: '', Mobile: '' },
  ]
  const upload = () => uploadClientBook(acaciaOwner, { dataset: 'client_book_clients', file_name: 'clients.csv', headers: Object.keys(rows[0]), rows })
  const count = (tenant: string) => new Repo(tenant).list('customers').length

  it('maps, previews, imports valid rows, and retries corrections without duplicates', () => {
    const view = upload()
    expect(view.mapping).toMatchObject({ client_ref: 'Client No', full_name: 'Name', email: 'Email', phone: 'Mobile', client_type: 'Type' })
    expect(view.summary).toMatchObject({ total: 4, will_create: 1, possible_duplicates: 1, errors: 2 })
    expect(forbidden(() => commitClientBook(acaciaOwner, { batch_id: view.batch.id }))).toBe('validation')

    attestClientBook(acaciaOwner, { batch_id: view.batch.id, confirmed: true })
    const before = { acacia: count(OB.orgs.acacia), coastline: count(OB.orgs.coastline) }
    const first = commitClientBook(acaciaOwner, { batch_id: view.batch.id })
    expect(first.result).toEqual({ committed: 1, failed: 3, linked: 0 })
    expect(clientBookErrorReport(acaciaOwner, { batch_id: view.batch.id }).csv).toContain('not-an-email')

    const bad = first.rows.find((r) => r.values.client_ref === 'ACA-9002')!
    correctClientBookRow(acaciaOwner, { row_id: bad.id, values: { email: 'megan@example.demo' } })
    const dup = first.rows.find((r) => r.values.client_ref === 'ACA-9003')!
    resolveClientBookDuplicate(acaciaOwner, { row_id: dup.id, resolution: 'create' })
    const repeat = first.rows.find((r) => r.values.full_name === 'Repeat Ref (Pty) Ltd')!
    resolveClientBookDuplicate(acaciaOwner, { row_id: repeat.id, resolution: 'skip' })

    const second = commitClientBook(acaciaOwner, { batch_id: view.batch.id })
    expect(second.result).toEqual({ committed: 2, failed: 0, linked: 0 })
    expect(commitClientBook(acaciaOwner, { batch_id: view.batch.id }).result).toEqual({ committed: 0, failed: 0, linked: 0 })
    expect(count(OB.orgs.acacia)).toBe(before.acacia + 3)
    expect(count(OB.orgs.coastline)).toBe(before.coastline)

    const imported = new Repo(OB.orgs.acacia).list('customers', (c) => c.data_origin === 'imported')
    expect(imported.map((c) => c.source_ref).sort()).toEqual(['ACA-9001', 'ACA-9002', 'ACA-9003'])
    expect(imported.every((c) => c.import_batch_id === view.batch.id)).toBe(true)
    expect(getClientBookImport(acaciaOwner, { batch_id: view.batch.id }).batch.status).toBe('committed')
  })

  it('refuses the same file twice and imports from read-only users', () => {
    upload()
    expect(forbidden(upload)).toBe('conflict')
    expect(forbidden(() => uploadClientBook(acaciaReadOnly, { dataset: 'client_book_clients', file_name: 'x.csv', headers: ['a'], rows: [{ a: '1' }] }))).toBe('forbidden')
  })
})

describe('roles, suspension and workspaces through direct API calls', () => {
  it('blocks writes for read-only and compliance roles', () => {
    expect(forbidden(() => tool(acaciaReadOnly, 'customer.create', { full_name: 'Blocked Person', email: 'blocked@example.demo', phone: '0825550000' }))).toBe('forbidden')
    expect(principal(acaciaReadOnly).repo.list('customers')).toHaveLength(5)
    expect(forbidden(() => createTeamInvitation(coastlineCompliance, { email: 'new@example.demo', role: 'representative' }))).toBe('forbidden')
    expect(forbidden(() => agreeTerms(acaciaRep, { package_key: 'growth', accept: true }))).toBe('forbidden')
  })

  it('suspension blocks operational access and keeps the records', () => {
    expect(forbidden(() => suspendBrokerage(reviewer, { organisation_id: OB.orgs.acacia, reason: 'x' }))).toBe('forbidden')
    suspendBrokerage(admin, { organisation_id: OB.orgs.acacia, reason: 'Professional indemnity lapsed' })
    expect(forbidden(() => listLeads(acaciaRep))).toBe('forbidden')
    expect(forbidden(() => tool(acaciaRep, 'customer.search', { query: 'zodwa' }))).toBe('forbidden')
    expect(new Repo(OB.orgs.acacia).list('customers')).toHaveLength(5)
    reinstateBrokerage(admin, { organisation_id: OB.orgs.acacia, reason: 'Cover renewed' })
    expect(listLeads(acaciaRep).length).toBe(1)
  })

  it('keeps Ava and the Business Discovery Agent available to staff of a brokerage that is not active', async () => {
    suspendBrokerage(admin, { organisation_id: OB.orgs.acacia, reason: 'Professional indemnity lapsed' })
    for (const who of [kagiso, acaciaRep]) {
      const started = startConversation(who, { channel: 'public' })
      expect(started.conversation).toMatchObject({ tenant_id: TENANT_ID, customer_id: null, channel: 'public', assistant: 'ava' })
      const replied = await sendMessage(who, { conversation_id: started.conversation.id, text: 'I’ve just bought a car' })
      expect(replied.messages.at(-1)?.role).toBe('assistant')
      expect(getConversation(who, { conversation_id: started.conversation.id }).messages).toHaveLength(3)
    }
    expect(startConversation(kagiso, { channel: 'portal' }).conversation.channel).toBe('public')
    expect(startConversation(kagiso, { channel: 'public', assistant: 'business_discovery' }).conversation.assistant).toBe('business_discovery')
    expect(forbidden(() => startConversation(acaciaRep, { channel: 'broker' }))).toBe('forbidden')
  })

  it('removes a member’s access immediately', () => {
    const membership = principal(acaciaRep).membership!
    removeMember(acaciaOwner, { membership_id: membership.id })
    expect(principal(acaciaRep).organisation).toBeNull()
    expect(forbidden(() => listLeads(acaciaRep))).toBe('forbidden')
  })

  it('requires an explicit switch between brokerages', () => {
    expect(principal(shared).repo.list('customers').every((c) => c.tenant_id === OB.orgs.acacia)).toBe(true)
    switchWorkspace(shared, { organisation_id: OB.orgs.coastline })
    expect(principal(shared).repo.list('customers').every((c) => c.tenant_id === OB.orgs.coastline)).toBe(true)
    expect(forbidden(() => switchWorkspace(shared, { organisation_id: OB.orgs.highveld }))).toBe('forbidden')
    expect(new Repo(OB.orgs.coastline).list('audit_events', (e) => e.action === 'workspace.switched')).toHaveLength(1)
  })
})

describe('Demo Studio sample applications', () => {
  it('adds one brokerage per stage once, with reviewer notes hidden from the brokerage', () => {
    expect(loadOnboardingSamples()).toEqual({ added: 5, total: 5 })
    expect(loadOnboardingSamples()).toEqual({ added: 0, total: 5 })
    const statuses = listOnboardingQueue(reviewer).map((r) => r.status)
    expect(statuses).toEqual(expect.arrayContaining(['draft', 'under_review', 'information_required', 'approved', 'declined', 'submitted', 'active']))
    const limpopo = listOnboardingQueue(reviewer).find((r) => r.brokerage === 'Limpopo Commercial Brokers')!
    const review = getOnboardingReview(reviewer, { application_id: limpopo.application_id })
    expect(review.internal_notes).toHaveLength(1)
    const owner = review.team.members.find((m) => m.role === 'brokerage_owner')!
    const theirs = getOnboarding(as(owner.user_id))
    expect(theirs.feedback[0].body).toContain('countersigned')
    expect(JSON.stringify(theirs)).not.toContain('Called the insurer')
    const garden = listOnboardingQueue(reviewer).find((r) => r.brokerage === 'Garden Route Cover')!
    activateBrokerage(reviewer, { application_id: garden.application_id })
    expect(sampleFiles().map((f) => f.file_name)).toContain('acacia-sample-clients.csv')
  })
})

describe('insurer access and quoting', () => {
  it('only quotes with enabled insurers and never exposes credentials', async () => {
    const quote = tool<{ id: string }>(acaciaRep, 'quote.create_request', { lead_id: OB.leads.acaciaLerato })
    const options = tool<Array<{ insurer_id: string }>>(acaciaRep, 'quote.get_demo_options', { quote_id: quote.id })
    expect(options).toHaveLength(1)

    const karoo = listInsurerAccess(acaciaOwner).rows.find((r) => r.insurer_name === 'Karoo Mutual')!
    expect(forbidden(() => enableInsurerAccess(acaciaOwner, { access_id: karoo.id }))).toBe('conflict')
    submitInsurerCredentials(acaciaOwner, { access_id: karoo.id, api_key: 'karoo-live-key-9931' })
    testInsurerAccess(acaciaOwner, { access_id: karoo.id })
    enableInsurerAccess(acaciaOwner, { access_id: karoo.id })

    const second = tool<{ id: string }>(acaciaRep, 'quote.create_request', { lead_id: OB.leads.acaciaLerato })
    expect(tool<unknown[]>(acaciaRep, 'quote.get_demo_options', { quote_id: second.id })).toHaveLength(2)

    const page = JSON.stringify(listInsurerAccess(acaciaOwner))
    expect(page).toContain('••••9931')
    expect(page).not.toContain('karoo-live-key-9931')
    expect(page).not.toContain('demo-secret-acacia-protea')
    const audit = JSON.stringify(new Repo(OB.orgs.acacia).list('audit_events'))
    expect(audit).not.toContain('karoo-live-key-9931')
    expect(russOnboardingTurn(acaciaOwner, { message: 'show me our api key' }).reply).toContain('never see')
  })

  it('blocks quoting in a brokerage with no enabled insurer', () => {
    const p = principal(acaciaOwner)
    for (const a of p.repo.list('insurer_access')) p.repo.update('insurer_access', a.id, { status: 'disabled' })
    const quote = tool<{ id: string }>(acaciaRep, 'quote.create_request', { lead_id: OB.leads.acaciaLerato })
    expect(forbidden(() => tool(acaciaRep, 'quote.get_demo_options', { quote_id: quote.id }))).toBe('forbidden')
  })
})
