import { interestLabel, productById } from '@/broker/book/dialogs'
import { newKey, salesApi, type SalesReceipt } from '@/copilot/salesApi'
import { dataCategory } from '@/lib/supabase/category'

/** Fictional people used only in Demo (sample) category. */
export const DEMO_CUSTOMERS: Array<{
  first_names: string
  surname: string
  phone: string
  email: string
  interests: string[]
  /** Product ids to seed with estimate offers after capture. */
  seedCovers?: string[]
}> = [
  {
    first_names: 'Thandi',
    surname: 'Mokoena',
    phone: '082 555 1001',
    email: 'thandi.demo@bcovered.example',
    interests: ['motor', 'household_contents'],
    seedCovers: ['motor', 'household_contents'],
  },
  {
    first_names: 'Johan',
    surname: 'van Wyk',
    phone: '083 555 1002',
    email: 'johan.demo@bcovered.example',
    interests: ['home', 'life'],
    seedCovers: ['home'],
  },
  {
    first_names: 'Aisha',
    surname: 'Patel',
    phone: '084 555 1003',
    email: 'aisha.demo@bcovered.example',
    interests: ['funeral', 'life'],
    seedCovers: ['funeral'],
  },
  {
    first_names: 'Sipho',
    surname: 'Dlamini',
    phone: '081 555 1004',
    email: 'sipho.demo@bcovered.example',
    interests: ['motor', 'business'],
    seedCovers: ['motor'],
  },
  {
    first_names: 'Lerato',
    surname: 'Ndlovu',
    phone: '082 555 1005',
    email: 'lerato.demo@bcovered.example',
    interests: ['home', 'household_contents', 'life'],
    seedCovers: ['home', 'life'],
  },
]

const ESTIMATE_INSURER: Record<string, string> = {
  motor: 'Santam',
  home: 'OUTsurance',
  household_contents: 'Hollard',
  business: 'Santam',
  life: 'Discovery',
  funeral: 'Old Mutual',
  other: 'Broker estimate',
}

export type SeedDemoResult = {
  created: Array<{ personId: string; name: string; covers: number }>
  switchedToDemo: boolean
}

function personIdFrom(r: SalesReceipt): string | null {
  const id = (r.person_id as string | undefined) ?? (r.client_id as string | undefined)
  return id ?? null
}

/** Creates multiple Demo clients (sample category) with optional estimate covers. */
export async function seedDemoCustomers(): Promise<SeedDemoResult> {
  const switchedToDemo = dataCategory.get() !== 'sample'
  if (switchedToDemo) dataCategory.set('sample')

  const created: SeedDemoResult['created'] = []

  for (const c of DEMO_CUSTOMERS) {
    const capture = await salesApi.capture('sample', {
      first_names: c.first_names,
      surname: c.surname,
      phone: c.phone,
      email: c.email,
      interest: interestLabel(c.interests),
      note: 'Demo client — seeded by Ava for demonstration. Not a live / Production customer.',
      force_new: true,
      key: newKey(),
    })
    const personId = personIdFrom(capture)
    if (!personId) continue

    let covers = 0
    for (const productId of c.seedCovers ?? []) {
      const product = productById(productId)
      if (!product) continue
      await salesApi.createOffer('sample', {
        person_id: personId,
        insurer_name: ESTIMATE_INSURER[productId] ?? 'Broker estimate',
        product: productId,
        premium_amount: product.estimateMonthly,
        premium_frequency: 'monthly',
        notes: `Estimate quote — reasonable first-pass for ${product.label} (${product.term}-term). Demo client seed.`,
        key: newKey(),
      })
      covers += 1
    }

    created.push({ personId, name: `${c.first_names} ${c.surname}`, covers })
  }

  return { created, switchedToDemo }
}
