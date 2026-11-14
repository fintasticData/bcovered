// Real broker accounts on Supabase Auth: signup, first sign-in and team invitations. The broker screens still read the
// in-browser identity store for navigation, so a database user is mirrored into it (same user and brokerage IDs, with
// their membership role). That only opens the screens; every record is still read and written under row-level security.
import { session } from '@/api/client'
import { salesApi, type SalesProfile } from '@/copilot/salesApi'
import { db, identity, Repo } from '@/server/db/store'
import type { MemberRole } from '@/server/db/onboardingSchema'
import { LEGACY_ROLE } from '@/server/onboarding/config'
import { supabase, supabaseAuth } from './client'

const DATABASE_USERS_KEY = 'bcovered_database_users_v1'

function databaseUsers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DATABASE_USERS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** People who signed in with their own Supabase login: the "Demo as" bridge never signs them in with the demo password. */
export const isDatabaseUser = (userId: string | null | undefined) => Boolean(userId && databaseUsers().includes(userId))

function rememberDatabaseUser(userId: string) {
  const ids = databaseUsers()
  if (!ids.includes(userId)) localStorage.setItem(DATABASE_USERS_KEY, JSON.stringify([...ids, userId]))
}

/** Writes the signed-in database user, their active brokerage and membership into the in-browser identity store. */
export function mirrorProfile(profile: SalesProfile, userId: string) {
  const org = profile.brokerage
  if (!org || !profile.membership_role) return
  const role = profile.membership_role as MemberRole
  db.transaction(() => {
    const repo = new Repo(org.id)
    const existingOrg = identity.organisation(org.id)
    const lifecycle = org.lifecycle_status as 'onboarding' | 'active' | 'suspended' | 'closed'
    if (!existingOrg) {
      repo.insert('organisations', {
        id: org.id, name: org.name, slug: org.id, fsp_number: null, fsp_verified: false, is_demo: false, kind: 'brokerage', legal_name: null,
        trading_name: org.name, registration_number: null, brokerage_type: null, lifecycle_status: lifecycle, status_reason: null, activated_at: null,
        suspended_at: null, retention_until: null,
      })
    } else if (existingOrg.lifecycle_status !== lifecycle || existingOrg.name !== org.name) {
      repo.update('organisations', org.id, { lifecycle_status: lifecycle, name: org.name })
    }
    const user = identity.user(userId)
    if (!user) {
      repo.insert('app_users', {
        id: userId, email: profile.email ?? '', full_name: profile.name ?? profile.email ?? 'Broker', role: LEGACY_ROLE[role], customer_id: null, active_organisation_id: org.id,
      })
    } else if (user.active_organisation_id !== org.id) {
      new Repo(user.tenant_id).update('app_users', userId, { active_organisation_id: org.id })
    }
    const membership = identity.memberships(userId).find((m) => m.tenant_id === org.id)
    if (!membership) repo.insert('organisation_memberships', { user_id: userId, role, status: 'active', invited_by: null })
    else if (membership.role !== role || membership.status !== 'active') repo.update('organisation_memberships', membership.id, { role, status: 'active' })
  })
  rememberDatabaseUser(userId)
}

/**
 * After a Supabase sign-in: finish workspace setup from the signup details if it is still pending, mirror the account and
 * make it the active session. Seeded demo people keep their existing in-browser identity.
 */
export async function adoptDatabaseUser(): Promise<SalesProfile | null> {
  const auth = supabaseAuth.get()
  if (!supabase || auth.status !== 'signed_in' || !auth.userId) return null
  let profile = await salesApi.profile()
  if (!profile.has_workspace && profile.pending_brokerage) {
    await salesApi.setup({ brokerage_name: profile.pending_brokerage })
    await supabase.auth.refreshSession()
    profile = await salesApi.profile()
  }
  const demo = auth.email ? identity.userByEmail(auth.email) : undefined
  if (demo && !isDatabaseUser(demo.id)) {
    session.set(demo.id)
    return profile
  }
  if (profile.has_workspace) {
    mirrorProfile(profile, auth.userId)
    session.set(auth.userId)
  }
  return profile
}

export interface BrokerSignUp {
  full_name: string
  email: string
  password: string
  brokerage_name: string
  phone?: string
  service_area?: string
}

/** Creates the Supabase login and the brokerage workspace. Returns needs_confirmation when the project requires email confirmation first. */
export async function signUpBroker(a: BrokerSignUp): Promise<{ status: 'ready'; profile: SalesProfile } | { status: 'needs_confirmation' }> {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  const { data, error } = await supabase.auth.signUp({
    email: a.email.trim(),
    password: a.password,
    options: { data: { full_name: a.full_name.trim(), brokerage_name: a.brokerage_name.trim() }, emailRedirectTo: `${window.location.origin}/sign-in?next=/broker/book` },
  })
  if (error) throw new Error(error.message)
  if (!data.session) return { status: 'needs_confirmation' }
  await supabaseAuth.signIn(a.email.trim(), a.password)
  await salesApi.setup({ brokerage_name: a.brokerage_name, full_name: a.full_name, phone: a.phone, service_area: a.service_area })
  await supabase.auth.refreshSession()
  const profile = await adoptDatabaseUser()
  return { status: 'ready', profile: profile! }
}

/** Accepts a private team invitation for the signed-in login and opens that brokerage. */
export async function acceptTeamInvitation(token: string): Promise<SalesProfile | null> {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  await salesApi.acceptInvitation(token)
  await supabase.auth.refreshSession()
  return adoptDatabaseUser()
}

/** Signs up (or signs in) the invited person with their own password, then accepts the invitation. */
export async function joinWithInvitation(a: { token: string; email: string; password: string; full_name: string; mode: 'sign_up' | 'sign_in' }) {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  if (a.mode === 'sign_up') {
    const { data, error } = await supabase.auth.signUp({
      email: a.email.trim(), password: a.password,
      options: { data: { full_name: a.full_name.trim() }, emailRedirectTo: `${window.location.origin}/team/join/${a.token}` },
    })
    if (error) throw new Error(error.message)
    if (!data.session) return { status: 'needs_confirmation' as const }
  }
  await supabaseAuth.signIn(a.email.trim(), a.password)
  const state = supabaseAuth.get()
  if (state.status !== 'signed_in') throw new Error(state.error ?? 'Sign-in failed.')
  const profile = await acceptTeamInvitation(a.token)
  return { status: 'ready' as const, profile }
}
