import { AGENTS, agentLabel } from '../agents/catalog'
import type { TableName } from '../db/schema'
import { db, type Repo } from '../db/store'
import { listWorkflows } from '../jobs/runner'
import { ADAPTERS } from '../llm'
import { listTools } from '../tools/registry'
import {
  AGENT_KIND,
  COMPONENTS,
  COPILOT_SURFACES,
  DATABASE_DECISIONS,
  ENDPOINTS,
  INSTANCE_STEPS,
  type AgentKind,
  type Endpoint,
  type SystemComponent,
} from './components'
import { DOMAINS, PLANNED_TABLES, REMOVED_TABLES, erdSource, plannedFor, relationships, type Domain, type DomainKey, type PlannedTable, type Relationship } from './plannedSchema'
import { SCREENS, type Screen } from './screens'

export interface AgentInfo {
  key: string
  label: string
  role: string
  kind: AgentKind
  steps: Array<{ workflow: string; workflow_title: string; step: string; name: string }>
  tools_used: string[]
  runs: number
  failed_runs: number
  surfaces: Array<{ name: string; route: string }>
}

export interface ToolInfo {
  name: string
  description: string
  allow: string[]
  side_effect: boolean
  calls: number
  errors: number
  blocked: number
}

export interface WorkflowInfo {
  type: string
  title: string
  restart_from: string | null
  steps: Array<{ key: string; name: string; agent: string; agent_label: string }>
  jobs_by_status: Record<string, number>
  total_jobs: number
}

export interface DemoTableInfo {
  name: string
  /** Null when the caller's repository may not read the table (platform-only or not yet operational). */
  rows: number | null
  planned: string | null
}

export interface AuditRow {
  id: string
  created_at: string
  actor_type: string
  actor_label: string
  action: string
  entity_table: string | null
  job_id: string | null
}

export interface SystemsCatalogue {
  generated_at: string
  summary: {
    planned_tables: number
    new_tables: number
    reshaped_tables: number
    carried_tables: number
    removed_tables: number
    relationships: number
    screens: number
    screen_gaps: number
    endpoints: number
    agents: number
    tools: number
    workflows: number
    active_jobs: number
    failed_jobs: number
  }
  components: SystemComponent[]
  endpoints: Endpoint[]
  adapters: Array<{ id: string; label: string; available: boolean; reason: string | null }>
  surfaces: typeof COPILOT_SURFACES
  decisions: typeof DATABASE_DECISIONS
  instance_steps: string[]
  schema: {
    domains: Domain[]
    tables: PlannedTable[]
    removed: typeof REMOVED_TABLES
    relationships: Relationship[]
    erd: Record<DomainKey | 'all', string>
  }
  screens: Screen[]
  agents: AgentInfo[]
  tools: ToolInfo[]
  workflows: WorkflowInfo[]
  demo_tables: DemoTableInfo[]
  audit: AuditRow[]
}

const ACTIVE = ['queued', 'running', 'awaiting_approval', 'awaiting_information', 'paused']

export function buildCatalogue(repo: Repo): SystemsCatalogue {
  const runs = repo.list('agent_runs')
  const calls = repo.list('agent_tool_calls')
  const jobs = repo.list('jobs')
  const runAgent = new Map(runs.map((r) => [r.id, r.agent]))
  const workflows = listWorkflows()

  const agents: AgentInfo[] = Object.entries(AGENTS).map(([key, a]) => ({
    key,
    label: a.label,
    role: a.role,
    kind: AGENT_KIND[key] ?? 'agent',
    steps: workflows.flatMap((w) => w.steps.filter((s) => s.agent === key).map((s) => ({ workflow: w.type, workflow_title: w.title, step: s.key, name: s.name }))),
    tools_used: [...new Set(calls.filter((c) => runAgent.get(c.agent_run_id) === key).map((c) => c.tool))].sort(),
    runs: runs.filter((r) => r.agent === key).length,
    failed_runs: runs.filter((r) => r.agent === key && r.status === 'failed').length,
    surfaces: COPILOT_SURFACES.filter((s) => s.agent === key).map((s) => ({ name: s.name, route: s.route })),
  }))

  const tools: ToolInfo[] = listTools()
    .map((t) => {
      const mine = calls.filter((c) => c.tool === t.name)
      return {
        name: t.name,
        description: t.description,
        allow: t.allow,
        side_effect: t.sideEffect,
        calls: mine.length,
        errors: mine.filter((c) => c.status === 'error').length,
        blocked: mine.filter((c) => c.status === 'blocked').length,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const workflowInfo: WorkflowInfo[] = workflows.map((w) => {
    const mine = jobs.filter((j) => j.workflow_type === w.type)
    const byStatus: Record<string, number> = {}
    mine.forEach((j) => (byStatus[j.status] = (byStatus[j.status] ?? 0) + 1))
    return {
      type: w.type,
      title: w.title,
      restart_from: w.restartOnChangesFrom ?? null,
      steps: w.steps.map((s) => ({ key: s.key, name: s.name, agent: s.agent, agent_label: agentLabel(s.agent) })),
      jobs_by_status: byStatus,
      total_jobs: mine.length,
    }
  })

  const demoTables: DemoTableInfo[] = (Object.keys(db.snapshot()) as TableName[])
    .map((name) => {
      let rows: number | null
      try {
        rows = repo.list(name).length
      } catch {
        rows = null
      }
      return { name, rows, planned: plannedFor(name) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const users = new Map(repo.list('app_users').map((u) => [u.id, u.full_name]))
  const audit: AuditRow[] = repo
    .list('audit_events')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 40)
    .map((e) => ({
      id: e.id,
      created_at: e.created_at,
      actor_type: e.actor_type,
      actor_label: e.actor_type === 'user' ? (users.get(e.actor_id) ?? 'Unknown person') : agentLabel(e.actor_id),
      action: e.action,
      entity_table: e.entity_table,
      job_id: e.job_id,
    }))

  const erd = Object.fromEntries([...DOMAINS.map((d) => [d.key, erdSource(d.key)]), ['all', erdSource('all')]]) as Record<DomainKey | 'all', string>

  return {
    generated_at: new Date().toISOString(),
    summary: {
      planned_tables: PLANNED_TABLES.length,
      new_tables: PLANNED_TABLES.filter((t) => t.status === 'new').length,
      reshaped_tables: PLANNED_TABLES.filter((t) => t.status === 'reshaped').length,
      carried_tables: PLANNED_TABLES.filter((t) => t.status === 'carried').length,
      removed_tables: REMOVED_TABLES.length,
      relationships: relationships().length,
      screens: SCREENS.length,
      screen_gaps: SCREENS.filter((s) => s.gap).length,
      endpoints: ENDPOINTS.length,
      agents: agents.length,
      tools: tools.length,
      workflows: workflowInfo.length,
      active_jobs: jobs.filter((j) => ACTIVE.includes(j.status)).length,
      failed_jobs: jobs.filter((j) => j.status === 'failed').length,
    },
    components: COMPONENTS,
    endpoints: ENDPOINTS,
    adapters: ADAPTERS.map((a) => ({ id: a.id, label: a.label, available: a.available, reason: a.unavailableReason ?? null })),
    surfaces: COPILOT_SURFACES,
    decisions: DATABASE_DECISIONS,
    instance_steps: INSTANCE_STEPS,
    schema: { domains: DOMAINS, tables: PLANNED_TABLES, removed: REMOVED_TABLES, relationships: relationships(), erd },
    screens: SCREENS,
    agents,
    tools,
    workflows: workflowInfo,
    demo_tables: demoTables,
    audit,
  }
}
