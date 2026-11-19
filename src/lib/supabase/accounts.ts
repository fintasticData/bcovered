// Live accounts on Supabase Auth (Client zone + Broker zone). Create/sign-in check the database — not browser
// localStorage. The in-browser identity store is only a mirror so existing screens can resolve the session.
import { session } from '@/api/client'
import { salesApi, type SalesProfile } from '@/copilot/salesApi'
import { TENANT_ID } from '@/server/db/seed'
import { db, identity, Repo } from '@/server/db/store'
import type { MemberRole, PlatformRole } from '@/server/db/onboardingSchema'
import { faisDefaultsForRole, LEGACY_ROLE } from '@/server/onboarding/config'
import { newId, nowIso } from '@/server/db/store'
import { supabase, supabaseAuth } from './client'

const PLATFORM_ROLES: PlatformRole[] = ['platform_admin', 'onboarding_reviewer', 'platform_read_only']

function mirrorPlatformRole(userId: string, platformRole: string | null | undefined) {
  const role = platformRole && PLATFORM_ROLES.includes(platformRole as PlatformRole) ? (platformRole as PlatformRole) : null
  db.transaction(() => {
    const repo = new Repo(TENANT_ID, { platform: true })
    const row = repo.list('platform_staff', (s) => s.user_id === userId)[0]
    if (!role) {
      if (row && !row.revoked_at) repo.update('platform_staff', row.id, { revoked_at: nowIso() })
      return
    }
    if (!row) {
      repo.insert('platform_staff', { id: newId(), user_id: userId, role, granted_by: null, revoked_at: null })
      return
    }
    repo.update('platform_staff', row.id, { role, revoked_at: null })
  })
}

export interface ClientProfile {
  kind: 'client' | 'broker'
  user_id: string
  name: string
  email: string
  customer_id?: string
  tenant_id?: string
  has_workspace?: boolean
  home: string
}

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

/** Mark a Supabase Auth user as a live database login so the Demo-as bridge never signs them out. */
export function rememberDatabaseUser(userId: string) {
  const ids = databaseUsers()
  if (!ids.includes(userId)) localStorage.setItem(DATABASE_USERS_KEY, JSON.stringify([...ids, userId]))
}

/** Writes the signed-in database user, their active brokerage and membership into the in-browser identity store. */
export function mirrorProfile(profile: SalesProfile, userId: string) {
  mirrorPlatformRole(userId, profile.platform_role)
  const org = profile.brokerage
  if (!org || !profile.membership_role) return
  const role = profile.membership_role as MemberRole
  db.transaction(() => {
    const repo = new Repo(org.id)
    const existingOrg = identity.organisation(org.id)
    const lifecycle = org.lifecycle_status as 'onboarding' | 'active' | 'suspended' | 'closed'
    if (!existingOrg) {
      repo.insert('organisations', {
        id: org.id, name: org.name, slug: org.id, fsp_number: null, fsp_verified: false, blp_number: null, is_demo: false, kind: 'brokerage', legal_name: null,
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
    } else {
      new Repo(user.tenant_id).update('app_users', userId, {
        active_organisation_id: org.id,
        role: LEGACY_ROLE[role],
        customer_id: null,
        full_name: profile.name ?? user.full_name,
        email: profile.email ?? user.email,
      })
    }
    const membership = identity.memberships(userId).find((m) => m.tenant_id === org.id)
    const fais = faisDefaultsForRole(role)
    if (!membership) repo.insert('organisation_memberships', { user_id: userId, role, status: 'active', invited_by: null, ...fais })
    else if (membership.role !== role || membership.status !== 'active') repo.update('organisation_memberships', membership.id, { role, status: 'active', ...fais })
  })
  rememberDatabaseUser(userId)
}

/** Mirrors a Client zone database user into the local session store so /my and portals open. */
export function mirrorClientProfile(profile: ClientProfile, userId: string) {
  if (profile.kind !== 'client' || !profile.customer_id || !profile.tenant_id) return
  const tenantId = profile.tenant_id || TENANT_ID
  db.transaction(() => {
    const repo = new Repo(tenantId)
    if (!repo.get('customers', profile.customer_id!)) {
      repo.insert('customers', {
        id: profile.customer_id,
        full_name: profile.name,
        email: profile.email,
        phone: null,
        region: null,
        customer_type: 'personal',
        status: 'prospect',
        is_synthetic: false,
        created_by: userId,
      })
    }
    const user = identity.user(userId)
    if (!user) {
      repo.insert('app_users', {
        id: userId,
        email: profile.email,
        full_name: profile.name,
        role: 'customer',
        customer_id: profile.customer_id ?? null,
        active_organisation_id: null,
      })
    } else {
      new Repo(user.tenant_id).update('app_users', userId, {
        role: 'customer',
        customer_id: profile.customer_id ?? null,
        tenant_id: tenantId,
        full_name: profile.name,
      })
    }
  })
  rememberDatabaseUser(userId)
}

export async function ensureClientProfile(): Promise<ClientProfile> {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  const token = session?.access_token
  if (!session || !token) throw new Error('Sign in again — your session is not ready yet.')
  if (session.user.id) rememberDatabaseUser(session.user.id)
  const { data, error } = await supabase.rpc('ensure_client_profile').setHeader('Authorization', `Bearer ${token}`)
  if (error) {
    if (/permission denied/i.test(error.message)) {
      throw new Error('Signed in, but the app could not open your client profile. Refresh and try once more.')
    }
    throw new Error(error.message)
  }
  return data as ClientProfile
}

/**
 * After a Supabase sign-in: finish workspace setup from the signup details if it is still pending, mirror the account and
 * make it the active session. Seeded demo people keep their existing in-browser identity.
 */
export async function adoptDatabaseUser(): Promise<SalesProfile | null> {
  const auth = supabaseAuth.get()
  if (!supabase || auth.status !== 'signed_in' || !auth.userId) return null
  rememberDatabaseUser(auth.userId)
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session?.access_token) {
    throw new Error('Your sign-in session was lost before your profile could open. Sign in again.')
  }
  let profile = await salesApi.profile()
  if (!profile.has_workspace && profile.pending_brokerage) {
    await salesApi.setup({ brokerage_name: profile.pending_brokerage })
    await supabase.auth.refreshSession()
    profile = await salesApi.profile()
  }
  // Creator / platform staff with no brokerage yet still need the local platform_staff mirror for /platform.
  if (profile.platform_role) mirrorPlatformRole(auth.userId, profile.platform_role)
  const demo = auth.email ? identity.userByEmail(auth.email) : undefined
  // Only keep seeded Demo-as staff identities — never divert a live Client Auth login.
  if (demo && demo.role !== 'customer' && !isDatabaseUser(demo.id) && demo.id !== auth.userId) {
    session.set(demo.id)
    return profile
  }
  if (profile.has_workspace) {
    mirrorProfile(profile, auth.userId)
    session.set(auth.userId)
    return profile
  }
  // Client zone (no brokerage membership): ensure customer row in the database, then mirror.
  const client = await ensureClientProfile()
  if (client.kind === 'client') {
    mirrorClientProfile(client, auth.userId)
    session.set(auth.userId)
  }
  return profile
}

/** After sign-up: Auth may omit a session when email confirm is on; DB auto-confirm lets password sign-in succeed. */
async function signInAfterSignUp(email: string, password: string): Promise<boolean> {
  await supabaseAuth.signIn(email, password)
  return supabaseAuth.get().status === 'signed_in'
}

/** Client zone: Supabase Auth sign-up. Existence is checked in Auth Users, not browser storage. */
export async function signUpClient(a: {
  full_name: string
  email: string
  password: string
}): Promise<{ status: 'ready'; home: string } | { status: 'needs_confirmation' }> {
  if (!supabase) throw new Error('This build has no Supabase connection. Client accounts require the live database.')
  const email = a.email.trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: a.password,
    options: {
      data: { full_name: a.full_name.trim(), zone: 'client' },
      emailRedirectTo: `${window.location.origin}/sign-in?zone=client&next=/my`,
    },
  })
  if (error) throw new Error(error.message)
  if (!data.session && !(await signInAfterSignUp(email, a.password))) return { status: 'needs_confirmation' }
  if (data.session) await supabaseAuth.signIn(email, a.password)
  if (supabaseAuth.get().status !== 'signed_in') throw new Error(supabaseAuth.get().error ?? 'Sign-in failed after sign-up.')
  const client = await ensureClientProfile()
  if (client.kind === 'client') mirrorClientProfile(client, supabaseAuth.get().userId!)
  else await adoptDatabaseUser()
  session.set(supabaseAuth.get().userId)
  return { status: 'ready', home: client.home || '/my' }
}

/** Client or broker: Supabase Auth password sign-in against the live database. */
export async function signInDatabase(a: { email: string; password: string }): Promise<{ home: string }> {
  if (!supabase) throw new Error('This build has no Supabase connection. Sign-in requires the live database.')
  await supabaseAuth.signIn(a.email.trim().toLowerCase(), a.password)
  const auth = supabaseAuth.get()
  if (auth.status !== 'signed_in' || !auth.userId) throw new Error(auth.error ?? 'Sign-in failed.')
  rememberDatabaseUser(auth.userId)
  const profile = await adoptDatabaseUser()
  if (profile?.has_workspace) {
    session.set(auth.userId)
    return { home: '/my' }
  }
  // adoptDatabaseUser already ensured + mirrored a client profile when there is no brokerage workspace.
  const userId = supabaseAuth.get().userId ?? auth.userId
  session.set(userId)
  return { home: '/my' }
}

export interface BrokerSignUp {
  full_name: string
  email: string
  password: string
  brokerage_name: string
  phone?: string
  service_area?: string
}

/** Creates the Supabase login and the brokerage workspace. Returns needs_confirmation only if auto-confirm + sign-in both fail. */
export async function signUpBroker(a: BrokerSignUp): Promise<{ status: 'ready'; profile: SalesProfile } | { status: 'needs_confirmation' }> {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  const email = a.email.trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: a.password,
    options: { data: { full_name: a.full_name.trim(), brokerage_name: a.brokerage_name.trim() }, emailRedirectTo: `${window.location.origin}/sign-in?next=/broker/book` },
  })
  if (error) throw new Error(error.message)
  if (!data.session && !(await signInAfterSignUp(email, a.password))) return { status: 'needs_confirmation' }
  if (data.session) await supabaseAuth.signIn(email, a.password)
  if (supabaseAuth.get().status !== 'signed_in') throw new Error(supabaseAuth.get().error ?? 'Sign-in failed after sign-up.')
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
  const email = a.email.trim().toLowerCase()
  if (a.mode === 'sign_up') {
    const { data, error } = await supabase.auth.signUp({
      email, password: a.password,
      options: { data: { full_name: a.full_name.trim() }, emailRedirectTo: `${window.location.origin}/team/join/${a.token}` },
    })
    if (error) throw new Error(error.message)
    if (!data.session && !(await signInAfterSignUp(email, a.password))) return { status: 'needs_confirmation' as const }
  }
  await supabaseAuth.signIn(email, a.password)
  const state = supabaseAuth.get()
  if (state.status !== 'signed_in') throw new Error(state.error ?? 'Sign-in failed.')
  const profile = await acceptTeamInvitation(a.token)
  return { status: 'ready' as const, profile }
}

/** Sends the Supabase password-recovery email. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw new Error(error.message)
}

/** Sets a new password while the recovery session from the email link is active. */
export async function updatePassword(password: string): Promise<void> {
  if (!supabase) throw new Error('This build has no Supabase connection.')
  if (password.length < 8) throw new Error('Use a password of at least 8 characters.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
}
