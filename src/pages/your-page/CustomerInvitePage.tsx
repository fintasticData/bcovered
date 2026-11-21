import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { customerPageApi } from '@/api/customerPage'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LoadingState, ErrorState } from '@/broker/PageHeader'

/** Redeem a broker-shared Your page invitation. */
export default function CustomerInvitePage() {
  const { token = '' } = useParams()
  const auth = useSupabaseAuth()
  const navigate = useNavigate()
  const [peek, setPeek] = useState<Awaited<ReturnType<typeof customerPageApi.invitePeek>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await customerPageApi.invitePeek(token)
        if (!cancelled) setPeek(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Invitation not valid')
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const redeem = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await customerPageApi.inviteRedeem(token)
      navigate(r.is_sample ? '/demo/my' : (r.path || '/my'), { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open Your page')
      setBusy(false)
    }
  }

  if (!peek && !error) return <div className="grid min-h-[50vh] place-items-center"><LoadingState label="Opening invitation…" /></div>
  if (error && !peek) return <div className="container-x py-10"><ErrorState message={error} /></div>

  return (
    <div className="bg-mist min-h-[60vh]">
      <div className="container-x max-w-lg space-y-5 py-10">
        <div className="rounded-2xl border border-navy-800/10 bg-white p-6 text-center">
          {peek?.brokerage.logo_url && (
            <img src={peek.brokerage.logo_url} alt="" className="mx-auto mb-3 h-14 w-14 rounded-xl object-contain" />
          )}
          <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{peek?.brokerage.trading_name}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">
            {peek?.greeting_name ? `Hello, ${peek.greeting_name}` : 'Your page'}
          </h1>
          <p className="mt-2 text-sm text-navy-600">
            Open your insurance page with {peek?.brokerage.trading_name}. Sign in so we can show only your cover and requests.
          </p>
          {peek?.is_sample && (
            <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-950">Sample invitation</p>
          )}
          {error && <p className="mt-3 text-xs text-red-700" role="alert">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {auth.status === 'signed_in' ? (
              <Button variant="accent" disabled={busy} onClick={() => void redeem()}>
                {busy ? 'Opening…' : 'Open My Page'}
              </Button>
            ) : (
              <Button variant="accent" asChild>
                <Link to={`/sign-in?zone=client&next=${encodeURIComponent(`/invite/c/${token}`)}`}>Sign in to continue</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
