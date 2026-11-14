import { Briefcase, HeartPulse, ShieldCheck, Sparkles } from 'lucide-react'
import type { AssistantKind } from '@/api/client'
import { isFeatureOn, type FeatureKey } from '@/lib/features'
import { COMMERCIAL_REVIEW, RISK_ASSESSMENT, RISK_INVESTIGATION, RISK_TWIN_BUILD } from '@/server/agents/commercialOrchestrator'
import { CONTRIBUTION_RECON, GROUP_MOVEMENTS } from '@/server/agents/controlsOrchestrator'
import { LIFE_ADVICE } from '@/server/agents/lifeOrchestrator'
import { MOTOR_NEW_LEAD } from '@/server/agents/orchestrator'
import type { Market, Term } from '../navConfig'

export type LensId = 'general' | 'commercial' | 'life' | 'controls'

export interface Lens {
  id: LensId
  label: string
  /** Ava works with people and personal lines; Russ with business accounts, group schemes and controls. */
  copilot: 'ava' | 'russ'
  /** Each assistant keeps its own conversation; undefined is the general broker copilot. */
  assistant?: AssistantKind
  title: string
  subtitle: string
  placeholder: string
  icon: typeof Sparkles
  /** Job workflow types this lens may bring into focus when the conversation has none of its own. */
  workflows: string[]
  line: { term: Term; market: Market } | null
  /** Show the motor customer-context tab. */
  customerContext: boolean
  feature?: FeatureKey
  emptyText: string
  planEmpty: string
  footerNote: string
}

const noAuthority = (name: string) =>
  `${name} uses typed tools only. ${name} cannot approve, give advice, bind cover, authorise payments or send external messages.`

export const LENSES: Lens[] = [
  {
    id: 'general',
    label: 'Personal lines',
    copilot: 'ava',
    title: 'Ava · Personal lines',
    subtitle: 'Leads, quotes, approvals and jobs for people · results open on the right',
    placeholder: 'e.g. Show pending approvals',
    icon: Sparkles,
    workflows: [MOTOR_NEW_LEAD],
    line: { term: 'short', market: 'personal' },
    customerContext: true,
    emptyText: 'Ask Ava for pending approvals, new leads or running jobs, or to create a quote comparison. Each answer opens here as a working view you can act on.',
    planEmpty: 'Ask Ava to create a quote comparison to see its plan here.',
    footerNote: noAuthority('Ava'),
  },
  {
    id: 'life',
    label: 'Life',
    copilot: 'ava',
    assistant: 'russ_life',
    title: 'Ava · Life',
    subtitle: 'Needs analysis, simulated quotes and draft advice for an authorised adviser',
    placeholder: 'e.g. Start life advice for Johan van der Merwe',
    icon: HeartPulse,
    workflows: [LIFE_ADVICE],
    line: { term: 'long', market: 'personal' },
    customerContext: false,
    feature: 'life',
    emptyText: 'Ask Ava to start life advice, show policies or list servicing items. Each answer opens here as a working view.',
    planEmpty: 'Ask Ava to start life advice for a client to see its plan here.',
    footerNote: noAuthority('Ava'),
  },
  {
    id: 'commercial',
    label: 'Commercial',
    copilot: 'russ',
    assistant: 'commercial_copilot',
    title: 'Russ · Commercial',
    subtitle: 'Coordinates the commercial agents · results open on the right',
    placeholder: 'e.g. Review Ubuntu Foods and identify outstanding insurance questions',
    icon: Briefcase,
    workflows: [COMMERCIAL_REVIEW, RISK_TWIN_BUILD, RISK_ASSESSMENT, RISK_INVESTIGATION],
    line: { term: 'short', market: 'business' },
    customerContext: false,
    emptyText: 'Ask Russ to review a business, show commercial clients or draft submissions. Each answer opens here as a working view.',
    planEmpty: 'Ask Russ to review a business to see its plan here.',
    footerNote: 'Russ uses typed tools only. It identifies potential exposures; it cannot approve, give advice or contact insurers.',
  },
  {
    id: 'controls',
    label: 'Controls',
    copilot: 'russ',
    assistant: 'russ_controls',
    title: 'Russ · Controls',
    subtitle: 'Imports, matching, reconciliations and exceptions, with corrections held for approval',
    placeholder: 'e.g. Reconcile the October payroll against the administrator contribution schedule',
    icon: ShieldCheck,
    workflows: [CONTRIBUTION_RECON, GROUP_MOVEMENTS],
    line: null,
    customerContext: false,
    feature: 'controls',
    emptyText: 'Ask Russ to reconcile a payroll, show financial exceptions or process scheme movements. Each answer opens here as a working view.',
    planEmpty: 'Ask Russ to run a reconciliation to see its plan here.',
    footerNote: noAuthority('Russ'),
  },
]

export const availableLenses = (copilot?: 'ava' | 'russ') => LENSES.filter((l) => (!l.feature || isFeatureOn(l.feature)) && (!copilot || l.copilot === copilot))

export function lensFor(id: string | null | undefined, copilot?: 'ava' | 'russ'): Lens {
  const lenses = availableLenses(copilot)
  return lenses.find((l) => l.id === id) ?? lenses[0] ?? availableLenses()[0]
}

/** Address of a copilot workflow lens, optionally sending a prompt on arrival. */
export function lensPath(id: LensId, prompt?: string): string {
  const lens = LENSES.find((l) => l.id === id)
  const q = new URLSearchParams({ copilot: lens?.copilot ?? 'ava', mode: 'workflows', lens: id })
  if (prompt) q.set('prompt', prompt)
  return `/broker/workspace?${q.toString()}`
}
