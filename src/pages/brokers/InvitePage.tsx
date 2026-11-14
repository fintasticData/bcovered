import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, MailCheck, ShieldAlert } from 'lucide-react'
import { useAcceptInvitation, useInvitation, useMe, useSignOut } from '@/api/hooks'
import { formatDateTime } from '@/lib/utils'
import { NotAuthorisation } from '@/onboarding/ui'
import { AuthForm } from '../auth/SignInPage'

const STATE_TEXT = {
  expired: 'This invitation has expired. Ask the person who invited you to send a new one.',
  used: 'This invitation has already been used.',
  revoked: 'This invitation was withdrawn. Ask the person who invited you for a new one.',
} as const

export default function InvitePage() {
  const { token } = useParams()
  const { data: invite, isLoading, error } = useInvitation(token)
  const { data: me } = useMe()
  const accept = useAcceptInvitation()
  const signOut = useSignOut()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-ink/60">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const emailMatches = me && invite && me.email.toLowerCase() === invite.email.toLowerCase()

  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-lg p-8">
        {error || !invite ? (
          <div className="text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-3 text-xl font-semibold text-brand-900">This invitation link is not valid</h1>
            <p className="mt-2 text-sm text-ink/70">Check that you copied the whole link, or ask for a new invitation.</p>
          </div>
        ) : (
          <>
            <p className="eyebrow">{invite.kind === 'owner' ? 'Brokerage invitation' : 'Team invitation'}</p>
            <h1 className="mt-2 font-display text-3xl text-brand-900">{invite.brokerage_name}</h1>
            <p className="mt-2 text-sm text-ink/70">
              Invitation for <strong>{invite.email}</strong> as <strong>{invite.role_label}</strong>. Valid until {formatDateTime(invite.expires_at)}. The link works once.
            </p>
            {invite.state !== 'valid' ? (
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                {STATE_TEXT[invite.state]}{' '}
                {invite.state === 'used' &&
                  (me ? (
                    <Link to={me.home} className="font-semibold underline">
                      Continue to your workspace
                    </Link>
                  ) : (
                    <Link to="/sign-in" className="font-semibold underline">
                      Sign in
                    </Link>
                  ))}
              </p>
            ) : !me ? (
              <div className="mt-6">
                <p className="mb-4 text-sm text-ink/70">Create an account or sign in with the invited email address to accept.</p>
                <AuthForm defaultMode="sign_up" email={invite.email} onDone={() => undefined} />
              </div>
            ) : !emailMatches ? (
              <div className="mt-6 space-y-3">
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  You are signed in as {me.email}. This invitation is for {invite.email}.
                </p>
                <button type="button" className="btn-ghost w-full" onClick={() => signOut.mutate(undefined)}>
                  Sign out and use the invited address
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {accept.error && <p className="field-error" role="alert">{accept.error.message}</p>}
                <button type="button" className="btn-dark w-full" disabled={accept.isPending} onClick={() => accept.mutate(token!, { onSuccess: (out) => navigate(out.home) })}>
                  <MailCheck className="h-4 w-4" /> Accept and continue
                </button>
              </div>
            )}
            {invite.kind === 'owner' && <NotAuthorisation className="mt-6" />}
          </>
        )}
      </div>
    </div>
  )
}
