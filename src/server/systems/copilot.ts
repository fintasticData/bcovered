import { TARGET_LABEL } from './components'
import type { SystemsCatalogue } from './catalogue'
import type { DomainKey } from './plannedSchema'
import { AREA_LABEL } from './screens'

export type SystemsTab = 'overview' | 'database' | 'frontend' | 'backend' | 'integrations' | 'agents' | 'workflows' | 'audit'
export type DatabaseView = 'erd' | 'tables' | 'screens' | 'plan'

/** Where an answer opens in the editor pane. */
export interface SystemsFocus {
  tab: SystemsTab
  view?: DatabaseView
  domain?: DomainKey | 'all'
  item?: string
  label: string
}

export interface SystemsAnswer {
  reply: string
  focus: SystemsFocus | null
  quick_replies: string[]
}

export const SYSTEMS_SUGGESTIONS = [
  'Which screens are missing tables?',
  'What tables does /claims need?',
  'Show the Risk Twin ERD',
  'How do I create the database instance?',
  'What tools has the Coverage Analyst used?',
  'Are any jobs failing?',
]

const ROUTE_ALIASES: Array<[RegExp, string]> = [
  [/\bclaims? (page|form|screen)|log a claim|track a claim/, '/claims'],
  [/quick quote|quote (page|form)/, '/quote'],
  [/contact (page|form)|callback/, '/contact'],
  [/submission editor/, '/broker/commercial/submissions/:submissionId'],
  [/twin workspace/, '/broker/commercial/risk-twins/:profileId'],
  [/risk twins? (page|portfolio)|portfolio/, '/broker/commercial/risk-twins'],
  [/approvals? (page|screen)/, '/broker/approvals'],
  [/business portal/, '/portal/business'],
  [/customer portal|my portal/, '/portal'],
  [/broker overview|overview page/, '/broker'],
]

const DOMAIN_ALIASES: Array<[RegExp, DomainKey]> = [
  [/twin|commercial|exposure|assessment/, 'twin'],
  [/claim|polic/, 'policies_claims'],
  [/quot/, 'personal'],
  [/submission/, 'submissions'],
  [/agent|copilot|job|workflow|approval|audit/, 'agent_ops'],
  [/system|component|health|endpoint/, 'systems'],
  [/reference|lookup|industr|cover class|insurer/, 'reference'],
  [/customer|lead|crm|contact|enquir|conversation/, 'crm'],
  [/platform|identity|tenant|user|role|auth/, 'platform'],
]

const humanise = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const withArticle = (word: string) => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`

const list = (items: string[], max = 8) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '))

export function answerSystemsQuestion(cat: SystemsCatalogue, question: string): SystemsAnswer {
  const q = question.toLowerCase().trim()
  const s = cat.summary
  const reply = (text: string, focus: SystemsFocus | null, quick: string[] = SYSTEMS_SUGGESTIONS.slice(0, 4)): SystemsAnswer => ({ reply: text, focus, quick_replies: quick })

  if (!q || /^(hi|hello|hey|help|what can you do)\b/.test(q)) {
    return reply(
      `I explain how InsureFlow is put together, from the Systems catalogue only. Ask about the planned database (${s.planned_tables} tables), which tables a screen needs, agents and copilots, tools, workflows and jobs, API endpoints or integrations. Each answer opens the matching item on the right.`,
      { tab: 'overview', label: 'Systems overview' },
      SYSTEMS_SUGGESTIONS,
    )
  }

  if (/gap|missing table|not stored|browser storage|align|without a table/.test(q)) {
    const gaps = cat.screens.filter((x) => x.gap)
    return reply(
      `${gaps.length} screens have no proper tables behind them yet:\n\n${gaps.map((g) => `• ${g.route} (${g.label}): ${g.gap}`).join('\n')}\n\nEvery other screen is mapped to planned tables.`,
      { tab: 'database', view: 'screens', item: gaps[0]?.route, label: 'Screens and their tables' },
    )
  }

  if (/instance|create (the )?(database|project)|supabase project|set ?up (the )?database|mcp|aivoortrekker|insureflow-dev/.test(q)) {
    return reply(
      `The bcovered Supabase project (cgwgmzpcrvimoqaxgoop) is live: migrations 0001–0018 are applied, Sample data is loaded, and the bcovered-mcp and copilot-agent Edge Functions serve AR, Ava and Russ. Remaining steps for production:\n\n${cat.instance_steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nNever use the aivoortrekker project for InsureFlow.`,
      { tab: 'database', view: 'plan', label: 'Database plan and instance' },
    )
  }

  if (/decision|row.level|rls|security polic|read supabase|direct/.test(q)) {
    return reply(
      cat.decisions.map((d) => `• ${d.title}: ${d.detail}`).join('\n'),
      { tab: 'database', view: 'plan', label: 'Database decisions' },
    )
  }

  const routeToken = q.match(/\/[a-z0-9\-/:]*/)?.[0]?.replace(/\/$/, '') || null
  const byRoute = routeToken ? cat.screens.find((x) => x.route === routeToken || x.route === `/broker${routeToken}`) : undefined
  const byAlias = ROUTE_ALIASES.find(([re]) => re.test(q))?.[1]
  const screen = byRoute ?? (byAlias ? cat.screens.find((x) => x.route === byAlias) : undefined)
  if (screen) {
    const where = screen.tables.length ? `It needs ${screen.tables.length} tables: ${screen.tables.join(', ')}.` : `It needs no tables; content comes from ${screen.content}.`
    const access = screen.roles.length ? `Open to ${screen.roles.join(', ')}.` : 'Open to anyone.'
    return reply(
      `${screen.label} (${screen.route}) is in ${AREA_LABEL[screen.area]}. ${access} ${where}${screen.gap ? `\n\nGap: ${screen.gap}` : ''}`,
      { tab: 'database', view: 'screens', item: screen.route, label: screen.label },
    )
  }

  const mentions = (phrase: string) => new RegExp(`\\b${phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q)
  const agent = cat.agents.find((a) => mentions(a.label) || mentions(a.key) || mentions(a.key.replace(/_/g, ' ')))
  if (agent) {
    const steps = agent.steps.length ? `It owns ${agent.steps.length} workflow step${agent.steps.length === 1 ? '' : 's'}, for example “${agent.steps[0].name}” in ${agent.steps[0].workflow_title}.` : 'It owns no workflow steps.'
    const used = agent.tools_used.length ? `In this browser it has called: ${list(agent.tools_used)}.` : 'It has not called any tools in this browser yet.'
    const surface = agent.surfaces.length ? ` You talk to it at ${agent.surfaces.map((x) => x.route).join(', ')}.` : ''
    return reply(
      `${agent.label} is ${withArticle(agent.kind)}: ${agent.role}. ${steps} ${used} Runs recorded: ${agent.runs} (${agent.failed_runs} failed).${surface}`,
      { tab: 'agents', item: agent.key, label: agent.label },
    )
  }

  const tool = cat.tools.find((t) => q.includes(t.name.toLowerCase()))
  if (tool) {
    return reply(
      `${tool.name}: ${tool.description} ${tool.side_effect ? 'It changes data, so calls are audited and deduplicated.' : 'It only reads data.'} Allowed for: ${tool.allow.join(', ')}. Calls in this browser: ${tool.calls} (${tool.errors} errors, ${tool.blocked} blocked).`,
      { tab: 'agents', item: `tool:${tool.name}`, label: tool.name },
    )
  }

  // Single-word names such as jobs or claims only count as a table when the question says so.
  const words = new Set(q.split(/[^a-z_]+/))
  const saysTable = /\btables?\b/.test(q)
  const table = [...cat.schema.tables]
    .sort((a, b) => b.name.length - a.name.length)
    .find((t) => (t.name.includes('_') || saysTable) && (words.has(t.name) || (t.name.includes('_') && q.includes(t.name.replace(/_/g, ' ')))))
  if (table) {
    const incoming = cat.schema.relationships.filter((r) => r.to === table.name).map((r) => r.from)
    const used = cat.screens.filter((x) => x.tables.includes(table.name)).map((x) => x.route)
    return reply(
      `${table.name} (${humanise(table.status).toLowerCase()}, ${table.scope}): ${table.purpose}${table.changes?.length ? `\n\nChanges: ${table.changes.join('; ')}.` : ''}${table.replaces?.length ? `\n\nReplaces: ${table.replaces.join(', ')}.` : ''}\n\nReferenced by ${incoming.length ? list([...new Set(incoming)]) : 'no other table'}. Used on ${used.length ? list(used, 6) : 'no screen directly'}.`,
      { tab: 'database', view: 'tables', item: table.name, label: table.name },
    )
  }
  const removed = cat.schema.removed.find((r) => words.has(r.name))
  if (removed) {
    return reply(`${removed.name} is not in the target schema. ${removed.reason} Its successor is ${removed.successor}.`, {
      tab: 'database',
      view: 'tables',
      item: removed.successor,
      label: removed.successor,
    })
  }

  if (/erd|diagram|schema|normalis|normaliz|data model|tables/.test(q)) {
    const domain = DOMAIN_ALIASES.find(([re]) => re.test(q))?.[1]
    const d = domain ? cat.schema.domains.find((x) => x.key === domain) : undefined
    if (d) {
      const count = cat.schema.tables.filter((t) => t.domain === d.key).length
      return reply(`${d.label}: ${count} tables. ${d.summary}`, { tab: 'database', view: 'erd', domain: d.key, label: `${d.label} ERD` })
    }
    return reply(
      `The target schema has ${s.planned_tables} tables in ${cat.schema.domains.length} areas: ${s.new_tables} new, ${s.reshaped_tables} reshaped and ${s.carried_tables} carried over, with ${s.relationships} relationships. ${s.removed_tables} current tables are merged or renamed. Lists of IDs and repeated groups move out of JSON fields into linking and child tables, free-text references become real references, and every tenant table gets tenant-safe foreign keys.`,
      { tab: 'database', view: 'erd', domain: 'all', label: 'Full ERD' },
    )
  }

  if (/fail|error|stuck|broken/.test(q)) {
    const failing = cat.workflows.filter((w) => w.jobs_by_status.failed)
    return reply(
      s.failed_jobs
        ? `${s.failed_jobs} jobs have failed: ${failing.map((w) => `${w.title} (${w.jobs_by_status.failed})`).join(', ')}. Open Tasks & Jobs to retry them.`
        : `No jobs have failed in this browser. ${s.active_jobs} are active.`,
      { tab: 'workflows', item: failing[0]?.type, label: 'Workflows and jobs' },
    )
  }

  if (/workflow|job/.test(q)) {
    return reply(
      `${s.workflows} workflows are registered:\n\n${cat.workflows.map((w) => `• ${w.title}: ${w.steps.length} steps, ${w.total_jobs} jobs so far`).join('\n')}`,
      { tab: 'workflows', label: 'Workflows and jobs' },
    )
  }

  if (/endpoint|api|backend|edge function|database function/.test(q)) {
    const byTarget = Object.entries(
      cat.endpoints.reduce<Record<string, number>>((acc, e) => ((acc[e.target] = (acc[e.target] ?? 0) + 1), acc), {}),
    ).map(([t, n]) => `${n} ${TARGET_LABEL[t as keyof typeof TARGET_LABEL].toLowerCase()}`)
    return reply(
      `The frontend calls ${s.endpoints} endpoints through src/api/client.ts. Once it reads Supabase directly they become: ${byTarget.join(', ')}.`,
      { tab: 'backend', label: 'Backend and endpoints' },
    )
  }

  if (/integrat|fal|llm|model|key|secret|insurer|whatsapp|email|storage/.test(q)) {
    const ext = cat.components.filter((c) => c.kind === 'external_api' || c.kind === 'storage')
    return reply(ext.map((c) => `• ${c.name}: ${humanise(c.status)}. ${c.summary}${c.secretRef ? ` Needs ${c.secretRef}.` : ''}`).join('\n'), {
      tab: 'integrations',
      label: 'Integrations',
    })
  }

  if (/copilot|assistant/.test(q)) {
    return reply(cat.surfaces.map((x) => `• ${x.name} at ${x.route}, for ${x.audience.toLowerCase()}`).join('\n'), { tab: 'agents', label: 'Agents and copilots' })
  }

  if (/frontend|route|page|screen/.test(q)) {
    return reply(`The app has ${s.screens} routes, ${s.screen_gaps} of them without proper tables yet. The Frontend tab lists each with its roles and how it stores data today.`, {
      tab: 'frontend',
      label: 'Frontend routes',
    })
  }

  if (/audit|activity|who changed|history/.test(q)) {
    const recent = cat.audit.slice(0, 5)
    return reply(
      recent.length ? `Latest activity:\n\n${recent.map((e) => `• ${e.actor_label}: ${humanise(e.action.replace(/\./g, ' '))}`).join('\n')}` : 'No activity recorded in this browser yet.',
      { tab: 'audit', label: 'Audit trail' },
    )
  }

  return reply(
    'I can only answer from the Systems catalogue: database plan, screens, agents, tools, workflows, endpoints and integrations. Try one of these:',
    null,
    SYSTEMS_SUGGESTIONS,
  )
}
