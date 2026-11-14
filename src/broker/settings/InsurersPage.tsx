import { useState, type FormEvent } from 'react'
import { KeyRound, Plug, Power, PowerOff } from 'lucide-react'
import type { InsurerAccessView } from '@/api/client'
import { useDeclareInsurer, useDisableInsurer, useEnableInsurer, useInsurerAccess, useInsurerCredentials, useTestInsurer } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { ProductModule } from '@/server/db/onboardingSchema'
import { MODULE_LABEL } from '@/server/onboarding/config'
import { textInput } from '@/onboarding/ui'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice, Page, Section } from '../shared/ui'

const STEPS = ['Not configured', 'Awaiting credentials', 'Testing', 'Enabled']

function AccessRow({ row, canManage, active }: { row: InsurerAccessView; canManage: boolean; active: boolean }) {
  const credentials = useInsurerCredentials()
  const test = useTestInsurer()
  const enable = useEnableInsurer()
  const disable = useDisableInsurer()
  const [key, setKey] = useState('')
  const error = credentials.error?.message ?? test.error?.message ?? enable.error?.message ?? disable.error?.message
  return (
    <li className="rounded-xl border border-navy-800/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900">
            {row.insurer_name} · {MODULE_LABEL[row.product_module]}
          </p>
          <p className="text-xs text-navy-600">
            Intermediary code {row.intermediary_code ?? '–'} · {row.supported ? row.integration_label : 'No integration available'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!row.supported && <Badge tone="neutral">Unsupported</Badge>}
          <StatusBadge status={row.status} />
        </div>
      </div>
      {row.status_reason && <p className="mt-2 text-xs text-navy-700">{row.status_reason}</p>}
      <p className="mt-1 text-[11px] text-navy-500">
        Credentials: {row.credential_hint ?? 'none stored'}
        {row.last_test_at && ` · last test ${row.last_test_result} ${formatDateTime(row.last_test_at)}`}
      </p>
      {canManage && row.supported && row.status !== 'enabled' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              credentials.mutate({ access_id: row.id, api_key: key }, { onSuccess: () => setKey('') })
            }}
          >
            <input aria-label="API key" type="password" autoComplete="off" className={`${textInput} w-56`} placeholder={row.credential_hint ? 'Rotate API key' : 'API key from the insurer'} value={key} onChange={(e) => setKey(e.target.value)} />
            <Button size="sm" type="submit" variant="outline" disabled={!key || credentials.isPending}>
              <KeyRound /> Store securely
            </Button>
          </form>
          <Button size="sm" variant="outline" disabled={!active || !row.credential_hint || test.isPending} onClick={() => test.mutate(row.id)}>
            <Plug /> Test connection
          </Button>
          <Button size="sm" variant="accent" disabled={!active || row.last_test_result !== 'passed' || enable.isPending} onClick={() => enable.mutate(row.id)}>
            <Power /> Enable
          </Button>
        </div>
      )}
      {canManage && row.status === 'enabled' && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => disable.mutate({ access_id: row.id, reason: 'Disabled by the brokerage' })}>
          <PowerOff /> Disable
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  )
}

export default function InsurersPage() {
  const { data, isLoading, error } = useInsurerAccess()
  const declare = useDeclareInsurer()
  const [insurerId, setInsurerId] = useState('')
  const [module, setModule] = useState<ProductModule | ''>('')
  const [code, setCode] = useState('')
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load insurer access'} /></div>

  return (
    <Page>
      <PageHeader title="Insurer access" description="Access to each insurer and product is configured separately from platform membership. Quoting only uses insurers whose access is enabled." />
      <Notice>
        Steps: {STEPS.join(' → ')}. Credentials are stored server-side (Vault in the target build) and shown only as a masked hint. They never appear in the browser after you submit them, in logs or in Russ. Only the simulated demo adapter exists today; every other insurer is shown as unsupported.
      </Notice>
      {!data.brokerage_active && <Notice tone="warning">Your brokerage is not active, so connections cannot be tested or enabled yet.</Notice>}
      <ul className="space-y-3">
        {data.rows.map((r) => (
          <AccessRow key={r.id} row={r} canManage={data.can_manage} active={data.brokerage_active} />
        ))}
      </ul>
      {data.can_manage && (
        <Section title="Add an insurer relationship">
          <form
            className="grid gap-2 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (module) declare.mutate({ insurer_id: insurerId, product_module: module, intermediary_code: code }, { onSuccess: () => setCode('') })
            }}
          >
            <select aria-label="Insurer" className={textInput} value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
              <option value="">Insurer…</option>
              {data.insurers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.supported_modules.length ? '' : ' (unsupported)'}
                </option>
              ))}
            </select>
            <select aria-label="Product module" className={textInput} value={module} onChange={(e) => setModule(e.target.value as ProductModule)} required>
              <option value="">Product…</option>
              {data.modules.map((m) => (
                <option key={m} value={m}>
                  {MODULE_LABEL[m]}
                </option>
              ))}
            </select>
            <input aria-label="Intermediary code" className={textInput} placeholder="Intermediary code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <Button type="submit" variant="accent" disabled={declare.isPending}>
              Add
            </Button>
          </form>
          {declare.error && <p className="mt-2 text-xs text-red-600">{declare.error.message}</p>}
        </Section>
      )}
    </Page>
  )
}
