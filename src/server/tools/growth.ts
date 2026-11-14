import type { Repo } from '../db/store'

export interface Opportunity {
  kind: 'life_shortfall' | 'no_life_cover' | 'employer_no_fund' | 'group_cover_gap'
  label: string
  detail: string
  to: string
}

/** Cross-selling and review opportunities from records already held. Suggestions for a broker, not advice. */
export function growthOpportunities(repo: Repo): Opportunity[] {
  const out: Opportunity[] = []
  repo
    .list('needs_analyses', (n) => n.status === 'complete')
    .forEach((n) => {
      const gap = n.needs.reduce((s, x) => s + x.shortfall, 0)
      const placed = repo.find('policies', (p) => p.customer_id === n.customer_id && p.origin === 'placed' && !['declined', 'not_taken_up', 'cancelled'].includes(p.status))
      if (gap > 0 && !placed) {
        const person = repo.get('persons', n.person_id)
        out.push({ kind: 'life_shortfall', label: `${person?.first_names} ${person?.surname}`, detail: `Needs analysis shows shortfalls (${n.needs.filter((x) => x.shortfall > 0).map((x) => x.label).join(', ')}) with no policy placed`, to: `/broker/people/${n.person_id}` })
      }
    })
  repo
    .list('customers', (c) => c.customer_type === 'personal' && c.status === 'active')
    .forEach((c) => {
      const self = repo.find('customer_persons', (l) => l.customer_id === c.id && l.role === 'self' && !l.effective_to)
      const hasLife = repo.find('policies', (p) => p.customer_id === c.id && p.line === 'individual_life')
      if (!hasLife) out.push({ kind: 'no_life_cover', label: c.full_name, detail: 'Short-term client with no individual life cover on record', to: self ? `/broker/people/${self.person_id}` : '/broker/leads' })
    })
  new Set(repo.list('employments', (e) => e.status === 'active').map((e) => e.employer_customer_id)).forEach((id) => {
    if (!repo.find('fund_participations', (f) => f.employer_customer_id === id && f.status === 'active')) {
      out.push({ kind: 'employer_no_fund', label: repo.get('customers', id)?.full_name ?? 'Employer', detail: 'Group risk client without a retirement fund arrangement through B-Covered', to: `/broker/benefits/employers/${id}` })
    }
  })
  repo
    .list('scheme_memberships', (m) => m.status === 'active' && m.above_free_cover_limit)
    .slice(0, 5)
    .forEach((m) => {
      const p = repo.get('persons', m.person_id)
      out.push({ kind: 'group_cover_gap', label: `${p?.first_names} ${p?.surname}`, detail: 'Group cover above the free cover limit; may benefit from a review of total cover', to: `/broker/people/${m.person_id}` })
    })
  return out
}
