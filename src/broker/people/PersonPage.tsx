import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HeartPulse, Lock } from 'lucide-react'
import { useCaptureProfile, usePerson, useStartLifeAdvice } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Page, Section, SourceBadge, Stat, zar } from '../shared/ui'
import { lensPath } from '../russ/lenses'
import { AskCopilotButton } from '../copilot/AskCopilotButton'
import { ClientActivity } from '../copilot/ClientActivity'

export default function PersonPage() {
  const { personId } = useParams()
  const { data, isLoading, error } = usePerson(personId)
  const start = useStartLifeAdvice()
  const navigate = useNavigate()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const { person } = data
  const self = data.accounts.find((a) => a.role === 'self')

  return (
    <Page>
      <PageHeader
        title={`${person.first_names} ${person.surname}`}
        description={
          <>
            {data.age !== null && `Age ${data.age} · `}
            {person.date_of_birth && `born ${formatDate(person.date_of_birth)} · `}
            {person.id_last4 ? `ID ending ${person.id_last4}` : 'No ID number on record'}
            {person.is_synthetic && ' · synthetic record'}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <AskCopilotButton copilot="ava" kind="client" id={person.id} />
            {self && (
              <Button
                variant="accent"
                size="sm"
                disabled={!data.can_advise || start.isPending}
                title={data.can_advise ? undefined : 'Your FAIS authorisation does not include long-term insurance'}
                onClick={() => start.mutate(person.id, { onSuccess: () => navigate(lensPath('life')) })}
              >
                <HeartPulse /> {data.life_case && !['completed', 'failed', 'cancelled'].includes(data.life_case.status) ? 'Life advice in progress' : 'Start life advice'}
              </Button>
            )}
          </div>
        }
      />
      <ClientActivity personId={person.id} />
      {start.error && <ErrorState message={start.error.message} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Client accounts" value={data.accounts.length} />
        <Stat label="Policies" value={data.policies.length} />
        <Stat label="Group schemes" value={data.schemes.filter((s) => s.status === 'active').length} />
        <Stat label="Retirement funds" value={data.funds.filter((f) => f.status === 'active').length} />
        <Stat label="Open tasks" value={data.tasks.length} tone={data.tasks.length ? 'warning' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Roles and relationships">
          <ul className="space-y-1.5 text-sm">
            {data.accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>
                  <Badge tone={a.role === 'self' ? 'accent' : 'neutral'}>{humanise(a.role)}</Badge> on {a.customer.full_name}
                </span>
                <span className="text-[11px] text-navy-500">since {formatDate(a.effective_from)}</span>
              </li>
            ))}
            {data.relationships.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>
                  {r.direction === 'outgoing' ? humanise(r.relationship) : `${humanise(r.relationship)} of`}:{' '}
                  <Link to={`/broker/people/${r.other.id}`} className="font-medium text-brand-600">
                    {r.other.first_names} {r.other.surname}
                  </Link>
                  {r.is_financial_dependant && ' · financial dependant'}
                </span>
                <BasisBadge basis={r.source} />
              </li>
            ))}
            {data.employments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span>
                  Employee {e.employee_number} at{' '}
                  <Link to={`/broker/benefits/employers/${e.employer_customer_id}`} className="font-medium text-brand-600">
                    {e.employer}
                  </Link>{' '}
                  · {e.category}
                </span>
                <StatusBadge status={e.status} />
              </li>
            ))}
            {!data.accounts.length && !data.relationships.length && !data.employments.length && <li className="text-navy-500">No roles recorded.</li>}
          </ul>
        </Section>

        <ProfileSection personId={person.id} profile={data.profile} versions={data.profile_versions} />
      </div>

      <Section title="Policies">
        {data.policies.length ? (
          <ul className="divide-y divide-navy-800/5">
            {data.policies.map(({ policy, provider, roles, benefits }) => (
              <li key={policy.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link to={`/broker/life/policies/${policy.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                    {provider} {policy.policy_number ?? '(application)'}
                  </Link>
                  <p className="text-xs text-navy-600">
                    {roles.map(humanise).join(', ')} · {benefits.map((b) => `${humanise(b.benefit_type_key)} ${zar(b.sum_assured ?? b.monthly_benefit)}`).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BasisBadge basis={policy.source} />
                  <StatusBadge status={policy.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-navy-500">No policies.</p>
        )}
      </Section>

      {(data.schemes.length > 0 || data.funds.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Group risk cover">
            <ul className="space-y-1.5 text-sm">
              {data.schemes.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span>
                    {s.scheme}: {zar(s.cover_amount)} {s.above_free_cover_limit && <Badge tone="warning">Above free cover limit</Badge>}
                  </span>
                  <StatusBadge status={s.status} />
                </li>
              ))}
              {!data.schemes.length && <li className="text-navy-500">None.</li>}
            </ul>
          </Section>
          <Section title="Retirement funds">
            <ul className="space-y-1.5 text-sm">
              {data.funds.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <span>
                    {f.fund} · {f.member_number} · {zar(f.latest_value)} at {f.valuation_date ?? '–'}
                  </span>
                  <BasisBadge basis="reported" />
                </li>
              ))}
              {!data.funds.length && <li className="text-navy-500">None.</li>}
            </ul>
          </Section>
        </div>
      )}

      {data.benefit_events.length > 0 && (
        <Section title="Claims and benefit events">
          <ul className="space-y-1.5 text-sm">
            {data.benefit_events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {humanise(e.event_type)} on {formatDate(e.event_date)} {e.section_37c && <Badge tone="warning">Section 37C</Badge>}
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <SourceBadge source="broker" /> {humanise(e.broker_status)} <SourceBadge source={e.arrangement === 'retirement_fund' ? 'administrator' : 'insurer'} /> {humanise(e.provider_decision ?? 'pending')}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Timeline">
        {data.timeline.length ? (
          <ol className="space-y-1.5 text-sm">
            {data.timeline.map((t, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-navy-800">{t.label}</span>
                <span className="shrink-0 text-[11px] text-navy-500">
                  {t.source} · {formatDateTime(t.at)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-navy-500">No activity yet.</p>
        )}
      </Section>
    </Page>
  )
}

function ProfileSection({ personId, profile, versions }: { personId: string; profile: import('@/server/db/lifeSchema').FinancialProfile | null; versions: number }) {
  const capture = useCaptureProfile()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    occupation: profile?.occupation ?? '',
    gross: profile?.gross_monthly_income?.toString() ?? '',
    net: profile?.net_monthly_income?.toString() ?? '',
    obligations: profile?.monthly_obligations?.toString() ?? '',
    debt: profile?.outstanding_debt?.toString() ?? '',
  })
  const n = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    capture.mutate(
      { person_id: personId, occupation: form.occupation || null, gross_monthly_income: n(form.gross), net_monthly_income: n(form.net), monthly_obligations: n(form.obligations), outstanding_debt: n(form.debt) },
      { onSuccess: () => setEditing(false) },
    )
  }
  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-navy-500" /> Financial profile
        </span>
      }
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing((x) => !x)}>
          {editing ? 'Cancel' : profile ? 'Record new version' : 'Capture profile'}
        </Button>
      }
    >
      <p className="mb-2 text-[11px] text-navy-500">Restricted to advisers in production. Every change creates a new version; earlier versions are kept ({versions} so far).</p>
      {editing ? (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 text-sm">
          {(
            [
              ['occupation', 'Occupation'],
              ['gross', 'Gross monthly income (R)'],
              ['net', 'Net monthly income (R)'],
              ['obligations', 'Monthly obligations (R)'],
              ['debt', 'Outstanding debt (R)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={k === 'occupation' ? 'col-span-2' : undefined}>
              <span className="field-label text-xs">{label}</span>
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="field" inputMode={k === 'occupation' ? 'text' : 'numeric'} />
            </label>
          ))}
          <div className="col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={capture.isPending}>
              Save as declared
            </Button>
            {capture.error && <span className="text-xs text-red-600">{capture.error.message}</span>}
          </div>
        </form>
      ) : profile ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {(
            [
              ['Occupation', profile.occupation, 'occupation'],
              ['Gross monthly income', zar(profile.gross_monthly_income), 'gross_monthly_income'],
              ['Net monthly income', zar(profile.net_monthly_income), 'net_monthly_income'],
              ['Monthly obligations', zar(profile.monthly_obligations), 'monthly_obligations'],
              ['Outstanding debt', zar(profile.outstanding_debt), 'outstanding_debt'],
            ] as const
          ).map(([label, value, key]) => (
            <div key={label}>
              <dt className="flex items-center gap-1 text-[11px] text-navy-500">
                {label} {profile.field_sources[key] && <BasisBadge basis={profile.field_sources[key]} />}
              </dt>
              <dd className="font-medium text-navy-900">{value ?? '–'}</dd>
            </div>
          ))}
          <div className="col-span-2">
            <dt className="text-[11px] text-navy-500">Objectives</dt>
            <dd className="text-navy-800">{profile.objectives.join('; ') || '–'}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-navy-500">No financial profile yet. Capture one before starting life advice.</p>
      )}
    </Section>
  )
}
