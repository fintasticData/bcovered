// Insurer access per brokerage, separate from platform membership. Only the simulated demo adapter exists; every other
// insurer and product is explicitly unsupported until an insurer supplies a specification and test credentials.
import type { InsurerAccess, ProductModule } from '../db/onboardingSchema'
import type { Insurer } from '../db/schema'

export interface IntegrationDef {
  key: string
  label: string
  insurers: string[]
  modules: ProductModule[]
  note: string
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'demo_adapter',
    label: 'Demo insurer adapter (simulated quotes)',
    insurers: ['Protea Insure', 'Karoo Mutual', 'Baobab General'],
    modules: ['personal_lines'],
    note: 'Returns synthetic motor options from a rate table. Never an insurer quotation.',
  },
]

export function integrationFor(insurer: Pick<Insurer, 'name'>, module: ProductModule): IntegrationDef | null {
  return INTEGRATIONS.find((i) => i.insurers.includes(insurer.name) && i.modules.includes(module)) ?? null
}

export const UNSUPPORTED_REASON = 'No integration exists for this insurer and product yet. Quotes are prepared on the insurer’s own portal.'

export const maskSecret = (secret: string) => `••••${secret.slice(-4)}`

/** What a brokerage member may see about one access row. Credentials are reduced to a masked hint. */
export interface InsurerAccessView extends InsurerAccess {
  insurer_name: string
  supported: boolean
  integration_label: string | null
  credential_hint: string | null
}
