import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Car,
  Building2,
  CheckSquare,
  ClipboardCheck,
  Database,
  Factory,
  FileStack,
  House,
  Layers,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Network,
  PiggyBank,
  Route,
  ScrollText,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  Users,
} from 'lucide-react'
import type { FeatureKey } from '@/lib/features'

/** Insurance term: short-term (personal lines, commercial) or long-term (life, group risk, retirement, investments). */
export type Term = 'short' | 'long'
/** Market: personal and individual lines, or business and group lines. */
export type Market = 'personal' | 'business'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  badge?: boolean
  /** Other path prefixes that belong to this item, for the active state and the line chip. */
  match?: string[]
  feature?: FeatureKey
  roles?: string[]
}

export interface NavSection {
  id: string
  label?: string
  term?: Term
  market?: Market
  roles?: string[]
  feature?: FeatureKey
  items: NavItem[]
}

export const TERM_LABEL: Record<Term, string> = { short: 'Short-term', long: 'Long-term' }
export const MARKET_LABEL: Record<Market, string> = { personal: 'Personal', business: 'Business' }

export const TERM_STYLE: Record<Term, { rail: string; chip: string; heading: string }> = {
  short: { rail: 'bg-short-400', chip: 'border-short-200 bg-short-50 text-short-700', heading: 'text-short-400' },
  long: { rail: 'bg-long-400', chip: 'border-long-200 bg-long-50 text-long-700', heading: 'text-long-400' },
}
export const MARKET_DOT: Record<Market, string> = { personal: 'bg-personal-500', business: 'bg-business-500' }
export const MARKET_ACTIVE: Record<Market, string> = { personal: 'bg-personal-500/30 text-white', business: 'bg-business-500/40 text-white' }

const MANAGERS = ['manager', 'admin']

export const NAV: NavSection[] = [
  {
    id: 'main',
    items: [
      { to: '/broker/book', label: 'My workspace', icon: BriefcaseBusiness },
      { to: '/broker/routes', label: 'Routes', icon: Route },
      { to: '/broker/franchise', label: 'Franchise', icon: Store },
      { to: '/broker', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/broker/workspace', label: 'AR · Ava · Russ', icon: Sparkles },
      { to: '/broker/leads', label: 'Leads', icon: Users },
      { to: '/broker/approvals', label: 'Approvals', icon: CheckSquare, badge: true },
      { to: '/broker/jobs', label: 'Tasks & Jobs', icon: ListChecks },
    ],
  },
  {
    id: 'short-personal',
    label: 'Personal',
    term: 'short',
    market: 'personal',
    items: [
      { to: '/broker/personal', label: 'Personal lines', icon: House },
      { to: '/broker/quotes/sample-motor', label: 'Motor quotes', icon: Car, match: ['/broker/quotes'] },
    ],
  },
  {
    id: 'short-business',
    label: 'Business',
    term: 'short',
    market: 'business',
    items: [
      { to: '/broker/commercial/cover', label: 'Commercial cover', icon: Layers },
      { to: '/broker/commercial/clients', label: 'Business clients', icon: Building2 },
      { to: '/broker/commercial/risk-twins', label: 'Risk Twins', icon: Network, match: ['/broker/commercial/assessments'] },
      { to: '/broker/commercial/submissions', label: 'Submissions', icon: FileStack },
      { to: '/broker/cells', label: 'Cell captives', icon: Boxes, feature: 'specialist' },
    ],
  },
  {
    id: 'long-personal',
    label: 'Personal · individual',
    term: 'long',
    market: 'personal',
    items: [
      { to: '/broker/people', label: 'People', icon: UserRound, feature: 'life' },
      { to: '/broker/life/policies', label: 'Life policies', icon: ScrollText, feature: 'life', match: ['/broker/life/servicing', '/broker/life/advice'] },
      { to: '/broker/investments', label: 'Investments', icon: LineChart, feature: 'funds' },
    ],
  },
  {
    id: 'long-business',
    label: 'Business · group',
    term: 'long',
    market: 'business',
    items: [
      { to: '/broker/benefits/employers', label: 'Employers & schemes', icon: Factory, feature: 'life' },
      { to: '/broker/funds', label: 'Retirement funds', icon: PiggyBank, feature: 'funds' },
      { to: '/broker/transfers', label: 'Transfers', icon: ArrowLeftRight, feature: 'funds' },
      { to: '/broker/governance', label: 'Governance & trustees', icon: Landmark, feature: 'specialist' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { to: '/broker/controls/imports', label: 'Controls', icon: ShieldCheck, feature: 'controls', match: ['/broker/controls'] },
      { to: '/broker/investigations', label: 'Investigations', icon: Search, feature: 'controls' },
      { to: '/broker/compliance', label: 'Compliance register', icon: ClipboardCheck, feature: 'specialist' },
      { to: '/broker/executive', label: 'Executive dashboard', icon: BarChart3, feature: 'specialist', roles: MANAGERS },
      { to: '/broker/settings/team', label: 'Brokerage settings', icon: Settings2, match: ['/broker/settings', '/broker/imports'] },
    ],
  },
  {
    id: 'systems',
    label: 'Systems',
    roles: MANAGERS,
    items: [
      { to: '/broker/systems', label: 'Systems overview', icon: ServerCog, end: true },
      { to: '/broker/systems/database', label: 'Database & ERD', icon: Database },
      { to: '/broker/systems/agents', label: 'Agents & copilots', icon: Bot },
    ],
  },
]

const startsWith = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** Whether a nav item owns the current path, including its extra `match` prefixes. */
export function itemMatches(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to
  return [item.to, ...(item.match ?? [])].some((p) => startsWith(pathname, p))
}

/** The insurance line a broker screen belongs to, or null for cross-line screens such as Overview or Controls. */
export function lineForPath(pathname: string): { term: Term; market: Market } | null {
  for (const s of NAV) if (s.term && s.market && s.items.some((i) => itemMatches(i, pathname))) return { term: s.term, market: s.market }
  return null
}

export const lineLabel = (line: { term: Term; market: Market }) => `${TERM_LABEL[line.term]} · ${MARKET_LABEL[line.market]}`
