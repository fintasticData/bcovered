// Short-term book: personal lines by product and commercial cover by cover area. Reached only through src/api/client.ts.
import { principal, requireRole, STAFF_ROLES, type Auth } from './api'
import type { CoverageStatus } from './db/commercialSchema'
import type { Policy } from './db/lifeSchema'
import type { Repo } from './db/store'
import { COVER_CLASSES, type CoverClass } from './domain/commercial/coverClasses'

export type PersonalProductKey = 'car' | 'home' | 'contents' | 'motorbike' | 'valuables'

/** Lead and quote categories recorded against each personal product. */
const PERSONAL_CATEGORIES: Record<PersonalProductKey, string[]> = {
  car: ['motor', 'car', 'private_motor'],
  home: ['home', 'buildings', 'household_buildings'],
  contents: ['contents', 'household_contents', 'home_contents'],
  motorbike: ['motorbike', 'motorcycle'],
  valuables: ['valuables', 'portable_valuables', 'all_risks'],
}
export const PRODUCT_KEYS = Object.keys(PERSONAL_CATEGORIES) as PersonalProductKey[]

export const productForCategory = (category: string): PersonalProductKey | null => PRODUCT_KEYS.find((k) => PERSONAL_CATEGORIES[k].includes(category)) ?? null
export const categoriesFor = (product: PersonalProductKey) => PERSONAL_CATEGORIES[product]

const CLOSED_LEADS = ['won', 'lost']
const ACTIVE_POLICY = ['in_force', 'accepted', 'reinstated']

export interface ShortTermPolicyRow {
  policy: Policy
  customer: string
  provider: string
}

function shortTermPolicies(repo: Repo, line: Policy['line']): ShortTermPolicyRow[] {
  return repo
    .list('policies', (x) => x.line === line)
    .map((policy) => ({
      policy,
      customer: repo.get('customers', policy.customer_id)?.full_name ?? 'Unknown',
      provider: repo.get('insurers', policy.provider_id)?.name ?? 'Unknown insurer',
    }))
    .sort((a, b) => b.policy.updated_at.localeCompare(a.policy.updated_at))
}

export interface PersonalProductSummary {
  key: PersonalProductKey
  leads: number
  open_leads: number
  quotes: number
  quotes_awaiting_approval: number
}

export interface PersonalLinesBook {
  products: PersonalProductSummary[]
  open_leads: number
  /** Open personal leads whose category matches none of the five products. */
  other_open_leads: number
  policies: ShortTermPolicyRow[]
  active_policies: number
  monthly_premium: number
}

export function getPersonalLines(auth: Auth): PersonalLinesBook {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const leads = p.repo.list('leads')
  const quotes = p.repo.list('quotes')
  const products = PRODUCT_KEYS.map((key) => {
    const mine = leads.filter((l) => PERSONAL_CATEGORIES[key].includes(l.product_category))
    const q = quotes.filter((x) => PERSONAL_CATEGORIES[key].includes(x.product_category))
    return {
      key,
      leads: mine.length,
      open_leads: mine.filter((l) => !CLOSED_LEADS.includes(l.status)).length,
      quotes: q.length,
      quotes_awaiting_approval: q.filter((x) => x.status === 'awaiting_approval').length,
    }
  })
  const policies = shortTermPolicies(p.repo, 'short_term_personal')
  const active = policies.filter((r) => ACTIVE_POLICY.includes(r.policy.status))
  return {
    products,
    open_leads: leads.filter((l) => l.line === 'personal' && !CLOSED_LEADS.includes(l.status)).length,
    other_open_leads: leads.filter((l) => l.line === 'personal' && !CLOSED_LEADS.includes(l.status) && !productForCategory(l.product_category)).length,
    policies,
    active_policies: active.length,
    monthly_premium: active.filter((r) => r.policy.premium_frequency !== 'annually').reduce((s, r) => s + (r.policy.premium_amount ?? 0), 0),
  }
}

const COVERAGE_KEYS: CoverageStatus[] = ['awaiting_broker_review', 'unknown', 'potentially_covered', 'confirmed_covered', 'confirmed_excluded']
const UNCONFIRMED: CoverageStatus[] = ['awaiting_broker_review', 'unknown']
const emptyCoverage = () => Object.fromEntries(COVERAGE_KEYS.map((k) => [k, 0])) as Record<CoverageStatus, number>

export interface CoverClassSummary {
  key: string
  label: string
  description: string
  /** Clients whose current Risk Twin lists this class as potentially relevant. */
  exposed_clients: Array<{ profile_id: string; name: string }>
  exposures: number
  coverage: Record<CoverageStatus, number>
  /** Clients with a policy section of this class on record. */
  sections_on_record: number
}

export interface CoverAreaSummary {
  group: CoverClass['group']
  classes: CoverClassSummary[]
  exposed_clients: number
  unconfirmed: number
}

export interface CommercialCoverBook {
  areas: CoverAreaSummary[]
  clients: number
  clients_with_twin: number
  policies: ShortTermPolicyRow[]
}

const AREA_ORDER: CoverClass['group'][] = ['property', 'interruption', 'liability', 'motor_transit', 'specialist', 'special_risk']

export function getCommercialCover(auth: Auth): CommercialCoverBook {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const profiles = p.repo.list('business_profiles', (b) => b.status !== 'archived')
  const nameOf = new Map(profiles.map((b) => [b.id, b.trading_name ?? b.registered_name]))
  const twins = profiles
    .map((b) => p.repo.find('business_risk_profiles', (r) => r.business_profile_id === b.id && r.status === 'current'))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
  const twinIds = new Set(twins.map((t) => t.id))
  const exposures = p.repo.list('risk_exposures', (e) => twinIds.has(e.risk_profile_id))
  const sections = p.repo.list('policy_sections', (s) => nameOf.has(s.business_profile_id))

  const summarise = (c: CoverClass): CoverClassSummary => {
    const mine = exposures.filter((e) => e.potential_classes.includes(c.key))
    const coverage = emptyCoverage()
    mine.forEach((e) => coverage[e.coverage_status]++)
    const clientIds = [...new Set(mine.map((e) => e.business_profile_id))]
    return {
      key: c.key,
      label: c.label,
      description: c.description,
      exposed_clients: clientIds.map((id) => ({ profile_id: id, name: nameOf.get(id) ?? 'Unknown business' })).sort((a, b) => a.name.localeCompare(b.name)),
      exposures: mine.length,
      coverage,
      sections_on_record: new Set(sections.filter((s) => s.cover_class === c.key).map((s) => s.business_profile_id)).size,
    }
  }

  const areas = AREA_ORDER.map((group) => {
    const classes = COVER_CLASSES.filter((c) => c.group === group).map(summarise)
    const groupExposures = exposures.filter((e) => e.potential_classes.some((k) => classes.some((c) => c.key === k)))
    return {
      group,
      classes,
      exposed_clients: new Set(groupExposures.map((e) => e.business_profile_id)).size,
      unconfirmed: groupExposures.filter((e) => UNCONFIRMED.includes(e.coverage_status)).length,
    }
  })

  return { areas, clients: profiles.length, clients_with_twin: twins.length, policies: shortTermPolicies(p.repo, 'short_term_commercial') }
}
