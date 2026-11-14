import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Database, LogIn, UserPlus } from 'lucide-react'
import { api, session } from '@/api/client'
import { useSignIn, useSignUp } from '@/api/hooks'
import { adoptDatabaseUser, isDatabaseUser } from '@/lib/supabase/accounts'
import { supabaseAuth, useSupabaseAuth } from '@/lib/supabase/client'
import { identity } from '@/server/db/store'
import { cn } from '@/lib/utils'

/** Email and password for people who join or are invited. Stands in for Supabase Auth; seeded demo people use “Demo as”. */
export function AuthForm({ defaultMode = 'sign_in', email: fixedEmail, onDone }: { defaultMode?: 'sign_in' | 'sign_up'; email?: string; onDone: () => void }) {
  const [mode, setMode] = useState(defaultMode)
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const signIn = useSignIn()
  const signUp = useSignUp()
  const busy = signIn.isPending || signUp.isPending
  const error = (mode === 'sign_in' ? signIn.error : signUp.error)?.message

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'sign_in') signIn.mutate({ email, password }, { onSuccess: onDone })
    else signUp.mutate({ email, password, full_name: name }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex gap-1 rounded-full bg-sand p-1" role="tablist" aria-label="Account">
        {(['sign_in', 'sign_up'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn('flex-1 cursor-pointer rounded-full px-3 py-2 text-sm font-semibold transition', mode === m ? 'bg-white text-brand-900 shadow-sm' : 'text-ink/60')}
          >
            {m === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>
      {mode === 'sign_up' && (
        <div>
          <label htmlFor="auth-name" className="field-label">Full name</label>
          <input id="auth-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </div>
      )}
      <div>
        <label htmlFor="auth-email" className="field-label">Email</label>
        <input id="auth-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={Boolean(fixedEmail)} autoComplete="email" required />
      </div>
      <div>
        <label htmlFor="auth-password" className="field-label">Password</label>
        <input
          id="auth-password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
          minLength={8}
          required
        />
        {mode === 'sign_up' && <p className="mt-1 text-xs text-ink/60">At least 8 characters.</p>}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn-dark w-full" disabled={busy}>
        {mode === 'sign_in' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {mode === 'sign_in' ? 'Sign in' : 'Create account'}
      </button>
      <p className="text-center text-[11px] text-ink/50">Demo mode: accounts live in this browser only. Seeded demo people use the “Demo as” switcher.</p>
    </form>
  )
}

/** Supabase Auth sign-in for brokerage staff: the copilots and Supabase-backed screens act as this login under row-level security. */
function DatabaseSignIn({ onDone }: { onDone: () => void }) {
  const auth = useSupabaseAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adopting, setAdopting] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await supabaseAuth.signIn(email.trim(), password)
    if (supabaseAuth.get().status !== 'signed_in') return
    const local = identity.userByEmail(email)
    if (local && !isDatabaseUser(local.id)) session.set(local.id)
    else {
      setAdopting(true)
      const profile = await adoptDatabaseUser().catch(() => null)
      setAdopting(false)
      if (profile && !profile.has_workspace) return navigate('/brokers/signup')
    }
    onDone()
  }
  if (auth.status === 'unconfigured') return <p className="text-xs text-ink/60">This build has no Supabase connection.</p>
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {auth.status === 'signed_in' && <p className="text-xs text-ink/70">Signed in to the database as {auth.email}.</p>}
      <div>
        <label htmlFor="db-email" className="field-label">Work email</label>
        <input id="db-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </div>
      <div>
        <label htmlFor="db-password" className="field-label">Password</label>
        <input id="db-password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </div>
      {auth.status === 'error' && auth.error && <p className="field-error" role="alert">{auth.error}</p>}
      <button type="submit" className="btn-dark w-full" disabled={auth.status === 'signing_in' || adopting || !email || !password}>
        <Database className="h-4 w-4" /> {adopting ? 'Opening your workspace…' : 'Sign in to the brokerage database'}
      </button>
    </form>
  )
}

export default function SignInPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next')
  const done = async () => {
    const me = await api.me()
    navigate(next && next.startsWith('/') ? next : (me?.home ?? '/'))
  }
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-md p-8">
        <p className="eyebrow">B-Covered</p>
        <h1 className="mt-2 font-display text-3xl text-brand-900">Sign in</h1>
        <p className="mt-2 text-sm text-ink/70">
          Brokerages that applied or were invited sign in here. New broker? <Link to="/brokers/signup" className="font-semibold text-brand-600 underline">Open a broker workspace</Link>{' '}
          or <Link to="/brokers/join" className="font-semibold text-brand-600 underline">apply as a brokerage</Link>.
        </p>
        <div className="mt-6">
          <AuthForm defaultMode={params.get('mode') === 'sign_up' ? 'sign_up' : 'sign_in'} onDone={done} />
        </div>
        <div className="mt-8 border-t border-ink/10 pt-6">
          <h2 className="text-sm font-semibold text-brand-900">Brokerage staff: database sign-in</h2>
          <p className="mt-1 mb-4 text-xs text-ink/60">Signs in with Supabase Auth so AR, Ava and Russ act as you, scoped to your brokerage and to Sample or Live records.</p>
          <DatabaseSignIn onDone={() => navigate(next && next.startsWith('/') ? next : '/broker/book')} />
        </div>
      </div>
    </div>
  )
}
