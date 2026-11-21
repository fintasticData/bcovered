/** Remembers the last Demo brokerage so entering Demo restores Highveld (or the last used demo book). */
const KEY = 'bcovered_last_demo_brokerage_v1'
const DEFAULT_SLUG = 'highveld-demo-brokers'
const DEFAULT_ID = 'd0000000-0000-4000-8000-000000000001'

const hasStorage = typeof localStorage !== 'undefined'

export const DEMO_BROKERAGE = {
  highveld: { id: DEFAULT_ID, slug: DEFAULT_SLUG, name: 'Highveld Demo Brokers' },
  coastal: { id: 'd0000000-0000-4000-8000-000000000002', slug: 'coastal-demo-brokers', name: 'Coastal Demo Brokers' },
} as const

export const lastDemoBrokerage = {
  get(): { id: string; slug: string } {
    if (!hasStorage) return { id: DEFAULT_ID, slug: DEFAULT_SLUG }
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return { id: DEFAULT_ID, slug: DEFAULT_SLUG }
      const parsed = JSON.parse(raw) as { id?: string; slug?: string }
      if (parsed.id && parsed.slug) return { id: parsed.id, slug: parsed.slug }
    } catch {
      /* ignore */
    }
    return { id: DEFAULT_ID, slug: DEFAULT_SLUG }
  },
  set(next: { id: string; slug: string }) {
    if (!hasStorage) return
    localStorage.setItem(KEY, JSON.stringify(next))
  },
  isDemoSlug(slug: string | null | undefined) {
    return slug === DEMO_BROKERAGE.highveld.slug || slug === DEMO_BROKERAGE.coastal.slug
  },
}
