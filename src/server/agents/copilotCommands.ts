import type { AssessmentType, BusinessProfile, TwinTable } from '../db/commercialSchema'
import type { Customer, Job, LeadStatus } from '../db/schema'
import type { Repo } from '../db/store'
import { compactRand } from '../domain/commercial/format'
import type { ImpactReport } from '../domain/commercial/graph'
import { invokeTool, type Actor } from '../tools/registry'
import type { ChangeReport } from '../tools/twin'
import { activeCommercialJob, startAssessment, startCommercialReview, startInvestigation, startTwinBuild } from './commercialOrchestrator'
import { startMotorLeadWorkflow } from './orchestrator'
import { CONTROLS_SUGGESTIONS, LIFE_SUGGESTIONS, russCommand } from './russ'

export type CopilotView =
  | { kind: 'approvals'; title: string; approval_ids: string[] }
  | { kind: 'leads'; title: string; lead_ids: string[] }
  | { kind: 'jobs'; title: string; job_ids: string[] }
  | { kind: 'job'; title: string; job_id: string }
  | { kind: 'business'; title: string; profile_id: string; job_id: string | null }
  | { kind: 'businesses'; title: string; profile_ids: string[] }
  | { kind: 'submissions'; title: string; submission_ids: string[] }
  | {
      kind: 'twin'
      title: string
      profile_id: string
      job_id: string | null
      focus: 'assessment' | 'graph' | 'actions' | 'insurance' | 'changes'
      impact?: { risk_profile_id: string; table: TwinTable; id: string }
    }
  | { kind: 'life_case'; title: string; customer_id: string; job_id: string | null }
  | { kind: 'life_servicing'; title: string }
  | { kind: 'policies'; title: string; customer_id: string | null }
  | { kind: 'reconciliation'; title: string; run_id: string | null; job_id: string | null }
  | { kind: 'exceptions'; title: string; customer_id: string | null }
  | { kind: 'movements'; title: string; employer_id: string; job_id: string | null }
  | { kind: 'links'; title: string; items: Array<{ label: string; to: string; detail: string; badge?: string }> }
  | { kind: 'none' }

export interface CopilotTurn {
  reply: string
  view: CopilotView
  suggestions: string[]
  /** Set when the broker should be interviewed about a business that has no profile yet. */
  discovery?: { business_name: string }
}

export const COPILOT_SUGGESTIONS = [
  'Show pending approvals',
  'Reconcile the October payroll against the administrator contribution schedule',
  'Start life advice for Johan van der Merwe',
  'Show new leads',
  'Create a quote comparison for Ayanda Khumalo',
  'Show running jobs',
]

export const COMMERCIAL_COPILOT_SUGGESTIONS = [
  'Assess Ubuntu Foods and identify the five most important risk areas requiring review',
  'Create a Risk Twin for Ubuntu Foods',
  'Which Risk Twins need attention?',
  'Review Ubuntu Foods and identify outstanding insurance questions',
  'Show commercial clients',
  'Show draft submissions',
  'Show pending approvals',
]

const OPEN_SUBMISSION = ['draft', 'awaiting_approval', 'approved']

const nameOf = (p: BusinessProfile) => p.trading_name ?? p.registered_name
const currentTwin = (repo: Repo, profileId: string) =>
  repo.find('business_risk_profiles', (r) => r.business_profile_id === profileId && r.status === 'current')

const TWIN_SUGGESTIONS = ['Which Risk Twins need attention?', 'Show running jobs', 'Show commercial clients']

/** "Create / build / rebuild a Risk Twin for X": reuse what exists, build what is missing, interview for what is new. */
function twinCommand(repo: Repo, actor: Actor, raw: string): CopilotTurn | null {
  const m = raw.match(/^\s*(?:please\s+)?(create|build|make|set\s+up|start|rebuild|refresh)\b.*?\brisk[\s-]?twins?\b(?:\s+(?:for|of)(?:\s+(.*))?)?\s*$/i)
  if (!m) return null
  const rebuild = /rebuild|refresh/i.test(m[1])
  const name = (m[2] ?? '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/^(?:new\s+)?(?:company|business|client)\s+(?:called|named)\s+/i, '')
    .replace(/^(?:called|named)\s+/i, '')
    .replace(/[“”"'.?!]+/g, '')
    .trim()
  if (name.length < 2) {
    return {
      reply: 'Which business should I build a Risk Twin for? Give me its registered or trading name, for example “Create a Risk Twin for Ubuntu Foods”.',
      view: { kind: 'none' },
      suggestions: ['Create a Risk Twin for Ubuntu Foods', 'Show commercial clients'],
    }
  }

  const matches = invokeTool<Array<{ profile: BusinessProfile; customer: Customer }>>('business.discover', { query: name }, { repo, actor })
  if (!matches.length) {
    return {
      reply:
        `I couldn’t find “${name}” among your commercial clients, so I’ll treat it as a new business. ` +
        'Describe what it does and where it operates in a sentence, and I’ll run a short discovery interview. Answer on the client’s behalf; ' +
        'I only ask what the industry template needs. Say “cancel” at any point to stop without saving.',
      view: { kind: 'none' },
      suggestions: [],
      discovery: { business_name: name },
    }
  }
  const exact = matches.filter((x) => [x.profile.registered_name, x.profile.trading_name].some((n) => n?.toLowerCase() === name.toLowerCase()))
  if (matches.length > 1 && exact.length !== 1) {
    return {
      reply: `“${name}” matches ${matches.length} clients: ${matches.map((x) => nameOf(x.profile)).join(', ')}. Which one did you mean?`,
      view: { kind: 'businesses', title: `Matches for “${name}”`, profile_ids: matches.map((x) => x.profile.id) },
      suggestions: matches.slice(0, 3).map((x) => `Create a Risk Twin for ${nameOf(x.profile)}`),
    }
  }
  const profile = (exact[0] ?? matches[0]).profile
  const label = nameOf(profile)
  const twin = currentTwin(repo, profile.id)
  const active = activeCommercialJob(repo, profile.customer_id)
  if (active) {
    return {
      reply: `${label} already has a job ${active.status.replace(/_/g, ' ')}. Opening it instead of starting a duplicate.`,
      view: { kind: 'business', title: `Risk Twin: ${label}`, profile_id: profile.id, job_id: active.id },
      suggestions: TWIN_SUGGESTIONS,
    }
  }
  if (twin && !rebuild) {
    return {
      reply:
        `${label} is an existing client and already has Risk Twin v${twin.version} (${twin.node_count} records, ${twin.edge_count} relationships). ` +
        `Opening it instead of creating a duplicate. Say “Rebuild the Risk Twin for ${label}” to build a new version from the current records.`,
      view: { kind: 'business', title: `Risk Twin: ${label}`, profile_id: profile.id, job_id: null },
      suggestions: [`Rebuild the Risk Twin for ${label}`, `Review ${label} and identify outstanding insurance questions`],
    }
  }
  const { job } = startTwinBuild(repo, actor, profile.id)
  return {
    reply:
      `${label} is an existing client, so I’m building ${twin ? `version ${twin.version + 1} of its Risk Twin` : 'its Risk Twin'} from the records you already hold. ` +
      'Plan: 1) retrieve the business profile, 2) link its entities, locations, activities and assets, 3) identify potential exposures from the ' +
      'industry template, 4) list missing information and create document requests. No submission pack is drafted and nothing is sent to an insurer.',
    view: { kind: 'business', title: `Risk Twin: ${label}`, profile_id: profile.id, job_id: job.id },
    suggestions: [`Review ${label} and identify outstanding insurance questions`, ...TWIN_SUGGESTIONS.slice(0, 2)],
  }
}

/** Clients whose Twin is missing or has open high-priority work, with the reason for each. */
function attentionCommand(repo: Repo): CopilotTurn {
  const rows = repo
    .list('business_profiles', (p) => p.status !== 'archived')
    .map((p) => {
      const twin = currentTwin(repo, p.id)
      const high = twin ? repo.list('risk_exposures', (e) => e.risk_profile_id === twin.id && e.priority === 'high').length : 0
      const brokerTasks = repo.list('tasks', (t) => t.subject_id === p.id && t.status === 'open' && t.audience === 'broker').length
      const reasons = [
        !twin && 'no Risk Twin yet',
        high && `${high} high advisory priority exposure${high === 1 ? '' : 's'}`,
        brokerTasks && `${brokerTasks} open broker task${brokerTasks === 1 ? '' : 's'}`,
      ].filter(Boolean) as string[]
      return { p, reasons, score: (twin ? 0 : 100) + high * 10 + brokerTasks }
    })
    .filter((r) => r.reasons.length)
    .sort((a, b) => b.score - a.score)
  if (!rows.length) {
    return { reply: 'Every commercial client has a Risk Twin with no high-priority exposures or open broker tasks.', view: { kind: 'none' }, suggestions: COMMERCIAL_COPILOT_SUGGESTIONS }
  }
  const lines = rows.slice(0, 6).map((r) => `• ${nameOf(r.p)}: ${r.reasons.join('; ')}`)
  const first = rows[0].p
  return {
    reply: `${rows.length} client${rows.length === 1 ? ' needs' : 's need'} attention:\n${lines.join('\n')}${rows.length > 6 ? `\n…and ${rows.length - 6} more.` : ''}`,
    view: { kind: 'businesses', title: 'Risk Twins needing attention', profile_ids: rows.map((r) => r.p.id) },
    suggestions: [currentTwin(repo, first.id) ? `Review ${nameOf(first)} and identify outstanding insurance questions` : `Create a Risk Twin for ${nameOf(first)}`, 'Show running jobs'],
  }
}

const STOP = new Set(['the', 'a', 'an', 'our', 'their', 'its', 'of', 'and', 'at', 'for', 'in', 'on', 'main', 'whole'])
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/(?:es|s)$/, ''))

/** Share of the query's words found in the label; 0 when nothing matches. */
function matchScore(query: string, label: string) {
  const q = tokens(query)
  const l = new Set(tokens(label))
  return q.length ? q.filter((w) => l.has(w) || [...l].some((x) => x.startsWith(w) || w.startsWith(x))).length / q.length : 0
}

type Found = { profile: BusinessProfile } | { reply: CopilotTurn }

/** Resolves a business by name, asking which one when several match. */
function findBusiness(repo: Repo, actor: Actor, name: string): Found {
  const matches = invokeTool<Array<{ profile: BusinessProfile }>>('business.discover', { query: name }, { repo, actor })
  if (!matches.length) {
    return { reply: { reply: `I couldn’t find a commercial client called “${name}”.`, view: { kind: 'none' }, suggestions: COMMERCIAL_COPILOT_SUGGESTIONS } }
  }
  const exact = matches.filter((x) => [x.profile.registered_name, x.profile.trading_name].some((n) => n?.toLowerCase() === name.toLowerCase()))
  if (matches.length > 1 && exact.length !== 1) {
    return {
      reply: {
        reply: `“${name}” matches ${matches.length} clients: ${matches.map((x) => nameOf(x.profile)).join(', ')}. Which one did you mean?`,
        view: { kind: 'businesses', title: `Matches for “${name}”`, profile_ids: matches.map((x) => x.profile.id) },
        suggestions: [],
      },
    }
  }
  return { profile: (exact[0] ?? matches[0]).profile }
}

const needTwin = (profile: BusinessProfile): CopilotTurn => ({
  reply: `${nameOf(profile)} has no Risk Twin yet, so there is nothing to trace or compare. Build it first.`,
  view: { kind: 'none' },
  suggestions: [`Create a Risk Twin for ${nameOf(profile)}`],
})

const assessmentTypeFrom = (t: string): AssessmentType =>
  /renewal/.test(t)
    ? 'annual_renewal'
    : /new (location|site|premises)/.test(t)
      ? 'new_location'
      : /new asset/.test(t)
        ? 'new_asset'
        : /change/.test(t)
          ? 'business_change'
          : /incident|claim|loss/.test(t)
            ? 'incident_triggered'
            : 'initial'

/** "What happens if the blast freezer fails?": explicit graph traversal, recorded values only. */
function impactCommand(repo: Repo, actor: Actor, raw: string): CopilotTurn | null {
  const m = raw.match(
    /what\s+(?:happens|would happen|is the impact|happens to the business)\s+if\s+(.+?)\s+(?:fails?|breaks?(?:\s+down)?|goes?\s+down|stops?(?:\s+working)?|is\s+(?:lost|damaged|destroyed|unavailable|down))(?:\s+(?:at|for)\s+(.+?))?\s*[?.!]*$/i,
  )
  if (!m) return null
  const item = m[1].replace(/^(?:the|our|their)\s+/i, '').trim()
  const profiles: BusinessProfile[] = []
  if (m[2]) {
    const found = findBusiness(repo, actor, m[2].trim())
    if ('reply' in found) return found.reply
    profiles.push(found.profile)
  } else {
    profiles.push(...repo.list('business_profiles', (p) => p.status !== 'archived' && Boolean(currentTwin(repo, p.id))))
  }
  const candidates = profiles.flatMap((p) => {
    const rows: Array<{ profile: BusinessProfile; table: TwinTable; id: string; label: string; score: number }> = [
      ...repo.list('commercial_assets', (a) => a.business_profile_id === p.id).map((a) => ({ profile: p, table: 'commercial_assets' as const, id: a.id, label: a.description, score: 0 })),
      ...repo.list('business_activities', (a) => a.business_profile_id === p.id).map((a) => ({ profile: p, table: 'business_activities' as const, id: a.id, label: a.name, score: 0 })),
      ...repo.list('business_locations', (l) => l.business_profile_id === p.id).map((l) => ({ profile: p, table: 'business_locations' as const, id: l.id, label: l.name, score: 0 })),
    ]
    return rows.map((r) => ({ ...r, score: matchScore(item, r.label) })).filter((r) => r.score >= 0.5)
  })
  if (!candidates.length) {
    return {
      reply: `I couldn’t find “${item}” among the recorded assets, operations or locations${profiles.length === 1 ? ` of ${nameOf(profiles[0])}` : ''}. Name it as it appears in the Risk Twin, for example “What happens if the blast freezers fail at Ubuntu Foods?”`,
      view: { kind: 'none' },
      suggestions: ['What happens if the blast freezers fail at Ubuntu Foods?'],
    }
  }
  const best = Math.max(...candidates.map((c) => c.score))
  const top = candidates.filter((c) => c.score === best)
  const businesses = [...new Set(top.map((c) => c.profile.id))]
  if (businesses.length > 1) {
    return {
      reply: `“${item}” appears at ${businesses.length} businesses. Which one? For example “What happens if the ${item} fails at ${nameOf(top[0].profile)}?”`,
      view: { kind: 'businesses', title: `Businesses with “${item}”`, profile_ids: businesses },
      suggestions: top.slice(0, 2).map((c) => `What happens if the ${item} fails at ${nameOf(c.profile)}?`),
    }
  }
  const target = top[0]
  const rp = currentTwin(repo, target.profile.id)
  if (!rp) return needTwin(target.profile)
  const impact = invokeTool<ImpactReport>('risk.trace_impact', { risk_profile_id: rp.id, table: target.table, id: target.id }, { repo, actor })
  const values = impact.known_values.slice(0, 4).map((v) => `• ${v.label}: ${compactRand(v.value)} (${v.basis}, ${v.source})`)
  const missing = impact.missing.slice(0, 4).map((x) => `• ${x}`)
  const paths = impact.paths.slice(0, 4).map((p) => `• ${p.labels.join(' → ')}${p.inferred ? ' (includes AI-inferred links)' : ''}`)
  return {
    reply: [
      impact.summary,
      paths.length ? `\nAffected paths:\n${paths.join('\n')}` : '',
      values.length ? `\nKnown values (not a loss estimate):\n${values.join('\n')}` : '',
      missing.length ? `\nMissing information:\n${missing.join('\n')}` : '',
      '\nThe paths are highlighted on the Risk Twin graph.',
    ]
      .filter(Boolean)
      .join('\n'),
    view: { kind: 'twin', title: `Impact: ${target.label}`, profile_id: target.profile.id, job_id: null, focus: 'graph', impact: { risk_profile_id: rp.id, table: target.table, id: target.id } },
    suggestions: [`Investigate possible underinsurance at ${nameOf(target.profile)}`, `Assess ${nameOf(target.profile)} and identify the five most important risk areas requiring review`],
  }
}

/** "Investigate possible underinsurance at X" or "Investigate <exposure> at X". */
function investigateCommand(repo: Repo, actor: Actor, raw: string): CopilotTurn | null {
  const m = raw.match(/^\s*(?:please\s+)?investigate\s+(?:the\s+)?(?:possible\s+|potential\s+)?(.+?)\s+(?:at|for|of)\s+(.+?)\s*[?.!]*$/i)
  if (!m) return null
  const found = findBusiness(repo, actor, m[2].trim())
  if ('reply' in found) return found.reply
  const profile = found.profile
  const label = nameOf(profile)
  const subject = m[1].trim()
  if (/under[\s-]?insur|sums? insured|valuation/i.test(subject)) {
    const { job, reused } = startInvestigation(repo, actor, profile.id, 'underinsurance', { request: raw })
    return {
      reply: reused
        ? `A job for ${label} is already ${job.status.replace(/_/g, ' ')}. Opening it instead of starting a duplicate.`
        : `Investigating possible underinsurance at ${label}. Plan: 1) retrieve the business and asset records, 2) retrieve the policy schedules on file, ` +
          '3) compare declared values with sums insured group by group, 4) identify missing valuations, 5) prepare findings, 6) create proposed actions, ' +
          '7) hold the findings for your review. Only recorded values are compared; no loss or premium is estimated.',
      view: { kind: 'twin', title: `Investigation: ${label}`, profile_id: profile.id, job_id: job.id, focus: 'actions' },
      suggestions: ['Show pending approvals', `Compare ${label} with its last assessment`],
    }
  }
  const rp = currentTwin(repo, profile.id)
  if (!rp) return needTwin(profile)
  const exposures = repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id).map((e) => ({ e, score: matchScore(subject, e.title) }))
  const best = exposures.sort((a, b) => b.score - a.score)[0]
  if (!best || best.score < 0.5) {
    return {
      reply: `I couldn’t match “${subject}” to an exposure at ${label}. Try “Investigate possible underinsurance at ${label}”, or open the Twin and use Investigate on a finding.`,
      view: { kind: 'twin', title: `Risk Twin: ${label}`, profile_id: profile.id, job_id: null, focus: 'assessment' },
      suggestions: [`Investigate possible underinsurance at ${label}`],
    }
  }
  const { job, reused } = startInvestigation(repo, actor, profile.id, 'exposure', { exposure_id: best.e.id, request: raw })
  return {
    reply: reused
      ? `An investigation of “${best.e.title}” is already ${job.status.replace(/_/g, ' ')}. Opening it.`
      : `Investigating “${best.e.title}” at ${label}: linked records, impact paths, policy evidence and open questions. Findings wait for your review.`,
    view: { kind: 'twin', title: `Investigation: ${best.e.title}`, profile_id: profile.id, job_id: job.id, focus: 'actions' },
    suggestions: ['Show pending approvals'],
  }
}

/** "Compare X with its last renewal assessment". */
function compareCommand(repo: Repo, actor: Actor, raw: string): CopilotTurn | null {
  const m = raw.match(/^\s*(?:please\s+)?compare\s+(.+?)\s+(?:with|to|against)\s+(?:its|the|their)\s+(?:last|previous|latest|most recent)\s+(?:renewal\s+)?(?:assessment|version|twin|risk twin)\s*[?.!]*$/i)
  if (!m) return null
  const found = findBusiness(repo, actor, m[1].replace(/['’]s$/, '').trim())
  if ('reply' in found) return found.reply
  const profile = found.profile
  if (!currentTwin(repo, profile.id)) return needTwin(profile)
  const report = invokeTool<ChangeReport>('risk.compare_versions', { profile_id: profile.id }, { repo, actor })
  const lines = report.changes.slice(0, 6).map((c) => `• ${c.label}: ${c.finding}`)
  return {
    reply: report.changes.length
      ? `Compared ${nameOf(profile)} with the ${report.baseline.label}. ${report.changes.length} change${report.changes.length === 1 ? '' : 's'}:\n${lines.join('\n')}${
          report.changes.length > 6 ? `\n…and ${report.changes.length - 6} more.` : ''
        }\n${report.tasks_created} broker review task${report.tasks_created === 1 ? '' : 's'} created.`
      : `No changes in the recorded business since the ${report.baseline.label}.`,
    view: { kind: 'twin', title: `Changes: ${nameOf(profile)}`, profile_id: profile.id, job_id: null, focus: 'changes' },
    suggestions: [`Assess ${nameOf(profile)} and identify the five most important risk areas requiring review`],
  }
}

/** "Assess X and identify the five most important risk areas requiring review". */
function assessCommand(repo: Repo, actor: Actor, raw: string, t: string): CopilotTurn | null {
  const m = raw.match(/^\s*(?:please\s+)?(?:assess|analy[sz]e|run\s+(?:an?\s+)?(?:\w+\s+)?(?:risk\s+)?assessment\s+(?:for|of|on))\s+(.+?)(?:\s+and\s+.*|\s+for\s+(?:its\s+)?(?:renewal|new\s+\w+).*|[.?!])?$/i)
  if (!m || /\b(renewals?|claims?|approvals?|leads?|jobs?)\b/i.test(m[1])) return null
  const found = findBusiness(repo, actor, m[1].replace(/['’]s$/, '').trim())
  if ('reply' in found) return found.reply
  const profile = found.profile
  const label = nameOf(profile)
  const { job, reused } = startAssessment(repo, actor, profile.id, assessmentTypeFrom(t), raw)
  return {
    reply: reused
      ? `${label} already has a job ${job.status.replace(/_/g, ' ')}. Opening it instead of starting a duplicate.`
      : `Assessing ${label}. Plan: 1) retrieve the business profile, 2) load the Risk Twin, 3) apply the industry template, 4) analyse recorded assets and dependencies, ` +
        '5) identify exposures, 6) check the insurance evidence on file, 7) prioritise findings with explanations and mark the five most important areas, ' +
        '8) request missing information and create broker review tasks, 9) hold the assessment for your sign-off, 10) save it. ' +
        'No coverage is assumed and no loss is estimated.',
    view: { kind: 'twin', title: `Assessment: ${label}`, profile_id: profile.id, job_id: job.id, focus: 'assessment' },
    suggestions: ['Show pending approvals', `What happens if the blast freezers fail at ${label}?`],
  }
}

function commercialCommand(repo: Repo, actor: Actor, raw: string, t: string): CopilotTurn | null {
  const ctx = { repo, actor }
  const twin = twinCommand(repo, actor, raw)
  if (twin) return twin
  const special = impactCommand(repo, actor, raw) ?? investigateCommand(repo, actor, raw) ?? compareCommand(repo, actor, raw) ?? assessCommand(repo, actor, raw, t)
  if (special) return special
  if (/\b(need|needs|needing|require|requires)\s+(attention|review|action)\b|\battention\b/.test(t)) return attentionCommand(repo)

  const review = raw.match(/^\s*(?:please\s+)?(?:review|risk[\s-]review)\s+(.+?)(?:\s+and\s+.*|[.?!])?$/i)
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
    const open = activeCommercialJob(repo, profile.customer_id)
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

export type CopilotMode = 'personal' | 'commercial' | 'life' | 'controls'

export function handleCopilotCommand(repo: Repo, actor: Actor, text: string, mode: CopilotMode = 'personal'): CopilotTurn {
  const t = text.toLowerCase().trim()
  const ctx = { repo, actor }
  const suggestions = mode === 'commercial' ? COMMERCIAL_COPILOT_SUGGESTIONS : mode === 'life' ? LIFE_SUGGESTIONS : mode === 'controls' ? CONTROLS_SUGGESTIONS : COPILOT_SUGGESTIONS

  const russ = russCommand(repo, actor, text, t)
  if (russ) return russ

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
      : mode === 'life'
        ? 'I can start life advice for a client with a financial profile, show policies, and run the servicing scan.'
        : mode === 'controls'
          ? 'I can reconcile payroll against the administrator contribution schedule, process employee movements, reconcile holdings and show financial exceptions.'
          : 'I can show approvals, leads and jobs, compare motor quotes, review a commercial client, start life advice, reconcile contributions, process employee movements, and report on transfers, investments and cell captives.'
  return {
    reply: later ? `${later[1]} In this build ${can}` : `In this build ${can}`,
    view: { kind: 'none' },
    suggestions,
  }
}
