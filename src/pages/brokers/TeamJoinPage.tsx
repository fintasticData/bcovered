import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, LogIn, MailCheck, ShieldAlert, UserPlus } from 'lucide-react'
import { referralApi } from '@/copilot/salesApi'
import { acceptTeamInvitation, joinWithInvitation } from '@/lib/supabase/accounts'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** The private team invitation a broker sends a sub-broker or agent (not the customer referral link). */
export default function TeamJoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const auth = useSupabaseAuth()
  const preview = useQuery({ queryKey: ['team-invitation', token], queryFn: () => referralApi.invitation(token), retry: false })
  const inv = preview.data
  const [mode, setMode] = useState<'sign_up' | 'sign_in'>('sign_up')
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (inv?.email) setForm((f) => ({ ...f, email: inv.email ?? f.email, full_name: f.full_name || (inv.name ?? '') }))
  }, [inv?.email, inv?.name])

  const signedInAsInvitee = auth.status === 'signed_in' && inv?.email && auth.email?.toLowerCase() === inv.email.toLowerCase()

  const done = () => navigate('/broker/book', { replace: true })
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const res = await joinWithInvitation({ token, mode, ...form })
      if (res.status === 'needs_confirmation') setConfirm(true)
      else done()
    })
  }

  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-md p-8">
        <p className="eyebrow">Team invitation</p>
        {preview.isLoading ? (
          <Loader2 className="mt-6 h-6 w-6 animate-spin text-brand-600" />
        ) : !inv?.valid ? (
          <div className="mt-4 space-y-3">
            <ShieldAlert className="h-8 w-8 text-amber-500" />
            <h1 className="font-display text-2xl text-brand-900">This invitation cannot be used</h1>
            <p className="text-sm text-ink/70">{inv?.reason ?? (preview.error as Error | null)?.message ?? 'Ask your broker for a new invitation link.'}</p>
            <Link to="/sign-in?next=/broker/book" className="text-sm font-semibold text-brand-600 underline">Sign in instead</Link>
          </div>
        ) : confirm ? (
          <div className="mt-4 space-y-3 text-center">
            <MailCheck className="mx-auto h-10 w-10 text-brand-600" />
            <h1 className="font-display text-2xl text-brand-900">Confirm your email</h1>
            <p className="text-sm text-ink/70">Open the confirmation link we sent to {form.email}; it brings you back here to join {inv.brokerage}.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-2 font-display text-3xl text-brand-900">Join {inv.brokerage}</h1>
            <p className="mt-2 text-sm text-ink/70">
              {inv.invited_by ?? 'Your broker'} invited <strong>{inv.name}</strong> as <strong>{inv.role_label}</strong>. You will see the clients assigned to you and
              get your own customer referral link.
            </p>
            {signedInAsInvitee ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-ink/70">Signed in as {auth.email}.</p>
                {error && <p className="field-error" role="alert">{error}</p>}
                <button type="button" className="btn-dark w-full" disabled={busy} onClick={() => void run(async () => { await acceptTeamInvitation(token); done() })}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Accept and open my workspace
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div className="flex gap-1 rounded-full bg-sand p-1" role="tablist" aria-label="Account">
                  {(['sign_up', 'sign_in'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => setMode(m)}
                      className={cn('flex-1 cursor-pointer rounded-full px-3 py-2 text-sm font-semibold transition', mode === m ? 'bg-white text-brand-900 shadow-sm' : 'text-ink/60')}
                    >
                      {m === 'sign_up' ? 'Create my login' : 'I already have one'}
                    </button>
                  ))}
                </div>
                {mode === 'sign_up' && (
                  <div>
                    <label htmlFor="tj-name" className="field-label">Full name</label>
                    <input id="tj-name" className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="name" />
                  </div>
                )}
                <div>
                  <label htmlFor="tj-email" className="field-label">Email</label>
                  <input id="tj-email" type="email" className="field" value={form.email} readOnly autoComplete="email" />
                  <p className="mt-1 text-xs text-ink/60">The invitation only works for this address.</p>
                </div>
                <div>
                  <label htmlFor="tj-password" className="field-label">Password</label>
                  <input id="tj-password" type="password" className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'} minLength={8} />
                </div>
                {error && <p className="field-error" role="alert">{error}</p>}
                <button type="submit" className="btn-dark w-full" disabled={busy || form.password.length < 8 || (mode === 'sign_up' && form.full_name.trim().length < 2)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'sign_up' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  {mode === 'sign_up' ? 'Create login and join' : 'Sign in and join'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
