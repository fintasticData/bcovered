/**
 * Shared Fintastic demo entry points — centre-first hosts and the three
 * right-hand modes from the fintastic-ux skill.
 */

export const FLEET_PERSON_ID = '4f636b52-b23d-4e06-9860-f29846094e17'
/** VIP sample client with Toyota Fortuner (record drawer + inspect demos). */
export const VIP_PERSON_ID = 'c0000000-0000-4000-8000-000000000310'
export const CLAIM_ID = 'c1111111-0000-4000-8000-00000000a033'
/** Naledi VIP burglary claim (CLM-S1007) — insurer accepted + repair quotes demo. */
export const BURGLARY_CLAIM_ID = '03766623-19d9-40e5-8737-06af43ac61d7'
/** Ubuntu Foods commercial profile — My Business Page demo. */
export const UBUNTU_FOODS_PROFILE_ID = 'a0000000-0000-4000-8000-000000000601'
/** Load-demo-businesses My Business Page profiles (Thali / Swift / Mokoena). */
export const THALI_HOUSE_PROFILE_ID = 'a0000000-0000-4000-8000-000000000811'
export const SWIFT_FREIGHT_PROFILE_ID = 'a0000000-0000-4000-8000-000000000841'
export const MOKOENA_PARTNERS_PROFILE_ID = 'a0000000-0000-4000-8000-000000000871'

export type FintasticDemoLink = {
  id: string
  to: string
  label: string
  hint: string
  group: 'centre' | 'drawer'
}

/** Full-width centre-first hosts — never crush these into a right slide-out. */
export const FINTASTIC_CENTRE_LINKS: FintasticDemoLink[] = [
  {
    id: 'fleet',
    to: `/broker/customers/people/${FLEET_PERSON_ID}?rtab=items&view=fintastic&item=${encodeURIComponent('Delivery van 04')}`,
    label: 'Fleet cover',
    hint: 'Wide hub above the items list',
    group: 'centre',
  },
  {
    id: 'renewals',
    to: '/broker/renewals?view=fintastic&focus=r1',
    label: 'Renewals',
    hint: 'Change review above the renewals queue',
    group: 'centre',
  },
  {
    id: 'policies',
    to: '/broker/policies?view=fintastic',
    label: 'Policies',
    hint: 'Star hub + working grid + drawer',
    group: 'centre',
  },
  {
    id: 'quotes',
    to: '/broker/quotes/sample-motor?view=fintastic',
    label: 'Quote comparison',
    hint: 'Full-width SAMPLE comparison',
    group: 'centre',
  },
  {
    id: 'claim',
    to: `/broker/claims/${CLAIM_ID}?view=fintastic`,
    label: 'Motor claim',
    hint: 'Active step on the claim page',
    group: 'centre',
  },
  {
    id: 'claim-burglary',
    to: `/broker/claims/${BURGLARY_CLAIM_ID}?view=fintastic`,
    label: 'Burglary claim quotes',
    hint: 'CLM-S1007 — accepted claim with provider quotes',
    group: 'centre',
  },
  {
    id: 'myclaims',
    to: '/demo/my?tab=claims&view=fintastic',
    label: 'My claims',
    hint: 'Cover desk — claims tab on personal account',
    group: 'centre',
  },
  {
    id: 'my-page-cover',
    to: '/demo/my?view=fintastic',
    label: 'My Cover · personal',
    hint: 'Queue-first — expand a row for the in-row hub',
    group: 'centre',
  },
  {
    id: 'my-business',
    to: `/broker/customers/businesses/${UBUNTU_FOODS_PROFILE_ID}/business-page?view=fintastic&tab=assets&item=${encodeURIComponent('Blast freezers and cold rooms')}`,
    label: 'My Business Page · Ubuntu',
    hint: 'Ubuntu Foods assets hub + working grid',
    group: 'centre',
  },
  {
    id: 'my-business-thali',
    to: `/broker/customers/businesses/${THALI_HOUSE_PROFILE_ID}/business-page?view=fintastic`,
    label: 'My Business Page · Thali',
    hint: 'Overview — KPIs, attention and next actions (load demo businesses first)',
    group: 'centre',
  },
  {
    id: 'my-business-thali-assets',
    to: `/broker/customers/businesses/${THALI_HOUSE_PROFILE_ID}/business-page?view=fintastic&tab=assets`,
    label: 'Assets & cover · Thali',
    hint: 'Thin asset register — KPIs, table and next actions',
    group: 'centre',
  },
  {
    id: 'my-business-thali-values',
    to: `/broker/customers/businesses/${THALI_HOUSE_PROFILE_ID}/business-page?view=fintastic&tab=values`,
    label: 'Values & payments · Thali',
    hint: 'Recorded asset value, purchase, premiums and Commission (not Comms)',
    group: 'centre',
  },
  {
    id: 'my-page-values',
    to: '/demo/my?view=fintastic&tab=values',
    label: 'Values & payments · personal',
    hint: 'Cover desk Values tab — personal account (switcher for Business)',
    group: 'centre',
  },
  {
    id: 'my-business-thali-cards',
    to: `/broker/customers/businesses/${THALI_HOUSE_PROFILE_ID}/business-page?view=fintastic&tab=assets&layout=cards&item=${encodeURIComponent('Kitchen equipment')}&panel=overview`,
    label: 'Business assets · Cards + inspect',
    hint: 'Thali card layout with thin focused-item inspect open',
    group: 'centre',
  },
  {
    id: 'my-business-thali-map',
    to: `/broker/customers/businesses/${THALI_HOUSE_PROFILE_ID}/business-page?view=fintastic&tab=assets&layout=map&place=${encodeURIComponent('a0000000-0000-4000-8000-000000000813')}&item=${encodeURIComponent("Manager's phone")}&panel=overview`,
    label: 'Business assets · Map · Thali',
    hint: 'Woodstock Site layout — cold room pins; phone typically used at both branches',
    group: 'centre',
  },
  {
    id: 'my-home-map',
    to: '/demo/my?view=fintastic&layout=map&place=place-home&item=Laptop&panel=overview',
    label: 'My home · Map',
    hint: 'Home Site layout — laptop typically used at Home and Work',
    group: 'centre',
  },
  {
    id: 'my-home-cards',
    to: '/demo/my?view=fintastic&layout=cards',
    label: 'My home · Cards',
    hint: 'Personal Assets & cover card browse',
    group: 'centre',
  },
  {
    id: 'my-business-swift',
    to: `/broker/customers/businesses/${SWIFT_FREIGHT_PROFILE_ID}/business-page?view=fintastic&tab=assets`,
    label: 'My Business Page · Swift',
    hint: 'Lerato Molefe · fleet & warehouse (load demo businesses first)',
    group: 'centre',
  },
  {
    id: 'my-business-mokoena',
    to: `/broker/customers/businesses/${MOKOENA_PARTNERS_PROFILE_ID}/business-page?view=fintastic&tab=assets`,
    label: 'My Business Page · Mokoena',
    hint: 'Kagiso Mokoena · professional offices (load demo businesses first)',
    group: 'centre',
  },
]

/**
 * Right-hand modes: complete record work drawer, thin focused-item inspect,
 * and task form (Save / Cancel or journey).
 */
export const FINTASTIC_DRAWER_LINKS: FintasticDemoLink[] = [
  {
    id: 'record-drawer',
    to: `/broker/customers/people/${VIP_PERSON_ID}`,
    label: 'Record drawer',
    hint: 'Complete customer work surface (size=record)',
    group: 'drawer',
  },
  {
    id: 'item-inspect',
    to: `/broker/customers/people/${VIP_PERSON_ID}/your-page?view=fintastic&item=${encodeURIComponent('Toyota Fortuner')}&panel=1`,
    label: 'Item inspect',
    hint: 'Thin preview while the expanded-row hub owns the item',
    group: 'drawer',
  },
  {
    id: 'business-asset-inspect',
    to: `/broker/customers/businesses/${UBUNTU_FOODS_PROFILE_ID}/business-page?view=fintastic&item=${encodeURIComponent('Blast freezers and cold rooms')}&panel=1`,
    label: 'Business asset inspect',
    hint: 'Thin asset preview on My Business Page hub',
    group: 'drawer',
  },
  {
    id: 'task-form',
    to: `/broker/concierge/providers?job=1&personId=${VIP_PERSON_ID}`,
    label: 'Task form',
    hint: 'Create job — task + person bound at open (Save / Cancel)',
    group: 'drawer',
  },
  {
    id: 'task-form-claim',
    to: `/broker/concierge/providers?job=1&claimId=${BURGLARY_CLAIM_ID}&personId=${VIP_PERSON_ID}`,
    label: 'Claim quotes job',
    hint: 'Create job bound to CLM-S1007 after insurer acceptance',
    group: 'drawer',
  },
]

/** All demo links (centre-first then drawer modes). */
export const FINTASTIC_DEMO_LINKS: FintasticDemoLink[] = [
  ...FINTASTIC_CENTRE_LINKS,
  ...FINTASTIC_DRAWER_LINKS,
]
