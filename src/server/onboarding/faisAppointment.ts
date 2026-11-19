// FAIS appointment checks on organisation_memberships (capacity, status, authorised categories).
// Separate from adviser_authorisations product-category rows used by life tooling.
import type { FaisCapacity } from '../db/onboardingSchema'
import type { FaisCategory } from '../db/lifeSchema'
import { FAIS_LABEL } from '../db/lifeSchema'
import type { Repo } from '../db/store'
import { ToolError } from '../lib/errors'
import { FAIS_CAPACITY_LABEL } from './config'

const ADVICE_CAPACITIES: FaisCapacity[] = ['key_individual', 'representative', 'juristic_representative']

export interface MemberFaisCheck {
  authorised: boolean
  reason: string
  membership_id: string | null
}

/** Whether the member’s FAIS appointment on this brokerage covers advising on a product category. */
export function checkMemberFaisAppointment(repo: Repo, userId: string, category: FaisCategory): MemberFaisCheck {
  const membership = repo.find('organisation_memberships', (m) => m.user_id === userId && m.status === 'active')
  if (!membership) {
    return { authorised: false, reason: 'This person is not an active member of the brokerage.', membership_id: null }
  }
  const capacity = membership.fais_capacity
  if (!capacity) {
    return {
      authorised: false,
      reason: 'FAIS appointment is not recorded for this team member. An owner or administrator must set capacity and authorised categories.',
      membership_id: membership.id,
    }
  }
  if (capacity === 'non_advice') {
    return {
      authorised: false,
      reason: `${FAIS_CAPACITY_LABEL[capacity]} cannot give advice or sign off on product recommendations.`,
      membership_id: membership.id,
    }
  }
  if (!ADVICE_CAPACITIES.includes(capacity)) {
    return { authorised: false, reason: 'This FAIS capacity cannot advise on products.', membership_id: membership.id }
  }
  if (membership.fais_status !== 'active') {
    return {
      authorised: false,
      reason: `FAIS appointment is ${membership.fais_status ?? 'not set'}; only an active appointment may advise.`,
      membership_id: membership.id,
    }
  }
  const cats = membership.authorised_licence_categories ?? []
  if (!cats.length) {
    return {
      authorised: false,
      reason: 'No authorised licence categories are set for this member. Empty categories mean not authorised for advice products.',
      membership_id: membership.id,
    }
  }
  if (!cats.includes(category)) {
    return {
      authorised: false,
      reason: `Not authorised for ${FAIS_LABEL[category] ?? category} under this membership’s FAIS appointment.`,
      membership_id: membership.id,
    }
  }
  return { authorised: true, reason: `Active ${FAIS_CAPACITY_LABEL[capacity]} appointment covers ${FAIS_LABEL[category] ?? category}.`, membership_id: membership.id }
}

export function assertMemberFaisAppointment(repo: Repo, userId: string, category: FaisCategory): void {
  const check = checkMemberFaisAppointment(repo, userId, category)
  if (!check.authorised) throw new ToolError('forbidden', check.reason)
}

/** Soft readiness: operate/advice-facing members missing appointment details. */
export function membersMissingFaisAppointment(repo: Repo) {
  return repo
    .list('organisation_memberships', (m) => m.status === 'active')
    .filter((m) => {
      if (m.role === 'read_only' || m.role === 'compliance_reviewer' || m.role === 'operations_admin') {
        return !m.fais_capacity
      }
      if (m.role === 'representative' || m.role === 'agent' || m.role === 'sub_broker' || m.role === 'brokerage_owner' || m.role === 'brokerage_admin') {
        if (!m.fais_capacity || m.fais_status !== 'active') return true
        if (m.fais_capacity !== 'non_advice' && !(m.authorised_licence_categories ?? []).length) return true
      }
      return false
    })
}

/** Active FAIS-appointed adviser under the brokerage (representative capacity or key individual with categories). */
export function hasActiveFaisAppointedAdviser(repo: Repo): boolean {
  return repo.list('organisation_memberships', (m) => m.status === 'active').some((m) => {
    if (m.fais_status !== 'active') return false
    if (m.fais_capacity === 'representative' || m.fais_capacity === 'juristic_representative') {
      return (m.authorised_licence_categories ?? []).length > 0
    }
    if (m.fais_capacity === 'key_individual' && (m.role === 'brokerage_owner' || m.role === 'representative')) {
      return (m.authorised_licence_categories ?? []).length > 0
    }
    return false
  })
}
