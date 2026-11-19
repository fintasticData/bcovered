import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Database, LogIn, UserPlus } from 'lucide-react'
import { api, session } from '@/api/client'
import { PasswordField } from '@/components/PasswordField'
import { adoptDatabaseUser, isDatabaseUser, signInDatabase, signUpClient } from '@/lib/supabase/accounts'
import { supabase, supabaseAuth, useSupabaseAuth } from '@/lib/supabase/client'
import { identity } from '@/server/db/store'
import { cn } from '@/lib/utils'

/** Live Client zone auth against Supabase Auth + ensure_client_profile (database is source of truth). */
export function AuthForm({ defaultMode = 'sign_in', email: fixedEmail, onDone }: { defaultMode?: 'sign_in' | 'sign_up'; email?: string; onDone: (home?: string) => void }) {
  const [mode, setMode] = useState(defaultMode)
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const auth = useSupabaseAuth()

  const switchToSignIn = (message?: string) => {
    setMode('sign_in')
    setError(message ?? 'This email is already registered in the database. Sign in with your password.')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!supabase || auth.status === 'unconfigured') {
      setError('This build has no Supabase connection. Accounts are created in the live database only.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'sign_in') {
        const out = await signInDatabase({ email, password })
        onDone(out.home)
        return
      }
      const out = await signUpClient({ email, password, full_name: name })
      if (out.status === 'needs_confirmation') {
        setConfirm(true)
        return
      }
      onDone(out.home)
    } catch (err) {
      const message = (err as Error).message || 'Something went wrong.'
      if (/already\s+(been\s+)?registered|already exists|User already registered/i.test(message)) {
        switchToSignIn('This email is already registered in the database. Sign in with your password.')
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (confirm) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-ink/70">
          Confirm the email we sent to <strong>{email}</strong>, then sign in. Your account is created in the live database.
        </p>
        <button type="button" className="btn-dark w-full" onClick={() => { setConfirm(false); setMode('sign_in') }}>
          <LogIn className="h-4 w-4" /> Go to sign in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <div className="flex gap-1 rounded-full bg-sand p-1" role="tablist" aria-label="Account">
        {(['sign_in', 'sign_up'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m)
              setError(null)
            }}
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
      <PasswordField
        id="auth-password"
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
        minLength={8}
        required
        hint={mode === 'sign_up' ? 'At least 8 characters. Checked against the live database.' : undefined}
      />
      {mode === 'sign_in' && (
        <p className="text-right text-xs">
          <Link to="/forgot-password" className="font-semibold text-brand-600 underline">Forgot password?</Link>
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          <p>{error}</p>
          {mode === 'sign_up' && /already/i.test(error) && (
            <button type="button" className="mt-2 font-semibold text-brand-700 underline" onClick={() => switchToSignIn()}>
              Switch to Sign in
            </button>
          )}
        </div>
      )}
      <button type="submit" className="btn-dark w-full" disabled={busy || auth.status === 'unconfigured'}>
        {mode === 'sign_in' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {busy ? 'Working…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
      </button>
      <p className="text-center text-[11px] text-ink/50">
        Accounts are stored in Supabase Auth and <code className="rounded bg-sand px-1">app_users</code>. Browser-only demo logins are disabled for Client zone.
      </p>
    </form>
  )
}

/** Supabase Auth sign-in for brokerage staff: the copilots and Supabase-backed screens act as this login under row-level security. */
function DatabaseSignIn({ onDone }: { onDone: (home?: string) => void }) {
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
    onDone('/my')
  }
  if (auth.status === 'unconfigured') return <p className="text-xs text-ink/60">This build has no Supabase connection.</p>
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
      {auth.status === 'signed_in' && <p className="text-xs text-ink/70">Signed in to the database as {auth.email}.</p>}
      <div>
        <label htmlFor="db-email" className="field-label">Work email</label>
        <input id="db-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </div>
      <PasswordField
        id="db-password"
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      <p className="text-right text-xs">
        <Link to="/forgot-password" className="font-semibold text-brand-600 underline">Forgot password?</Link>
      </p>
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
  const zone = params.get('zone')
  const done = async (home?: string) => {
    const me = await api.me().catch(() => null)
    navigate(next && next.startsWith('/') ? next : home || me?.home || '/my')
  }
  const zoneCopy =
    zone === 'broker'
      ? 'Broker zone sign-in uses the live database. After you authenticate you land in My Area with your BLP# and workspace shortcuts.'
      : zone === 'client'
        ? 'Client zone create/sign-in checks Supabase Auth. After you authenticate Russ welcomes you in My Area.'
        : 'Sign in against the live database. You land in My Area with Russ.'
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-md p-8">
        <p className="eyebrow">{zone === 'broker' ? 'Broker zone' : zone === 'client' ? 'Client zone' : 'BCovered'}</p>
        <h1 className="mt-2 font-display text-3xl text-brand-900">{params.get('mode') === 'sign_up' ? 'Create account' : 'Sign in'}</h1>
        <p className="mt-2 text-sm text-ink/70">
          {zoneCopy}{' '}
          New brokerage?{' '}
          <Link to="/brokers/signup" className="font-semibold text-brand-600 underline">Open a broker workspace</Link>
          {' '}or{' '}
          <Link to="/brokers/join" className="font-semibold text-brand-600 underline">apply as a brokerage</Link>.
          {' '}Have an invite?{' '}
          <Link to="/brokers/invite" className="font-semibold text-brand-600 underline">Open your invitation</Link>.
        </p>
        <div className="mt-6">
          <AuthForm defaultMode={params.get('mode') === 'sign_up' ? 'sign_up' : 'sign_in'} onDone={(home) => void done(home)} />
        </div>
        {zone !== 'client' && (
          <div className="mt-8 border-t border-ink/10 pt-6">
            <h2 className="text-sm font-semibold text-brand-900">Brokerage staff: database sign-in</h2>
            <p className="mt-1 mb-4 text-xs text-ink/60">Same live database. Use this if you already have a brokerage workspace.</p>
            <DatabaseSignIn onDone={(home) => void done(home)} />
          </div>
        )}
      </div>
    </div>
  )
}
