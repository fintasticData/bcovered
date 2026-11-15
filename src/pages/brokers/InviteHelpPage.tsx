import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'

/** Explains how to use a brokerage or team invitation when the user only has a partial link. */
export default function InviteHelpPage() {
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-12">
      <div className="card w-full max-w-lg p-8">
        <p className="eyebrow flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> Invitation
        </p>
        <h1 className="mt-2 font-display text-3xl text-brand-900">Have an invite?</h1>
        <p className="mt-3 text-sm text-ink/70">
          Open the full link from the person who invited you. Owner invitations look like{' '}
          <code className="rounded bg-sand px-1.5 py-0.5 text-[11px]">/brokers/invite/…</code>
          ; team and broker-agent invitations look like{' '}
          <code className="rounded bg-sand px-1.5 py-0.5 text-[11px]">/team/join/…</code>.
          Each link works once and expires.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-ink/80">
          <li>
            Already have an account?{' '}
            <Link to="/sign-in" className="font-semibold text-brand-600 underline">
              Sign in
            </Link>
            , then open your invite link again.
          </li>
          <li>
            New here?{' '}
            <Link to="/sign-in?mode=sign_up" className="font-semibold text-brand-600 underline">
              Create an account
            </Link>{' '}
            with the invited email, then accept the invitation.
          </li>
          <li>
            Joining as a brokerage owner without a link?{' '}
            <Link to="/brokers/join" className="font-semibold text-brand-600 underline">
              Apply as a brokerage
            </Link>
            .
          </li>
        </ul>
      </div>
    </div>
  )
}
