import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import '../api'
import { AGENTS } from '../agents/catalog'
import { SEED_IDS } from '../db/seed'
import { db } from '../db/store'
import { listWorkflows } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import { AGENT_KIND, COMPONENTS, COPILOT_SURFACES } from '../systems/components'
import { EDGE_FUNCTIONS } from '../systems/edgeFunctions'
import { LIVE_RELATIONSHIPS, LIVE_TABLES, liveErdSource, liveTableByName } from '../systems/liveSchema'
import { PLANNED_TABLES, REMOVED_TABLES, erdSource, plannedFor, relationships } from '../systems/plannedSchema'
import { SCREENS } from '../systems/screens'
import { askSystemsCopilot, getSystemsCatalogue } from '../systemsApi'

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
const appRoutes = [...appSource.matchAll(/path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== '*')
  .map((p) => (p.startsWith('/') ? p : `/broker/${p}`))
  .concat('/broker')

const manager = { userId: SEED_IDS.users.manager }
const broker = { userId: SEED_IDS.users.broker }
const tableNames = new Set(PLANNED_TABLES.map((t) => t.name))

beforeEach(() => db.reset())

describe('planned schema', () => {
  it('has unique table names and only references planned tables', () => {
    expect(tableNames.size).toBe(PLANNED_TABLES.length)
    expect(relationships().filter((r) => !tableNames.has(r.to))).toEqual([])
  })

  it('maps every current demo table to a target table', () => {
    const current = Object.keys(db.snapshot())
    expect(current.filter((t) => !plannedFor(t))).toEqual([])
    REMOVED_TABLES.forEach((r) => expect(tableNames.has(r.successor)).toBe(true))
  })

  it('draws every table in the full ERD', () => {
    const erd = erdSource('all')
    PLANNED_TABLES.forEach((t) => expect(erd).toContain(`  ${t.name} {`))
  })
})

describe('live schema snapshot', () => {
  const liveNames = new Set(LIVE_TABLES.map((t) => t.name))

  it('only links live tables, by columns that exist', () => {
    expect(LIVE_RELATIONSHIPS.filter((r) => !liveNames.has(r.from) || !liveNames.has(r.to))).toEqual([])
    expect(LIVE_RELATIONSHIPS.filter((r) => !liveTableByName(r.from)!.columns.some((c) => c.name === r.column.split('+')[0]))).toEqual([])
  })

  it('places every live table in a target area and every legacy table has a successor', () => {
    LIVE_TABLES.forEach((t) => expect(PLANNED_TABLES.some((p) => p.name === t.name) || t.successor).toBeTruthy())
    expect(LIVE_TABLES.every((t) => t.columns.some((c) => c.pk))).toBe(true)
  })

  it('draws every live table in the full live ERD', () => {
    const erd = liveErdSource('all')
    LIVE_TABLES.forEach((t) => expect(erd).toContain(`  ${t.name} {`))
  })

  it('names only live tables and existing callers in the Edge Function catalogue', () => {
    expect(EDGE_FUNCTIONS.flatMap((f) => f.tables).filter((t) => !liveNames.has(t))).toEqual([])
    expect(EDGE_FUNCTIONS.flatMap((f) => f.callers.map((c) => c.route)).filter((r) => !appRoutes.includes(r))).toEqual([])
  })
})

describe('screen alignment', () => {
  it('maps every route in App.tsx, and nothing else', () => {
    const mapped = SCREENS.map((s) => s.route)
    expect(new Set(mapped).size).toBe(mapped.length)
    expect([...new Set(appRoutes)].filter((r) => !mapped.includes(r))).toEqual([])
    expect(mapped.filter((r) => !appRoutes.includes(r))).toEqual([])
  })

  it('names only planned tables', () => {
    expect(SCREENS.flatMap((s) => s.tables.filter((t) => !tableNames.has(t)).map((t) => `${s.route}: ${t}`))).toEqual([])
  })

  it('flags the three screens that store nothing in the service layer', () => {
    expect(SCREENS.filter((s) => s.gap).map((s) => s.route).sort()).toEqual(['/claims', '/contact', '/quote'])
  })
})

describe('agent catalogue', () => {
  it('knows every agent that owns a workflow step or a copilot surface', () => {
    const steps = listWorkflows().flatMap((w) => w.steps.map((s) => s.agent))
    expect([...steps, ...COPILOT_SURFACES.map((s) => s.agent), ...Object.keys(AGENT_KIND)].filter((a) => !(a in AGENTS))).toEqual([])
  })

  it('lists component dependencies that exist', () => {
    const keys = new Set(COMPONENTS.map((c) => c.key))
    expect(COMPONENTS.flatMap((c) => c.dependsOn).filter((d) => !keys.has(d))).toEqual([])
  })
})

describe('systems API and Copilot', () => {
  it('is limited to managers and admins', () => {
    expect(() => getSystemsCatalogue(broker)).toThrow(ToolError)
    const cat = getSystemsCatalogue(manager)
    expect(cat.summary.planned_tables).toBe(PLANNED_TABLES.length)
    expect(cat.summary.screen_gaps).toBe(3)
  })

  it('answers which tables a screen needs and opens it', () => {
    const a = askSystemsCopilot(manager, { question: 'What tables does /claims need?' })
    expect(a.reply).toContain('claim_status_events')
    expect(a.focus).toMatchObject({ tab: 'database', view: 'screens', item: '/claims' })
  })

  it('lists the screen gaps', () => {
    const a = askSystemsCopilot(manager, { question: 'Which screens are missing tables?' })
    expect(a.reply).toContain('/contact')
    expect(a.focus?.view).toBe('screens')
  })

  it('describes a table and an agent', () => {
    expect(askSystemsCopilot(manager, { question: 'Tell me about entity_links' }).focus).toMatchObject({ view: 'tables', item: 'entity_links' })
    expect(askSystemsCopilot(manager, { question: 'What does the Coverage Analyst do?' }).focus).toMatchObject({ tab: 'agents', item: 'coverage_analyst' })
    expect(askSystemsCopilot(manager, { question: 'Show the Risk Twin ERD' }).focus).toMatchObject({ view: 'erd', domain: 'twin' })
  })

  it('opens the live ERD and an Edge Function', () => {
    expect(askSystemsCopilot(manager, { question: 'Show the live database ERD' }).focus).toMatchObject({ view: 'live', domain: 'all' })
    expect(askSystemsCopilot(manager, { question: 'What does copilot-agent do?' }).focus).toMatchObject({ view: 'functions', item: 'copilot-agent' })
    expect(askSystemsCopilot(manager, { question: 'Which Edge Functions are deployed?' }).reply).toContain('seed-loader')
  })

  it('points a removed table to its successor', () => {
    const a = askSystemsCopilot(manager, { question: 'where did risk_dependencies go' })
    expect(a.focus?.item).toBe('entity_links')
  })
})
