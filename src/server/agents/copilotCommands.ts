import type { BusinessProfile } from '../db/commercialSchema'
import type { Customer, Job, LeadStatus } from '../db/schema'
import type { Repo } from '../db/store'
import { invokeTool, type Actor } from '../tools/registry'
import { COMMERCIAL_REVIEW, startCommercialReview } from './commercialOrchestrator'
import { startMotorLeadWorkflow } from './orchestrator'

export type CopilotView =
  | { kind: 'approvals'; title: string; approval_ids: string[] }
  | { kind: 'leads'; title: string; lead_ids: string[] }
  | { kind: 'jobs'; title: string; job_ids: string[] }
  | { kind: 'job'; title: string; job_id: string }
  | { kind: 'business'; title: string; profile_id: string; job_id: string | null }
  | { kind: 'businesses'; title: string; profile_ids: string[] }
  | { kind: 'submissions'; title: string; submission_ids: string[] }
  | { kind: 'none' }

export interface CopilotTurn {
  reply: string
  view: CopilotView
  suggestions: string[]
}

export const COPILOT_SUGGESTIONS = [
  'Show pending approvals',
  'Show new leads',
  'Create a quote comparison for Ayanda Khumalo',
  'Show running jobs',
]

export const COMMERCIAL_COPILOT_SUGGESTIONS = [
  'Review Ubuntu Foods and identify outstanding insurance questions',
  'Show commercial clients',
  'Show draft submissions',
  'Show pending approvals',
]

const OPEN_SUBMISSION = ['draft', 'awaiting_approval', 'approved']

function commercialCommand(repo: Repo, actor: Actor, raw: string, t: string): CopilotTurn | null {
  const ctx = { repo, actor }
  const review = raw.match(/^\s*(?:please\s+)?(?:review|assess|analy[sz]e|risk[\s-]review)\s+(.+?)(?:\s+and\s+.*|[.?!])?$/i)
  if (review && !/\b(renewals?|claims?|approvals?|leads?|jobs?)\b/i.test(review[1])) {
    const name = review[1].replace(/['’]s$/, '').trim()
    const matches = invokeTool<Array<{ profile: BusinessProfile; customer: Customer }>>('business.discover', { query: name }, ctx)
    if (!matches.length) {
      return {
        reply: `I couldn’t find a commercial client called “${name}”. Try Ubuntu Foods, or run the Restaurant Group scenario in Demo Studio to create one.`,
        view: { kind: 'none' },
        suggestions: COMMERCIAL_COPILOT_SUGGESTIONS,
      }
    }
    const { profile } = matches[0]
    const label = profile.trading_name ?? profile.registered_name
    const open = repo
      .list('jobs', (j: Job) => j.workflow_type === COMMERCIAL_REVIEW && j.customer_id === profile.customer_id && !TERMINAL.includes(j.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (open) {
      return {
        reply: `A review for ${label} is already ${open.status.replace(/_/g, ' ')}. Opening it instead of starting a duplicate.`,
        view: { kind: 'business', title: `Risk review: ${label}`, profile_id: profile.id, job_id: open.id },
        suggestions: ['Show pending approvals', 'Show draft submissions'],
      }
    }
    const job = startCommercialReview(repo, actor, { source: 'broker_copilot', business_profile_id: profile.id })
    return {
      reply:
        `Reviewing ${label}. Plan: 1) retrieve the existing business records, 2) rebuild the Risk Twin, 3) identify potential exposures, ` +
        '4) list outstanding questions and request documents, 5) refresh the draft submission pack, 6) write your review summary and hold the pack for your approval. ' +
        'Nothing is sent to an insurer.',
      view: { kind: 'business', title: `Risk review: ${label}`, profile_id: profile.id, job_id: job.id },
      suggestions: ['Show pending approvals', 'Show running jobs'],
    }
  }

  if (/commercial (clients?|customers?)|business (clients?|customers?|profiles?)|risk twins?/.test(t)) {
    const ids = repo
      .list('business_profiles', (p) => p.status !== 'archived')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((p) => p.id)
    return {
      reply: `${ids.length} commercial client${ids.length === 1 ? '' : 's'} with a business profile.`,
      view: { kind: 'businesses', title: 'Commercial clients', profile_ids: ids },
      suggestions: COMMERCIAL_COPILOT_SUGGESTIONS,
    }
  }

  if (/submission/.test(t)) {
    const ids = repo
      .list('commercial_submissions', (s) => (/draft|open|pending/.test(t) ? OPEN_SUBMISSION.includes(s.status) : true))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((s) => s.id)
    return {
      reply: ids.length
        ? `${ids.length} submission pack${ids.length === 1 ? '' : 's'}. None has been sent to an insurer.`
        : 'No submission packs yet. Ask me to review a business to draft one.',
      view: { kind: 'submissions', title: /draft|open|pending/.test(t) ? 'Draft submissions' : 'Submissions', submission_ids: ids },
      suggestions: COMMERCIAL_COPILOT_SUGGESTIONS,
    }
  }
  return null
}

const LATER_PHASE: Array<[RegExp, string]> = [
  [/claim/, 'Claims review is Scenario 3 and arrives with the claims module.'],
  [/renewal/, 'Renewal reviews are Scenario 4 and arrive with the renewals module.'],
  [/household|cross[\s-]?sell|no .*cover/, 'Cross-sell segments are Scenario 5 and arrive with the opportunity analyst.'],
  [/portfolio|commission|premium|summari[sz]e/, 'Portfolio intelligence is Scenario 6 and needs policy data, which arrives in Phase 3.'],
]

const OPEN_LEAD: LeadStatus[] = ['new', 'qualifying', 'qualified', 'quoting', 'proposal_pending']
const TERMINAL = ['completed', 'failed', 'cancelled']

export function handleCopilotCommand(repo: Repo, actor: Actor, text: string, mode: 'personal' | 'commercial' = 'personal'): CopilotTurn {
  const t = text.toLowerCase().trim()
  const ctx = { repo, actor }
  const suggestions = mode === 'commercial' ? COMMERCIAL_COPILOT_SUGGESTIONS : COPILOT_SUGGESTIONS

  const commercial = commercialCommand(repo, actor, text, t)
  if (commercial) return commercial

  const compare = t.match(/(?:quote|comparison|compare|proposal)\b.*\bfor\s+(.+)$/)
  if (compare) {
    const raw = text.trim()
    const name = raw.slice(raw.length - compare[1].length).replace(/[.?!]+$/, '').trim()
    const matches = invokeTool<Customer[]>('customer.search', { query: name }, ctx)
    if (!matches.length) {
      return {
        reply: `I couldn’t find a customer called “${name}”. Try a name from the Leads screen, or run Scenario 1 in Demo Studio to create Sarah Jacobs.`,
        view: { kind: 'none' },
        suggestions,
      }
    }
    const customer = matches[0]
    const lead = repo
      .list('leads', (l) => l.customer_id === customer.id && l.product_category === 'motor')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!lead) {
      return { reply: `${customer.full_name} has no motor lead yet, so there is nothing to compare.`, view: { kind: 'none' }, suggestions: COPILOT_SUGGESTIONS }
    }
    const existing = repo
      .list('jobs', (j: Job) => j.lead_id === lead.id && j.workflow_type === 'motor_new_lead')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (existing && (!TERMINAL.includes(existing.status) || lead.status === 'proposal_released')) {
      return {
        reply: `There is already a comparison job for ${customer.full_name} (${existing.status.replace(/_/g, ' ')}). Opening it instead of starting a duplicate.`,
        view: { kind: 'job', title: `Comparison for ${customer.full_name}`, job_id: existing.id },
        suggestions: ['Show pending approvals'],
      }
    }
    if (!lead.qualification.vehicle?.value) {
      return { reply: `${customer.full_name}’s lead is missing the vehicle value, so I can’t request options yet.`, view: { kind: 'none' }, suggestions: COPILOT_SUGGESTIONS }
    }
    const job = startMotorLeadWorkflow(repo, actor, { source: 'broker_copilot', details: lead.qualification.vehicle, lead_id: lead.id })
    return {
      reply: `Started a comparison for ${customer.full_name}. The Risk and Quote agents are working now; the proposal will wait in Approvals for your decision.`,
      view: { kind: 'job', title: `Comparison for ${customer.full_name}`, job_id: job.id },
      suggestions: ['Show pending approvals', 'Show running jobs'],
    }
  }

  if (/approv/.test(t)) {
    const ids = repo.list('approval_requests', (a) => a.status === 'pending').map((a) => a.id)
    return {
      reply: ids.length ? `${ids.length} approval${ids.length > 1 ? 's are' : ' is'} waiting for a decision.` : 'Nothing is waiting for approval.',
      view: { kind: 'approvals', title: 'Pending approvals', approval_ids: ids },
      suggestions,
    }
  }

  if (/lead/.test(t)) {
    const onlyNew = /new|open|unqualified/.test(t)
    const ids = repo
      .list('leads', (l) => (onlyNew ? ['new', 'qualifying', 'qualified'].includes(l.status) : OPEN_LEAD.includes(l.status)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((l) => l.id)
    return {
      reply: `${ids.length} ${onlyNew ? 'new or qualifying' : 'open'} lead${ids.length === 1 ? '' : 's'}.`,
      view: { kind: 'leads', title: onlyNew ? 'New and qualifying leads' : 'Open leads', lead_ids: ids },
      suggestions,
    }
  }

  if (/job|task|running|agent/.test(t)) {
    const ids = repo
      .list('jobs', (j) => !j.archived_at && (/running|active/.test(t) ? !TERMINAL.includes(j.status) : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => j.id)
    return {
      reply: `${ids.length} job${ids.length === 1 ? '' : 's'} found.`,
      view: { kind: 'jobs', title: /running|active/.test(t) ? 'Active jobs' : 'Recent jobs', job_ids: ids },
      suggestions,
    }
  }

  const later = LATER_PHASE.find(([re]) => re.test(t))
  const can =
    mode === 'commercial'
      ? 'I can review a business (for example “Review Ubuntu Foods”), show commercial clients, draft submissions, approvals and jobs.'
      : 'I can show pending approvals, new leads and jobs, create a quote comparison for a customer with a motor lead, or review a commercial client.'
  return {
    reply: later ? `${later[1]} In this build ${can}` : `In this build ${can}`,
    view: { kind: 'none' },
    suggestions,
  }
}
