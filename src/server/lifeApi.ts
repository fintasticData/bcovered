// Life & Benefits request handlers: people, policies, advice and servicing. Reached only through src/api/client.ts.
import { agentLabel } from './agents/catalog'
import { activeLifeCase, LIFE_ADVICE, startLifeAdvice } from './agents/lifeOrchestrator'
import { STAFF_ROLES, principal, requireCustomer, requireRole, summariseJob, type Auth, type JobSummary } from './api'
import type { BenefitEvent, Employment, FundMembership, SchemeMembership } from './db/benefitsSchema'
import type { Task } from './db/commercialSchema'
import {
  FAIS_LABEL,
  type AdviserAuthorisation,
  type CustomerPerson,
  type FinancialProfile,
  type LifeQuote,
  type LifeQuoteOption,
  type NeedsAnalysis,
  type Person,
  type PersonRelationship,
  type Policy,
  type PolicyBenefit,
  type PolicyParty,
  type PolicyStatusEvent,
  type RecordOfAdvice,
  type RoaSection,
  type UnderwritingRequirement,
} from './db/lifeSchema'
import type { ApprovalRequest, AuditEvent, Customer } from './db/schema'
import type { Repo } from './db/store'
import { ageOn, today } from './domain/life/identity'
import { ToolError } from './lib/errors'
import { checkAuthorisation } from './tools/adviser'
import { currentProfile, selfOf } from './tools/person'
import { invokeTool } from './tools/registry'

const nameOf = (p: Person | undefined) => (p ? `${p.first_names} ${p.surname}` : 'Unknown person')
const provider = (repo: Repo, id: string) => repo.get('insurers', id)?.name ?? 'Unknown provider'

// ---------------------------------------------------------------- people

export interface PersonRow {
  person: Person
  age: number | null
  accounts: Array<{ customer_id: string; name: string; role: CustomerPerson['role'] }>
  employer: string | null
  policies: number
  schemes: number
  funds: number
}

export function listPeople(auth: Auth, body: { query?: string } = {}): PersonRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const q = body.query?.trim().toLowerCase()
  return p.repo
    .list('persons', (x) => {
      if (!q) return true
      const employment = p.repo.find('employments', (e) => e.person_id === x.id)
      return `${x.first_names} ${x.surname}`.toLowerCase().includes(q) || x.id_last4 === q || employment?.employee_number.toLowerCase() === q
    })
    .map((x) => {
      const employment = p.repo.find('employments', (e) => e.person_id === x.id && e.status === 'active')
      return {
        person: x,
        age: x.date_of_birth ? ageOn(x.date_of_birth, today()) : null,
        accounts: p.repo
          .list('customer_persons', (l) => l.person_id === x.id && !l.effective_to)
          .map((l) => ({ customer_id: l.customer_id, name: p.repo.get('customers', l.customer_id)?.full_name ?? 'Unknown', role: l.role })),
        employer: employment ? (p.repo.get('customers', employment.employer_customer_id)?.full_name ?? null) : null,
        policies: new Set(p.repo.list('policy_parties', (pp) => pp.person_id === x.id && !pp.effective_to).map((pp) => pp.policy_id)).size,
        schemes: p.repo.list('scheme_memberships', (m) => m.person_id === x.id && m.status === 'active').length,
        funds: p.repo.list('fund_memberships', (m) => m.person_id === x.id && m.status === 'active').length,
      }
    })
    .sort((a, b) => b.accounts.length + b.policies - (a.accounts.length + a.policies) || a.person.surname.localeCompare(b.person.surname))
}

export interface PersonDetail {
  person: Person
  age: number | null
  accounts: Array<CustomerPerson & { customer: Customer }>
  relationships: Array<PersonRelationship & { other: Person; direction: 'outgoing' | 'incoming' }>
  profile: FinancialProfile | null
  profile_versions: number
  policies: Array<{ policy: Policy; provider: string; roles: PolicyParty['role'][]; benefits: PolicyBenefit[] }>
  employments: Array<Employment & { employer: string; annual_salary: number | null }>
  schemes: Array<SchemeMembership & { scheme: string }>
  funds: Array<FundMembership & { fund: string; latest_value: number | null; valuation_date: string | null; source: string | null }>
  benefit_events: BenefitEvent[]
  tasks: Task[]
  timeline: Array<{ at: string; label: string; source: string }>
  can_advise: boolean
  life_case: JobSummary | null
}

export function getPerson(auth: Auth, body: { person_id: string }): PersonDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const repo = p.repo
  const person = repo.require('persons', body.person_id)
  const accounts = repo.list('customer_persons', (l) => l.person_id === person.id && !l.effective_to).map((l) => ({ ...l, customer: repo.require('customers', l.customer_id) }))
  const parties = repo.list('policy_parties', (pp) => pp.person_id === person.id && !pp.effective_to)
  const policyIds = [...new Set(parties.map((pp) => pp.policy_id))]
  const policies = policyIds.map((id) => {
    const policy = repo.require('policies', id)
    return { policy, provider: provider(repo, policy.provider_id), roles: parties.filter((pp) => pp.policy_id === id).map((pp) => pp.role), benefits: repo.list('policy_benefits', (b) => b.policy_id === id) }
  })
  const employments = repo.list('employments', (e) => e.person_id === person.id).map((e) => ({
    ...e,
    employer: repo.get('customers', e.employer_customer_id)?.full_name ?? 'Unknown',
    annual_salary: repo.list('salary_history', (s) => s.employment_id === e.id && !s.effective_to).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.annual_amount ?? null,
  }))
  const funds = repo.list('fund_memberships', (m) => m.person_id === person.id).map((m) => {
    const v = repo.list('administrator_valuations', (x) => x.fund_membership_id === m.id).sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))[0]
    return { ...m, fund: repo.get('retirement_funds', m.fund_id)?.name ?? 'Unknown fund', latest_value: v?.total_value ?? null, valuation_date: v?.valuation_date ?? null, source: v?.source_reference ?? null }
  })
  const timeline: PersonDetail['timeline'] = [
    ...repo
      .list('policy_status_events', (e) => policyIds.includes(e.policy_id))
      .map((e) => ({ at: e.occurred_at, label: `${e.status.replace(/_/g, ' ')}: ${e.note ?? ''}`.trim(), source: e.reported_by === 'insurer' ? 'Insurer' : e.reported_by === 'broker' ? 'Broker' : 'System' })),
    ...repo
      .list('member_movements', (m) => m.person_id === person.id)
      .map((m) => ({ at: m.processing_date, label: `${m.movement_type.replace(/_/g, ' ')} effective ${m.effective_date}`, source: 'Payroll import' })),
    ...repo
      .list('audit_events', (e: AuditEvent) => e.entity_id === person.id || (e.entity_table === 'financial_profiles' && (e.after as { person_id?: string } | null)?.person_id === person.id))
      .map((e) => ({ at: e.created_at, label: e.action, source: e.actor_type === 'agent' ? agentLabel(e.actor_id) : e.actor_type === 'user' ? (repo.get('app_users', e.actor_id)?.full_name ?? 'User') : 'System' })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const self = accounts.find((a) => a.role === 'self')
  const job = self ? (activeLifeCase(repo, self.customer_id) ?? repo.list('jobs', (j) => j.workflow_type === LIFE_ADVICE && j.customer_id === self.customer_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]) : undefined
  return {
    person,
    age: person.date_of_birth ? ageOn(person.date_of_birth, today()) : null,
    accounts,
    relationships: [
      ...repo.list('person_relationships', (r) => r.person_id === person.id && !r.effective_to).map((r) => ({ ...r, other: repo.require('persons', r.related_person_id), direction: 'outgoing' as const })),
      ...repo.list('person_relationships', (r) => r.related_person_id === person.id && !r.effective_to).map((r) => ({ ...r, other: repo.require('persons', r.person_id), direction: 'incoming' as const })),
    ],
    profile: currentProfile(repo, person.id) ?? null,
    profile_versions: repo.list('financial_profiles', (f) => f.person_id === person.id).length,
    policies,
    employments,
    schemes: repo.list('scheme_memberships', (m) => m.person_id === person.id).map((m) => ({ ...m, scheme: repo.get('group_schemes', m.scheme_id)?.name ?? 'Unknown scheme' })),
    funds,
    benefit_events: repo.list('benefit_events', (e) => e.person_id === person.id),
    tasks: repo.list('tasks', (t) => t.status === 'open' && (policyIds.includes(t.subject_id ?? '') || accounts.some((a) => a.customer_id === t.customer_id))),
    timeline: timeline.slice(0, 40),
    can_advise: p.user ? checkAuthorisation(repo, p.user.id, 'lt_b1').authorised : false,
    life_case: job ? summariseJob(repo, job) : null,
  }
}

export function captureFinancialProfile(auth: Auth, body: { person_id: string; occupation?: string | null; gross_monthly_income?: number | null; net_monthly_income?: number | null; monthly_obligations?: number | null; outstanding_debt?: number | null; objectives?: string[] }): FinancialProfile {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<FinancialProfile>('profile.capture_financial', { ...body, source: 'declared' }, { repo: p.repo, actor: p.actor })
}

export function startLifeAdviceForPerson(auth: Auth, body: { person_id: string }): { job_id: string; reused: boolean } {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const link = p.repo.find('customer_persons', (l) => l.person_id === body.person_id && l.role === 'self' && !l.effective_to)
  if (!link) throw new ToolError('validation', 'This person is not a client in their own right. Link them to a client account as “self” first.')
  const { job, reused } = startLifeAdvice(p.repo, p.actor, { customer_id: link.customer_id, person_id: body.person_id, adviser_id: p.user!.id, smoker: false })
  return { job_id: job.id, reused }
}

// ---------------------------------------------------------------- policies

export interface PolicyRow {
  policy: Policy
  provider: string
  holder: string
  life_insured: string
  cover: number
  beneficiaries: number
  customer: string
}

export function listLifePolicies(auth: Auth, body: { customer_id?: string | null } = {}): PolicyRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('policies', (x) => x.line === 'individual_life' && (!body.customer_id || x.customer_id === body.customer_id))
    .map((policy) => {
      const parties = p.repo.list('policy_parties', (pp) => pp.policy_id === policy.id && !pp.effective_to)
      const person = (role: PolicyParty['role']) => nameOf(p.repo.get('persons', parties.find((pp) => pp.role === role)?.person_id ?? ''))
      return {
        policy,
        provider: provider(p.repo, policy.provider_id),
        holder: person('policyholder'),
        life_insured: person('life_insured'),
        cover: p.repo.list('policy_benefits', (b) => b.policy_id === policy.id && b.benefit_type_key === 'life').reduce((s, b) => s + (b.sum_assured ?? 0), 0),
        beneficiaries: parties.filter((pp) => pp.role === 'beneficiary').length,
        customer: p.repo.get('customers', policy.customer_id)?.full_name ?? 'Unknown',
      }
    })
    .sort((a, b) => b.policy.updated_at.localeCompare(a.policy.updated_at))
}

export interface PolicyDetail {
  policy: Policy
  provider: string
  product: string | null
  customer: Customer
  parties: Array<PolicyParty & { name: string }>
  benefits: PolicyBenefit[]
  events: PolicyStatusEvent[]
  requirements: UnderwritingRequirement[]
  roa: { id: string; status: RecordOfAdvice['status']; version: number } | null
  approvals: ApprovalRequest[]
  tasks: Task[]
  household: Array<{ person_id: string; name: string; role: string }>
}

export function getPolicy(auth: Auth, body: { policy_id: string }): PolicyDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const repo = p.repo
  const policy = repo.require('policies', body.policy_id)
  const version = policy.product_version_id ? repo.get('product_versions', policy.product_version_id) : undefined
  const roa = policy.record_of_advice_id ? repo.get('records_of_advice', policy.record_of_advice_id) : undefined
  return {
    policy,
    provider: provider(repo, policy.provider_id),
    product: version ? (repo.get('products', version.product_id)?.name ?? null) : null,
    customer: repo.require('customers', policy.customer_id),
    parties: repo.list('policy_parties', (pp) => pp.policy_id === policy.id && !pp.effective_to).map((pp) => ({ ...pp, name: nameOf(repo.get('persons', pp.person_id)) })),
    benefits: repo.list('policy_benefits', (b) => b.policy_id === policy.id),
    events: repo.list('policy_status_events', (e) => e.policy_id === policy.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    requirements: repo.list('underwriting_requirements', (u) => u.policy_id === policy.id),
    roa: roa ? { id: roa.id, status: roa.status, version: roa.version } : null,
    approvals: repo.list('approval_requests', (a) => a.subject_id === policy.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    tasks: repo.list('tasks', (t) => t.subject_id === policy.id && t.status === 'open'),
    household: repo
      .list('customer_persons', (l) => l.customer_id === policy.customer_id && !l.effective_to)
      .map((l) => ({ person_id: l.person_id, name: nameOf(repo.get('persons', l.person_id)), role: l.role })),
  }
}

export function recordInsurerDecision(auth: Auth, body: { policy_id: string; decision: 'accepted' | 'accepted_with_terms' | 'declined'; document_ref: string; policy_number?: string; inception_date?: string; loading_pct?: number; exclusions?: string[] }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<Policy>('life.record_insurer_decision', body, { repo: p.repo, actor: p.actor })
}

export function updateRequirement(auth: Auth, body: { requirement_id: string; status: 'received' | 'waived' | 'outstanding' }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<UnderwritingRequirement>('life.update_requirement', body, { repo: p.repo, actor: p.actor })
}

export function proposeBeneficiaries(auth: Auth, body: { policy_id: string; beneficiaries: Array<{ person_id?: string; first_names?: string; surname?: string; date_of_birth?: string; share_pct: number }> }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<ApprovalRequest>('policy.propose_beneficiaries', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- advice

export interface AdviceDetail {
  roa: RecordOfAdvice
  person: Person
  customer: Customer
  needs: NeedsAnalysis | null
  quote: LifeQuote | null
  options: Array<LifeQuoteOption & { provider: string }>
  adviser: { id: string; name: string; authorisation: AdviserAuthorisation | null; category: string }
  approvals: ApprovalRequest[]
  pending_approval_matches: boolean | null
  policy_id: string | null
  job_id: string | null
}

export function getAdvice(auth: Auth, body: { roa_id: string }): AdviceDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const repo = p.repo
  const roa = repo.require('records_of_advice', body.roa_id)
  const approvals = repo.list('approval_requests', (a) => a.subject_id === roa.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pending = approvals.find((a) => a.status === 'pending')
  const authorisation = roa.adviser_authorisation_id ? (repo.get('adviser_authorisations', roa.adviser_authorisation_id) ?? null) : null
  return {
    roa,
    person: repo.require('persons', roa.person_id),
    customer: repo.require('customers', roa.customer_id),
    needs: roa.needs_analysis_id ? (repo.get('needs_analyses', roa.needs_analysis_id) ?? null) : null,
    quote: roa.life_quote_id ? (repo.get('life_quotes', roa.life_quote_id) ?? null) : null,
    options: repo.list('life_quote_options', (o) => o.life_quote_id === roa.life_quote_id).map((o) => ({ ...o, provider: provider(repo, o.provider_id) })).sort((a, b) => a.monthly_premium - b.monthly_premium),
    adviser: { id: roa.adviser_id, name: repo.get('app_users', roa.adviser_id)?.full_name ?? 'Unknown', authorisation, category: authorisation ? FAIS_LABEL[authorisation.product_category] : 'No authorisation recorded' },
    approvals,
    pending_approval_matches: pending ? pending.payload_hash === approvals[0]?.payload_hash : null,
    policy_id: repo.find('policies', (x) => x.record_of_advice_id === roa.id)?.id ?? null,
    job_id: roa.job_id,
  }
}

export function updateAdviceSection(auth: Auth, body: { roa_id: string; section: RoaSection; text: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<RecordOfAdvice>('life.update_roa_section', body, { repo: p.repo, actor: p.actor })
}

export function applyAdviceSuggestion(auth: Auth, body: { roa_id: string; section: RoaSection }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<RecordOfAdvice>('life.apply_roa_suggestion', body, { repo: p.repo, actor: p.actor })
}

export function requestAdviceSignoff(auth: Auth, body: { roa_id: string }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool<ApprovalRequest>('life.request_roa_signoff', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- servicing and case

export interface ServicingItem {
  task: Task
  agent: string
  customer: string | null
  link: string | null
}

const SERVICING_AGENTS = ['life_servicing', 'compliance_monitor', 'life_underwriting']

export function getLifeServicing(auth: Auth): ServicingItem[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('tasks', (t) => t.status === 'open' && SERVICING_AGENTS.includes(t.created_by_agent ?? ''))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((task) => ({
      task,
      agent: agentLabel(task.created_by_agent ?? ''),
      customer: task.customer_id ? (p.repo.get('customers', task.customer_id)?.full_name ?? null) : null,
      link: task.subject_table === 'policies' ? `/broker/life/policies/${task.subject_id}` : task.subject_table === 'needs_analyses' ? personLinkForAnalysis(p.repo, task.subject_id) : null,
    }))
}

function personLinkForAnalysis(repo: Repo, id: string | null) {
  const analysis = id ? repo.get('needs_analyses', id) : undefined
  return analysis ? `/broker/people/${analysis.person_id}` : null
}

export function runServicingScan(auth: Auth) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return invokeTool('life.scan_servicing', {}, { repo: p.repo, actor: p.actor })
}

export function bulkUpdateTasks(auth: Auth, body: { task_ids: string[]; status: 'done' | 'cancelled' }) {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return body.task_ids.map((task_id) => invokeTool<Task>('task.update', { task_id, status: body.status }, { repo: p.repo, actor: p.actor }))
}

export interface LifeCase {
  customer: Customer
  person: Person | null
  job: JobSummary | null
  needs: NeedsAnalysis | null
  options: Array<LifeQuoteOption & { provider: string }>
  roa: RecordOfAdvice | null
  policy: Policy | null
}

export function getLifeCase(auth: Auth, body: { customer_id: string; job_id?: string | null }): LifeCase {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const repo = p.repo
  const customer = repo.require('customers', body.customer_id)
  const job = body.job_id ? repo.get('jobs', body.job_id) : repo.list('jobs', (j) => j.workflow_type === LIFE_ADVICE && j.customer_id === customer.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const outputs = (job?.outputs ?? {}) as Record<string, { needs_analysis_id?: string; life_quote_id?: string; roa_id?: string; policy_id?: string }>
  const needs = outputs.needs?.needs_analysis_id ? (repo.get('needs_analyses', outputs.needs.needs_analysis_id) ?? null) : null
  const quoteId = outputs.quote?.life_quote_id
  return {
    customer,
    person: selfOf(repo, customer.id),
    job: job ? summariseJob(repo, job) : null,
    needs,
    options: quoteId ? repo.list('life_quote_options', (o) => o.life_quote_id === quoteId).map((o) => ({ ...o, provider: provider(repo, o.provider_id) })).sort((a, b) => a.monthly_premium - b.monthly_premium) : [],
    roa: outputs.advice?.roa_id ? (repo.get('records_of_advice', outputs.advice.roa_id) ?? null) : null,
    policy: outputs.application?.policy_id ? (repo.get('policies', outputs.application.policy_id) ?? null) : null,
  }
}

// ---------------------------------------------------------------- customer portal

export interface PortalLifeView {
  person: Person | null
  policies: Array<{
    policy: Policy
    provider: string
    benefits: PolicyBenefit[]
    beneficiaries: Array<{ name: string; share_pct: number | null }>
    last_insurer_update: PolicyStatusEvent | null
    last_broker_update: PolicyStatusEvent | null
  }>
}

export function getPortalLife(auth: Auth): PortalLifeView {
  const p = principal(auth)
  const customer = requireCustomer(p)
  const repo = p.repo
  return {
    person: selfOf(repo, customer.id),
    policies: repo
      .list('policies', (x) => x.customer_id === customer.id && x.line === 'individual_life' && x.status !== 'proposed')
      .map((policy) => {
        const events = repo.list('policy_status_events', (e) => e.policy_id === policy.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        return {
          policy,
          provider: provider(repo, policy.provider_id),
          benefits: repo.list('policy_benefits', (b) => b.policy_id === policy.id),
          beneficiaries: repo
            .list('policy_parties', (pp) => pp.policy_id === policy.id && pp.role === 'beneficiary' && !pp.effective_to)
            .map((pp) => ({ name: nameOf(repo.get('persons', pp.person_id)), share_pct: pp.share_pct })),
          last_insurer_update: events.find((e) => e.reported_by === 'insurer') ?? null,
          last_broker_update: events.find((e) => e.reported_by === 'broker') ?? null,
        }
      }),
  }
}
