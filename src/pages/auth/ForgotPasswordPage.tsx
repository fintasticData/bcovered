import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import { requestPasswordReset } from '@/lib/supabase/accounts'
import { useSupabaseAuth } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const auth = useSupabaseAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (auth.status === 'unconfigured') {
      setError('This build has no Supabase connection.')
      return
    }
    setBusy(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError((err as Error).message || 'Could not send reset email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-md p-8">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 font-display text-3xl text-brand-900">Forgot password</h1>
        {sent ? (
          <div className="mt-6 space-y-4 text-center">
            <Mail className="mx-auto h-10 w-10 text-brand-600" />
            <p className="text-sm text-ink/70">
              If an account exists for <strong>{email.trim().toLowerCase()}</strong>, we sent a reset link.
              Open it to choose a new password.
            </p>
            <Link to="/sign-in" className="btn-dark inline-flex w-full">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate>
            <p className="text-sm text-ink/70">Enter the email for your live database account. We’ll send a reset link.</p>
            <div>
              <label htmlFor="forgot-email" className="field-label">Email</label>
              <input
                id="forgot-email"
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
            <button type="submit" className="btn-dark w-full" disabled={busy || !email.trim() || auth.status === 'unconfigured'}>
              <Mail className="h-4 w-4" /> {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-center text-xs text-ink/60">
              <Link to="/sign-in" className="font-semibold text-brand-600 underline">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
