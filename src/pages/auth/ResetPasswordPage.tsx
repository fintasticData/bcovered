import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { PasswordField } from '@/components/PasswordField'
import { updatePassword } from '@/lib/supabase/accounts'
import { supabase, useSupabaseAuth } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const auth = useSupabaseAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) setReady(true)
    })
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      setDone(true)
      window.setTimeout(() => navigate('/sign-in', { replace: true }), 1600)
    } catch (err) {
      setError((err as Error).message || 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-md p-8">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-display text-3xl text-brand-900">Reset password</h1>
        {auth.status === 'unconfigured' ? (
          <p className="mt-4 text-sm text-ink/70">This build has no Supabase connection.</p>
        ) : done ? (
          <p className="mt-6 text-sm text-ink/70">Password updated. Taking you to sign in…</p>
        ) : !ready ? (
          <div className="mt-6 space-y-3 text-sm text-ink/70">
            <p>Open the reset link from your email on this device to continue.</p>
            <Link to="/forgot-password" className="font-semibold text-brand-600 underline">Request a new link</Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate>
            <PasswordField
              id="reset-password"
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              hint="At least 8 characters."
            />
            <PasswordField
              id="reset-password-confirm"
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {error && <p className="field-error" role="alert">{error}</p>}
            <button type="submit" className="btn-dark w-full" disabled={busy || password.length < 8}>
              <KeyRound className="h-4 w-4" /> {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
