import { z } from 'zod'
import {
  ROA_SECTION_LABEL,
  ROA_SECTIONS,
  type LifeQuoteOption,
  type NeedsAnalysis,
  type Policy,
  type RecordOfAdvice,
  type RoaContent,
  type RoaSection,
} from '../db/lifeSchema'
import type { Repo } from '../db/store'
import { ageOn, today } from '../domain/life/identity'
import { analyseNeeds, NEED_LABEL, priceFromRates, type ExistingCover } from '../domain/life/needs'
import { ToolError } from '../lib/errors'
import { randWhole } from '../lib/money'
import { assertAuthorised, versionOn } from './adviser'
import { registerApprovalSubject, requestApproval, requireApproved } from './approval'
import { currentProfile, resolveOrCreatePerson } from './person'
import { defineTool, STAFF, type ToolDef } from './registry'
import { createTask } from './task'

export const rand = randWhole

const fullName = (repo: Repo, personId: string) => {
  const p = repo.require('persons', personId)
  return `${p.first_names} ${p.surname}`
}

const providerName = (repo: Repo, id: string) => repo.get('insurers', id)?.name ?? 'Unknown provider'

const ACTIVE_POLICY: Policy['status'][] = ['in_force', 'accepted', 'reinstated']

/** Cover a person already holds as an insured life, from in-force policies. */
export function existingCover(repo: Repo, personId: string): ExistingCover {
  const cover: ExistingCover = { life: 0, disability_lump_sum: 0, income_protection: 0, critical_illness: 0 }
  const policyIds = new Set(
    repo
      .list('policies', (p) => ACTIVE_POLICY.includes(p.status))
      .map((p) => p.id),
  )
  repo
    .list('policy_benefits', (b) => policyIds.has(b.policy_id) && b.life_insured_person_id === personId && b.status === 'active')
    .forEach((b) => {
      const key = b.benefit_type_key as keyof ExistingCover
      if (key in cover) cover[key] += key === 'income_protection' ? (b.monthly_benefit ?? 0) : (b.sum_assured ?? 0)
    })
  return cover
}

export const financialDependants = (repo: Repo, personId: string) =>
  repo.list('person_relationships', (r) => r.person_id === personId && r.is_financial_dependant && !r.effective_to).length

export function roaPayload(roa: RecordOfAdvice) {
  return { roa_id: roa.id, version: roa.version, content: roa.content, recommended_option_id: roa.recommended_option_id, adviser_id: roa.adviser_id, is_replacement: roa.is_replacement }
}

export function applicationPayload(repo: Repo, policy: Policy) {
  return {
    policy_id: policy.id,
    provider_id: policy.provider_id,
    product_version_id: policy.product_version_id,
    premium_amount: policy.premium_amount,
    record_of_advice_id: policy.record_of_advice_id,
    benefits: repo
      .list('policy_benefits', (b) => b.policy_id === policy.id)
      .map((b) => ({ key: b.benefit_type_key, sum_assured: b.sum_assured, monthly_benefit: b.monthly_benefit, premium: b.premium }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    parties: repo
      .list('policy_parties', (p) => p.policy_id === policy.id && p.role !== 'beneficiary' && !p.effective_to)
      .map((p) => ({ person_id: p.person_id, role: p.role }))
      .sort((a, b) => `${a.role}${a.person_id}`.localeCompare(`${b.role}${b.person_id}`)),
  }
}

export function beneficiaryState(repo: Repo, policyId: string) {
  return repo
    .list('policy_parties', (p) => p.policy_id === policyId && p.role === 'beneficiary' && !p.effective_to)
    .map((p) => ({ person_id: p.person_id, share_pct: p.share_pct ?? 0 }))
    .sort((a, b) => a.person_id.localeCompare(b.person_id))
}

function statusEvent(repo: Repo, policyId: string, status: string, reportedBy: 'broker' | 'insurer' | 'system', note: string | null, actorUserId: string | null, documentRef: string | null = null) {
  return repo.insert('policy_status_events', { policy_id: policyId, status, reported_by: reportedBy, note, document_ref: documentRef, actor_user_id: actorUserId, occurred_at: new Date().toISOString() })
}

// ---------------------------------------------------------------- Record of Advice drafting

function draftContent(repo: Repo, analysis: NeedsAnalysis, options: LifeQuoteOption[], recommended: LifeQuoteOption | undefined) {
  const person = repo.require('persons', analysis.person_id)
  const profile = analysis.financial_profile_id ? repo.get('financial_profiles', analysis.financial_profile_id) : undefined
  const age = person.date_of_birth ? ageOn(person.date_of_birth, today()) : null
  const deps = financialDependants(repo, person.id)
  const existing = repo
    .list('policy_parties', (p) => p.person_id === person.id && p.role === 'life_insured' && !p.effective_to)
    .map((p) => repo.get('policies', p.policy_id))
    .filter((p): p is Policy => Boolean(p && ACTIVE_POLICY.includes(p.status)))
  const describe = (o: LifeQuoteOption) =>
    `${o.label}: ${o.benefits.map((b) => `${NEED_LABEL[b.benefit_type_key] ?? b.benefit_type_key} ${rand(b.sum_assured)}${b.benefit_type_key === 'income_protection' ? ' pm' : ''}`).join(', ')} at ${rand(o.monthly_premium)} per month`
  const content: RoaContent = {
    client_summary:
      `${person.first_names} ${person.surname}${age !== null ? `, age ${age}` : ''}${profile?.occupation ? `, ${profile.occupation}` : ''}. ` +
      `Gross monthly income ${rand(profile?.gross_monthly_income)}, net ${rand(profile?.net_monthly_income)}, monthly obligations ${rand(profile?.monthly_obligations)}, outstanding debt ${rand(profile?.outstanding_debt)}. ` +
      `${deps} financial dependant${deps === 1 ? '' : 's'}. Objectives: ${(profile?.objectives ?? []).join('; ') || 'not recorded'}.`,
    needs_summary: analysis.needs
      .map((n) => `${n.label}: required ${rand(n.required)}, existing ${rand(n.existing)}, shortfall ${rand(n.shortfall)} (${n.basis}).`)
      .join('\n'),
    products_considered: options.map(describe).join('\n'),
    recommendation: recommended ? `${describe(recommended)} (simulated rate table; the final premium depends on the insurer’s underwriting).` : 'No option is recommended yet.',
    reasons: recommended ? `It covers the identified shortfalls at the lowest simulated premium of the options considered.` : '',
    replacement_note: existing.length
      ? `No existing policy is replaced. ${existing.map((p) => `${providerName(repo, p.provider_id)} ${p.policy_number ?? ''}`.trim()).join(', ')} remains in force and is counted as existing cover. If replacement is considered later, a replacement comparison and disclosure are required.`
      : 'The client holds no existing individual life cover; nothing is replaced.',
    fees_and_commission: 'Commission is paid by the insurer. Disclose the exact amount from the insurer’s official quotation before the client accepts. No advice fee is charged. [Adviser to confirm]',
    disclosures: [
      'Premiums are simulated from a synthetic rate table. Obtain the insurer’s quotation before applying.',
      'Underwriting may change the premium, add exclusions or decline cover.',
      'Russ prepared this draft. The authorised adviser is responsible for the advice and must review every section.',
    ],
  }
  const suggestions: Partial<Record<RoaSection, string>> = recommended
    ? {
        reasons:
          `${recommended.label} is recommended because it closes the life, disability and income gaps identified in the needs analysis in one policy, ` +
          `at ${rand(recommended.monthly_premium)} per month, which is ${profile?.net_monthly_income ? `${((recommended.monthly_premium / profile.net_monthly_income) * 100).toFixed(1)}% of net monthly income` : 'within the stated budget'}. ` +
          `The other options considered either leave a benefit uncovered or cost more for equivalent cover. Existing cover is retained rather than replaced, which avoids new waiting periods and exclusions on that cover.`,
      }
    : {}
  return { content, suggestions }
}

const roaFor = (repo: Repo, lifeQuoteId: string) =>
  repo.find('records_of_advice', (r) => r.life_quote_id === lifeQuoteId && ['draft', 'awaiting_approval'].includes(r.status))

/** Re-raises the sign-off request after an edit, keeping the job link so the waiting job continues on the new approval. */
function refreshSignoff(repo: Repo, roa: RecordOfAdvice, requestedBy: string) {
  if (roa.status !== 'awaiting_approval') return
  const pending = repo.find('approval_requests', (a) => a.subject_id === roa.id && a.approval_type === 'record_of_advice_signoff' && a.status === 'pending')
  requestSignoff(repo, repo.require('records_of_advice', roa.id), requestedBy, pending?.job_id ?? roa.job_id)
}

function requestSignoff(repo: Repo, roa: RecordOfAdvice, requestedBy: string, jobId: string | null) {
  const person = fullName(repo, roa.person_id)
  return requestApproval(repo, requestedBy, jobId, {
    approval_type: 'record_of_advice_signoff',
    subject_table: 'records_of_advice',
    subject_id: roa.id,
    summary: `Sign off the Record of Advice for ${person} (version ${roa.version})`,
    proposed_changes: roaPayload(roa),
    risk_flags: [
      ...(roa.content.fees_and_commission.includes('[Adviser to confirm]') ? ['Commission disclosure still marked “Adviser to confirm”'] : []),
      ...(roa.is_replacement ? ['Replacement of existing cover: replacement disclosure required'] : []),
    ],
    evidence: [{ label: 'Record of Advice', ref: `/broker/life/advice/${roa.id}` }],
  })
}

registerApprovalSubject('records_of_advice', {
  currentPayload: (repo, id) => roaPayload(repo.require('records_of_advice', id)),
  authorise: (repo, _id, actorId) => void assertAuthorised(repo, actorId, 'lt_b1'),
  onRequested: (repo, id, approval) => void repo.update('records_of_advice', id, { status: 'awaiting_approval', approval_id: approval.id }),
  onDecided: (repo, id, decision, _actor, approval) =>
    void repo.update('records_of_advice', id, decision === 'approved' ? { status: 'signed_off', payload_hash: approval.payload_hash } : { status: 'draft' }),
  describe: (repo, a) => {
    const roa = repo.get('records_of_advice', a.subject_id)
    if (!roa) return { lines: [], links: [] }
    return {
      lines: [`Recommendation: ${roa.content.recommendation}`, `Reasons: ${roa.content.reasons || 'not written yet'}`, roa.content.replacement_note],
      links: [{ label: 'Open the Record of Advice', to: `/broker/life/advice/${roa.id}` }],
    }
  },
})

registerApprovalSubject('policies', {
  currentPayload: (repo, id, approval) => {
    const policy = repo.require('policies', id)
    if (approval.approval_type === 'application_submission') return applicationPayload(repo, policy)
    if (approval.approval_type === 'beneficiary_change') return { ...(approval.proposed_changes as object), current: beneficiaryState(repo, id) }
    return undefined
  },
  authorise: (repo, _id, actorId, approval) => {
    if (approval.approval_type === 'application_submission') assertAuthorised(repo, actorId, 'lt_b1')
  },
  onDecided: (repo, id, decision, actorId, approval) => {
    if (approval.approval_type !== 'beneficiary_change' || decision !== 'approved') return
    const proposal = approval.proposed_changes as { beneficiaries: Array<{ person_id: string; share_pct: number }> }
    const date = today()
    repo
      .list('policy_parties', (p) => p.policy_id === id && p.role === 'beneficiary' && !p.effective_to)
      .forEach((p) => repo.update('policy_parties', p.id, { effective_to: date }))
    proposal.beneficiaries.forEach((b) => repo.insert('policy_parties', { policy_id: id, person_id: b.person_id, role: 'beneficiary', share_pct: b.share_pct, effective_from: date, effective_to: null }))
    statusEvent(repo, id, 'beneficiaries_changed', 'broker', `Beneficiary nominations updated after approval. The insurer must still be notified on its form.`, actorId)
  },
  describe: (repo, a) => {
    const policy = repo.get('policies', a.subject_id)
    if (!policy) return { lines: [], links: [] }
    const p = a.proposed_changes as { benefits?: Array<{ key: string; sum_assured: number | null; monthly_benefit: number | null }>; beneficiaries?: Array<{ person_id: string; share_pct: number }> }
    const lines =
      a.approval_type === 'beneficiary_change'
        ? (p.beneficiaries ?? []).map((b) => `${fullName(repo, b.person_id)}: ${b.share_pct}%`)
        : [
            `${providerName(repo, policy.provider_id)} · ${rand(policy.premium_amount)} per month (simulated)`,
            ...(p.benefits ?? []).map((b) => `${NEED_LABEL[b.key] ?? b.key}: ${rand(b.sum_assured ?? b.monthly_benefit)}${b.key === 'income_protection' ? ' pm' : ''}`),
            'No insurer integration exists: approving records the application as ready to submit through the insurer’s portal.',
          ]
    return { lines, links: [{ label: 'Open the policy', to: `/broker/life/policies/${policy.id}` }] }
  },
})

// ---------------------------------------------------------------- servicing

export interface ServicingFinding {
  category: 'missing_beneficiary' | 'anniversary' | 'underwriting' | 'shortfall' | 'compliance'
  title: string
  detail: string
  customer_id: string | null
  subject_table: string
  subject_id: string
  task_id: string
  created: boolean
}

function nextAnniversary(policy: Policy, from: string): string | null {
  if (!policy.anniversary_month) return null
  const day = policy.inception_date ? policy.inception_date.slice(8, 10) : '01'
  const year = Number(from.slice(0, 4))
  const candidate = `${year}-${String(policy.anniversary_month).padStart(2, '0')}-${day}`
  return candidate >= from ? candidate : `${year + 1}-${candidate.slice(5)}`
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export function scanServicing(repo: Repo, agent: string, jobId: string | null): ServicingFinding[] {
  const findings: ServicingFinding[] = []
  const now = today()
  const add = (f: Omit<ServicingFinding, 'task_id' | 'created'>, dedupe: string, createdBy = agent) => {
    const { task, created } = createTask(repo, createdBy, jobId, {
      customer_id: f.customer_id,
      subject_table: f.subject_table,
      subject_id: f.subject_id,
      kind: 'follow_up',
      audience: 'broker',
      title: f.title,
      detail: f.detail,
      due_in_days: 14,
      dedupe_key: dedupe,
    })
    findings.push({ ...f, task_id: task.id, created })
  }
  const lifePolicies = repo.list('policies', (p) => p.line === 'individual_life')
  for (const policy of lifePolicies) {
    const holder = repo.find('policy_parties', (p) => p.policy_id === policy.id && p.role === 'policyholder' && !p.effective_to)
    const who = holder ? fullName(repo, holder.person_id) : 'the policyholder'
    const label = `${providerName(repo, policy.provider_id)} ${policy.policy_number ?? '(no number yet)'}`
    if (ACTIVE_POLICY.includes(policy.status) && !beneficiaryState(repo, policy.id).length) {
      add({ category: 'missing_beneficiary', title: `Missing beneficiary nomination: ${label}`, detail: `${who} has no beneficiary nominated. Without one, the benefit is paid to the estate.`, customer_id: policy.customer_id, subject_table: 'policies', subject_id: policy.id }, `servicing:beneficiary:${policy.id}`)
    }
    const anniversary = ACTIVE_POLICY.includes(policy.status) ? nextAnniversary(policy, now) : null
    if (anniversary && daysBetween(now, anniversary) <= 60) {
      add({ category: 'anniversary', title: `Policy anniversary on ${anniversary}: ${label}`, detail: `Review ${who}’s cover and premium increase before the anniversary.`, customer_id: policy.customer_id, subject_table: 'policies', subject_id: policy.id }, `servicing:anniversary:${policy.id}:${anniversary.slice(0, 4)}`)
    }
    const outstanding = repo.list('underwriting_requirements', (u) => u.policy_id === policy.id && u.status === 'outstanding')
    if (outstanding.length) {
      add({ category: 'underwriting', title: `${outstanding.length} underwriting requirement${outstanding.length === 1 ? '' : 's'} outstanding: ${label}`, detail: outstanding.map((u) => u.requirement).join('; '), customer_id: policy.customer_id, subject_table: 'policies', subject_id: policy.id }, `servicing:underwriting:${policy.id}`)
    }
    if (policy.origin === 'placed' && policy.status !== 'proposed') {
      const roa = policy.record_of_advice_id ? repo.get('records_of_advice', policy.record_of_advice_id) : undefined
      if (!roa || !['signed_off', 'delivered'].includes(roa.status)) {
        add({ category: 'compliance', title: `Placed policy without a signed-off Record of Advice: ${label}`, detail: 'FAIS requires a record of the advice given. Complete and sign off the Record of Advice.', customer_id: policy.customer_id, subject_table: 'policies', subject_id: policy.id }, `compliance:roa:${policy.id}`, 'compliance_monitor')
      }
    }
  }
  const latest = new Map<string, NeedsAnalysis>()
  repo
    .list('needs_analyses', (n) => n.status === 'complete')
    .forEach((n) => {
      const prev = latest.get(n.person_id)
      if (!prev || prev.created_at < n.created_at) latest.set(n.person_id, n)
    })
  for (const analysis of latest.values()) {
    const placed = repo.find('policies', (p) => {
      const roa = p.record_of_advice_id ? repo.get('records_of_advice', p.record_of_advice_id) : undefined
      return roa?.needs_analysis_id === analysis.id && !['declined', 'not_taken_up', 'cancelled'].includes(p.status)
    })
    const gaps = analysis.needs.filter((n) => n.shortfall > 0)
    if (!placed && gaps.length) {
      add(
        {
          category: 'shortfall',
          title: `Cover shortfall for ${fullName(repo, analysis.person_id)}`,
          detail: gaps.map((g) => `${g.label}: ${rand(g.shortfall)}`).join('; '),
          customer_id: analysis.customer_id,
          subject_table: 'needs_analyses',
          subject_id: analysis.id,
        },
        `servicing:shortfall:${analysis.id}`,
      )
    }
  }
  return findings
}

// ---------------------------------------------------------------- tools

const sectionEnum = z.enum(ROA_SECTIONS)

export const lifeTools = [
  defineTool({
    name: 'life.analyse_needs',
    description: 'Calculate required, existing and shortfall cover from the current financial profile and in-force policies.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ customer_id: z.uuid(), person_id: z.uuid(), adviser_id: z.uuid().nullable().optional() }),
    run: ({ repo, jobId }, { customer_id, person_id, adviser_id }) => {
      const profile = currentProfile(repo, person_id)
      if (!profile) throw new ToolError('validation', `Capture a financial profile for ${fullName(repo, person_id)} first`)
      repo
        .list('needs_analyses', (n) => n.person_id === person_id && n.status === 'complete')
        .forEach((n) => repo.update('needs_analyses', n.id, { status: 'superseded' }))
      return repo.insert('needs_analyses', {
        customer_id,
        person_id,
        financial_profile_id: profile.id,
        adviser_id: adviser_id ?? null,
        needs: analyseNeeds(profile, existingCover(repo, person_id), financialDependants(repo, person_id)),
        status: 'complete',
        job_id: jobId ?? null,
      })
    },
    auditEntity: (r) => ({ table: 'needs_analyses', id: r.id }),
  }),

  defineTool({
    name: 'life.prepare_quote',
    description: 'Price the shortfall cover against each eligible individual life product’s rate table. Simulated, never an insurer quote.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ needs_analysis_id: z.uuid(), smoker: z.boolean().default(false) }),
    run: ({ repo, jobId }, { needs_analysis_id, smoker }) => {
      const analysis = repo.require('needs_analyses', needs_analysis_id)
      const person = repo.require('persons', analysis.person_id)
      if (!person.date_of_birth) throw new ToolError('validation', 'A date of birth is needed to quote')
      const age = ageOn(person.date_of_birth, today())
      const requested = analysis.needs.filter((n) => n.shortfall > 0).map((n) => ({ benefit_type_key: n.benefit_type_key, sum_assured: n.shortfall }))
      if (!requested.length) throw new ToolError('conflict', 'The needs analysis shows no shortfall to quote for')
      const quote = repo.insert('life_quotes', {
        customer_id: analysis.customer_id,
        person_id: person.id,
        needs_analysis_id,
        status: 'compared',
        assumptions: { age, smoker, cover: Object.fromEntries(requested.map((r) => [r.benefit_type_key, r.sum_assured])) },
        valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        job_id: jobId ?? null,
        is_simulated: true,
      })
      const products = repo.list('products', (p) => p.line === 'individual_life' && p.is_active && p.fais_category === 'lt_b1')
      const options: LifeQuoteOption[] = []
      products.forEach((product) => {
        const version = versionOn(repo, product.id)
        if (!version) return
        const priced = priceFromRates(version.rules, requested, age, smoker)
        if (!priced) return
        options.push(
          repo.insert('life_quote_options', {
            life_quote_id: quote.id,
            provider_id: product.provider_id,
            product_version_id: version.id,
            label: `${providerName(repo, product.provider_id)} ${product.name}`,
            benefits: priced.benefits,
            monthly_premium: priced.monthly_premium,
            policy_fee: priced.policy_fee,
            underwriting_expected: priced.underwriting_expected,
            source: 'simulated_rate_table',
            is_simulated: true,
          }),
        )
      })
      if (!options.length) throw new ToolError('conflict', 'No product on the panel is eligible for this life')
      return { quote, options }
    },
    auditEntity: (r) => ({ table: 'life_quotes', id: r.quote.id }),
  }),

  defineTool({
    name: 'life.draft_roa',
    description: 'Draft a Record of Advice for an authorised adviser from the needs analysis and quote, and request the adviser’s sign-off.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ life_quote_id: z.uuid(), adviser_id: z.uuid(), recommended_option_id: z.uuid().nullable().optional() }),
    run: ({ repo, actor, jobId }, { life_quote_id, adviser_id, recommended_option_id }) => {
      const authorisation = assertAuthorised(repo, adviser_id, 'lt_b1')
      const quote = repo.require('life_quotes', life_quote_id)
      const analysis = repo.require('needs_analyses', quote.needs_analysis_id!)
      const options = repo.list('life_quote_options', (o) => o.life_quote_id === life_quote_id).sort((a, b) => a.monthly_premium - b.monthly_premium)
      const shortfallKeys = analysis.needs.filter((n) => n.shortfall > 0).map((n) => n.benefit_type_key)
      const full = options.filter((o) => shortfallKeys.every((k) => o.benefits.some((b) => b.benefit_type_key === k)))
      const recommended = options.find((o) => o.id === recommended_option_id) ?? full[0] ?? options[0]
      const existing = roaFor(repo, life_quote_id)
      const roa =
        existing ??
        repo.insert('records_of_advice', {
          customer_id: quote.customer_id,
          person_id: quote.person_id,
          needs_analysis_id: analysis.id,
          life_quote_id,
          recommended_option_id: recommended?.id ?? null,
          adviser_id,
          adviser_authorisation_id: authorisation.id,
          version: 1,
          status: 'draft',
          ...draftContent(repo, analysis, options, recommended),
          is_replacement: false,
          payload_hash: null,
          approval_id: null,
          job_id: jobId ?? null,
          delivered_at: null,
          acknowledged_at: null,
        })
      repo.update('life_quotes', life_quote_id, { status: 'recommended' })
      const approval = requestSignoff(repo, repo.require('records_of_advice', roa.id), actor.id, jobId ?? null)
      return { roa: repo.require('records_of_advice', roa.id), approval_id: approval.id }
    },
    auditEntity: (r) => ({ table: 'records_of_advice', id: r.roa.id }),
  }),

  defineTool({
    name: 'life.update_roa_section',
    description: 'Edit one section of a draft Record of Advice. A pending sign-off is re-raised for the new wording.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ roa_id: z.uuid(), section: sectionEnum, text: z.string().max(4000) }),
    run: ({ repo, actor }, { roa_id, section, text }) => {
      const roa = repo.require('records_of_advice', roa_id)
      if (!['draft', 'awaiting_approval'].includes(roa.status)) throw new ToolError('conflict', `A ${roa.status.replace(/_/g, ' ')} Record of Advice cannot be edited; start a new version`)
      repo.update('records_of_advice', roa_id, { content: { ...roa.content, [section]: text } })
      refreshSignoff(repo, roa, actor.id)
      return repo.require('records_of_advice', roa_id)
    },
    auditEntity: (r) => ({ table: 'records_of_advice', id: r.id }),
  }),

  defineTool({
    name: 'life.apply_roa_suggestion',
    description: 'Apply Russ’s suggested wording for one section to the draft. Only a person can apply it.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ roa_id: z.uuid(), section: sectionEnum }),
    run: ({ repo, actor }, { roa_id, section }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only the adviser can apply suggested wording')
      const roa = repo.require('records_of_advice', roa_id)
      const suggestion = roa.suggestions[section]
      if (!suggestion) throw new ToolError('not_found', `There is no suggestion for ${ROA_SECTION_LABEL[section]}`)
      if (!['draft', 'awaiting_approval'].includes(roa.status)) throw new ToolError('conflict', 'This Record of Advice can no longer be edited')
      const { [section]: _applied, ...rest } = roa.suggestions
      repo.update('records_of_advice', roa_id, { content: { ...roa.content, [section]: suggestion }, suggestions: rest })
      refreshSignoff(repo, roa, actor.id)
      return repo.require('records_of_advice', roa_id)
    },
    auditEntity: (r) => ({ table: 'records_of_advice', id: r.id }),
  }),

  defineTool({
    name: 'life.request_roa_signoff',
    description: 'Ask the adviser to sign off the Record of Advice exactly as it stands.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ roa_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { roa_id }) => {
      const roa = repo.require('records_of_advice', roa_id)
      if (!['draft', 'awaiting_approval'].includes(roa.status)) throw new ToolError('conflict', `This Record of Advice is already ${roa.status.replace(/_/g, ' ')}`)
      return requestSignoff(repo, roa, actor.id, jobId ?? roa.job_id)
    },
    auditEntity: (r) => ({ table: 'approval_requests', id: r.id }),
  }),

  defineTool({
    name: 'life.prepare_application',
    description: 'Create the proposed policy from a signed-off Record of Advice and request approval to submit the application.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ roa_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { roa_id }) => {
      const roa = repo.require('records_of_advice', roa_id)
      requireApproved(repo, 'record_of_advice_signoff', roa_id, roaPayload(roa), 'The Record of Advice')
      const option = repo.require('life_quote_options', roa.recommended_option_id!)
      let policy = repo.find('policies', (p) => p.record_of_advice_id === roa_id)
      if (!policy) {
        const start = today()
        policy = repo.insert('policies', {
          customer_id: roa.customer_id,
          line: 'individual_life',
          provider_id: option.provider_id,
          product_version_id: option.product_version_id,
          record_of_advice_id: roa.id,
          adviser_id: roa.adviser_id,
          policy_number: null,
          origin: 'placed',
          status: 'proposed',
          underwriting_status: 'not_started',
          premium_amount: option.monthly_premium,
          premium_frequency: 'monthly',
          inception_date: null,
          anniversary_month: null,
          source: 'declared',
          job_id: jobId ?? null,
        })
        ;(['policyholder', 'life_insured', 'premium_payer'] as const).forEach((role) =>
          repo.insert('policy_parties', { policy_id: policy!.id, person_id: roa.person_id, role, share_pct: null, effective_from: start, effective_to: null }),
        )
        option.benefits.forEach((b) =>
          repo.insert('policy_benefits', {
            policy_id: policy!.id,
            life_insured_person_id: roa.person_id,
            benefit_type_key: b.benefit_type_key,
            kind: b.benefit_type_key === 'life' ? 'core' : 'rider',
            sum_assured: b.benefit_type_key === 'income_protection' ? null : b.sum_assured,
            monthly_benefit: b.benefit_type_key === 'income_protection' ? b.sum_assured : null,
            premium: b.monthly_premium,
            loading_pct: null,
            exclusions: [],
            status: 'proposed',
            effective_from: start,
            effective_to: null,
            source: 'declared',
          }),
        )
        statusEvent(repo, policy.id, 'proposed', 'broker', `Application prepared from the signed-off Record of Advice (version ${roa.version}).`, actor.type === 'user' ? actor.id : null)
      }
      const approval = requestApproval(repo, actor.id, jobId ?? null, {
        approval_type: 'application_submission',
        subject_table: 'policies',
        subject_id: policy.id,
        summary: `Submit the ${option.label} application for ${fullName(repo, roa.person_id)}`,
        proposed_changes: applicationPayload(repo, policy),
        risk_flags: option.underwriting_expected.length > 1 ? [`Expected underwriting: ${option.underwriting_expected.join(', ')}`] : [],
        evidence: [{ label: 'Record of Advice', ref: `/broker/life/advice/${roa.id}` }],
      })
      return { policy, approval_id: approval.id }
    },
    auditEntity: (r) => ({ table: 'policies', id: r.policy.id }),
  }),

  defineTool({
    name: 'life.submit_application',
    description: 'Record an approved application as submitted and list the insurer’s expected underwriting requirements. Nothing is sent: there is no insurer integration.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ policy_id: z.uuid() }),
    run: ({ repo, actor }, { policy_id }) => {
      const policy = repo.require('policies', policy_id)
      if (policy.status !== 'proposed') return { policy, requirements: repo.list('underwriting_requirements', (u) => u.policy_id === policy_id), already: true }
      requireApproved(repo, 'application_submission', policy_id, applicationPayload(repo, policy), 'The application')
      statusEvent(repo, policy_id, 'application_submitted', 'broker', 'Approved for submission. No insurer integration exists: submit through the insurer’s portal and record its reference here.', actor.type === 'user' ? actor.id : null)
      const version = policy.product_version_id ? repo.get('product_versions', policy.product_version_id) : undefined
      const lumpSum = Math.max(0, ...repo.list('policy_benefits', (b) => b.policy_id === policy_id).map((b) => b.sum_assured ?? 0))
      const now = new Date().toISOString()
      const requirements = (version?.rules.underwriting ?? [])
        .filter((u) => lumpSum > u.above_sum_assured)
        .map((u) => repo.insert('underwriting_requirements', { policy_id, requirement: u.requirement, status: 'outstanding', source: 'product_rules', requested_at: now, received_at: null }))
      const updated = repo.update('policies', policy_id, { status: 'underwriting', underwriting_status: requirements.length ? 'requirements_outstanding' : 'requirements_complete' })
      return { policy: updated, requirements, already: false }
    },
    auditEntity: (r) => ({ table: 'policies', id: r.policy.id }),
  }),

  defineTool({
    name: 'life.track_underwriting',
    description: 'Create follow-up tasks for outstanding underwriting requirements. Never makes an underwriting decision.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ policy_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { policy_id }) => {
      const policy = repo.require('policies', policy_id)
      const outstanding = repo.list('underwriting_requirements', (u) => u.policy_id === policy_id && u.status === 'outstanding')
      const tasks = outstanding.map(
        (u) =>
          createTask(repo, actor.type === 'agent' ? actor.id : null, jobId ?? null, {
            customer_id: policy.customer_id,
            subject_table: 'policies',
            subject_id: policy_id,
            kind: 'follow_up',
            audience: 'broker',
            title: `Underwriting: ${u.requirement}`,
            detail: `Arrange with the client and confirm with ${providerName(repo, policy.provider_id)} when received.`,
            due_in_days: 10,
            dedupe_key: `underwriting:${u.id}`,
          }).task,
      )
      return { outstanding: outstanding.length, task_ids: tasks.map((t) => t.id) }
    },
  }),

  defineTool({
    name: 'life.update_requirement',
    description: 'Mark an underwriting requirement as received or waived.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ requirement_id: z.uuid(), status: z.enum(['received', 'waived', 'outstanding']) }),
    run: ({ repo }, { requirement_id, status }) => {
      const r = repo.update('underwriting_requirements', requirement_id, { status, received_at: status === 'outstanding' ? null : new Date().toISOString() })
      const open = repo.list('underwriting_requirements', (u) => u.policy_id === r.policy_id && u.status === 'outstanding').length
      const policy = repo.require('policies', r.policy_id)
      if (policy.underwriting_status !== 'decided') repo.update('policies', r.policy_id, { underwriting_status: open ? 'requirements_outstanding' : 'requirements_complete' })
      repo.list('tasks', (t) => t.dedupe_key === `underwriting:${r.id}` && t.status === 'open').forEach((t) => status !== 'outstanding' && repo.update('tasks', t.id, { status: 'done' }))
      return r
    },
    auditEntity: (r) => ({ table: 'underwriting_requirements', id: r.id }),
  }),

  defineTool({
    name: 'life.record_insurer_decision',
    description: 'Record the insurer’s official underwriting decision from its letter or portal. Only a person can record it, with the document reference.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({
      policy_id: z.uuid(),
      decision: z.enum(['accepted', 'accepted_with_terms', 'declined']),
      document_ref: z.string().min(3).max(200),
      policy_number: z.string().max(40).optional(),
      inception_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      loading_pct: z.number().min(0).max(500).optional(),
      exclusions: z.array(z.string().max(200)).max(10).optional(),
    }),
    run: ({ repo, actor }, input) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can record an insurer decision')
      const policy = repo.require('policies', input.policy_id)
      if (!['underwriting', 'application_submitted'].includes(policy.status)) throw new ToolError('conflict', `The policy is ${policy.status.replace(/_/g, ' ')}, not in underwriting`)
      const declined = input.decision === 'declined'
      repo.list('policy_benefits', (b) => b.policy_id === policy.id).forEach((b) =>
        repo.update('policy_benefits', b.id, {
          status: declined ? 'ceased' : 'active',
          loading_pct: input.loading_pct ?? b.loading_pct,
          exclusions: input.exclusions ?? b.exclusions,
          premium: b.premium !== null && input.loading_pct ? Math.round(b.premium * (1 + input.loading_pct / 100) * 100) / 100 : b.premium,
          source: 'verified',
        }),
      )
      const premium = repo.list('policy_benefits', (b) => b.policy_id === policy.id).reduce((s, b) => s + (b.premium ?? 0), 0)
      const fee = policy.product_version_id ? (repo.get('product_versions', policy.product_version_id)?.rules.monthly_policy_fee ?? 0) : 0
      statusEvent(repo, policy.id, input.decision, 'insurer', input.exclusions?.length ? `Exclusions: ${input.exclusions.join('; ')}` : null, actor.id, input.document_ref)
      return repo.update('policies', policy.id, {
        status: declined ? 'declined' : input.inception_date ? 'in_force' : 'accepted',
        underwriting_status: 'decided',
        policy_number: input.policy_number ?? policy.policy_number,
        inception_date: input.inception_date ?? policy.inception_date,
        anniversary_month: input.inception_date ? Number(input.inception_date.slice(5, 7)) : policy.anniversary_month,
        premium_amount: declined ? policy.premium_amount : Math.round((premium + fee) * 100) / 100,
        source: 'verified',
      })
    },
    auditEntity: (r) => ({ table: 'policies', id: r.id }),
  }),

  defineTool({
    name: 'policy.propose_beneficiaries',
    description: 'Propose new beneficiary nominations (shares must total 100%). Applied only after a person approves.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      policy_id: z.uuid(),
      beneficiaries: z
        .array(
          z.object({
            person_id: z.uuid().optional(),
            first_names: z.string().min(1).optional(),
            surname: z.string().min(1).optional(),
            date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            share_pct: z.number().positive().max(100),
          }),
        )
        .min(1)
        .max(10),
    }),
    run: ({ repo, actor, jobId }, { policy_id, beneficiaries }) => {
      const policy = repo.require('policies', policy_id)
      const total = Math.round(beneficiaries.reduce((s, b) => s + b.share_pct, 0) * 100) / 100
      if (total !== 100) throw new ToolError('validation', `Shares must total 100% (they total ${total}%)`)
      const resolved = beneficiaries.map((b) => {
        if (b.person_id) return { person_id: repo.require('persons', b.person_id).id, share_pct: b.share_pct }
        if (!b.first_names || !b.surname) throw new ToolError('validation', 'Each beneficiary needs a person or a name')
        const r = resolveOrCreatePerson(repo, { first_names: b.first_names, surname: b.surname, date_of_birth: b.date_of_birth ?? null }, true)
        return { person_id: r.person!.id, share_pct: b.share_pct }
      })
      const proposal = { policy_id, beneficiaries: resolved.sort((a, b) => a.person_id.localeCompare(b.person_id)), current: beneficiaryState(repo, policy_id) }
      return requestApproval(repo, actor.id, jobId ?? null, {
        approval_type: 'beneficiary_change',
        subject_table: 'policies',
        subject_id: policy.id,
        summary: `Change beneficiaries on ${providerName(repo, policy.provider_id)} ${policy.policy_number ?? 'policy'}`,
        proposed_changes: proposal,
        risk_flags: [],
        evidence: [{ label: 'Policy', ref: `/broker/life/policies/${policy.id}` }],
      })
    },
    auditEntity: (r) => ({ table: 'approval_requests', id: r.id }),
  }),

  defineTool({
    name: 'life.scan_servicing',
    description: 'Find missing beneficiaries, anniversaries, outstanding underwriting, cover shortfalls and missing advice records, creating one task each.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({}),
    run: ({ repo, actor, jobId }) => scanServicing(repo, actor.type === 'agent' ? actor.id : 'life_servicing', jobId ?? null),
  }),
] as unknown as ToolDef[]
