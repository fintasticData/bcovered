// Keeps Supabase Auth in step with the "Demo as ..." identity: brokerage and platform staff can use seeded demo
// passwords. Live Client/Broker database logins are never replaced or signed out by the demo bridge.
import { session } from '@/api/client'
import { identity } from '@/server/db/store'
import { adoptDatabaseUser, isDatabaseUser, rememberDatabaseUser } from './accounts'
import { supabase, supabaseAuth } from './client'

/** Seeded demo staff only — never treat a brand-new Auth UUID as "demo leftover". */
function isDemoStaffAuthSession() {
  const auth = supabaseAuth.get()
  if (auth.status !== 'signed_in' || !auth.email) return false
  if (isDatabaseUser(auth.userId)) return false
  const local = identity.userByEmail(auth.email)
  if (!local || local.role === 'customer') return false
  return identity.memberships(local.id).some((m) => m.status === 'active') || Boolean(identity.platformStaff(local.id))
}

export function startSupabaseBridge() {
  if (!supabase) return
  const follow = () => {
    const userId = session.get()
    if (isDatabaseUser(userId)) return
    // Live password/OTP login owns Auth — do not tear it down for Demo-as.
    if (supabaseAuth.get().status === 'signed_in' && (isDatabaseUser(supabaseAuth.get().userId) || !isDemoStaffAuthSession())) return
    const user = userId ? identity.user(userId) : null
    const staff =
      user && user.role !== 'customer' && (identity.memberships(user.id).some((m) => m.status === 'active') || Boolean(identity.platformStaff(user.id)))
    if (staff) void supabaseAuth.connectDemo(user.email)
    else if (isDemoStaffAuthSession()) void supabaseAuth.signOut()
  }
  session.subscribe(follow)
  follow()

  // A restored login refreshes the mirrored brokerage / client profile.
  let adopted: string | null = null
  supabaseAuth.subscribe(() => {
    const a = supabaseAuth.get()
    if (a.status !== 'signed_in' || !a.userId || adopted === a.userId) return
    rememberDatabaseUser(a.userId)
    adopted = a.userId
    void adoptDatabaseUser()
      .then(() => {
        if (a.userId) session.set(a.userId)
      })
      .catch(() => {
        adopted = null
      })
  })
}
