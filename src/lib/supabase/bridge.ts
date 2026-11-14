// Keeps Supabase Auth in step with the "Demo as ..." identity: brokerage and platform staff sign in with their seeded
// login; customers and visitors have no staff login, so the Supabase session ends. Brokers who signed in with their own
// login keep it: their session is never replaced by a demo sign-in.
import { session } from '@/api/client'
import { identity } from '@/server/db/store'
import { adoptDatabaseUser, isDatabaseUser } from './accounts'
import { supabase, supabaseAuth } from './client'

export function startSupabaseBridge() {
  if (!supabase) return
  const follow = () => {
    const userId = session.get()
    if (isDatabaseUser(userId)) return
    const user = userId ? identity.user(userId) : null
    const staff =
      user && user.role !== 'customer' && (identity.memberships(user.id).some((m) => m.status === 'active') || Boolean(identity.platformStaff(user.id)))
    if (staff) void supabaseAuth.connectDemo(user.email)
    else if (supabaseAuth.get().status === 'signed_in' && !isDatabaseUser(supabaseAuth.get().userId)) void supabaseAuth.signOut()
  }
  session.subscribe(follow)
  follow()

  // A restored login refreshes the mirrored brokerage (for example after B-Covered activates it).
  let adopted: string | null = null
  supabaseAuth.subscribe(() => {
    const a = supabaseAuth.get()
    if (a.status !== 'signed_in' || !a.userId || !isDatabaseUser(a.userId) || adopted === a.userId) return
    adopted = a.userId
    void adoptDatabaseUser().catch(() => {
      adopted = null
    })
  })
}
