// The browser's Supabase connection: publishable key only, signed in as a broker through Supabase Auth so row-level
// security applies to every read and write. Service-role keys never reach the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'

const env = import.meta.env as Record<string, string | undefined>
export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? null
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null
/** Shared password of the seeded demo staff logins (Sample brokerage only). Real brokers sign in with their own. */
const DEMO_PASSWORD = env.VITE_DEMO_STAFF_PASSWORD ?? null

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY && typeof window !== 'undefined'
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bcovered-auth' } })
    : null

export type AuthStatus = 'unconfigured' | 'signed_out' | 'signing_in' | 'signed_in' | 'error'

export interface AuthState {
  status: AuthStatus
  email: string | null
  userId: string | null
  error: string | null
}

let state: AuthState = { status: supabase ? 'signed_out' : 'unconfigured', email: null, userId: null, error: null }
const listeners = new Set<() => void>()
const set = (next: Partial<AuthState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export const supabaseAuth = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  async accessToken(): Promise<string | null> {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },
  async signIn(email: string, password: string) {
    if (!supabase) return set({ status: 'unconfigured' })
    set({ status: 'signing_in', error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) return set({ status: 'error', error: error?.message ?? 'Sign-in failed', email: null, userId: null })
    set({ status: 'signed_in', email: data.session.user.email ?? email, userId: data.session.user.id, error: null })
  },
  /** Signs the demo staff identity in to Supabase Auth with the seeded demo password. */
  async connectDemo(email: string) {
    if (!supabase) return set({ status: 'unconfigured' })
    if (state.status === 'signed_in' && state.email?.toLowerCase() === email.toLowerCase()) return
    if (!DEMO_PASSWORD) return set({ status: 'error', error: 'Set VITE_DEMO_STAFF_PASSWORD, or sign in at /sign-in with your own login.' })
    await supabaseAuth.signIn(email, DEMO_PASSWORD)
  },
  async signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    set({ status: 'signed_out', email: null, userId: null, error: null })
  },
}

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) set({ status: 'signed_in', email: data.session.user.email ?? null, userId: data.session.user.id })
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) set({ status: 'signed_in', email: session.user.email ?? null, userId: session.user.id, error: null })
    else if (state.status === 'signed_in') set({ status: 'signed_out', email: null, userId: null })
  })
}

export function useSupabaseAuth(): AuthState {
  return useSyncExternalStore(supabaseAuth.subscribe, supabaseAuth.get, supabaseAuth.get)
}
