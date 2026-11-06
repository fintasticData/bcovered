import { rand } from '@/lib/quote'
import type {
  BusinessActivity,
  BusinessLegalEntity,
  BusinessLocation,
  BusinessProfile,
  CommercialAsset,
  CoverageStatus,
  ExposureEvidence,
  IndustryRiskTemplate,
  RiskExposure,
  RiskPriority,
  TwinTable,
} from '../../db/commercialSchema'
import { FOOD_SERVICE } from './facts'
import { compactRand } from './format'

export interface ProfileSnapshot {
  profile: BusinessProfile
  legal_entities: BusinessLegalEntity[]
  locations: BusinessLocation[]
  activities: BusinessActivity[]
  assets: CommercialAsset[]
}

export type ExposureSpec = Pick<
  RiskExposure,
  | 'rule_key'
  | 'title'
  | 'description'
  | 'category'
  | 'business_impact'
  | 'evidence'
  | 'priority'
  | 'priority_inputs'
  | 'coverage_status'
  | 'potential_classes'
  | 'location_ids'
  | 'outstanding_questions'
> & { links: Array<{ table: TwinTable; id: string }> }

interface Input {
  text: string
  weight: number
}

/** Advisory banding of explicit, listed inputs. It is a review order for the broker, not a probability of loss. */
function band(inputs: Input[]): RiskPriority {
  const score = inputs.reduce((s, i) => s + i.weight, 0)
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

const millions = compactRand
const sum = (assets: CommercialAsset[]) => assets.reduce((s, a) => s + (a.declared_value ?? 0), 0)
const locName = (l: BusinessLocation) => l.suburb ?? l.name
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

const ev = (label: string, source: ExposureEvidence['source'], ref?: { table: TwinTable; id: string }): ExposureEvidence => ({
  label,
  source,
  ref_table: ref?.table ?? null,
  ref_id: ref?.id ?? null,
})

type RuleOutput = Omit<ExposureSpec, 'rule_key' | 'coverage_status' | 'priority' | 'priority_inputs'> & { inputs: Input[] }
type Rule = (s: ProfileSnapshot, ctx: RuleContext) => RuleOutput | null

interface RuleContext {
  industry: string
  kitchen: boolean
  claimNotes: string
}

const REFRIGERATION = /cold|perishable|frozen|fridge|refrigerat|freezer/i
const BREAKDOWN_CLAIM = /cold room|fridge|refrigerat|compressor|freezer|breakdown/i

const RULES: Record<string, Rule> = {
  fire_property: (s, c) => {
    if (!s.locations.length) return null
    const n = s.locations.length
    const property = s.assets.filter((a) => ['buildings', 'contents', 'machinery', 'stock'].includes(a.asset_class))
    const total = sum(property)
    const suppression = s.locations.some((l) => l.fire_protection.some((f) => /suppression|sprinkler/i.test(f)))
    const leased = s.locations.filter((l) => l.ownership === 'leased')
    const owned = s.locations.some((l) => l.ownership === 'owned')
    const inputs: Input[] = [{ text: `${n} premises in the profile`, weight: n > 1 ? 1 : 0.5 }]
    if (c.kitchen) inputs.push({ text: 'Commercial kitchens with open flames and fryers', weight: 2 })
    if (suppression) inputs.push({ text: 'Fire suppression or sprinklers declared, no service certificate seen yet', weight: 0.5 })
    else if (c.kitchen) inputs.push({ text: 'No fire suppression over cooking lines declared', weight: 2 })
    if (total) inputs.push({ text: `Declared property values of ${millions(total)} across ${n} premises`, weight: total > 2_000_000 ? 1 : 0.5 })
    if (n === 1 && total > 5_000_000) inputs.push({ text: 'All property value concentrated on a single site', weight: 1.5 })
    return {
      title: 'Fire damage to premises, equipment and stock',
      description: `A fire at any of the ${n} premises could damage ${c.kitchen ? 'kitchen equipment, refrigeration, stock and fittings' : 'equipment, stock and fittings'}.`,
      category: 'property',
      business_impact: n > 1 ? 'One site could close for months while it is repaired and re-equipped.' : 'The business could stop trading while the site is repaired.',
      evidence: [
        ...s.locations.map((l) => ev(`${locName(l)}: ${l.ownership}, ${l.occupancy.toLowerCase()}`, l.source, { table: 'business_locations', id: l.id })),
        ...(total ? [ev(`Declared property values ${millions(total)}`, 'declared')] : []),
      ],
      potential_classes: owned ? ['fire_allied_perils', 'buildings_combined'] : ['fire_allied_perils'],
      location_ids: s.locations.map((l) => l.id),
      outstanding_questions: [
        ...(leased.length ? ['Who insures the buildings and tenant improvements under each lease?'] : []),
        ...(c.kitchen ? ['When were the suppression systems and extraction ducts last serviced?'] : []),
        'Are contents, plant and stock declared on a replacement basis?',
      ],
      links: [...s.locations.map((l) => ({ table: 'business_locations' as const, id: l.id })), ...property.map((a) => ({ table: 'commercial_assets' as const, id: a.id }))],
      inputs,
    }
  },

  business_interruption: (s) => {
    const streams = s.activities.filter((a) => a.kind === 'revenue_stream')
    const turnover = s.profile.annual_turnover
    if (!streams.length && !turnover) return null
    const sites = new Set(streams.map((a) => a.location_id).filter(Boolean)).size || s.locations.length
    const inputs: Input[] = []
    if (turnover) inputs.push({ text: `Declared turnover ${millions(turnover)} (an accounting figure, not insured gross profit)`, weight: turnover > 5_000_000 ? 1 : 0.5 })
    if (sites > 1) inputs.push({ text: `Revenue spread across ${sites} sites; closing one affects about 1/${sites} of revenue (inferred equal split)`, weight: 1 })
    else inputs.push({ text: 'All revenue depends on a single site', weight: 2.5 })
    if (!s.profile.existing_cover?.notes?.match(/interruption/i)) inputs.push({ text: 'No business interruption sum insured or indemnity period recorded', weight: 1 })
    return {
      title: 'Loss of gross profit if a site closes after insured damage',
      description: 'Revenue depends on premises and equipment being available. Business interruption cover responds to insured damage, not to every loss of revenue.',
      category: 'interruption',
      business_impact: 'Lost gross profit and extra costs of working while a site is closed or partly operating.',
      evidence: [
        ...(turnover ? [ev(`Annual turnover ${millions(turnover)}`, s.profile.field_sources.annual_turnover ?? 'declared')] : []),
        ...streams.map((a) => ev(a.name, a.source, { table: 'business_activities', id: a.id })),
      ],
      potential_classes: ['business_interruption'],
      location_ids: s.locations.map((l) => l.id),
      outstanding_questions: [
        'What gross profit basis and indemnity period should be considered? Accounting gross profit is not automatically insurable gross profit.',
        'Which insured damage triggers are needed (fire, machinery breakdown, utility supply)?',
        'How long would it realistically take to re-open a site after a major fire?',
      ],
      links: [...streams.map((a) => ({ table: 'business_activities' as const, id: a.id })), ...s.locations.map((l) => ({ table: 'business_locations' as const, id: l.id }))],
      inputs,
    }
  },

  stock_deterioration: (s, c) => {
    const stock = s.assets.filter((a) => a.asset_class === 'stock')
    const refrigerated = stock.filter((a) => REFRIGERATION.test(a.description) || c.kitchen)
    if (!refrigerated.length) return null
    const total = sum(refrigerated)
    const noBackup = s.locations.filter((l) => l.backup_power === false && refrigerated.some((a) => a.location_id === l.id))
    const inputs: Input[] = [{ text: `Refrigerated or perishable stock of ${millions(total)} declared`, weight: total >= 500_000 ? 2 : 1 }]
    if (noBackup.length) inputs.push({ text: `No backup power at ${list(noBackup.map(locName))}`, weight: 2 })
    if (BREAKDOWN_CLAIM.test(c.claimNotes)) inputs.push({ text: `Prior claim: ${c.claimNotes}`, weight: 2 })
    const power = s.activities.find((a) => a.kind === 'supplier_dependency' && /electric/i.test(a.name))
    return {
      title: 'Spoilage of perishable stock after breakdown or power failure',
      description: 'Refrigerated stock can be lost within hours if cold rooms fail or power is interrupted.',
      category: 'property',
      business_impact: 'Stock replacement cost plus lost sales while stock is rebuilt.',
      evidence: refrigerated.map((a) => ev(`${a.description}: ${a.declared_value ? rand(a.declared_value) : 'value not declared'}`, a.source, { table: 'commercial_assets', id: a.id })),
      potential_classes: ['deterioration_of_stock'],
      location_ids: [...new Set(refrigerated.map((a) => a.location_id).filter((x): x is string => Boolean(x)))],
      outstanding_questions: [
        'Would deterioration of stock respond to machinery breakdown and to public supply failure, and how are scheduled power outages treated?',
        'Is there temperature monitoring with alarms on each cold room?',
      ],
      links: [...refrigerated.map((a) => ({ table: 'commercial_assets' as const, id: a.id })), ...(power ? [{ table: 'business_activities' as const, id: power.id }] : [])],
      inputs,
    }
  },

  machinery_breakdown: (s, c) => {
    const machines = s.assets.filter((a) => a.asset_class === 'machinery')
    if (!machines.length) return null
    const total = sum(machines)
    const inputs: Input[] = [{ text: `Machinery and equipment of ${millions(total)} declared`, weight: total > 2_000_000 ? 1.5 : 1 }]
    if (BREAKDOWN_CLAIM.test(c.claimNotes)) inputs.push({ text: `Prior breakdown claim: ${c.claimNotes}`, weight: 1.5 })
    if (machines.some((m) => m.value_basis === 'book')) inputs.push({ text: 'Some machinery declared at book value', weight: 1 })
    if (c.kitchen) inputs.push({ text: 'Trading stops if cooking or refrigeration equipment fails', weight: 1 })
    return {
      title: 'Breakdown of critical equipment',
      description: `Sudden mechanical or electrical breakdown of ${c.kitchen ? 'kitchen and refrigeration equipment' : 'production machinery'} could stop operations.`,
      category: 'property',
      business_impact: 'Repair or replacement cost, and possible downtime while parts are sourced.',
      evidence: machines.map((a) => ev(`${a.description}: ${a.declared_value ? rand(a.declared_value) : 'value not declared'} (${a.value_basis} basis)`, a.source, { table: 'commercial_assets', id: a.id })),
      potential_classes: ['machinery_breakdown'],
      location_ids: [...new Set(machines.map((a) => a.location_id).filter((x): x is string => Boolean(x)))],
      outstanding_questions: ['Which machines would stop trading if they failed, and what are the replacement lead times?', 'Are there maintenance contracts in place?', 'Should business interruption be linked to machinery breakdown?'],
      links: machines.map((a) => ({ table: 'commercial_assets' as const, id: a.id })),
      inputs,
    }
  },

  public_liability: (s, c) => {
    const open = s.locations.filter((l) => l.public_access)
    if (!open.length) return null
    const seats = open.reduce((t, l) => t + (l.seating_capacity ?? 0), 0)
    const inputs: Input[] = [{ text: `${open.length} premises open to the public`, weight: 1 }]
    if (seats) inputs.push({ text: `About ${seats} seats in total`, weight: seats > 150 ? 1.5 : 1 })
    if (FOOD_SERVICE.includes(c.industry)) inputs.push({ text: 'Hot food and drinks served to customers', weight: 0.5 })
    return {
      title: 'Injury to customers or damage to their property',
      description: 'Customers and visitors on the premises could be injured, for example by slips, burns or falling objects.',
      category: 'liability',
      business_impact: 'Legal defence costs and compensation awarded to third parties.',
      evidence: open.map((l) => ev(`${locName(l)}: public access${l.seating_capacity ? `, about ${l.seating_capacity} seats` : ''}`, l.source, { table: 'business_locations', id: l.id })),
      potential_classes: ['public_liability'],
      location_ids: open.map((l) => l.id),
      outstanding_questions: ['What limit of indemnity do the landlords or shopping centres require?', 'Are there stairs, terraces or outdoor areas used by customers?'],
      links: open.map((l) => ({ table: 'business_locations' as const, id: l.id })),
      inputs,
    }
  },

  products_liability: (s, c) => {
    const customers = s.activities.filter((a) => a.kind === 'customer_dependency')
    const inputs: Input[] = []
    if (FOOD_SERVICE.includes(c.industry)) inputs.push({ text: 'Food prepared and served to the public', weight: 1.5 })
    if (c.industry === 'manufacturing') inputs.push({ text: 'Food products manufactured for resale', weight: 2 })
    if (customers.length) inputs.push({ text: `Products supplied to ${list(customers.map((a) => a.name))}`, weight: 1 })
    if (!inputs.length) inputs.push({ text: 'Products sold to customers', weight: 1 })
    return {
      title: 'Illness or injury caused by products supplied',
      description: 'A contaminated or defective product could cause illness or injury after it leaves the business.',
      category: 'liability',
      business_impact: 'Compensation claims, legal costs and possible recall costs (recall usually needs separate cover).',
      evidence: [ev(`Industry: ${c.industry.replace(/_/g, ' ')}`, s.profile.field_sources.industry_key ?? 'inferred'), ...customers.map((a) => ev(a.name, a.source, { table: 'business_activities', id: a.id }))],
      potential_classes: ['products_liability'],
      location_ids: [],
      outstanding_questions: ['Are food safety certificates current at every site?', 'Is there a documented product recall plan?'],
      links: customers.map((a) => ({ table: 'business_activities' as const, id: a.id })),
      inputs,
    }
  },

  cyber_payments: (s) => {
    const platforms = s.activities.filter((a) => a.kind === 'supplier_dependency' && /card|payment|online|platform/i.test(a.name))
    const pos = s.assets.filter((a) => a.asset_class === 'electronic_equipment')
    if (!platforms.length && !pos.length) return null
    const inputs: Input[] = []
    if (pos.length) inputs.push({ text: 'Card payments taken on POS terminals', weight: 1 })
    if (s.activities.some((a) => /online/i.test(a.name))) inputs.push({ text: 'Online orders depend on third-party platforms', weight: 1 })
    if (pos.some((a) => a.declared_value === null)) inputs.push({ text: 'POS and electronic equipment value not declared', weight: 0.5 })
    return {
      title: 'Card data, POS and online-ordering disruption',
      description: 'A cyber incident or platform outage could stop card payments or online orders and expose customer information.',
      category: 'cyber',
      business_impact: 'Lost sales during downtime, incident response costs and possible POPIA notification obligations.',
      evidence: [...pos.map((a) => ev(a.description, a.source, { table: 'commercial_assets', id: a.id })), ...platforms.map((a) => ev(a.name, a.source, { table: 'business_activities', id: a.id }))],
      potential_classes: ['cyber', 'electronic_equipment'],
      location_ids: [],
      outstanding_questions: ['Who provides the POS and online ordering platforms, and what happens if they are down?', 'Is customer personal information stored (POPIA)?'],
      links: [...pos.map((a) => ({ table: 'commercial_assets' as const, id: a.id })), ...platforms.map((a) => ({ table: 'business_activities' as const, id: a.id }))],
      inputs,
    }
  },

  theft_money: (s, c) => {
    if (!s.locations.length) return null
    const secured = s.locations.filter((l) => l.security.length)
    const inputs: Input[] = []
    if (secured.length === s.locations.length) inputs.push({ text: `Security declared: ${list([...new Set(secured.flatMap((l) => l.security))])} (not verified)`, weight: 0.5 })
    else inputs.push({ text: `No security measures recorded at ${s.locations.length - secured.length} premises`, weight: 2 })
    if (['restaurants_hospitality', 'retail', 'tourism'].includes(c.industry)) inputs.push({ text: 'Cash handled at tills', weight: 1 })
    return {
      title: 'Burglary and loss of cash',
      description: 'Break-ins after hours, or theft of cash on premises and on the way to the bank.',
      category: 'crime',
      business_impact: 'Stolen stock, equipment and cash, plus damage caused by forced entry.',
      evidence: s.locations.map((l) => ev(`${locName(l)}: ${l.security.length ? l.security.join(', ') : 'no security recorded'}`, l.source, { table: 'business_locations', id: l.id })),
      potential_classes: ['theft', 'money'],
      location_ids: s.locations.map((l) => l.id),
      outstanding_questions: ['How is cash banked, and how much is kept on premises overnight?', 'Is the alarm linked to armed response at every site?'],
      links: s.locations.map((l) => ({ table: 'business_locations' as const, id: l.id })),
      inputs,
    }
  },

  delivery_motor: (s) => {
    const vehicles = s.assets.filter((a) => a.asset_class === 'vehicle')
    if (!vehicles.length) return null
    const qty = vehicles.reduce((t, v) => t + v.quantity, 0)
    const inputs: Input[] = [{ text: `${qty} vehicle${qty > 1 ? 's' : ''} used for business`, weight: qty >= 5 ? 2 : 1 }]
    if (vehicles.some((v) => v.declared_value === null)) inputs.push({ text: 'Vehicle values not declared', weight: 0.5 })
    if (vehicles.some((v) => /deliver|truck/i.test(v.description))) inputs.push({ text: 'Vehicles used for deliveries on public roads', weight: 1 })
    return {
      title: 'Accidents involving business vehicles',
      description: 'Damage to business vehicles and liability to third parties on the road.',
      category: 'motor',
      business_impact: 'Repair costs, third-party claims and disrupted deliveries.',
      evidence: vehicles.map((v) => ev(`${v.quantity} × ${v.description}`, v.source, { table: 'commercial_assets', id: v.id })),
      potential_classes: [qty >= 5 ? 'motor_fleet' : 'commercial_motor'],
      location_ids: [...new Set(vehicles.map((v) => v.location_id).filter((x): x is string => Boolean(x)))],
      outstanding_questions: ['Are the drivers employees or contractors, and are they licensed for these vehicles?', 'What are the registration numbers and values of each vehicle?'],
      links: vehicles.map((v) => ({ table: 'commercial_assets' as const, id: v.id })),
      inputs,
    }
  },

  goods_in_transit: (s, c) => {
    const vehicles = s.assets.filter((a) => a.asset_class === 'vehicle')
    if (!vehicles.length || FOOD_SERVICE.includes(c.industry)) return null
    return {
      title: 'Loss of goods while they are being transported',
      description: 'Goods carried in own vehicles can be damaged, stolen or hijacked on the way to customers.',
      category: 'motor',
      business_impact: 'Value of goods lost and possible liability to customers for late or lost deliveries.',
      evidence: vehicles.map((v) => ev(`${v.quantity} × ${v.description}`, v.source, { table: 'commercial_assets', id: v.id })),
      potential_classes: ['goods_in_transit'],
      location_ids: [],
      outstanding_questions: ['What is the maximum value of goods on one vehicle?', 'Are vehicles tracked, and are routes high-risk for hijacking?'],
      links: vehicles.map((v) => ({ table: 'commercial_assets' as const, id: v.id })),
      inputs: [{ text: 'Own vehicles deliver goods to customers', weight: 1.5 }, { text: 'Load values not declared', weight: 1 }],
    }
  },

  valuation_gap: (s) => {
    const issues = s.assets.filter((a) => a.declared_value === null || a.value_basis !== 'replacement')
    if (!issues.length) return null
    const groups = new Map<string, { text: string; weight: number; count: number }>()
    issues.forEach((a) => {
      const issue =
        a.value_basis === 'book'
          ? { key: `book:${a.id}`, text: `${a.description} declared at book value ${a.declared_value ? millions(a.declared_value) : ''} (book value is not replacement value)`, weight: 2 }
          : a.declared_value === null
            ? { key: `none:${a.description}`, text: `${a.description}: no value declared`, weight: 0.75 }
            : a.value_basis === 'market'
              ? { key: `market:${a.id}`, text: `${a.description} declared at market value (market value is not replacement value)`, weight: 1 }
              : { key: `basis:${a.description}`, text: `${a.description}: valuation basis not stated`, weight: 0.75 }
      const g = groups.get(issue.key)
      if (g) g.count++
      else groups.set(issue.key, { text: issue.text.replace(/\s+\(/, ' ('), weight: issue.weight, count: 1 })
    })
    const inputs: Input[] = [...groups.values()].map((g) => ({
      text: g.count > 1 ? g.text.replace(/^([^:]+):/, `$1 at ${g.count} sites:`) : g.text,
      weight: g.weight,
    }))
    const classes = new Set<string>()
    issues.forEach((a) => {
      if (a.asset_class === 'machinery') classes.add('machinery_breakdown')
      if (['stock', 'contents', 'buildings'].includes(a.asset_class)) classes.add('fire_allied_perils')
      if (a.asset_class === 'vehicle') classes.add('commercial_motor')
      if (a.asset_class === 'electronic_equipment') classes.add('electronic_equipment')
    })
    return {
      title: 'Possible underinsurance: values or valuation basis not confirmed',
      description: 'Some declared values are missing or are not on a replacement basis. Book, market and replacement values are not interchangeable.',
      category: 'valuation',
      business_impact: 'If sums insured are below the value at risk, an average condition can reduce claim payments.',
      evidence: issues.map((a) => ev(`${a.description}: ${a.declared_value ? rand(a.declared_value) : 'no value'} (${a.value_basis} basis)`, a.source, { table: 'commercial_assets', id: a.id })),
      potential_classes: [...classes],
      location_ids: [...new Set(issues.map((a) => a.location_id).filter((x): x is string => Boolean(x)))],
      outstanding_questions: ['Can replacement-cost valuations be provided for each asset group?', 'When were the sums insured last reviewed?'],
      links: issues.map((a) => ({ table: 'commercial_assets' as const, id: a.id })),
      inputs,
    }
  },

  utility_dependency: (s) => {
    const power = s.activities.find((a) => a.kind === 'supplier_dependency' && /electric/i.test(a.name))
    const noBackup = s.locations.filter((l) => l.backup_power === false)
    if (!power && !noBackup.length) return null
    const withBackup = s.locations.filter((l) => l.backup_power === true)
    const inputs: Input[] = [
      { text: `Backup power at ${withBackup.length} of ${s.locations.length} sites`, weight: noBackup.length ? 1.5 : 0.5 },
      { text: 'Refrigeration and trading depend on municipal electricity supply', weight: 1 },
    ]
    return {
      title: 'Interruption from electricity supply failure',
      description: 'Power outages, including load-shedding, can stop trading and refrigeration where there is no backup supply.',
      category: 'dependency',
      business_impact: 'Lost trading hours and possible stock spoilage. Many policies treat scheduled outages differently from unplanned failures.',
      evidence: s.locations.map((l) => ev(`${locName(l)}: ${l.backup_power === true ? 'backup power declared' : l.backup_power === false ? 'no backup power' : 'backup power not stated'}`, l.source, { table: 'business_locations', id: l.id })),
      potential_classes: ['business_interruption', 'deterioration_of_stock'],
      location_ids: noBackup.map((l) => l.id),
      outstanding_questions: ['Is a utility supply extension available, and how are scheduled outages treated in the wording?', 'Is backup power planned for the remaining sites?'],
      links: [...(power ? [{ table: 'business_activities' as const, id: power.id }] : []), ...noBackup.map((l) => ({ table: 'business_locations' as const, id: l.id }))],
      inputs,
    }
  },

  supplier_dependency: (s) => {
    const suppliers = s.activities.filter((a) => a.kind === 'supplier_dependency' && !/electric|card|payment|platform/i.test(a.name))
    if (!suppliers.length) return null
    return {
      title: 'Disruption at key suppliers',
      description: 'A fire or failure at a key supplier could interrupt deliveries the business depends on.',
      category: 'dependency',
      business_impact: 'Menu or production gaps and lost sales until an alternative supplier is found.',
      evidence: suppliers.map((a) => ev(a.name, a.source, { table: 'business_activities', id: a.id })),
      potential_classes: ['business_interruption'],
      location_ids: [],
      outstanding_questions: ['Which suppliers would be hard to replace quickly?', 'Should a suppliers extension be considered on business interruption?'],
      links: suppliers.map((a) => ({ table: 'business_activities' as const, id: a.id })),
      inputs: suppliers.map((a) => ({ text: `Depends on ${a.name.toLowerCase()}`, weight: 0.75 })),
    }
  },

  customer_concentration: (s) => {
    const key = s.activities.filter((a) => a.kind === 'customer_dependency')
    if (!key.length) return null
    const share = key.reduce((t, a) => t + (a.share_of_revenue ?? 0), 0)
    return {
      title: 'Revenue concentrated on a few customers',
      description: 'A large share of revenue comes from a small number of customers.',
      category: 'dependency',
      business_impact: 'An incident at a key customer, or losing a contract, would have an outsized effect on revenue.',
      evidence: key.map((a) => ev(`${a.name}${a.share_of_revenue ? ` (about ${Math.round(a.share_of_revenue * 100)}% of revenue)` : ''}`, a.source, { table: 'business_activities', id: a.id })),
      potential_classes: ['business_interruption'],
      location_ids: [],
      outstanding_questions: ['Do customer contracts require specific insurance cover or limits?', 'Should a customers extension be considered on business interruption?'],
      links: key.map((a) => ({ table: 'business_activities' as const, id: a.id })),
      inputs: [{ text: share ? `Key customers account for about ${Math.round(share * 100)}% of revenue` : 'Key customer dependency declared', weight: share >= 0.5 ? 2.5 : 1 }],
    }
  },

  employer_obligations: (s) => {
    const staff = s.profile.employee_count
    if (!staff) return null
    return {
      title: 'Employee injury: COIDA and employers’ liability',
      description: 'COIDA provides statutory compensation for workplace injuries. Employers’ liability cover is a separate consideration for relevant legal liability beyond COIDA.',
      category: 'people',
      business_impact: 'Legal costs and damages in claims that fall outside COIDA benefits.',
      evidence: [ev(`${staff} employees`, s.profile.field_sources.employee_count ?? 'declared')],
      potential_classes: ['employers_liability'],
      location_ids: [],
      outstanding_questions: ['Is the business registered with the Compensation Fund, with a current letter of good standing?'],
      links: [],
      inputs: [{ text: `${staff} employees declared`, weight: staff >= 50 ? 1 : 0.5 }],
    }
  },

  sasria_special_risk: (s) => {
    if (!s.locations.length) return null
    const city = s.locations.find((l) => l.city)?.city
    const vehicles = s.assets.some((a) => a.asset_class === 'vehicle')
    const inputs: Input[] = [{ text: 'Sasria cover not confirmed in any schedule on file', weight: 1 }]
    if (city) inputs.push({ text: `Public-facing premises in ${city}`, weight: 1 })
    if (vehicles) inputs.push({ text: 'Business vehicles on public roads', weight: 0.5 })
    return {
      title: 'Riot, strike and civil commotion (Sasria)',
      description: 'Damage from riot, strike or civil commotion is excluded from standard policies and needs Sasria special-risk cover for each relevant class.',
      category: 'special_risk',
      business_impact: 'Uninsured damage and interruption if Sasria cover is missing for a class.',
      evidence: [ev(`${s.locations.length} premises${vehicles ? ' and business vehicles' : ''}`, 'declared')],
      potential_classes: ['sasria'],
      location_ids: s.locations.map((l) => l.id),
      outstanding_questions: ['Do the material damage, business interruption and motor sections each have the corresponding Sasria cover? Do not assume it is included.'],
      links: s.locations.map((l) => ({ table: 'business_locations' as const, id: l.id })),
      inputs,
    }
  },

  fidelity: (s) => {
    const staff = s.profile.employee_count ?? 0
    if (staff < 20) return null
    return {
      title: 'Employee dishonesty',
      description: 'Staff with access to cash, stock or payments could cause a loss through theft or fraud.',
      category: 'crime',
      business_impact: 'Direct financial loss, often discovered long after it started.',
      evidence: [ev(`${staff} employees`, s.profile.field_sources.employee_count ?? 'declared')],
      potential_classes: ['fidelity_crime'],
      location_ids: [],
      outstanding_questions: ['Who can approve payments and handle cash, and are there dual controls?'],
      links: [],
      inputs: [{ text: `${staff} staff with access to cash and stock`, weight: 1 }],
    }
  },

  professional_indemnity: (s) => ({
    title: 'Claims for professional errors or negligence',
    description: 'Clients could claim for financial loss caused by advice or services.',
    category: 'liability',
    business_impact: 'Defence costs and damages, often years after the work was done.',
    evidence: [ev(`Industry: ${s.profile.industry_key.replace(/_/g, ' ')}`, s.profile.field_sources.industry_key ?? 'inferred')],
    potential_classes: ['professional_indemnity'],
    location_ids: [],
    outstanding_questions: ['What services are provided, and have there been client complaints?'],
    links: [],
    inputs: [{ text: 'Advice or professional services provided to clients', weight: 2 }],
  }),

  directors_officers: (s) => ({
    title: 'Management liability of directors and officers',
    description: 'Directors can be personally liable for governance decisions.',
    category: 'liability',
    business_impact: 'Personal liability and defence costs for directors.',
    evidence: [ev(s.profile.registered_name, s.profile.field_sources.registered_name ?? 'declared')],
    potential_classes: ['directors_officers'],
    location_ids: [],
    outstanding_questions: ['How many directors are there, and are there external investors?'],
    links: [],
    inputs: [{ text: 'Company with directors', weight: 1 }],
  }),

  contract_works: () => ({
    title: 'Damage to contract works in progress',
    description: 'Works under construction, materials and plant on site can be damaged before handover.',
    category: 'property',
    business_impact: 'Cost of redoing work and contractual penalties.',
    evidence: [],
    potential_classes: ['contractors_all_risks', 'plant_equipment'],
    location_ids: [],
    outstanding_questions: ['What is the largest contract value on site, and what do contracts require?'],
    links: [],
    inputs: [{ text: 'Construction contracts in progress', weight: 2 }],
  }),
}

/**
 * Deterministic exposure assessment: same facts, same exposures. Coverage is never confirmed here, because no policy
 * wording has been analysed; exposures wait for broker review when current cover exists, otherwise they are unknown.
 */
export function assessExposures(s: ProfileSnapshot, template: Pick<IndustryRiskTemplate, 'exposure_rules' | 'key'>): ExposureSpec[] {
  const ctx: RuleContext = {
    industry: s.profile.industry_key,
    kitchen: s.profile.industry_key === 'restaurants_hospitality',
    claimNotes: s.profile.loss_history?.notes ?? '',
  }
  const coverage: CoverageStatus = s.profile.existing_cover?.insurer ? 'awaiting_broker_review' : 'unknown'
  const order = { high: 0, medium: 1, low: 2 }
  return template.exposure_rules
    .flatMap((key) => {
      const out = RULES[key]?.(s, ctx)
      if (!out) return []
      const { inputs, ...rest } = out
      return [{ ...rest, rule_key: key, priority: band(inputs), priority_inputs: inputs.map((i) => i.text), coverage_status: coverage }]
    })
    .sort((a, b) => order[a.priority] - order[b.priority])
}

export interface GapReport {
  missing: string[]
  documents: Array<{ key: string; title: string; detail: string }>
  broker_tasks: Array<{ key: string; title: string; detail: string }>
}

/** Missing information and the documents that would close it, filtered to what applies to this business. */
export function identifyGaps(s: ProfileSnapshot, exposures: Array<Pick<RiskExposure, 'rule_key' | 'priority' | 'title'>>, template: Pick<IndustryRiskTemplate, 'documents'>): GapReport {
  const has = (k: string) => exposures.some((e) => e.rule_key === k)
  const leased = s.locations.some((l) => l.ownership === 'leased')
  const suppression = s.locations.some((l) => l.fire_protection.some((f) => /suppression/i.test(f)))
  const kitchen = s.profile.industry_key === 'restaurants_hospitality'
  const applies = (doc: string) => {
    const d = doc.toLowerCase()
    if (d.includes('lease')) return leased
    if (d.includes('suppression')) return suppression
    if (d.includes('extraction')) return kitchen
    if (d.includes('financial statements')) return has('business_interruption')
    if (d.includes('asset register') || d.includes('machinery schedule') || d.includes('valuation')) return has('valuation_gap') || has('machinery_breakdown')
    if (d.includes('vehicle') || d.includes('driver')) return s.assets.some((a) => a.asset_class === 'vehicle')
    return true
  }
  const docs = [...template.documents.filter(applies)]
  if (s.profile.employee_count) docs.push('COIDA letter of good standing')
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const detail = (t: string) =>
    /policy schedule/i.test(t)
      ? 'Needed to confirm what is actually covered. Until then every exposure stays awaiting broker review.'
      : /claims history/i.test(t)
        ? 'Insurers look for well-documented claims experience.'
        : /replacement|valuation|register|schedule/i.test(t)
          ? 'Book, market and replacement values are not interchangeable; insurers need the replacement basis.'
          : 'Requested to complete the underwriting submission.'

  const high = exposures.filter((e) => e.priority === 'high')
  return {
    missing: [...s.profile.missing_info],
    documents: docs.map((t) => ({ key: slug(t), title: t, detail: detail(t) })),
    broker_tasks: [
      {
        key: 'review_exposures',
        title: `Review ${exposures.length} potential exposures for ${s.profile.trading_name ?? s.profile.registered_name}`,
        detail: high.length ? `Start with the ${high.length} marked high advisory priority: ${high.map((e) => e.title.toLowerCase()).join('; ')}.` : 'No exposures were marked high advisory priority.',
      },
      { key: 'coverage_evidence', title: 'Confirm coverage evidence against the current policy wording', detail: 'No policy wording has been analysed, so no exposure is confirmed as covered or excluded.' },
    ],
  }
}
