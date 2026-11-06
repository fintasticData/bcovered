import { compactRand as rand } from '../domain/commercial/format'
import type { IndustryRiskTemplate } from '../db/commercialSchema'
import type { ContactDetails } from '../db/schema'
import type { BusinessFacts } from '../domain/commercial/facts'
import { detectIndustry, FALLBACK_TEMPLATE_KEY, type DiscoveryTopic } from '../domain/commercial/industryTemplates'
import { PRIVACY_NOTICE_VERSION } from './adapter'
import {
  parseAmount,
  parseBackupPower,
  parseCity,
  parseClaimsHistory,
  parseCompanyName,
  parseCurrentCover,
  parseEmployees,
  parseFire,
  parseLocationNames,
  parseOwnership,
  parsePublic,
  parseSecurity,
  parseSiteCount,
  parseStructure,
  parseVehicles,
  perSite,
} from './commercialParser'
import { isAffirmative, isNegative, parseEmail, parseName, parsePhone } from './motorParser'

type ContactSlot = 'consent' | 'full_name' | 'email' | 'phone' | 'marketing' | 'confirm'
export type CommercialSlot = DiscoveryTopic | 'industry' | ContactSlot

export interface CommercialIntakeState {
  stage: 'collecting' | 'consent' | 'declined' | 'contact' | 'confirm' | 'submitted'
  asking: CommercialSlot | null
  facts: BusinessFacts
  contact: ContactDetails
  consent: { processing?: boolean; marketing?: boolean }
  misses: number
}

export interface CommercialTurn {
  reply: string
  state: CommercialIntakeState
  quick_replies: string[]
  links?: Array<{ label: string; to: string }>
  /** True when the business owner has confirmed and the review workflow should start. */
  submit: boolean
}

export type TemplateLite = Pick<IndustryRiskTemplate, 'key' | 'name' | 'keywords' | 'discovery_topics'>

export const initialCommercialState = (): CommercialIntakeState => ({
  stage: 'collecting',
  asking: null,
  facts: {},
  contact: {},
  consent: {},
  misses: 0,
})

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number) => NUMBER_WORDS[n] ?? String(n)
const isFood = (f: BusinessFacts) => f.industry_key === 'restaurants_hospitality'
const siteNoun = (f: BusinessFacts, n = f.location_count ?? 1) => (isFood(f) ? (n === 1 ? 'restaurant' : 'restaurants') : n === 1 ? 'site' : 'sites')
const branch = (f: BusinessFacts) => (isFood(f) ? 'branch' : 'site')

interface Topic {
  applies?: (f: BusinessFacts) => boolean
  missing: (f: BusinessFacts) => boolean
  question: (f: BusinessFacts) => string
  quick?: (f: BusinessFacts) => string[]
}

const TOPICS: Record<DiscoveryTopic, Topic> = {
  structure: {
    applies: (f) => (f.location_count ?? 0) > 1,
    missing: (f) => f.same_entity === undefined || f.single_policy === undefined,
    question: (f) => {
      const n = say(f.location_count ?? 2)
      if (f.same_entity !== undefined) return `And do you currently have one policy covering all ${n}, or separate policies?`
      if (f.single_policy !== undefined) return `Are the ${n} ${siteNoun(f)} owned by the same legal entity?`
      return `Are the ${n} ${siteNoun(f)} owned by the same legal entity, and do you currently have one policy covering all ${n}?`
    },
  },
  business_name: {
    missing: (f) => !f.registered_name && !f.trading_name,
    question: () => 'What is the registered name of the business, and does it trade under a different name?',
  },
  locations: {
    missing: (f) => !f.location_names?.length,
    question: (f) =>
      (f.location_count ?? 0) > 1 ? `Which suburbs or towns are the ${say(f.location_count!)} ${siteNoun(f)} in?` : 'Where is the business based? The suburb and town are enough.',
  },
  premises: {
    missing: (f) => f.ownership === undefined,
    question: (f) => `Do you own or lease the ${(f.location_count ?? 1) > 1 ? 'premises' : 'premises you trade from'}?`,
    quick: () => ['We lease all of them', 'We own the buildings', 'Some owned, some leased'],
  },
  turnover_staff: {
    missing: (f) => f.annual_turnover === undefined || f.employee_count === undefined,
    question: (f) =>
      f.annual_turnover !== undefined
        ? 'And roughly how many people do you employ?'
        : f.employee_count !== undefined
          ? 'Roughly what is the annual turnover across the business?'
          : 'Roughly what is the annual turnover across the business, and how many people do you employ?',
  },
  equipment: {
    missing: (f) => f.equipment_value_per_location === undefined,
    question: (f) =>
      isFood(f)
        ? `Roughly what would it cost to replace the kitchen and refrigeration equipment at each ${branch(f)}? A figure per ${branch(f)} is fine.`
        : `Roughly what would it cost to replace the equipment and machinery at each ${branch(f)}?`,
  },
  stock: {
    missing: (f) => f.stock_value_per_location === undefined,
    question: (f) => (isFood(f) ? `How much perishable stock do you usually hold at each ${branch(f)}?` : `What value of stock do you usually hold at each ${branch(f)}?`),
  },
  backup_power: {
    applies: (f) => isFood(f) || f.stock_value_per_location !== undefined,
    missing: (f) => f.backup_power === undefined,
    question: () => 'If the power goes off, for example during load-shedding, do your fridges and cold rooms have backup power?',
    quick: () => ['Yes, generators at every site', 'No backup power'],
  },
  fire_protection: {
    missing: (f) => f.fire_suppression === undefined,
    question: (f) =>
      isFood(f)
        ? 'Do the kitchens have a fire suppression system over the cooking line, and when was it last serviced?'
        : 'What fire protection is installed, for example sprinklers or a suppression system?',
  },
  security: {
    missing: (f) => f.security === undefined,
    question: () => 'What security do you have after hours, for example an alarm, armed response or CCTV?',
    quick: () => ['Alarm with armed response and CCTV', 'Alarm only', 'None'],
  },
  vehicles: {
    missing: (f) => f.vehicle_count === undefined,
    question: (f) => (isFood(f) ? 'Do you use your own vehicles for deliveries? If so, how many and what type?' : 'Does the business use its own vehicles? If so, how many and what type?'),
    quick: () => ['No own vehicles'],
  },
  public_payments: {
    missing: (f) => (isFood(f) && f.seating_per_location === undefined) || f.card_payments === undefined,
    question: (f) =>
      isFood(f) && f.seating_per_location === undefined
        ? `Roughly how many customers can you seat at each ${branch(f)}, and do you take card payments or online orders?`
        : 'Do you take card payments or online orders?',
  },
  current_cover: {
    missing: (f) => f.current_insurer === undefined,
    question: () => 'Who insures the business at the moment, and when does the policy renew?',
    quick: () => ['We are not insured at the moment'],
  },
  claims: {
    missing: (f) => f.claims_last_5_years === undefined,
    question: () => 'Have you had any insurance claims in the last five years? If so, briefly what happened?',
    quick: () => ['No claims'],
  },
}

const CONSENT_TEXT =
  'Before I take any contact details: BCovered uses this information only to review your business insurance needs, in line with POPIA and ' +
  `our privacy notice (${PRIVACY_NOTICE_VERSION}). Our agents identify potential exposures; only a licensed broker gives advice. Do you agree?`

const TOPIC_KEYS: Partial<Record<CommercialSlot, Array<keyof BusinessFacts>>> = {
  industry: ['industry_key'],
  structure: ['same_entity', 'single_policy'],
  business_name: ['registered_name', 'trading_name'],
  locations: ['location_names', 'location_count'],
  premises: ['ownership'],
  turnover_staff: ['annual_turnover', 'employee_count'],
  equipment: ['equipment_value_per_location'],
  stock: ['stock_value_per_location'],
  backup_power: ['backup_power', 'backup_power_locations'],
  fire_protection: ['fire_suppression', 'fire_notes'],
  security: ['security'],
  vehicles: ['vehicle_count', 'vehicle_type', 'vehicle_location'],
  public_payments: ['seating_per_location', 'card_payments', 'online_orders'],
  current_cover: ['current_insurer', 'renewal_month', 'single_policy'],
  claims: ['claims_last_5_years', 'claims_notes'],
}

function topicsFor(f: BusinessFacts, templates: TemplateLite[]): DiscoveryTopic[] {
  const tpl = templates.find((t) => t.key === f.industry_key)
  return (tpl?.discovery_topics ?? ['business_name', 'locations', 'premises', 'turnover_staff', 'current_cover', 'claims']) as DiscoveryTopic[]
}

/** Pulls every business fact stated in a message. Values for the slot being asked may overwrite earlier answers. */
export function extractBusiness(text: string, asking: CommercialSlot | null, prev: BusinessFacts, templates: TemplateLite[]): BusinessFacts {
  const t = text.toLowerCase()
  const is = (slot: CommercialSlot) => asking === slot
  const found: BusinessFacts = {}
  const industry = detectIndustry(text, templates)
  if (industry) found.industry_key = industry
  const count = parseSiteCount(text)
  if (count) found.location_count = count
  const city = parseCity(text)
  if (city) found.city = city
  Object.assign(found, parseStructure(text), parseCompanyName(text))
  if (is('business_name') && !found.registered_name && !found.trading_name) {
    const raw = text.replace(/^(it'?s|we are|we'?re|the company is|called|it is)\s+/i, '').replace(/[.!]+$/, '').trim()
    if (raw.length >= 2) found.registered_name = raw
  }
  if (is('locations')) {
    const names = parseLocationNames(text)
    if (names.length) found.location_names = names
  }
  const ownership = parseOwnership(text)
  if (ownership && (is('premises') || prev.ownership === undefined)) found.ownership = ownership
  if (is('turnover_staff') || /turnover|revenue|sales/.test(t)) {
    const amount = parseAmount(text, is('turnover_staff') && !/staff|employ|people/.test(t))
    if (amount) found.annual_turnover = amount
  }
  const staff = parseEmployees(text)
  if (staff !== undefined) found.employee_count = staff
  const sites = prev.location_count ?? found.location_count
  if (is('equipment') || /equipment|machinery/.test(t)) {
    const amount = parseAmount(text, is('equipment'))
    if (amount) found.equipment_value_per_location = perSite(text, amount, sites)
  }
  if (is('stock') || (/\bstock\b/.test(t) && !is('equipment'))) {
    const amount = parseAmount(text, is('stock'))
    if (amount) found.stock_value_per_location = perSite(text, amount, sites)
  }
  if (is('backup_power') || /generator|backup power|inverter|load.?shedding/.test(t)) {
    Object.assign(found, parseBackupPower(text, prev.location_names ?? []))
  }
  if (is('fire_protection') || /suppression|sprinkler|ansul/.test(t)) Object.assign(found, parseFire(text))
  const security = parseSecurity(text, is('security'))
  if (security) found.security = security
  Object.assign(found, parseVehicles(text, prev.location_names ?? [], is('vehicles')))
  Object.assign(found, parsePublic(text, is('public_payments')))
  if (is('current_cover') || /insur|polic/.test(t)) {
    const cover = parseCurrentCover(text, is('current_cover'))
    if (!is('current_cover')) delete cover.single_policy
    Object.assign(found, cover)
  }
  if (is('claims') || /\bclaims?\b/.test(t)) Object.assign(found, parseClaimsHistory(text, is('claims')))

  const merged: BusinessFacts = { ...prev }
  const targeted = new Set<keyof BusinessFacts>(asking ? (TOPIC_KEYS[asking] ?? []) : [])
  ;(Object.keys(found) as Array<keyof BusinessFacts>).forEach((k) => {
    if (found[k] === undefined) return
    if (prev[k] === undefined || asking === null || targeted.has(k)) (merged as Record<string, unknown>)[k] = found[k]
  })
  if (merged.location_names?.length && (merged.location_count ?? 0) < merged.location_names.length) merged.location_count = merged.location_names.length
  return merged
}

function acknowledge(before: BusinessFacts, after: BusinessFacts, templates: TemplateLite[]): string {
  const changed = (k: keyof BusinessFacts) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && after[k] !== undefined
  const parts: string[] = []
  if (changed('industry_key')) parts.push(templates.find((t) => t.key === after.industry_key)?.name.toLowerCase() ?? 'your industry')
  if (changed('location_count') || changed('city')) parts.push(`${say(after.location_count ?? 1)} ${siteNoun(after)}${after.city ? ` in ${after.city}` : ''}`)
  if (changed('registered_name')) parts.push(after.registered_name!)
  if (changed('same_entity')) parts.push(after.same_entity ? 'one legal entity' : 'separate legal entities')
  if (changed('single_policy')) parts.push(after.single_policy ? 'one policy for all sites' : 'separate policies')
  if (changed('location_names')) parts.push(after.location_names!.join(', '))
  if (changed('ownership')) parts.push(after.ownership === 'mixed' ? 'some premises owned, some leased' : `${after.ownership} premises`)
  if (changed('annual_turnover')) parts.push(`turnover about ${rand(after.annual_turnover!)}`)
  if (changed('employee_count')) parts.push(`${after.employee_count} employees`)
  if (changed('equipment_value_per_location')) parts.push(`equipment about ${rand(after.equipment_value_per_location!)} per ${branch(after)} to replace`)
  if (changed('stock_value_per_location')) parts.push(`stock about ${rand(after.stock_value_per_location!)} per ${branch(after)}`)
  if (changed('backup_power'))
    parts.push(
      after.backup_power === 'partial'
        ? `backup power at ${after.backup_power_locations!.join(', ')} only`
        : after.backup_power === 'all'
          ? 'backup power at every site'
          : 'no backup power',
    )
  if (changed('fire_suppression')) parts.push(after.fire_suppression ? `suppression system in place${after.fire_notes ? ` (${after.fire_notes})` : ''}` : 'no suppression system')
  if (changed('security')) parts.push(after.security!.length ? after.security!.join(', ') : 'no security measures')
  if (changed('vehicle_count')) parts.push(after.vehicle_count ? `${after.vehicle_count} delivery ${after.vehicle_type ?? 'vehicle'}${after.vehicle_count > 1 ? 's' : ''}` : 'no own vehicles')
  if (changed('seating_per_location')) parts.push(`about ${after.seating_per_location} seats per ${branch(after)}`)
  if (changed('card_payments') && after.card_payments) parts.push('card payments')
  if (changed('online_orders') && after.online_orders) parts.push('online orders')
  if (changed('current_insurer')) parts.push(after.current_insurer ? `insured with ${after.current_insurer}${after.renewal_month ? `, renewing in ${after.renewal_month}` : ''}` : 'not currently insured')
  if (changed('claims_last_5_years')) parts.push(after.claims_last_5_years ? `${after.claims_last_5_years} claim${after.claims_last_5_years > 1 ? 's' : ''} in five years` : 'no claims in five years')
  return parts.length ? `Noted: ${parts.join('; ')}. ` : ''
}

function summary(s: CommercialIntakeState, templates: TemplateLite[]): string {
  const f = s.facts
  const lines = [
    `Business: ${f.registered_name ?? f.trading_name ?? 'name not given'} (${templates.find((t) => t.key === f.industry_key)?.name ?? 'industry not set'})`,
    `Premises: ${say(f.location_count ?? 1)} ${siteNoun(f)}${f.location_names?.length ? ` (${f.location_names.join(', ')})` : ''}${f.city ? `, ${f.city}` : ''}${f.ownership ? `, ${f.ownership}` : ''}`,
    f.annual_turnover !== undefined || f.employee_count !== undefined
      ? `Turnover ${f.annual_turnover ? rand(f.annual_turnover) : 'not given'}; ${f.employee_count ?? 'unknown'} employees`
      : null,
    f.equipment_value_per_location !== undefined || f.stock_value_per_location !== undefined
      ? `Per ${branch(f)}: equipment ${f.equipment_value_per_location ? rand(f.equipment_value_per_location) : 'not given'}, stock ${f.stock_value_per_location ? rand(f.stock_value_per_location) : 'not given'}`
      : null,
    f.current_insurer !== undefined ? `Current cover: ${f.current_insurer || 'none'}${f.renewal_month ? `, renews ${f.renewal_month}` : ''}` : null,
    `Contact: ${s.contact.full_name}, ${s.contact.email}, ${s.contact.phone}`,
  ]
  return lines.filter(Boolean).join('\n')
}

const turn = (state: CommercialIntakeState, reply: string, quick: string[] = [], extra: Partial<CommercialTurn> = {}): CommercialTurn => ({
  reply,
  state,
  quick_replies: quick,
  submit: false,
  ...extra,
})

function nextQuestion(state: CommercialIntakeState, prefix: string, templates: TemplateLite[]): CommercialTurn {
  const f = state.facts
  if (!f.industry_key) {
    return turn({ ...state, stage: 'collecting', asking: 'industry' }, `${prefix}What does the business do? For example, restaurants, a factory, a shop or professional services.`, [
      'We run restaurants',
      'We manufacture food products',
      'We are a professional services firm',
    ])
  }
  const key = topicsFor(f, templates).find((k) => (TOPICS[k].applies?.(f) ?? true) && TOPICS[k].missing(f))
  if (key) {
    const s: CommercialIntakeState = { ...state, stage: 'collecting', asking: key }
    return turn(s, `${prefix}${TOPICS[key].question(f)}`, TOPICS[key].quick?.(f) ?? [])
  }
  if (!state.consent.processing) {
    return turn(
      { ...state, stage: 'consent', asking: 'consent' },
      `${prefix}That gives our agents a good picture of how the business operates. ${CONSENT_TEXT}`,
      ['I agree', 'I don’t agree'],
    )
  }
  const contactSlot = (['full_name', 'email', 'phone'] as const).find((k) => !state.contact[k])
  if (contactSlot) {
    const q = {
      full_name: 'What is your full name? You will be the primary contact for the business.',
      email: `Thanks${state.contact.full_name ? `, ${state.contact.full_name.split(' ')[0]}` : ''}. Which email address should your broker use?`,
      phone: 'And a South African mobile number, in case the broker needs to clarify anything?',
    }[contactSlot]
    return turn({ ...state, stage: 'contact', asking: contactSlot }, `${prefix}${q}`)
  }
  if (state.consent.marketing === undefined) {
    return turn(
      { ...state, stage: 'contact', asking: 'marketing' },
      `${prefix}Separately and entirely optional: may we send you occasional business risk tips? This does not affect your review.`,
      ['Yes, send me tips', 'No thanks'],
    )
  }
  const s: CommercialIntakeState = { ...state, stage: 'confirm', asking: 'confirm' }
  return turn(s, `${prefix}Here is what I'll hand to our agents and broker team:\n${summary(s, templates)}\n\nShall I go ahead?`, [
    'Yes, please send it to a broker',
    'I need to change something',
  ])
}

/** Deterministic Business Discovery Agent: asks only for what the industry template needs and the business hasn't said yet. */
export function commercialTurn(prev: CommercialIntakeState, raw: string, templates: TemplateLite[]): CommercialTurn {
  const state: CommercialIntakeState = structuredClone(prev)
  const text = raw.replace(/[‘’]/g, "'").trim()

  if (state.stage === 'submitted') {
    return turn(
      state,
      'Your review is with our agents and a licensed broker. Each step shows on the right. Your broker will be in touch about the documents still needed.',
    )
  }

  if (state.stage === 'consent' || state.stage === 'declined') {
    if (isAffirmative(text)) {
      state.consent = { processing: true }
      return nextQuestion(state, 'Thank you. ', templates)
    }
    if (isNegative(text)) {
      return turn(
        { ...state, stage: 'declined', asking: 'consent', consent: { processing: false } },
        "No problem. Without your consent I can't capture contact details or start a review. Tell me if you change your mind.",
        ["I've changed my mind, I agree"],
      )
    }
    return turn(state, CONSENT_TEXT, ['I agree', 'I don’t agree'])
  }

  if (state.stage === 'contact') {
    if (state.asking === 'marketing') {
      state.consent.marketing = isAffirmative(text)
      return nextQuestion(state, state.consent.marketing ? 'Thanks, noted. ' : 'No problem. ', templates)
    }
    const email = parseEmail(text)
    const phone = parsePhone(text)
    if (email) state.contact.email = email
    if (phone) state.contact.phone = phone
    if (state.asking === 'full_name' && !email && !phone) {
      const name = parseName(text)
      if (!name || !name.includes(' ')) return turn(state, 'Please share your first name and surname.')
      state.contact.full_name = name
    }
    if (state.asking === 'email' && !email) return turn(state, "That doesn't look like an email address. Could you check it?")
    if (state.asking === 'phone' && !phone) return turn(state, 'Please use a South African number, for example 082 555 0142.')
    return nextQuestion(state, '', templates)
  }

  if (state.stage === 'confirm') {
    if (isAffirmative(text)) {
      return turn(
        { ...state, stage: 'submitted', asking: null },
        "Done. I've handed this to our agents. They'll build your business profile and Risk Twin, identify potential exposures and draft a submission pack. A licensed broker reviews everything before anything goes to an insurer.",
        [],
        { submit: true },
      )
    }
    const before = state.facts
    state.facts = extractBusiness(text, null, state.facts, templates)
    const ack = acknowledge(before, state.facts, templates)
    if (!ack) return turn(state, "Tell me what to change, for example 'we have four branches' or 'turnover is R20 million'.")
    return nextQuestion(state, ack, templates)
  }

  const before = state.facts
  state.facts = extractBusiness(text, state.asking, state.facts, templates)
  if (state.asking === 'industry' && !state.facts.industry_key) {
    if (state.misses >= 1) state.facts.industry_key = FALLBACK_TEMPLATE_KEY
    else {
      state.misses++
      return turn(state, "I didn't recognise the industry. Could you describe what the business sells or does, in a few words?")
    }
  }
  const ack = acknowledge(before, state.facts, templates)
  if (!ack && state.asking && state.asking !== 'industry') {
    const topic = TOPICS[state.asking as DiscoveryTopic]
    if (topic) return turn(state, `Sorry, I didn't catch that. ${topic.question(state.facts)}`, topic.quick?.(state.facts) ?? [])
  }
  if (!before.industry_key && state.facts.industry_key && !state.asking) {
    return nextQuestion(state, `Certainly. I'll build a picture of how the business operates so a broker can review the right cover. ${ack}`, templates)
  }
  if (!state.facts.industry_key && !state.asking && !ack) {
    return turn(
      state,
      "I'm BCovered's Business Discovery Agent. I learn how your business operates, our agents map its potential risks, and a licensed broker reviews everything. What does your business do?",
      ['We operate three restaurants around Johannesburg'],
    )
  }
  return nextQuestion(state, ack, templates)
}
