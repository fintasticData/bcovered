import type { MotorDetails } from '../db/schema'
import { describeVehicle, formatMotorField } from '../domain/motor'
import { PRIVACY_NOTICE_VERSION, type AssistantAdapter, type Intent, type IntakeState, type IntakeTurn, type Slot } from './adapter'
import {
  isAffirmative,
  isNegative,
  parseClaims,
  parseCondition,
  parseCover,
  parseDriver,
  parseEmail,
  parseMakeModel,
  parseMoney,
  parseName,
  parseParking,
  parsePhone,
  parseTracker,
  parseUsage,
  parseYear,
} from './motorParser'

const MOTOR = /\b(car|vehicle|bakkie|motor|corolla|polo|hilux|ranger|toyota|vw|volkswagen|ford|hyundai|suzuki|kia|nissan|bmw|mercedes|audi|mazda|honda|haval|chery|renault)\b/i
const CLAIM = /\b(claim|accident|hit my|crash|collided|stolen|hijack|burgl)\b/i
const OTHER = /\b(home|house|building|contents|household|business|shop|office|cyber|liability|laptop|phone|jewel|valuables|all.?risk|restaurants?|factory|company)\b/i
const BUSINESS = /\b(business|shop|office|cyber|liability|restaurants?|factory|company)\b/i

export function detectIntent(text: string): Intent {
  if (CLAIM.test(text) && !/need insurance|insure|quote|cover for/i.test(text)) return 'claim'
  if (MOTOR.test(text)) return 'motor_quote'
  if (OTHER.test(text)) return 'other_product'
  if (/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(text)) return 'greeting'
  return 'unknown'
}

/** Pulls every motor detail stated in a message. Ambiguous answers (bare numbers, "new") only count for the slot being asked. */
export function extractMotor(text: string, asking: Slot | null): MotorDetails {
  const out: MotorDetails = {
    ...parseMakeModel(text),
    year: parseYear(text),
    value: parseMoney(text, asking === 'value'),
    condition: parseCondition(text, asking === 'condition_usage'),
    usage: parseUsage(text),
    parking: parseParking(text),
    tracker: parseTracker(text),
    ...parseDriver(text, asking === 'driver'),
    claims_last_3_years: parseClaims(text, asking === 'claims'),
    cover_type: parseCover(text, asking === 'cover_type'),
  }
  if (out.value !== undefined && out.value < 10_000) delete out.value
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as MotorDetails
}

const VEHICLE_SLOTS: Array<{ slot: Slot; missing: (d: MotorDetails) => boolean }> = [
  { slot: 'make_model', missing: (d) => !d.make || !d.model },
  { slot: 'year', missing: (d) => !d.year },
  { slot: 'value', missing: (d) => !d.value },
  { slot: 'condition_usage', missing: (d) => !d.usage },
  { slot: 'parking', missing: (d) => !d.parking },
  { slot: 'driver', missing: (d) => d.driver_age === undefined },
  { slot: 'claims', missing: (d) => d.claims_last_3_years === undefined },
  { slot: 'cover_type', missing: (d) => !d.cover_type },
]

const QUESTIONS: Partial<Record<Slot, (s: IntakeState) => string>> = {
  make_model: () => 'What make and model is the vehicle?',
  year: (s) => `Which year model is the ${describeVehicle(s.details)}?`,
  value: () => 'Roughly what is it worth today? The retail value is fine.',
  condition_usage: () => 'Is it new or used, and will it mainly be for private or business use?',
  parking: () => 'Where is it parked overnight (locked garage, carport, secure complex, driveway or street), and does it have a tracker?',
  driver: () => 'Who is the regular driver? Please share their age and how many years they have held a licence.',
  claims: () => 'How many motor claims have you had in the last three years?',
  cover_type: () => 'Which cover would you like: comprehensive, third party fire and theft, or third party only?',
  full_name: () => 'What is your full name?',
  email: (s) => `Thanks${s.contact.full_name ? `, ${s.contact.full_name.split(' ')[0]}` : ''}. Which email address should your broker use?`,
  phone: () => 'And a South African mobile number, in case the broker needs to clarify anything?',
  marketing: () => 'Separately and entirely optional: may we send you occasional insurance tips? This does not affect your comparison.',
}

const QUICK: Partial<Record<Slot, string[]>> = {
  condition_usage: ['Used, mainly private use', 'New, private use', 'Mostly business use'],
  parking: ['Locked garage, with a tracker', 'Secure complex, no tracker', 'On the street, no tracker'],
  claims: ['No claims', '1 claim'],
  cover_type: ['Comprehensive', 'Third party, fire and theft', 'Third party only'],
  consent: ['I agree', 'I don’t agree'],
  marketing: ['Yes, send me tips', 'No thanks'],
  confirm: ['Yes, please send it to a broker', 'I need to change something'],
}

const CONSENT_TEXT =
  'Before I take any personal details: BCovered uses your information only to arrange this comparison, in line with POPIA and ' +
  `our privacy notice (${PRIVACY_NOTICE_VERSION}). A licensed broker reviews every recommendation. Do you agree?`

function acknowledge(before: MotorDetails, after: MotorDetails): string {
  const changed = (Object.keys(after) as Array<keyof MotorDetails>).filter((k) => before[k] !== after[k])
  if (!changed.length) return ''
  const parts: string[] = []
  if (changed.includes('make') || changed.includes('model')) parts.push(describeVehicle(after))
  changed
    .filter((k) => k !== 'make' && k !== 'model' && k !== 'year')
    .forEach((k) => {
      if (k === 'claims_last_3_years') parts.push(after.claims_last_3_years ? `${after.claims_last_3_years} claim(s) in 3 years` : 'no recent claims')
      else if (k === 'licence_years') parts.push(`licensed ${after.licence_years} years`)
      else if (k === 'tracker') parts.push(after.tracker ? 'tracker fitted' : 'no tracker')
      else if (k === 'value') parts.push(formatMotorField(k, after))
      else parts.push(formatMotorField(k, after).toLowerCase())
    })
  if (changed.includes('year') && !changed.includes('make')) parts.unshift(`${after.year} model`)
  return `Noted: ${parts.join(', ')}. `
}

function summary(s: IntakeState) {
  const d = s.details
  const f = (k: keyof MotorDetails) => formatMotorField(k, d)
  return [
    `Vehicle: ${describeVehicle(d)} (${f('condition')}), ${f('value')}`,
    `Use: ${f('usage')}; parking: ${f('parking')}; tracker: ${f('tracker')}`,
    `Driver: ${f('driver_age')}, licensed ${f('licence_years')}; claims in 3 years: ${f('claims_last_3_years')}`,
    `Cover: ${f('cover_type')}`,
    `Contact: ${s.contact.full_name}, ${s.contact.email}, ${s.contact.phone}`,
  ].join('\n')
}

const turn = (state: IntakeState, reply: string, slot: Slot | null, extra: Partial<IntakeTurn> = {}): IntakeTurn => ({
  reply,
  state,
  quick_replies: slot ? (QUICK[slot] ?? []) : [],
  submit: false,
  ...extra,
})

function nextQuestion(state: IntakeState, prefix: string): IntakeTurn {
  const missing = VEHICLE_SLOTS.find((s) => s.missing(state.details))
  if (missing) {
    const s: IntakeState = { ...state, stage: 'collecting', asking: missing.slot }
    return turn(s, `${prefix}${QUESTIONS[missing.slot]!(s)}`, missing.slot)
  }
  if (!state.consent.processing) {
    const s: IntakeState = { ...state, stage: 'consent', asking: 'consent' }
    return turn(s, `${prefix}That's everything I need about the vehicle. ${CONSENT_TEXT}`, 'consent')
  }
  const contactSlot = (['full_name', 'email', 'phone'] as const).find((k) => !state.contact[k])
  if (contactSlot) {
    const s: IntakeState = { ...state, stage: 'contact', asking: contactSlot }
    return turn(s, `${prefix}${QUESTIONS[contactSlot]!(s)}`, contactSlot)
  }
  if (state.consent.marketing === undefined) {
    const s: IntakeState = { ...state, stage: 'contact', asking: 'marketing' }
    return turn(s, `${prefix}${QUESTIONS.marketing!(s)}`, 'marketing')
  }
  const s: IntakeState = { ...state, stage: 'confirm', asking: 'confirm' }
  return turn(s, `${prefix}Here is what I'll send to our agents and broker team:\n${summary(s)}\n\nShall I go ahead?`, 'confirm')
}

export function deterministicTurn(prev: IntakeState, raw: string): IntakeTurn {
  const state: IntakeState = structuredClone(prev)
  const text = raw.replace(/[‘’]/g, "'").trim()

  if (state.stage === 'submitted') {
    return turn(
      state,
      'Your request is with our agents and a licensed broker. Every step shows on the right, and the proposal appears in your portal once a broker approves it.',
      null,
    )
  }

  if (state.intent !== 'motor_quote') {
    const intent = detectIntent(text)
    if (intent === 'claim') {
      return turn(
        { ...state, intent: null },
        "I'm sorry to hear that. Guided claims with Ava arrive in a later phase of this demo. Please log the incident on the Claims page and a broker will follow up. I can't confirm cover or promise any claim outcome.",
        null,
        { quick_replies: ['I need car insurance instead'], links: [{ label: 'Log a claim', to: '/claims' }] },
      )
    }
    if (intent === 'other_product' && BUSINESS.test(text)) {
      return turn(
        { ...state, intent: null },
        'For business insurance, our Business Discovery Agent builds a picture of how your business operates and a licensed broker reviews it. Would you like to start a business risk review?',
        null,
        { quick_replies: ['I need car insurance instead'], links: [{ label: 'Start a business risk review', to: '/business/risk-review' }] },
      )
    }
    if (intent === 'other_product') {
      return turn(
        { ...state, intent: null },
        'In this demo I can run a full assessment for motor insurance. For home, contents or business cover, the quote form reaches a broker directly. Would you like to insure a vehicle?',
        null,
        { quick_replies: ['I need car insurance'], links: [{ label: 'Open the quote form', to: '/quote' }] },
      )
    }
    if (intent !== 'motor_quote') {
      return turn(
        state,
        "I'm Ava, BCovered's AI assistant. I gather your details, our agents prepare a comparison, and a licensed broker reviews it before you see anything. What would you like to insure?",
        null,
        { quick_replies: ['I’ve just bought a car', 'I want to compare my car insurance'] },
      )
    }
    state.intent = 'motor_quote'
    const before = { ...state.details }
    state.details = { ...state.details, ...extractMotor(text, null) }
    const congrats = /\b(just bought|new car|just got|bought a)\b/i.test(text) ? 'Congratulations on the car. ' : ''
    const intro = "Certainly. I'll gather a few details, prepare a comparison and have a broker review the options. "
    return nextQuestion(state, `${congrats}${intro}${acknowledge(before, state.details)}`)
  }

  if (state.stage === 'consent' || state.stage === 'declined') {
    if (isAffirmative(text)) {
      state.consent = { processing: true }
      return nextQuestion(state, 'Thank you. ')
    }
    if (isNegative(text)) {
      return turn(
        { ...state, stage: 'declined', asking: 'consent', consent: { processing: false } },
        "No problem. Without your consent I can't capture personal details or prepare a comparison. You can still read about our cover, or tell me if you change your mind.",
        null,
        { quick_replies: ["I've changed my mind, I agree"] },
      )
    }
    return turn(state, CONSENT_TEXT, 'consent')
  }

  if (state.stage === 'contact') {
    if (state.asking === 'marketing') {
      state.consent.marketing = isAffirmative(text)
      return nextQuestion(state, state.consent.marketing ? 'Thanks, noted. ' : 'No problem. ')
    }
    const email = parseEmail(text)
    const phone = parsePhone(text)
    if (email) state.contact.email = email
    if (phone) state.contact.phone = phone
    if (state.asking === 'full_name' && !email && !phone) {
      const name = parseName(text)
      if (!name || !name.includes(' ')) return turn(state, 'Please share your first name and surname.', null)
      state.contact.full_name = name
    }
    if (state.asking === 'email' && !email) return turn(state, "That doesn't look like an email address. Could you check it?", null)
    if (state.asking === 'phone' && !phone) return turn(state, 'Please use a South African number, for example 082 555 0142.', null)
    return nextQuestion(state, '')
  }

  if (state.stage === 'confirm') {
    if (isAffirmative(text)) {
      return turn(
        { ...state, stage: 'submitted', asking: null },
        "Done. I've handed this to our agents: they'll create your profile, review the risk and prepare three simulated options. A licensed broker then reviews everything before it reaches your portal.",
        null,
        { submit: true },
      )
    }
    const before = { ...state.details }
    state.details = { ...state.details, ...extractMotor(text, null) }
    const email = parseEmail(text)
    const phone = parsePhone(text)
    if (email) state.contact.email = email
    if (phone) state.contact.phone = phone
    const ack = acknowledge(before, state.details)
    if (!ack && !email && !phone) {
      return turn(state, "Tell me what to change, for example 'the value is R250,000' or 'it has a tracker'.", null)
    }
    return nextQuestion(state, ack || 'Updated. ')
  }

  const before = { ...state.details }
  state.details = { ...state.details, ...extractMotor(text, state.asking) }
  const ack = acknowledge(before, state.details)
  if (!ack && state.asking && QUESTIONS[state.asking]) {
    return turn(state, `Sorry, I didn't catch that. ${QUESTIONS[state.asking]!(state)}`, state.asking)
  }
  return nextQuestion(state, ack)
}

export const deterministicAdapter: AssistantAdapter = {
  id: 'deterministic',
  label: 'Deterministic demo adapter',
  available: true,
  intakeTurn: async (state, text) => deterministicTurn(state, text),
}
