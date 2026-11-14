import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FAQ_CATEGORIES } from '../faq'
import { ACCESS_MATRIX, CAPABILITIES, GETTING_STARTED, ROLES, WALKTHROUGHS } from '../helpGuide'
import { LATEST_UPDATE, UPDATE_THREADS } from '../updates'
import { LATEST_UPDATE_HEADLINE } from '../latestUpdate'
import { LEGAL_SECTIONS } from '../legal'
import { personalProducts } from '../products'

const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
const routes = [...appSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
const brokerChildren = routes.filter((p) => !p.startsWith('/')).map((p) => `/broker/${p}`)
const knownPaths = new Set([...routes.filter((p) => p.startsWith('/')), ...brokerChildren, ...personalProducts.map((p) => `/insurance/${p.slug}`)])

const HELP_ANCHORS = ['start', 'roles', 'capabilities', 'walkthroughs', 'copilot', 'agents', 'guardrails', 'statuses', 'roadmap', 'faq', 'more']

function resolves(to: string) {
  const [target, hash] = to.split('#')
  const path = target.split('?')[0]
  if (!knownPaths.has(path)) return false
  if (path === '/legal' && hash) return LEGAL_SECTIONS.some((s) => s.id === hash)
  if (path === '/help' && hash) return HELP_ANCHORS.includes(hash)
  if (path === '/' && hash) return hash === 'personal'
  return true
}

describe('help, FAQ and updates content', () => {
  it('links only to pages that exist', () => {
    const links = [
      ...FAQ_CATEGORIES.flatMap((c) => c.items.flatMap((i) => (i.link ? [i.link.to] : []))),
      ...UPDATE_THREADS.flatMap((t) => t.posts.flatMap((p) => (p.links ?? []).map((l) => l.to))),
      ...CAPABILITIES.flatMap((c) => c.links.map((l) => l.to)),
      ...GETTING_STARTED.flatMap((s) => (s.link ? [s.link.to] : [])),
      ...ROLES.map((r) => r.home.to),
      ...ACCESS_MATRIX.map((r) => r.link.to),
      ...WALKTHROUGHS.flatMap((w) => w.steps.map((s) => s.link.to)),
    ]
    expect(links.filter((to) => !resolves(to))).toEqual([])
  })

  it('keeps threads newest first with one pinned overview', () => {
    const releases = UPDATE_THREADS.filter((t) => !t.pinned)
    const dates = releases.map((t) => Date.parse(t.date))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect(UPDATE_THREADS.filter((t) => t.pinned)).toHaveLength(1)
    expect(LATEST_UPDATE).toBe(releases[0])
    expect(LATEST_UPDATE_HEADLINE).toEqual({ id: releases[0].id, version: releases[0].version, title: releases[0].title })
  })

  it('has no duplicate questions', () => {
    const questions = FAQ_CATEGORIES.flatMap((c) => c.items.map((i) => i.q))
    expect(new Set(questions).size).toBe(questions.length)
  })
})
