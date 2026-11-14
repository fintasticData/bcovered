import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailPlus } from 'lucide-react'
import { api, type CreatedInvitation } from '@/api/client'
import { useMe, usePlatformAction } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/broker/PageHeader'
import { Notice, Page, Section } from '@/broker/shared/ui'
import { InvitationCreated } from '@/onboarding/sections'
import { textInput } from '@/onboarding/ui'
import { INVITATION_TTL_DAYS } from '@/server/onboarding/config'

export default function InvitationsPage() {
  const { data: me } = useMe()
  const invite = usePlatformAction(api.platformAdmin.inviteOwner)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(INVITATION_TTL_DAYS)
  const [created, setCreated] = useState<(CreatedInvitation & { application_id: string }) | null>(null)
  const isAdmin = me?.platform_role === 'platform_admin'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate({ brokerage_name: name, email, expires_in_days: days }, { onSuccess: (c) => { setCreated(c); setName(''); setEmail('') } })
  }

  return (
    <Page>
      <PageHeader title="Invite a brokerage" description="Creates the brokerage’s workspace in onboarding state, a draft application and a secure, single-use invitation for its owner." />
      {!isAdmin && <Notice tone="warning">Only platform administrators can invite brokerage owners.</Notice>}
      <Section title="Owner invitation">
        <form onSubmit={submit} className="grid max-w-xl gap-3">
          <label className="text-xs font-semibold text-navy-800" htmlFor="inv-name">
            Brokerage name
          </label>
          <input id="inv-name" className={textInput} value={name} onChange={(e) => setName(e.target.value)} required disabled={!isAdmin} />
          <label className="text-xs font-semibold text-navy-800" htmlFor="inv-email">
            Owner’s email
          </label>
          <input id="inv-email" type="email" className={textInput} value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!isAdmin} />
          <label className="text-xs font-semibold text-navy-800" htmlFor="inv-days">
            Expires after (days)
          </label>
          <input id="inv-days" type="number" min={1} max={30} className={`${textInput} max-w-32`} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={!isAdmin} />
          <Button type="submit" variant="accent" disabled={!isAdmin || invite.isPending}>
            <MailPlus /> Create invitation
          </Button>
          {invite.error && <p className="text-xs text-red-600">{invite.error.message}</p>}
        </form>
      </Section>
      {created && (
        <>
          <InvitationCreated created={created} />
          <p className="text-xs text-navy-600">
            The application now appears in the <Link to="/platform/onboarding" className="font-semibold underline">onboarding queue</Link> under Drafts.
          </p>
        </>
      )}
      <Notice>Seeded demo invitation: open /brokers/invite/demo-invite-umhlanga-2026 and create an account with owner@umhlangabrokers.example.demo.</Notice>
    </Page>
  )
}
