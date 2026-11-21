// Keeps Supabase Auth in step with the "Demo as ..." identity: brokerage and platform staff can use seeded demo
// passwords. Live Client/Broker database logins are never replaced or signed out by the demo bridge.
import { session } from '@/api/client'
import { identity } from '@/server/db/store'
import { adoptDatabaseUser, isDatabaseUser, rememberDatabaseUser } from './accounts'
import { supabase, supabaseAuth } from './client'

const VIP_DEMO_EMAILS = new Set([
  'naledi.vip@example.demo',
  'thandi.walkthrough@example.demo',
  'lerato.mokoena@bcovered.demo',
  'protea.desk@bcovered.demo',
  'karoo.desk@bcovered.demo',
])

/** Seeded Demo-as Auth sessions the bridge may replace — never lock these as live database logins. */
export function isSeededDemoAuthEmail(email: string | null | undefined) {
  if (!email) return false
  const e = email.toLowerCase()
  if (VIP_DEMO_EMAILS.has(e)) return true
  const local = identity.userByEmail(e)
  if (!local) return false
  if (local.role === 'customer') return false
  return identity.memberships(local.id).some((m) => m.status === 'active') || Boolean(identity.platformStaff(local.id))
}

/** Seeded demo Auth sessions the bridge may replace when Demo-as switches identity. */
function isDemoBridgeAuthSession() {
  const auth = supabaseAuth.get()
  if (auth.status !== 'signed_in' || !auth.email) return false
  // Live password/OTP logins stay locked even if email happens to match a seed row.
  if (isDatabaseUser(auth.userId) && !isSeededDemoAuthEmail(auth.email)) return false
  return isSeededDemoAuthEmail(auth.email)
}

function shouldConnectDemo(user: NonNullable<ReturnType<typeof identity.user>>) {
  if (VIP_DEMO_EMAILS.has(user.email.toLowerCase())) return true
  if (user.role === 'insurer_partner') return true
  return (
    user.role !== 'customer' &&
    (identity.memberships(user.id).some((m) => m.status === 'active') || Boolean(identity.platformStaff(user.id)))
  )
}

export function startSupabaseBridge() {
  if (!supabase) return
  const follow = () => {
    const userId = session.get()
    if (userId && isDatabaseUser(userId) && !isSeededDemoAuthEmail(identity.user(userId)?.email)) return
    // Live password/OTP login owns Auth — do not tear it down for Demo-as.
    const auth = supabaseAuth.get()
    if (auth.status === 'signed_in' && isDatabaseUser(auth.userId) && !isSeededDemoAuthEmail(auth.email)) return
    if (auth.status === 'signed_in' && !isDemoBridgeAuthSession() && !isSeededDemoAuthEmail(auth.email)) return
    const user = userId ? identity.user(userId) : null
    if (user && shouldConnectDemo(user)) void supabaseAuth.connectDemo(user.email)
    else if (isDemoBridgeAuthSession()) void supabaseAuth.signOut()
  }
  session.subscribe(follow)
  follow()

  // A restored live login refreshes the mirrored brokerage / client profile.
  // Seeded Demo-as Auth must not be marked as database users — that blocked VIP switches.
  let adopted: string | null = null
  supabaseAuth.subscribe(() => {
    const a = supabaseAuth.get()
    if (a.status !== 'signed_in' || !a.userId || adopted === a.userId) return
    if (isSeededDemoAuthEmail(a.email)) {
      adopted = a.userId
      return
    }
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
