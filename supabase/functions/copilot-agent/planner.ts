// AR, Ava and Russ: the rule planner and executor behind every copilot turn. No language model: fixed rules turn a broker's
// message into MCP jobs, resolve clients, accounts and policies to verified IDs, ask with choices when a rule cannot decide,
// and only write once every record a step touches is resolved.
// Pure TypeScript with no imports, so the copilot-agent Edge Function, the frontend (types) and Vitest share one file.

export type Category = 'sample' | 'live'
export type CopilotId = 'ar' | 'ava' | 'russ'
export type Handler = 'ava' | 'russ'
export type RecordType = 'client' | 'account' | 'policy' | 'quote_option' | 'team_member' | 'offer'

export interface EntityRef {
  record_type: RecordType
  id: string
  number: string | null
  name: string
  category: Category
  detail?: string | null
  open_path?: string | null
  account?: { id: string; number: string | null; name: string } | null
}

export interface PolicyRef {
  id: string
  display_number: string
  reference?: string
  policy_number?: string | null
  line: string
  cover_type: string | null
  status: string
  provider?: string | null
  open_path: string
  account?: { id: string; number: string | null; name: string } | null
}

/** A broker, sub-broker or agent in the brokerage, with their customer referral code. */
export interface MemberRef {
  member_id: string
  name: string
  role: 'broker' | 'sub_broker' | 'agent'
  role_label: string
  referral_code: string
  referral_path: string
  service_area?: string | null
  status?: string
  invite_status?: string
  user_id?: string | null
  is_me?: boolean
}

export interface OfferRef {
  id: string
  reference: string
  status: string
  person_id: string
  insurer?: string
  product?: string
  premium_amount?: number
  premium_frequency?: string
  from_sample_quote?: boolean
}

export interface TurnContext {
  person?: EntityRef | null
  account?: EntityRef | null
  policy?: PolicyRef | null
  member?: MemberRef | null
  offer?: OfferRef | null
  /** The Route run Russ is working on; runs live in the browser, so the server only carries it along. */
  route_run_id?: string | null
}

export type JobName =
  | 'records.search'
  | 'records.overview'
  | 'client.create'
  | 'account.create'
  | 'interaction.record'
  | 'task.create'
  | 'history.list'
  | 'ava.policies.list'
  | 'ava.policy.get'
  | 'ava.quote_request.create'
  | 'ava.life_application.create'
  | 'ava.life_application.get'
  | 'russ.business.overview'
  | 'russ.policies.list'
  | 'russ.scheme.overview'
  | 'russ.members.list'
  | 'sales.workspace.setup'
  | 'sales.profile'
  | 'sales.team.invite'
  | 'sales.team.list'
  | 'sales.team.invite_link'
  | 'sales.enquiry.capture'
  | 'sales.book.grid'
  | 'sales.client.record'
  | 'sales.client.reassign'
  | 'sales.offer.create'
  | 'sales.offer.message'
  | 'sales.offer.sent'
  | 'sales.offer.accept'
  | 'sales.sale.record'
  | 'sales.comms.log'
  | 'sales.followup.create'
  | 'sales.referral.funnel'
  | 'sales.team.find'
  | 'franchise.setup'
  | 'franchise.outlet.update'
  | 'franchise.staff.invite'
  | 'franchise.seller.link'
  | 'franchise.list'
  | 'franchise.outlet.get'
  | 'franchise.enquiries.grid'
  | 'franchise.performance'
  | 'franchise.sales'
  | 'franchise.client.attribution'

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }

export interface ToolPort {
  call(name: JobName, args: Record<string, unknown>): Promise<ToolOutcome>
}

export type Intent =
  | 'note'
  | 'task'
  | 'create_client'
  | 'create_account'
  | 'quote_request'
  | 'life_application_create'
  | 'life_application_get'
  | 'members'
  | 'schemes'
  | 'history'
  | 'policies'
  | 'find'
  | 'overview'
  | 'sales_setup'
  | 'sales_invite'
  | 'sales_referral_link'
  | 'sales_load_prospect'
  | 'sales_prepare_offer'
  | 'sales_offer_sent'
  | 'sales_accept'
  | 'sales_sale'
  | 'sales_book'
  | 'franchise_setup'
  | 'franchise_enquiries'
  | 'franchise_sales'
  /** A Route step run in the browser (CopilotPanel bridge); never planned on the server. */
  | 'route'
  | 'unknown'

export interface NameHint {
  text: string
  kind: 'account' | 'client' | null
}

export interface PlannedStep {
  index: number
  clause: string
  intent: Intent
  write: boolean
  mentions: EntityRef[]
  numbers: string[]
  names: NameHint[]
  pronoun: 'person' | 'account' | 'policy' | null
  cover_type: string | null
  mentions_policy: boolean
  line_hint: Handler | null
  params: Record<string, string | number | null>
}

export interface StepInput {
  /** Answers to a needs_input question, keyed by field. */
  values?: Record<string, string>
  /** A record or policy the broker picked for this step. */
  choice?: EntityRef | PolicyRef | null
}

export interface TurnInput {
  copilot: CopilotId
  category: Category
  text: string
  entities?: EntityRef[]
  context?: TurnContext
  conversation_id: string
  message_id: string
  steps?: Record<number, StepInput>
  /** The app's origin, so replies can carry full referral links. */
  origin?: string
}

export type StepStatus = 'saved' | 'retrieved' | 'needs_choice' | 'needs_input' | 'failed' | 'refused'

export interface Receipt {
  reference: string
  record_type: string
  summary: string
  client_number?: string | null
  client_name?: string | null
  account_number?: string | null
  account_name?: string | null
  policy_number?: string | null
  open_path: string
  replayed: boolean
  category: Category
}

export interface StepResult {
  index: number
  clause: string
  intent: Intent
  job: JobName | null
  handled_by: Handler | 'ar'
  handed_off: boolean
  status: StepStatus
  title: string
  summary: string
  category: Category
  subject?: EntityRef | null
  policy?: PolicyRef | null
  receipt?: Receipt | null
  data?: unknown
  choice_kind?: 'record' | 'policy'
  choices?: Array<EntityRef | PolicyRef>
  input?: { field: string; label: string; placeholder?: string; kind?: 'text' | 'date' | 'confirm' }
  error?: { code: string; message: string } | null
  /** `to` is an app path or an external URL; `copy` puts that text on the clipboard instead of navigating. */
  links: Array<{ label: string; to: string; copy?: string }>
}

export interface TurnResult {
  copilot: CopilotId
  category: Category
  reply: string
  steps: StepResult[]
  context: TurnContext
}

// ------------------------------------------------------------------ Vocabulary

const VERBS =
  'find|show|add|create|open|get|list|record|log|note|save|arrange|schedule|book|start|new|set|look|search|retrieve|pull|give|display|make|remind|capture|register|submit|tell|what|who|leave|write|view|invite|load|prepare|draft|share'

const COVER_WORDS: Array<[RegExp, string]> = [
  [/\b(motor ?bike|motorcycle)\b/i, 'motorbike'],
  [/\b(motor|car|vehicle)\b/i, 'motor'],
  [/\b(contents)\b/i, 'contents'],
  [/\b(home|house|buildings|household)\b/i, 'home'],
  [/\b(valuables|all risks)\b/i, 'valuables'],
  [/\bfuneral\b/i, 'funeral'],
  [/\bdisability\b/i, 'disability'],
  [/\blife\b/i, 'life'],
  [/\bfleet\b/i, 'fleet'],
  [/\bliability\b/i, 'liability'],
  [/\b(commercial|business) (package|property|cover)\b/i, 'commercial_package'],
]

const PEOPLE_WORDS = /\b(motor|car|vehicle|home|house|household|contents|life|funeral|disability|personal|individual|motorbike|valuables)\b/i
const BUSINESS_WORDS = /\b(business|commercial|company|scheme|schemes|employer|employees|members|group|fleet|liability|payroll|fund|risk twin)\b/i

const NAME_STOP = new Set([
  'I', 'AR', 'Ava', 'Russ', 'Sample', 'Live', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January',
  'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Find', 'Show', 'Add',
  'Create', 'Open', 'Get', 'List', 'Record', 'Log', 'Note', 'Save', 'Arrange', 'Schedule', 'Book', 'Start', 'New', 'Set', 'Look', 'Search',
  'Retrieve', 'Pull', 'Give', 'Display', 'Make', 'Remind', 'Capture', 'Register', 'Submit', 'Tell', 'What', 'Who', 'Please', 'Then', 'And',
  'The', 'A', 'An', 'Her', 'His', 'Their', 'Leave', 'Write', 'View', 'Can', 'Could', 'Would', 'Also', 'Motor', 'Life', 'Home', 'Contents',
  'Policy', 'Client', 'Account', 'R', 'CL', 'AC', 'PL', 'WhatsApp', 'Whatsapp', 'Email', 'Invite', 'Load', 'Prepare', 'Draft', 'Share', 'Agent',
  'Prospect', 'Offer', 'Customer', 'Insurer', 'This', 'My', 'Our', 'Me', 'OF', 'EN', 'SL',
])

const CHIP = /@\[([^\]]+)\]\((client|account|policy):([0-9a-f-]{36})\)/gi

// ------------------------------------------------------------------ Parsing helpers

/** Split a message into clauses at commas, semicolons, "and" or "then" that start a new instruction. */
export function splitClauses(text: string): string[] {
  const re = new RegExp(`\\s*(?:;|\\.\\s+|,\\s*(?:and\\s+|then\\s+)?|\\s+and\\s+(?:then\\s+)?|\\s+then\\s+)(?=(?:please\\s+)?(?:${VERBS})\\b)`, 'i')
  return text
    .split(re)
    .map((c) => c.trim().replace(/[.!?]+$/, ''))
    .filter(Boolean)
}

/** Chips inserted by the composer: @[Priya Naidoo · CL-S1001](client:<uuid>). */
export function chipsIn(clause: string, entities: EntityRef[]): EntityRef[] {
  const found: EntityRef[] = []
  for (const m of clause.matchAll(CHIP)) {
    const id = m[3].toLowerCase()
    const known = entities.find((e) => e.id.toLowerCase() === id)
    found.push(known ?? { record_type: m[2] as RecordType, id, number: null, name: m[1].split(' · ')[0], category: 'sample' })
  }
  return found
}

export const stripChips = (s: string) => s.replace(CHIP, (_m, label: string) => label.split(' · ')[0])

export function numbersIn(clause: string): string[] {
  const text = stripChips(clause)
  const own = text.match(/\b(?:CL|AC|PL|NT|TK)-S?\d{3,}\b/gi) ?? []
  const insurer = text.match(/\b[A-Z]{2,4}-[A-Z]{2}-\d{4,}\b|\b[A-Z]{2,4}-\d{5,}\b/g) ?? []
  return [...new Set([...own.map((n) => n.toUpperCase()), ...insurer])].filter((n, i, all) => all.indexOf(n) === i)
}

const NAME_WORD = "[A-Z][a-zA-Z\\u00C0-\\u017F'’\\-]+"
const NAME_SEQ = `${NAME_WORD}(?:\\s+(?:van der|van den|van|de|du|le|la|von)\\s+${NAME_WORD}|\\s+${NAME_WORD}){0,3}`

export function namesIn(clause: string): NameHint[] {
  const text = stripChips(clause).replace(/\b(?:CL|AC|PL|NT|TK)-S?\d{3,}\b/gi, ' ')
  const hints: NameHint[] = []
  const add = (raw: string, kind: NameHint['kind']) => {
    const words = raw.trim().split(/\s+/).filter((w) => !NAME_STOP.has(w.replace(/['’]s$/, '')))
    const cleaned = words.join(' ').replace(/['’]s$/, '').trim()
    if (cleaned.length < 2 || NAME_STOP.has(cleaned)) return
    const existing = hints.find((h) => h.text.toLowerCase() === cleaned.toLowerCase())
    if (existing) {
      existing.kind ??= kind
      return
    }
    if (hints.some((h) => h.text.toLowerCase().includes(cleaned.toLowerCase()))) return
    for (let i = hints.length - 1; i >= 0; i--) if (cleaned.toLowerCase().includes(hints[i].text.toLowerCase())) hints.splice(i, 1)
    hints.push({ text: cleaned, kind })
  }
  for (const m of text.matchAll(new RegExp(`\\bthe\\s+(${NAME_SEQ})\\s+(?:account|household|family|business|company)\\b`, 'g'))) add(m[1], 'account')
  for (const m of text.matchAll(new RegExp(`\\b(${NAME_SEQ})(?:'s|’s)\\b`, 'g'))) add(m[1], 'client')
  for (const m of text.matchAll(new RegExp(`(?:^|\\s)(${NAME_SEQ})`, 'g'))) {
    const start = m.index ?? 0
    const atStart = text.slice(0, start).trim() === ''
    const words = m[1].split(/\s+/)
    if (atStart && new RegExp(`^(?:${VERBS}|please)$`, 'i').test(words[0])) {
      if (words.length > 1) add(words.slice(1).join(' '), null)
      continue
    }
    add(m[1], null)
  }
  return hints
}

export function pronounIn(clause: string): PlannedStep['pronoun'] {
  const t = stripChips(clause).toLowerCase()
  if (/\b(that|this|the|her|his|their) (policy|cover)\b|\bit\b/.test(t)) return 'policy'
  if (/\b(that|this|the|their|her|his) (account|household|business|company)\b/.test(t)) return 'account'
  if (/\b(her|his|she|he|him|their|them|they|the client)\b/.test(t)) return 'person'
  return null
}

export function coverTypeIn(clause: string): string | null {
  const t = stripChips(clause)
  return COVER_WORDS.find(([re]) => re.test(t))?.[1] ?? null
}

// ------------------------------------------------------------------ Broker sales book: rules and parsing

const SALES_RULES: Array<[Intent, RegExp]> = [
  ['sales_invite', /\b(invite|add|onboard|bring on|set up|sign up)\b[^.]*\bas (?:my |our |an? |the )?(agent|sub[- ]?broker)\b|\binvite\b[^.]*\b(agent|sub[- ]?broker)\b/],
  ['sales_setup', /\b(set ?up|open|create|start|reopen)\b[^.]*\b(brokerage|workspace)\b/],
  ['sales_load_prospect', /\b(load|capture|add|register|log)\b[^.]*\b(prospect|enquiry)\b|\b(load|capture|add)\b[^.]*\bagainst\b[^.]*\bcode\b/],
  ['sales_referral_link', /\breferral (link|code)s?\b/],
  ['sales_prepare_offer', /\b(prepare|create|draft|make|build|put together)\b[^.]*\boffer\b/],
  ['sales_offer_sent', /\b(sent|shared|whatsapped|emailed|send)\b[^.]*\boffer\b|\boffer\b[^.]*\b(sent|shared)\b/],
  ['sales_book', /\b(show|list|open|view|see|pull up)\b[^.]*\b(referrals|comms|communications|sales|client grid|grid|pipeline)\b/],
  ['sales_sale', /\b(confirmed|confirms)\b[^.]*\bcover\b|\bcover\b[^.]*\b(confirmed|is on risk)\b|\brecord (the |a )?sale\b/],
  ['sales_accept', /^(?:the |my |our )?(?:client|customer)\b[^.]*\b(accepted|agreed|said yes|wants to go ahead)\b|\b(accepted|agreed to|took)\b[^.]*\boffer\b|\boffer\b[^.]*\baccepted\b/],
]

export const SALES_INTENTS: Intent[] = SALES_RULES.map(([i]) => i)
const SALES_CLIENT_INTENTS: Intent[] = ['sales_prepare_offer', 'sales_offer_sent', 'sales_accept', 'sales_sale']
const OWN_PREFIX = /^(?:CL|AC|PL|NT|TK|OF|EN|SL)-/i

export function salesIntentOf(clause: string): Intent | null {
  const t = stripChips(clause).toLowerCase().trim()
  if (/\b(add|make|save|write|leave|put)\b[^.]*\bnotes?\b|^note\b/.test(t)) return null
  return SALES_RULES.find(([, re]) => re.test(t))?.[0] ?? null
}

/** A customer referral code such as LERATO-QSA4 (never a client, offer or enquiry number). */
export function referralCodeIn(clause: string): string | null {
  const all = stripChips(clause).toUpperCase().match(/\b[A-Z][A-Z0-9]{1,11}-[A-Z0-9]{4}\b/g) ?? []
  return all.find((c) => !OWN_PREFIX.test(c)) ?? null
}

export const phoneIn = (clause: string) => clause.match(/(?:\+?27|\b0)(?:[\s-]?\d){9}\b/)?.[0]?.trim() ?? null
export const emailIn = (clause: string) => clause.match(/[^\s@,;<>()]+@[^\s@,;<>()]+\.[A-Za-z]{2,}/)?.[0] ?? null

export function frequencyIn(clause: string): 'monthly' | 'quarterly' | 'annually' | 'single' | null {
  const t = clause.toLowerCase()
  if (/\b(quarterly|per quarter)\b/.test(t)) return 'quarterly'
  if (/\b(annual(ly)?|yearly|per year|p\.?a\.?)\b/.test(t)) return 'annually'
  if (/\b(once[- ]off|single premium|single)\b/.test(t)) return 'single'
  if (/\b(monthly|per month|a month|pm|p\.m\.)\b/.test(t)) return 'monthly'
  return null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Cover start date from "starting 2026-12-01", "from 1 December", "start tomorrow" or "on Monday". */
export function startDateIn(clause: string, now = new Date()): string | null {
  const t = clause.toLowerCase()
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(20\d{2}))?\b/)
  if (dm) {
    const month = MONTHS.indexOf(dm[2])
    let year = dm[3] ? Number(dm[3]) : now.getUTCFullYear()
    if (!dm[3] && new Date(Date.UTC(year, month, Number(dm[1]))) < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 31))) year += 1
    return new Date(Date.UTC(year, month, Number(dm[1]))).toISOString().slice(0, 10)
  }
  const after = t.match(/\b(?:start(?:s|ing)?|from|effective|commenc\w*|cover (?:starts|begins))\b(.*)$/)
  return after ? dueDateIn(after[1], now) : null
}

/** The insurer's policy or confirmation reference: "ref SAN-MV-778812", "policy number 4410023". */
export function insurerReferenceIn(clause: string): string | null {
  const t = stripChips(clause)
  const labelled = t.match(/\b(?:ref(?:erence)?|policy(?:\s+(?:number|no\.?|#))?|confirmation(?:\s+(?:number|no\.?))?)\s*(?:is|:|#|=|number)?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i)
  if (labelled && /\d/.test(labelled[1]) && !OWN_PREFIX.test(labelled[1])) return labelled[1].toUpperCase()
  const shaped = (t.match(/\b[A-Z]{2,5}(?:-[A-Z0-9]{2,})+\b/g) ?? []).find((x) => /\d/.test(x) && !OWN_PREFIX.test(x) && x !== referralCodeIn(x))
  return shaped ?? null
}

/** "Santam, motor, R865.50 monthly" or "motor with Santam at R865". */
export function offerDetailsIn(text: string): { insurer_name: string | null; product: string | null; premium_amount: number | null; premium_frequency: string | null } {
  const t = stripChips(text)
  const parts = t.split(',').map((p) => p.trim()).filter(Boolean)
  const amount = amountIn(t) ?? (t.match(/\b(\d{2,6}(?:\.\d{1,2})?)\b/) ? Number(t.match(/\b(\d{2,6}(?:\.\d{1,2})?)\b/)![1]) : null)
  const product = coverTypeIn(t) ?? (parts.length >= 3 ? parts[1].toLowerCase() : null)
  const withName = t.match(/\b(?:with|from|via|through)\s+([A-Z][A-Za-z&'.]+(?:\s+[A-Z][A-Za-z&'.]+)?)/)?.[1] ?? null
  const first = parts.length >= 2 && !/\d/.test(parts[0]) && !coverTypeIn(parts[0]) ? parts[0] : null
  return { insurer_name: withName ?? first, product, premium_amount: amount, premium_frequency: frequencyIn(t) }
}

const cleanName = (s: string | null | undefined) => {
  if (!s) return null
  const words = s.trim().split(/\s+/).filter((w) => !NAME_STOP.has(w.replace(/['’]s$/, '')))
  const name = words.join(' ').replace(/['’]s$/, '').trim()
  return name.length >= 2 ? name : null
}

/** The team member a clause is about: "Lerato's referrals", "referral link for Lerato", "against Lerato's code". */
export function memberHintIn(clause: string): string | null {
  const t = stripChips(clause)
  const possessive = t.match(new RegExp(`\\b(${NAME_SEQ})(?:'s|’s)\\b`))
  if (possessive) return cleanName(possessive[1])
  const against = t.match(new RegExp(`\\b(?:against|under|for|of|to)\\s+(${NAME_SEQ})`))
  if (against) return cleanName(against[1])
  return null
}

/** Case-insensitive words in front of a case-sensitive name pattern. */
const anyCase = (words: string) => words.split('|').map((w) => w.replace(/[a-z]/gi, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`)).join('|')

function inviteeIn(clause: string): { name: string | null; service_area: string | null } {
  const t = stripChips(clause)
  const name = t.match(new RegExp(`\\b(?:${anyCase('invite|add|onboard|bring on|set up|sign up')})\\s+(${NAME_SEQ})`))?.[1] ?? null
  const area = t.match(new RegExp(`\\b(?:${anyCase('agent|sub-broker|sub broker|subbroker')})s?\\s+(?:in|for|covering|based in|at)\\s+(${NAME_SEQ})`))?.[1] ?? null
  return { name: cleanName(name), service_area: area ? area.trim() : null }
}

function prospectNameIn(clause: string): { first_names: string; surname: string } | null {
  const t = stripChips(clause)
  const m = t.match(new RegExp(`\\b(?:${anyCase('load|capture|add|register|log')})\\s+(?:a\\s+|the\\s+|new\\s+)?(?:${anyCase('prospect|enquiry|lead')})?\\s*(?:for\\s+|called\\s+|named\\s+|:\\s*)?(${NAME_SEQ})`))
  const name = cleanName(m?.[1])
  if (!name) return null
  const words = name.split(/\s+/)
  return words.length >= 2 ? { first_names: words.slice(0, -1).join(' '), surname: words[words.length - 1] } : null
}

function salesClientNamesIn(clause: string): NameHint[] {
  const t = stripChips(clause).replace(/\b(?:CL|AC|PL|NT|TK|OF|EN|SL)-S?\d{3,}\b/gi, ' ')
  const hints: NameHint[] = []
  for (const m of t.matchAll(new RegExp(`\\b(?:for|to)\\s+(?:client\\s+)?(${NAME_SEQ})`, 'g'))) {
    const n = cleanName(m[1])
    if (n) hints.push({ text: n, kind: 'client' })
  }
  for (const m of t.matchAll(new RegExp(`\\b(${NAME_SEQ})(?:'s|’s)\\s+offer\\b`, 'g'))) {
    const n = cleanName(m[1])
    if (n && !hints.some((h) => h.text === n)) hints.push({ text: n, kind: 'client' })
  }
  return hints
}

function salesParams(intent: Intent, clause: string): PlannedStep['params'] {
  const t = stripChips(clause)
  const lower = t.toLowerCase()
  switch (intent) {
    case 'sales_setup':
      return { brokerage_name: t.match(/\b(?:called|named)\s+(.{2,})$/i)?.[1]?.trim() ?? null }
    case 'sales_invite': {
      const who = inviteeIn(clause)
      return { role: /sub[- ]?broker/i.test(t) ? 'sub_broker' : 'agent', full_name: who.name, service_area: who.service_area, email: emailIn(t), phone: phoneIn(t) }
    }
    case 'sales_referral_link':
      return { member: memberHintIn(clause) ?? (/\b(her|his|their)\b/.test(lower) ? null : 'me') }
    case 'sales_load_prospect': {
      const p = prospectNameIn(clause)
      const code = referralCodeIn(clause)
      const member = code ? null : memberHintIn(t.replace(/^.*?\b(?:against|under|using)\b/i, 'against '))
      return { first_names: p?.first_names ?? null, surname: p?.surname ?? null, phone: phoneIn(t), email: emailIn(t), referral_code: code,
        member: member && p && `${p.first_names} ${p.surname}`.includes(member) ? null : member, interest: coverTypeIn(t) }
    }
    case 'sales_prepare_offer': {
      const d = offerDetailsIn(t)
      return { product: coverTypeIn(t), insurer_name: d.insurer_name, premium_amount: amountIn(t), premium_frequency: frequencyIn(t) }
    }
    case 'sales_offer_sent':
      return { channel: /whats ?app/i.test(t) ? 'whatsapp' : /\bemail(ed)?\b/i.test(t) ? 'email' : /\b(call|phone|phoned)\b/i.test(t) ? 'call' : /\bin person\b|\bmet\b/i.test(t) ? 'in_person' : 'whatsapp' }
    case 'sales_accept':
      return { accepted_on: /\byesterday\b/i.test(t) ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) : startDateIn(t) }
    case 'sales_sale':
      return { insurer_reference: insurerReferenceIn(t), cover_start_date: startDateIn(t) }
    case 'sales_book':
      return { member: /\b(my|mine)\b/.test(lower) && !memberHintIn(clause) ? 'me' : memberHintIn(clause) }
    default:
      return {}
  }
}

export function intentOf(clause: string): Intent {
  const sales = salesIntentOf(clause)
  if (sales) return sales
  const t = stripChips(clause).toLowerCase()
  if (/\b(add|make|save|log|record|write|leave|put|capture)\b[^.]*\bnotes?\b|\bnote (that|:)|^note\b|\blog (a |the )?(call|meeting|email)\b/.test(t)) return 'note'
  if (/\b(arrange|schedule|book|set up|create|add|make)\b[^.]*\b(callback|call back|call-back|follow[- ]?up|task|reminder)\b|\bremind me\b/.test(t)) return 'task'
  if (/\b(create|add|new|register|capture|onboard)\b[^.]*\bclient\b|\bnew client\b/.test(t)) return 'create_client'
  if (/\b(create|add|new|set up)\b[^.]*\baccount\b/.test(t) && !/\b(find|show|open|search)\b/.test(t)) return 'create_account'
  if (/\bquote\b/.test(t) && /\b(request|new|create|get|need|want|capture|start|add)\b/.test(t)) return 'quote_request'
  if (/\b(create|start|new|capture|submit|record|add|open)\b[^.]*\blife\b[^.]*\b(application|app|policy|cover)\b/.test(t)) return 'life_application_create'
  if (/\blife\b[^.]*\b(application|app)s?\b|\blatest life\b/.test(t)) return 'life_application_get'
  if (/\bmembers?\b|\bemployees\b/.test(t)) return 'members'
  if (/\bschemes?\b|\bgroup (benefits?|risk|life|cover)\b/.test(t)) return 'schemes'
  if (/\b(history|activity|timeline|interactions|notes|what happened|follow[- ]?ups|tasks)\b/.test(t)) return 'history'
  if (/\bpolic(y|ies)\b|\bcover\b/.test(t)) return 'policies'
  if (/\b(find|search|look ?up|locate|who is|pull up)\b/.test(t)) return 'find'
  if (/\b(show|open|view|overview|tell me about|summary|details|get)\b/.test(t)) return 'overview'
  return 'unknown'
}

const WRITE_INTENTS: Intent[] = ['note', 'task', 'create_client', 'create_account', 'quote_request', 'life_application_create']

export function noteBodyIn(clause: string): string | null {
  const t = stripChips(clause).trim()
  const quoted = t.match(/["“]([^"”]{2,})["”]/)
  if (quoted) return quoted[1].trim()
  const colon = t.match(/:\s*(.{2,})$/)
  if (colon) return colon[1].trim()
  const that = t.match(/\bnote\b[^.]*?\b(?:that|saying|to say)\s+(.{2,})$/i)
  if (that) return that[1].trim()
  const logged = t.match(/\blog (?:a |the )?(?:call|meeting|email)\b[^.]*?\b(?:about|re|regarding|that)\s+(.{2,})$/i)
  if (logged) return logged[1].trim()
  return null
}

export function interactionKindIn(clause: string): 'note' | 'call' | 'meeting' | 'email' {
  const t = clause.toLowerCase()
  if (/\blog (a |the )?call\b/.test(t)) return 'call'
  if (/\blog (a |the )?meeting\b/.test(t)) return 'meeting'
  if (/\blog (a |the )?email\b/.test(t)) return 'email'
  return 'note'
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Due date as YYYY-MM-DD from "today", "tomorrow", "next week", "in 3 days", "on Friday" or an ISO date. */
export function dueDateIn(clause: string, now = new Date()): string | null {
  const t = clause.toLowerCase()
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const plus = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n))
  if (iso) return iso[1]
  if (/\btoday\b/.test(t)) return day(plus(0))
  if (/\btomorrow\b/.test(t)) return day(plus(1))
  if (/\bnext week\b/.test(t)) return day(plus(7))
  const inDays = t.match(/\bin (\d{1,2}) days?\b/)
  if (inDays) return day(plus(Number(inDays[1])))
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(t))
  if (wd >= 0) {
    const diff = (wd - now.getUTCDay() + 7) % 7 || 7
    return day(plus(diff))
  }
  return null
}

export function amountIn(clause: string): number | null {
  const m = clause.match(/\bR\s?(\d[\d\s,]*(?:\.\d{1,2})?)\b/)
  return m ? Number(m[1].replace(/[\s,]/g, '')) : null
}

function productCategoryIn(clause: string): string | null {
  const c = coverTypeIn(clause)
  if (c === 'motor') return 'motor'
  if (c === 'home') return 'home'
  if (c === 'contents') return 'household_contents'
  if (c === 'motorbike') return 'motorbike'
  if (c === 'valuables') return 'valuables'
  return null
}

function newClientNameIn(clause: string): { first_names: string; surname: string } | null {
  const t = stripChips(clause)
  const m = t.match(new RegExp(`\\b(?:called|named|client|for)\\s+(${NAME_SEQ})`)) ?? t.match(new RegExp(`(${NAME_SEQ})\\s*$`))
  if (!m) return null
  const words = m[1].split(/\s+/).filter((w) => !NAME_STOP.has(w))
  if (words.length < 2) return null
  return { first_names: words.slice(0, -1).join(' '), surname: words[words.length - 1] }
}

function birthDateIn(clause: string): string | null {
  return clause.match(/\b(?:born|dob|date of birth)\s*:?\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? null
}

function accountNameIn(clause: string): string | null {
  const t = stripChips(clause)
  return t.match(/\baccount\s+(?:called|named|for)\s+(.{2,})$/i)?.[1]?.trim() ?? t.match(/\b(?:called|named)\s+(.{2,})$/i)?.[1]?.trim() ?? null
}

export function lineHintIn(clause: string): Handler | null {
  const t = stripChips(clause)
  if (BUSINESS_WORDS.test(t)) return 'russ'
  if (PEOPLE_WORDS.test(t)) return 'ava'
  return null
}

export function planTurn(text: string, entities: EntityRef[] = []): PlannedStep[] {
  // "I sent the offer on WhatsApp. Log it and …": "log it" belongs to the instruction before it.
  const clauses = splitClauses(text).filter((c, i) => i === 0 || !/^(?:please\s+)?(?:log|record|save|note)\s+(?:it|that|this)$/i.test(c.trim()))
  return clauses.map((clause, index) => {
    const intent = intentOf(clause)
    if (SALES_INTENTS.includes(intent)) {
      return {
        index, clause, intent, write: !['sales_referral_link', 'sales_book'].includes(intent),
        mentions: chipsIn(clause, entities),
        numbers: SALES_CLIENT_INTENTS.includes(intent) ? numbersIn(clause).filter((n) => /^(?:CL|AC)-/i.test(n)) : [],
        names: SALES_CLIENT_INTENTS.includes(intent) ? salesClientNamesIn(clause) : [],
        pronoun: pronounIn(clause), cover_type: coverTypeIn(clause), mentions_policy: false, line_hint: null,
        params: salesParams(intent, clause),
      }
    }
    const params: PlannedStep['params'] = {}
    if (intent === 'note') {
      params.body = noteBodyIn(clause)
      params.kind = interactionKindIn(clause)
    }
    if (intent === 'task') {
      const lower = clause.toLowerCase()
      params.title = /call ?-?back/.test(lower) ? 'Callback' : /remind/.test(lower) ? 'Reminder' : 'Follow-up'
      params.detail = stripChips(clause)
      params.due_date = dueDateIn(clause)
    }
    if (intent === 'create_client') {
      const n = newClientNameIn(clause)
      params.first_names = n?.first_names ?? null
      params.surname = n?.surname ?? null
      params.date_of_birth = birthDateIn(clause)
    }
    if (intent === 'create_account') {
      params.name = accountNameIn(clause)
      params.type = /\b(business|commercial|company|\(pty\)|pty|cc|ltd)\b/i.test(clause) ? 'commercial' : 'personal'
    }
    if (intent === 'quote_request') params.product_category = productCategoryIn(clause)
    if (intent === 'life_application_create') params.premium_amount = amountIn(clause)
    if (intent === 'history') {
      const t = clause.toLowerCase()
      params.record_type = /\bnotes?\b|\binteractions\b/.test(t) ? 'interaction' : /\b(tasks|follow[- ]?ups)\b/.test(t) ? 'task' : null
      params.copilot = /\b(ava|personal|people)\b/.test(t) ? 'ava' : /\b(russ|business|commercial)\b/.test(t) ? 'russ' : null
    }
    const names = intent === 'create_client' || intent === 'create_account' ? [] : namesIn(clause)
    return {
      index,
      clause,
      intent,
      write: WRITE_INTENTS.includes(intent),
      mentions: chipsIn(clause, entities),
      numbers: numbersIn(clause),
      names,
      pronoun: pronounIn(clause),
      cover_type: coverTypeIn(clause),
      mentions_policy: /\bpolic(y|ies)\b|\brenewal\b/i.test(clause) || coverTypeIn(clause) !== null,
      line_hint: lineHintIn(clause),
      params,
    }
  })
}

// ------------------------------------------------------------------ Execution

const label = (e: EntityRef) => `${e.name}${e.number ? ` (${e.number})` : ''}`
const policyLabel = (p: PolicyRef) => `${p.cover_type ? `${p.cover_type.replace(/_/g, ' ')} ` : ''}policy ${p.display_number}`
const isBusiness = (e: EntityRef | null | undefined) => !!e && e.record_type === 'account' && /business/i.test(e.detail ?? '')
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const wholeWord = (name: string, q: string) => new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(name)

interface Candidates {
  step: number
  query: string
  kind: NameHint['kind']
  options: EntityRef[]
  chosen: EntityRef | null
}

/** One client plus the account they belong to (often named after them) is one person, not a choice. */
function collapsePersonAccount(list: EntityRef[]): EntityRef[] {
  const clients = list.filter((o) => o.record_type === 'client')
  if (clients.length !== 1 || !clients[0].account) return list
  const others = list.filter((o) => o !== clients[0])
  return others.every((o) => o.record_type === 'account' && o.id === clients[0].account!.id) ? clients : list
}

/** Narrow ambiguous candidates using the other records in the same message (an account and a person on it). */
export function reduceCandidates(all: Candidates[], context: TurnContext) {
  const resolvedAccounts = () =>
    [
      ...all.filter((c) => c.chosen?.record_type === 'account').map((c) => c.chosen!.id),
      ...all.filter((c) => c.chosen?.record_type === 'client' && c.chosen.account).map((c) => c.chosen!.account!.id),
      ...(context.account ? [context.account.id] : []),
      ...(context.person?.account ? [context.person.account.id] : []),
    ]
  let changed = true
  while (changed) {
    changed = false
    for (const c of all) {
      if (c.chosen) continue
      if (c.options.length === 1) {
        c.chosen = c.options[0]
        changed = true
        continue
      }
      const exact = collapsePersonAccount(c.options.filter((o) => sameText(o.name, c.query) || (o.number && sameText(o.number, c.query))))
      if (exact.length === 1) {
        c.chosen = exact[0]
        changed = true
        continue
      }
      const word = collapsePersonAccount(c.options.filter((o) => wholeWord(o.name, c.query)))
      const pool = word.length ? word : c.options
      const accounts = resolvedAccounts()
      const linked = pool.filter((o) => accounts.includes(o.id) || (o.account && accounts.includes(o.account.id)))
      if (linked.length === 1) {
        c.chosen = linked[0]
        changed = true
        continue
      }
      // An ambiguous account is settled by a person in the same message who belongs to exactly one of the candidates.
      if (c.kind === 'account' || pool.every((o) => o.record_type === 'account')) {
        const personAccounts = all.filter((o) => o !== c).flatMap((o) => (o.chosen ? [o.chosen] : o.options)).filter((o) => o.record_type === 'client' && o.account).map((o) => o.account!.id)
        const viaPerson = pool.filter((o) => personAccounts.includes(o.id))
        if (viaPerson.length === 1) {
          c.chosen = viaPerson[0]
          changed = true
          continue
        }
      }
      if (word.length === 1) {
        c.chosen = word[0]
        changed = true
      }
    }
  }
}

function asEntityList(data: unknown, category: Category): EntityRef[] {
  return (Array.isArray(data) ? data : []).map((x: Record<string, unknown>) => ({
    record_type: x.record_type as RecordType,
    id: String(x.id),
    number: (x.number as string) ?? null,
    name: String(x.name),
    category,
    detail: (x.detail as string) ?? null,
    open_path: (x.open_path as string) ?? null,
    account: (x.account as EntityRef['account']) ?? null,
  }))
}

function asPolicies(data: unknown): PolicyRef[] {
  return (Array.isArray(data) ? data : []) as PolicyRef[]
}

export async function runTurn(input: TurnInput, tools: ToolPort): Promise<TurnResult> {
  const { category } = input
  const entities = input.entities ?? []
  const plan = planTurn(input.text, entities)
  const context: TurnContext = { ...(input.context ?? {}) }
  const results: StepResult[] = []
  const sales: SalesSession = { team: null }

  // 1. Search every name and number once, then settle ambiguity across the whole message.
  const candidates: Candidates[] = []
  for (const step of plan) {
    const choice = input.steps?.[step.index]?.choice
    const picked = choice && 'record_type' in choice && ['client', 'account', 'policy'].includes(choice.record_type) ? choice : null
    if (picked) {
      candidates.push({ step: step.index, query: picked.name, kind: null, options: [picked], chosen: picked })
      continue
    }
    if (step.mentions.length) {
      for (const m of step.mentions) candidates.push({ step: step.index, query: m.name, kind: null, options: [m], chosen: m })
      continue
    }
    for (const n of step.numbers) {
      const r = await tools.call('records.search', { query: n })
      const exact = r.ok ? asEntityList(r.data, category).filter((e) => e.number && sameText(e.number, n)) : []
      candidates.push({ step: step.index, query: n, kind: null, options: exact.length ? exact : r.ok ? asEntityList(r.data, category) : [], chosen: null })
    }
    for (const n of step.names) {
      const kinds = n.kind === 'account' ? ['account'] : ['client', 'account']
      const r = await tools.call('records.search', { query: n.text, kinds, limit: 8 })
      candidates.push({ step: step.index, query: n.text, kind: n.kind, options: r.ok ? asEntityList(r.data, category) : [], chosen: null })
    }
  }
  reduceCandidates(candidates, context)

  // 2. Run each step with its resolved records.
  for (const step of plan) {
    const mine = candidates.filter((c) => c.step === step.index)
    const base = {
      index: step.index,
      clause: stripChips(step.clause),
      intent: step.intent,
      category,
      handed_off: false,
      links: [] as StepResult['links'],
    }

    const offCategory = mine.find((c) => c.chosen && c.chosen.category !== category)
    if (offCategory) {
      results.push({
        ...base, job: null, handled_by: 'ar', status: 'refused', title: 'Different category',
        summary: `${label(offCategory.chosen!)} is a ${offCategory.chosen!.category === 'live' ? 'Live' : 'Sample'} record. Switch category to work with it; ${category === 'live' ? 'Live' : 'Sample'} actions never touch it.`,
        error: { code: 'category_mismatch', message: 'Selected record belongs to the other category' },
      })
      continue
    }

    const unresolved = mine.find((c) => !c.chosen)
    if (unresolved && step.intent !== 'create_client' && step.intent !== 'create_account') {
      if (unresolved.options.length === 0) {
        results.push({
          ...base, job: 'records.search', handled_by: 'ar', status: 'failed', title: 'No match',
          summary: `No ${category === 'live' ? 'Live' : 'Sample'} client or account matches “${unresolved.query}”. Check the spelling, or type @ to search.`,
          error: { code: 'not_found', message: `No match for ${unresolved.query}` },
        })
      } else {
        results.push({
          ...base, job: 'records.search', handled_by: 'ar', status: 'needs_choice', title: `Which “${unresolved.query}”?`,
          summary: `${unresolved.options.length} ${category === 'live' ? 'Live' : 'Sample'} records match “${unresolved.query}”. Choose one${step.write ? ' before anything is saved' : ''}.`,
          choice_kind: 'record', choices: unresolved.options.slice(0, 8),
        })
      }
      continue
    }

    const chosen = mine.map((c) => c.chosen!).filter(Boolean)
    let person = chosen.find((e) => e.record_type === 'client') ?? null
    let account = chosen.find((e) => e.record_type === 'account') ?? null
    let policy: PolicyRef | null = null
    const policyHit = chosen.find((e) => e.record_type === 'policy')
    if (!person && !account && !policyHit) {
      if (step.pronoun === 'account') account = context.account ?? null
      else {
        // Opened from a policy (or "that policy"): notes and follow-ups default to it unless another cover is named.
        const coverClash = step.cover_type && context.policy?.cover_type && step.cover_type !== context.policy.cover_type
        if (context.policy && !coverClash && (step.pronoun === 'policy' || step.intent === 'note' || step.intent === 'task')) policy = context.policy
        person = context.person ?? null
        if (!person) account = context.account ?? null
      }
    }
    if (person && !account && person.account) {
      account = { record_type: 'account', id: person.account.id, number: person.account.number, name: person.account.name, category }
    }
    if (person) context.person = person
    if (account) context.account = account

    if (SALES_INTENTS.includes(step.intent)) {
      results.push(await runSalesStep({ step, input, tools, context, person, base, sales }))
      continue
    }

    // Who handles it: business accounts and scheme work go to Russ, people and personal lines to Ava.
    const business = isBusiness(account) && !person
    const handledBy: Handler = step.intent === 'schemes' || step.intent === 'members' ? 'russ'
      : ['quote_request', 'life_application_create', 'life_application_get'].includes(step.intent) ? 'ava'
      : business ? 'russ' : person ? 'ava' : step.line_hint ?? (input.copilot === 'russ' ? 'russ' : 'ava')
    const handedOff = input.copilot !== 'ar' && input.copilot !== handledBy
    const stamp = { handled_by: handledBy, handed_off: handedOff } as const
    const key = `${input.conversation_id}:${input.message_id}:${step.index}`
    const values = input.steps?.[step.index]?.values ?? {}
    const pickedPolicy = input.steps?.[step.index]?.choice
    const subject = person ?? account

    const needSubject = (what: string): StepResult => ({
      ...base, ...stamp, job: null, status: 'needs_input', title: 'Which client?',
      summary: `Choose the client or account ${what}. Type @ and a name or client number.`,
      input: { field: 'subject', label: 'Client or account', placeholder: '@Priya Naidoo or CL-S1001' },
    })

    const resolvePolicy = async (): Promise<StepResult | null> => {
      if (pickedPolicy && !('record_type' in pickedPolicy)) {
        policy = pickedPolicy
        return null
      }
      if (policyHit) {
        const r = await tools.call('ava.policy.get', { policy_id: policyHit.id })
        if (r.ok) policy = r.data as PolicyRef
        return null
      }
      if (policy || !step.mentions_policy) return null
      if (step.pronoun === 'policy' && context.policy) {
        policy = context.policy
        return null
      }
      const job: JobName = handledBy === 'russ' ? 'russ.policies.list' : 'ava.policies.list'
      const args = handledBy === 'russ' ? { customer_id: account?.id, cover_type: step.cover_type ?? undefined } : { person_id: person?.id, customer_id: person ? undefined : account?.id, cover_type: step.cover_type ?? undefined }
      const r = await tools.call(job, args)
      if (!r.ok) return { ...base, ...stamp, job, status: 'failed', title: 'Could not list policies', summary: r.error.message, error: r.error }
      const list = asPolicies(r.data).filter((p) => !['cancelled', 'lapsed', 'not_taken_up', 'declined'].includes(p.status))
      if (list.length === 1) {
        policy = list[0]
        return null
      }
      const what = step.cover_type ? `${step.cover_type.replace(/_/g, ' ')} policy` : 'policy'
      if (list.length === 0) {
        return { ...base, ...stamp, job, status: 'failed', title: `No ${what}`, subject, summary: `${subject ? label(subject) : 'This client'} has no active ${what} in ${category === 'live' ? 'Live' : 'Sample'}.`, error: { code: 'not_found', message: `No ${what}` } }
      }
      return {
        ...base, ...stamp, job, status: 'needs_choice', title: `Which ${what}?`, subject,
        summary: `${subject ? label(subject) : 'This client'} has ${list.length} ${what === 'policy' ? 'policies' : `${what}s`}. Choose one before anything is saved.`,
        choice_kind: 'policy', choices: list,
      }
    }

    const fromTool = (job: JobName, r: ToolOutcome, ok: (data: unknown) => StepResult): StepResult =>
      r.ok ? ok(r.data) : { ...base, ...stamp, job, status: r.error.code === 'forbidden' || r.error.code === 'category_mismatch' ? 'refused' : r.error.code === 'needs_input' ? 'needs_input' : 'failed', title: 'Not completed', summary: r.error.message, error: r.error, subject }

    const saved = (job: JobName, data: unknown, title: string): StepResult => {
      const d = data as Record<string, unknown>
      if (d.outcome === 'needs_input') {
        return {
          ...base, ...stamp, job, status: 'needs_choice', title: 'Possible duplicate', summary: String(d.summary), choice_kind: 'record',
          choices: asEntityList(d.choices, category), input: { field: 'force', label: 'This is a new person: create the client anyway', kind: 'confirm' },
        }
      }
      const receipt: Receipt = {
        reference: String(d.reference), record_type: String(d.record_type), summary: String(d.summary),
        client_number: (d.client_number as string) ?? null, client_name: (d.client_name as string) ?? null,
        account_number: (d.account_number as string) ?? null, account_name: (d.account_name as string) ?? null,
        policy_number: (d.policy_number as string) ?? null, open_path: String(d.open_path), replayed: Boolean(d.replayed), category,
      }
      return {
        ...base, ...stamp, job, status: 'saved', title, subject, policy, receipt,
        summary: `${receipt.summary}${receipt.replayed ? ' (already saved; not repeated)' : ''}.`,
        links: [{ label: 'Open record', to: receipt.open_path }],
      }
    }

    let result: StepResult
    switch (step.intent) {
      case 'note': {
        if (!subject && !policy && !policyHit) { result = needSubject('the note belongs to'); break }
        const p = await resolvePolicy()
        if (p) { result = p; break }
        const body = values.body ?? (step.params.body as string | null)
        if (!body) {
          result = {
            ...base, ...stamp, job: 'interaction.record', status: 'needs_input', title: 'What should the note say?', subject, policy,
            summary: `Ready to save a note on ${policy ? policyLabel(policy) : subject ? label(subject) : 'the record'}. Give the wording.`,
            input: { field: 'body', label: 'Note', placeholder: 'e.g. Requested a callback about the renewal premium' },
          }
          break
        }
        const pp = policy as PolicyRef | null
        const r = await tools.call('interaction.record', {
          body, kind: step.params.kind ?? 'note', person_id: person?.id, customer_id: person ? undefined : (pp?.account?.id ?? account?.id),
          policy_id: pp?.id, idempotency_key: key, copilot: handledBy,
        })
        result = fromTool('interaction.record', r, (d) => saved('interaction.record', d, 'Note saved'))
        break
      }
      case 'task': {
        if (!subject && !policy) { result = needSubject('the follow-up is for'); break }
        // Straight after an offer step, the follow-up is dated, assigned to the broker and linked to that offer.
        const offer = context.offer && person && context.offer.person_id === person.id ? context.offer : null
        if (offer) {
          const r = await tools.call('sales.followup.create', {
            person_id: person!.id, title: `Follow up on offer ${offer.reference}: ${person!.name}`, detail: step.params.detail ?? undefined,
            due_date: values.due_date ?? step.params.due_date ?? undefined, offer_id: offer.id, idempotency_key: key, copilot: input.copilot,
          })
          result = fromTool('sales.followup.create', r, (d) => ({ ...saved('sales.followup.create', d, 'Follow-up created'), handled_by: input.copilot, handed_off: false }))
          break
        }
        const p = await resolvePolicy()
        if (p) { result = p; break }
        const pp = policy as PolicyRef | null
        const r = await tools.call('task.create', {
          title: subject ? `${step.params.title}: ${subject.name}` : String(step.params.title), detail: step.params.detail ?? undefined,
          due_date: values.due_date ?? step.params.due_date ?? undefined, person_id: person?.id, customer_id: person ? undefined : account?.id,
          policy_id: pp?.id, idempotency_key: key, copilot: handledBy,
        })
        result = fromTool('task.create', r, (d) => saved('task.create', d, 'Follow-up created'))
        break
      }
      case 'create_client': {
        const typed = values.full_name?.trim().split(/\s+/) ?? []
        const first = values.first_names ?? (typed.length > 1 ? typed.slice(0, -1).join(' ') : null) ?? (step.params.first_names as string | null)
        const surname = values.surname ?? (typed.length > 1 ? typed[typed.length - 1] : null) ?? (step.params.surname as string | null)
        if (!first || !surname) {
          result = { ...base, ...stamp, job: 'client.create', status: 'needs_input', title: 'Client name', summary: 'Give the new client’s first names and surname.', input: { field: 'full_name', label: 'Full name', placeholder: 'e.g. Sipho Dlamini' } }
          break
        }
        const r = await tools.call('client.create', {
          first_names: first, surname, date_of_birth: values.date_of_birth ?? step.params.date_of_birth ?? undefined,
          account_id: /\b(this|that|the) account\b|\bto (this|that|the)\b/i.test(step.clause) ? context.account?.id : undefined,
          force: values.force === 'true', idempotency_key: key, copilot: handledBy,
        })
        result = fromTool('client.create', r, (d) => saved('client.create', d, 'Client created'))
        break
      }
      case 'create_account': {
        const name = values.name ?? (step.params.name as string | null)
        if (!name) {
          result = { ...base, ...stamp, job: 'account.create', status: 'needs_input', title: 'Account name', summary: 'Give the account name.', input: { field: 'name', label: 'Account name' } }
          break
        }
        const r = await tools.call('account.create', { name, type: step.params.type ?? 'personal', primary_person_id: person?.id, idempotency_key: key, copilot: step.params.type === 'commercial' ? 'russ' : 'ava' })
        result = fromTool('account.create', r, (d) => saved('account.create', d, 'Account created'))
        break
      }
      case 'quote_request': {
        if (!account) { result = needSubject('the quote is for'); break }
        const product = values.product_category ?? (step.params.product_category as string | null)
        if (!product) {
          result = { ...base, ...stamp, job: 'ava.quote_request.create', status: 'needs_input', title: 'Which cover?', subject, summary: 'Which cover is the quote for: motor, home or contents?', input: { field: 'product_category', label: 'Cover', placeholder: 'motor' } }
          break
        }
        const r = await tools.call('ava.quote_request.create', { customer_id: account.id, product_category: product, summary: stripChips(step.clause), person_id: person?.id, idempotency_key: key })
        result = fromTool('ava.quote_request.create', r, (d) => saved('ava.quote_request.create', d, 'Quote request created'))
        break
      }
      case 'life_application_create': {
        if (!person) { result = needSubject('the life application is for'); break }
        const premium = values.premium_amount ? Number(values.premium_amount) : (step.params.premium_amount as number | null)
        const r = await tools.call('ava.life_application.create', { person_id: person.id, customer_id: account?.id, premium_amount: premium ?? undefined, idempotency_key: key })
        result = fromTool('ava.life_application.create', r, (d) => saved('ava.life_application.create', d, 'Life application created'))
        break
      }
      case 'life_application_get': {
        if (!subject) { result = needSubject('to look up'); break }
        const r = await tools.call('ava.life_application.get', { person_id: person?.id, customer_id: person ? undefined : account?.id })
        result = fromTool('ava.life_application.get', r, (d) => {
          const p = d as PolicyRef
          policy = p
          return { ...base, ...stamp, job: 'ava.life_application.get', status: 'retrieved', title: 'Latest life application', subject, policy: p, data: d,
            summary: `${p.status === 'in_force' ? 'Latest life policy' : 'Latest life application'} ${p.display_number} (${p.status.replace(/_/g, ' ')}${p.provider ? `, ${p.provider}` : ''}).`,
            links: [{ label: 'Open record', to: p.open_path }] }
        })
        break
      }
      case 'policies': {
        if (!subject) { result = needSubject('whose policies to list'); break }
        const job: JobName = handledBy === 'russ' ? 'russ.policies.list' : 'ava.policies.list'
        const r = await tools.call(job, handledBy === 'russ' ? { customer_id: account?.id, cover_type: step.cover_type ?? undefined } : { person_id: person?.id, customer_id: person ? undefined : account?.id, cover_type: step.cover_type ?? undefined })
        result = fromTool(job, r, (d) => {
          const list = asPolicies(d)
          if (list.length === 1) policy = list[0]
          return { ...base, ...stamp, job, status: 'retrieved', title: 'Policies', subject, data: list,
            summary: list.length ? `${list.length} ${list.length === 1 ? 'policy' : 'policies'} for ${label(subject)}.` : `No policies on record for ${label(subject)}.`,
            links: list.slice(0, 6).map((p) => ({ label: p.display_number, to: p.open_path })) }
        })
        break
      }
      case 'history': {
        if (!subject) { result = needSubject('whose history to show'); break }
        const r = await tools.call('history.list', { person_id: person?.id, customer_id: person ? undefined : account?.id, copilot: step.params.copilot ?? undefined, record_type: step.params.record_type ?? undefined })
        result = fromTool('history.list', r, (d) => {
          const list = Array.isArray(d) ? d : []
          return { ...base, ...stamp, job: 'history.list', status: 'retrieved', title: 'History', subject, data: list,
            summary: list.length ? `${list.length} item${list.length === 1 ? '' : 's'} for ${label(subject)}, newest first.` : `Nothing recorded yet for ${label(subject)}.`,
            links: subject.open_path ? [{ label: 'Open record', to: subject.open_path }] : [] }
        })
        break
      }
      case 'schemes':
      case 'members': {
        if (!account) { result = needSubject('the employer'); break }
        const r = await tools.call('russ.scheme.overview', { customer_id: account.id })
        if (!r.ok) { result = fromTool('russ.scheme.overview', r, () => null as never); break }
        const schemes = ((r.data as { schemes?: Array<Record<string, unknown>> }).schemes ?? [])
        if (step.intent === 'members' && schemes.length === 1) {
          const m = await tools.call('russ.members.list', { scheme_id: schemes[0].scheme_id })
          result = fromTool('russ.members.list', m, (d) => ({ ...base, ...stamp, job: 'russ.members.list', status: 'retrieved', title: `${schemes[0].name} members`, subject: account, data: d,
            summary: `${(d as unknown[]).length} members on ${schemes[0].name}.`, links: account?.open_path ? [{ label: 'Open account', to: account.open_path }] : [] }))
          break
        }
        result = { ...base, ...stamp, job: 'russ.scheme.overview', status: 'retrieved', title: 'Group schemes', subject: account, data: schemes,
          summary: schemes.length ? `${schemes.length} scheme${schemes.length === 1 ? '' : 's'} for ${label(account)}.` : `${label(account)} has no group schemes.`,
          links: account.open_path ? [{ label: 'Open account', to: account.open_path }] : [] }
        break
      }
      case 'find':
      case 'overview': {
        if (!subject) {
          result = step.names.length || step.numbers.length ? needSubject('to open') : { ...base, ...stamp, job: null, status: 'needs_input', title: 'What should I do?', summary: 'Name a client or account (type @), or pick a job with /.', input: { field: 'subject', label: 'Client or account' } }
          break
        }
        const usePerson = person && !(step.names.some((n) => n.kind === 'account'))
        const job: JobName = !usePerson && business ? 'russ.business.overview' : 'records.overview'
        const args = job === 'russ.business.overview' ? { customer_id: account!.id } : usePerson ? { record_type: 'client', id: person!.id, scope: input.copilot === 'ava' ? 'people' : input.copilot === 'russ' ? 'business' : 'all' } : { record_type: 'account', id: account!.id, scope: input.copilot === 'ava' ? 'people' : input.copilot === 'russ' ? 'business' : 'all' }
        const target = usePerson ? person! : account!
        const r = await tools.call(job, args)
        result = fromTool(job, r, (d) => ({ ...base, ...stamp, job, status: 'retrieved', title: label(target), subject: target, data: d,
          summary: `Found ${label(target)}${target.record_type === 'client' && target.account ? ` on ${target.account.name} (${target.account.number})` : ''}.`,
          links: target.open_path ? [{ label: 'Open record', to: target.open_path }] : [] }))
        break
      }
      default:
        result = { ...base, ...stamp, job: null, status: 'needs_input', title: 'Not sure what to do', subject,
          summary: 'I can find clients and accounts, add notes, create follow-ups, clients, accounts, quote requests and life applications, and show policies, history and schemes. Type / for the list.',
          input: { field: 'text', label: 'Rephrase' } }
    }

    const finalPolicy = policy as PolicyRef | null
    if (finalPolicy && result.status !== 'failed' && result.status !== 'refused') context.policy = finalPolicy
    if (result.handed_off) result.summary = `${result.handled_by === 'russ' ? 'Russ' : 'Ava'} handled this, keeping your client context. ${result.summary}`
    results.push(result)
  }

  const reply = results.length
    ? results.map((r) => (results.length > 1 ? `${r.index + 1}. ${r.summary}` : r.summary)).join('\n')
    : 'Tell me what to do, for example “Find Priya Naidoo” or “Add a note to @Priya Naidoo’s motor policy: …”.'
  return { copilot: input.copilot, category, reply, steps: results, context }
}

// ------------------------------------------------------------------ Broker sales book: execution

interface SalesSession {
  team: MemberRef[] | null
}

interface SalesPersonJson {
  id: string
  client_number: string
  name: string
  contact_stage: string
  category: Category
  open_path: string
  account: { id: string; number: string; name: string } | null
  assigned: MemberRef | null
  referred_by: MemberRef | null
  offers?: Array<OfferRef & { sale?: { reference: string } | null; created_at?: string }>
}

const BOOK_PATH = '/broker/book'
const OPEN_STATUSES: Record<string, string[]> = {
  sales_offer_sent: ['draft', 'sent'],
  sales_accept: ['sent', 'draft'],
  sales_sale: ['accepted', 'sent'],
}

const memberChoice = (m: MemberRef, category: Category): EntityRef => ({
  record_type: 'team_member', id: m.member_id, number: m.referral_code, name: m.name, category,
  detail: `${m.role_label}${m.service_area ? ` · ${m.service_area}` : ''}`,
})

const personRef = (p: SalesPersonJson, category: Category): EntityRef => ({
  record_type: 'client', id: p.id, number: p.client_number, name: p.name, category, open_path: p.open_path, account: p.account ?? null,
})

const offerRef = (o: Record<string, unknown>, person_id: string): OfferRef => ({
  id: String(o.id), reference: String(o.reference), status: String(o.status), person_id: String(o.person_id ?? person_id),
  insurer: o.insurer as string | undefined, product: o.product as string | undefined, premium_amount: o.premium_amount as number | undefined,
  premium_frequency: o.premium_frequency as string | undefined, from_sample_quote: o.from_sample_quote as boolean | undefined,
})

const money = (n: number | undefined) => (typeof n === 'number' ? `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '')

export function whatsappUrl(text: string, phone?: string | null) {
  return `https://wa.me/${(phone ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`
}

async function runSalesStep(a: {
  step: PlannedStep
  input: TurnInput
  tools: ToolPort
  context: TurnContext
  person: EntityRef | null
  base: Pick<StepResult, 'index' | 'clause' | 'intent' | 'category' | 'handed_off' | 'links'>
  sales: SalesSession
}): Promise<StepResult> {
  const { step, input, tools, context, base, sales } = a
  const category = input.category
  const p = step.params
  const values = input.steps?.[step.index]?.values ?? {}
  const choice = input.steps?.[step.index]?.choice
  const picked = choice && 'record_type' in choice ? choice : null
  const key = `${input.conversation_id}:${input.message_id}:${step.index}`
  const stamp = { handled_by: input.copilot, handed_off: false } as const
  const abs = (path: string) => `${(input.origin ?? '').replace(/\/$/, '')}${path}`
  const cat = category === 'live' ? 'Live' : 'Sample'

  const fail = (job: JobName | null, error: { code: string; message: string }, title = 'Not completed'): StepResult => ({
    ...base, ...stamp, job, title, error, summary: error.message,
    status: error.code === 'forbidden' || error.code === 'category_mismatch' ? 'refused' : error.code === 'needs_input' ? 'needs_input' : 'failed',
  })
  const receiptOf = (d: Record<string, unknown>, fallbackPath: string): Receipt => ({
    reference: String(d.reference ?? ''), record_type: String(d.record_type ?? ''), summary: String(d.summary ?? ''),
    client_number: (d.client_number as string) ?? null, client_name: (d.client_name as string) ?? null,
    account_number: (d.account_number as string) ?? null, account_name: (d.account_name as string) ?? null, policy_number: null,
    open_path: String(d.open_path ?? fallbackPath), replayed: Boolean(d.replayed), category,
  })
  const done = (d: unknown) => (Boolean((d as { replayed?: boolean }).replayed) ? ' (already saved; not repeated)' : '')
  const referralLinks = (m: MemberRef) => [
    { label: 'Copy referral link', to: m.referral_path, copy: abs(m.referral_path) },
    { label: 'Share on WhatsApp', to: whatsappUrl(`Hi, I'm ${m.name.split(' ')[0]}. Tell me what cover you need and I'll come back to you with options: ${abs(m.referral_path)}`) },
  ]

  const team = async (): Promise<MemberRef[]> => {
    if (!sales.team) {
      const r = await tools.call('sales.team.list', {})
      sales.team = r.ok && Array.isArray(r.data) ? (r.data as MemberRef[]) : []
    }
    return sales.team
  }

  /** A team member from a choice, "me", a pronoun ("her link") or a name. */
  const findMember = async (hint: string | number | null): Promise<{ member?: MemberRef; result?: StepResult }> => {
    const list = await team()
    if (picked?.record_type === 'team_member') {
      const m = list.find((x) => x.member_id === picked.id)
      if (m) return { member: m }
    }
    if (!hint && context.member && step.pronoun === 'person') return { member: list.find((x) => x.member_id === context.member!.member_id) ?? context.member }
    if (!hint || hint === 'me') {
      const me = list.find((x) => x.is_me)
      if (me) return { member: me }
      if (!hint && context.member) return { member: context.member }
      return { result: fail('sales.team.list', { code: 'not_found', message: 'You do not have a sales profile in this brokerage yet. Say “Set up my brokerage” first.' }) }
    }
    const q = String(hint).toLowerCase()
    const exact = list.filter((m) => m.name.toLowerCase() === q)
    const first = list.filter((m) => m.name.toLowerCase().split(' ')[0] === q)
    const loose = list.filter((m) => m.name.toLowerCase().includes(q))
    const pool = exact.length ? exact : first.length ? first : loose
    if (pool.length === 1) return { member: pool[0] }
    if (pool.length === 0) {
      return { result: fail('sales.team.list', { code: 'not_found', message: `No one called “${hint}” is on your team. Invite them first, for example “Invite ${hint} as an agent”.` }, 'No team member') }
    }
    return {
      result: {
        ...base, ...stamp, job: 'sales.team.list', status: 'needs_choice', title: `Which “${hint}”?`,
        summary: `${pool.length} team members match “${hint}”. Choose one.`, choice_kind: 'record', choices: pool.map((m) => memberChoice(m, category)),
      },
    }
  }

  const loadRecord = async (personId: string): Promise<{ record?: SalesPersonJson; result?: StepResult }> => {
    const r = await tools.call('sales.client.record', { person_id: personId })
    if (!r.ok) return { result: fail('sales.client.record', r.error) }
    return { record: r.data as SalesPersonJson }
  }

  /** The offer a step acts on: a chosen one, the one in context, or the client's open offer. */
  const resolveOffer = async (): Promise<{ offer?: OfferRef; person?: EntityRef; result?: StepResult }> => {
    const subject = a.person ?? context.person ?? null
    if (picked?.record_type === 'offer') {
      return { offer: { id: picked.id, reference: picked.number ?? '', status: '', person_id: subject?.id ?? context.offer?.person_id ?? '' }, person: subject ?? undefined }
    }
    if (context.offer && (!subject || subject.id === context.offer.person_id)) return { offer: context.offer, person: subject ?? undefined }
    if (!subject) {
      return {
        result: {
          ...base, ...stamp, job: null, status: 'needs_input', title: 'Which client?', summary: 'Choose the client whose offer this is. Type @ and a name or client number.',
          input: { field: 'subject', label: 'Client', placeholder: '@Thandi Customer or CL-S1001' },
        },
      }
    }
    const { record, result } = await loadRecord(subject.id)
    if (result) return { result }
    const prefer = OPEN_STATUSES[step.intent] ?? ['draft', 'sent', 'accepted']
    const offers = (record!.offers ?? []).filter((o) => prefer.includes(o.status))
    if (offers.length === 1) return { offer: offerRef(offers[0] as unknown as Record<string, unknown>, subject.id), person: subject }
    if (offers.length === 0) {
      return { result: fail('sales.client.record', { code: 'not_found', message: `${label(subject)} has no ${prefer.join(' or ')} offer in ${cat}. Say “Prepare a motor offer for ${subject.number ?? subject.name}” first.` }, 'No open offer') }
    }
    return {
      result: {
        ...base, ...stamp, job: 'sales.client.record', status: 'needs_choice', title: 'Which offer?', subject,
        summary: `${label(subject)} has ${offers.length} open offers. Choose one.`, choice_kind: 'record',
        choices: offers.map((o) => ({
          record_type: 'offer', id: o.id, number: o.reference, name: `${o.insurer ?? ''} · ${(o.product ?? '').replace(/_/g, ' ')}`, category,
          detail: `${o.status} · ${money(o.premium_amount)} ${o.premium_frequency ?? ''}`, open_path: `${BOOK_PATH}/clients/${subject.id}`,
        })),
      },
    }
  }

  const offerSaved = (job: JobName, d: Record<string, unknown>, title: string, personHint?: EntityRef): StepResult => {
    const o = (d.offer ?? {}) as Record<string, unknown>
    const pid = String(o.person_id ?? d.client_id ?? personHint?.id ?? '')
    const offer = offerRef(o, pid)
    context.offer = offer
    if (d.client_id) {
      context.person = { record_type: 'client', id: String(d.client_id), number: (d.client_number as string) ?? null, name: String(d.client_name ?? personHint?.name ?? ''), category,
        open_path: `${BOOK_PATH}/clients/${d.client_id}`, account: d.account_id ? { id: String(d.account_id), number: (d.account_number as string) ?? null, name: String(d.account_name ?? '') } : null }
    }
    return {
      ...base, ...stamp, job, status: 'saved', title, subject: context.person ?? personHint ?? null, receipt: receiptOf(d, `${BOOK_PATH}/clients/${pid}`),
      summary: `${String(d.summary)}${done(d)}.`, data: d,
      links: [{ label: 'Open client', to: `${BOOK_PATH}/clients/${pid}` }],
    }
  }

  switch (step.intent) {
    case 'sales_setup': {
      const r = await tools.call('sales.workspace.setup', { brokerage_name: values.brokerage_name ?? p.brokerage_name ?? undefined })
      if (!r.ok) {
        if (r.error.code === 'needs_input') {
          return { ...fail('sales.workspace.setup', r.error, 'Brokerage name'), input: { field: 'brokerage_name', label: 'Brokerage name', placeholder: 'e.g. Benoni Cover Brokers' } }
        }
        return fail('sales.workspace.setup', r.error)
      }
      const raw = r.data as { member: MemberRef; brokerage: { name: string; live_available: boolean }; summary: string; reopened: boolean }
      const d = { ...raw, member: { ...raw.member, referral_path: `/r/${raw.member.referral_code}${category === 'sample' ? '?mode=sample' : ''}` } }
      context.member = d.member
      sales.team = null
      return {
        ...base, ...stamp, job: 'sales.workspace.setup', status: 'saved', title: d.reopened ? 'Workspace reopened' : 'Workspace created', data: d,
        receipt: { reference: d.member.referral_code, record_type: 'workspace', summary: d.summary, open_path: BOOK_PATH, replayed: d.reopened, category },
        summary: `${d.summary} Your customer referral link is ${abs(d.member.referral_path)}.${d.brokerage.live_available ? '' : ' Sample is ready now; Live opens once B-Covered activates the brokerage.'}`,
        links: [{ label: 'Open my workspace', to: BOOK_PATH }, ...referralLinks(d.member)],
      }
    }

    case 'sales_invite': {
      const typed = values.full_name ?? null
      const name = typed ?? (p.full_name as string | null)
      const email = values.email ?? (p.email as string | null) ?? (typed ? emailIn(typed) : null)
      if (!name && !email) {
        return { ...base, ...stamp, job: 'sales.team.invite', status: 'needs_input', title: 'Who should I invite?', summary: 'Give the team member’s full name (and email for their private invitation).', input: { field: 'full_name', label: 'Full name', placeholder: 'e.g. Lerato Dube' } }
      }
      const r = await tools.call('sales.team.invite', {
        full_name: name ? name.replace(emailIn(name) ?? '', '').trim() || undefined : undefined, role: p.role ?? 'agent', email: email ?? undefined,
        phone: p.phone ?? undefined, service_area: values.service_area ?? p.service_area ?? undefined, idempotency_key: key, copilot: input.copilot,
      })
      if (!r.ok) return fail('sales.team.invite', r.error)
      const d = r.data as Record<string, unknown> & { member?: MemberRef; invite_path?: string | null; invite_status?: string; outcome?: string; choices?: MemberRef[] }
      if (d.outcome === 'needs_input') {
        return { ...base, ...stamp, job: 'sales.team.invite', status: 'needs_input', title: 'Which team member?', summary: String(d.summary),
          choice_kind: 'record', choices: (d.choices ?? []).map((m) => memberChoice(m, category)), input: { field: 'email', label: 'Email address', placeholder: 'lerato@example.co.za' } }
      }
      const m = d.member!
      context.member = m
      sales.team = null
      const invite = d.invite_path
        ? ` Their private team invitation is ready to send (separate from the customer link).`
        : d.invite_status === 'needs_email' ? ` Add ${m.name.split(' ')[0]}’s email address to send the private team invitation.` : d.invite_status === 'joined' ? '' : ` Team invitation: ${String(d.invite_status ?? '').replace(/_/g, ' ')}.`
      return {
        ...base, ...stamp, job: 'sales.team.invite', status: 'saved', title: d.existing ? 'Team member found' : 'Team member invited', data: d,
        receipt: receiptOf(d, `${BOOK_PATH}?tab=team`),
        summary: `${String(d.summary)}${done(d)}. Customer referral link: ${abs(m.referral_path)}.${invite}`,
        links: [
          ...referralLinks(m),
          ...(d.invite_path ? [{ label: 'Copy team invitation', to: d.invite_path, copy: abs(d.invite_path) }] : []),
          { label: 'Open team', to: `${BOOK_PATH}?tab=team` },
        ],
      }
    }

    case 'sales_referral_link': {
      const { member, result } = await findMember(p.member ?? null)
      if (result) return result
      context.member = member!
      return {
        ...base, ...stamp, job: 'sales.team.list', status: 'retrieved', title: `${member!.is_me ? 'My' : `${member!.name.split(' ')[0]}’s`} customer referral link`, data: member,
        summary: `${member!.is_me ? 'Your' : `${member!.name}’s`} customer referral link: ${abs(member!.referral_path)} (code ${member!.referral_code}). Customers who open it see who referred them; only a submitted enquiry creates a prospect. This is separate from the private team invitation.`,
        links: [...referralLinks(member!), { label: 'Open the enquiry form', to: member!.referral_path }],
      }
    }

    case 'sales_load_prospect': {
      const typed = values.full_name?.trim() ?? null
      const typedWords = typed ? typed.replace(emailIn(typed) ?? '', '').replace(phoneIn(typed) ?? '', '').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean) : []
      const first = typedWords.length > 1 ? typedWords.slice(0, -1).join(' ') : (p.first_names as string | null)
      const surname = typedWords.length > 1 ? typedWords[typedWords.length - 1] : (p.surname as string | null)
      if (!first || !surname) {
        return { ...base, ...stamp, job: 'sales.enquiry.capture', status: 'needs_input', title: 'Prospect details', summary: 'Give the prospect’s full name and a phone number or email.', input: { field: 'full_name', label: 'Name and contact', placeholder: 'e.g. Sipho Dlamini, 082 555 0101' } }
      }
      let code = (p.referral_code as string | null) ?? null
      let member: MemberRef | undefined
      if (!code && p.member) {
        const found = await findMember(p.member)
        if (found.result) return found.result
        member = found.member
        code = member!.referral_code
      }
      const linkTo = picked?.record_type === 'client' ? picked.id : undefined
      const r = await tools.call('sales.enquiry.capture', {
        first_names: first, surname, phone: (typed ? phoneIn(typed) : null) ?? p.phone ?? undefined, email: (typed ? emailIn(typed) : null) ?? p.email ?? undefined,
        interest: p.interest ?? undefined, note: stripChips(step.clause), referral_code: code ?? undefined, link_person_id: linkTo,
        force_new: values.force === 'true', idempotency_key: key, copilot: input.copilot,
      })
      if (!r.ok) return fail('sales.enquiry.capture', r.error)
      const d = r.data as Record<string, unknown> & { person?: SalesPersonJson; choices?: unknown[] }
      if (d.outcome === 'needs_input') {
        return { ...base, ...stamp, job: 'sales.enquiry.capture', status: 'needs_choice', title: 'Already in the brokerage?', summary: String(d.summary), choice_kind: 'record',
          choices: asEntityList(d.choices, category), input: { field: 'force', label: 'This is a new person: load the prospect anyway', kind: 'confirm' } }
      }
      if (d.person) context.person = personRef(d.person, category)
      context.offer = null
      return {
        ...base, ...stamp, job: 'sales.enquiry.capture', status: 'saved', title: d.linked_existing ? 'Enquiry linked' : 'Prospect loaded', subject: context.person ?? null, data: d,
        receipt: receiptOf(d, String(d.open_path ?? BOOK_PATH)), summary: `${String(d.summary)}${done(d)}.`,
        links: [{ label: 'Open client', to: String(d.open_path ?? BOOK_PATH) }, { label: 'Open my workspace', to: BOOK_PATH }],
      }
    }

    case 'sales_prepare_offer': {
      const subject = a.person ?? context.person ?? null
      if (!subject) {
        return { ...base, ...stamp, job: 'sales.offer.create', status: 'needs_input', title: 'Which client?', summary: 'Choose the client the offer is for. Type @ and a name or client number.', input: { field: 'subject', label: 'Client', placeholder: '@Thandi Customer or CL-S1001' } }
      }
      const typed = values.offer_details ? offerDetailsIn(values.offer_details) : null
      const r = await tools.call('sales.offer.create', {
        person_id: subject.id, quote_option_id: picked?.record_type === 'quote_option' ? picked.id : undefined,
        insurer_name: typed?.insurer_name ?? p.insurer_name ?? undefined, product: typed?.product ?? p.product ?? undefined,
        premium_amount: typed?.premium_amount ?? p.premium_amount ?? undefined, premium_frequency: typed?.premium_frequency ?? p.premium_frequency ?? undefined,
        idempotency_key: key, copilot: input.copilot,
      })
      if (!r.ok) return fail('sales.offer.create', r.error)
      const d = r.data as Record<string, unknown> & { choices?: Array<Record<string, unknown>>; message?: { text: string; phone?: string | null } }
      if (d.outcome === 'needs_input') {
        const choices = (d.choices ?? []).map((c) => ({
          record_type: 'quote_option' as const, id: String(c.id), number: (c.number as string) ?? null, name: String(c.name), category,
          detail: String(c.detail ?? ''), open_path: (c.open_path as string) ?? null,
        }))
        return {
          ...base, ...stamp, job: 'sales.offer.create', status: choices.length ? 'needs_choice' : 'needs_input', title: choices.length ? 'Which quote?' : 'Offer details',
          subject, summary: String(d.summary), choice_kind: 'record', choices,
          input: { field: 'offer_details', label: choices.length ? 'Or capture insurer, product, premium and frequency' : 'Insurer, product, premium and frequency', placeholder: 'Santam, motor, R865.50 monthly' },
        }
      }
      const res = offerSaved('sales.offer.create', d, 'Offer prepared', subject)
      const text = d.message?.text ?? ''
      res.summary = `${res.summary} The customer message is ready to copy or send; I have not marked it as sent.`
      res.links = [
        ...res.links,
        { label: 'Copy customer message', to: res.links[0].to, copy: text },
        { label: 'Open WhatsApp', to: whatsappUrl(text, d.message?.phone) },
      ]
      return res
    }

    case 'sales_offer_sent':
    case 'sales_accept':
    case 'sales_sale': {
      const { offer, person, result } = await resolveOffer()
      if (result) return result
      if (step.intent === 'sales_offer_sent') {
        const r = await tools.call('sales.offer.sent', { offer_id: offer!.id, channel: p.channel ?? 'whatsapp', idempotency_key: key, copilot: input.copilot })
        return r.ok ? offerSaved('sales.offer.sent', r.data as Record<string, unknown>, 'Offer logged as sent', person) : fail('sales.offer.sent', r.error)
      }
      if (step.intent === 'sales_accept') {
        const r = await tools.call('sales.offer.accept', { offer_id: offer!.id, accepted_on: (p.accepted_on as string | null) ?? undefined, idempotency_key: key, copilot: input.copilot })
        return r.ok ? offerSaved('sales.offer.accept', r.data as Record<string, unknown>, 'Acceptance recorded', person) : fail('sales.offer.accept', r.error)
      }
      const answer = values.sale_details ?? ''
      const reference = insurerReferenceIn(answer) ?? (answer && !/\d{4}-\d{2}-\d{2}/.test(answer.split(',')[0]) ? answer.split(',')[0].trim() || null : null) ?? (p.insurer_reference as string | null)
      const start = startDateIn(answer) ?? (p.cover_start_date as string | null)
      if (!reference || !start) {
        return {
          ...base, ...stamp, job: 'sales.sale.record', status: 'needs_input', title: 'Confirmation details', subject: person ?? null,
          summary: `To record the sale on ${offer!.reference}, give the insurer’s policy or confirmation reference and the cover start date${reference ? ` (reference ${reference} noted)` : ''}.`,
          input: { field: 'sale_details', label: 'Reference and start date', placeholder: 'SAN-MV-778812, starting 2026-12-01' },
        }
      }
      const r = await tools.call('sales.sale.record', { offer_id: offer!.id, insurer_reference: reference, cover_start_date: start, idempotency_key: key, copilot: input.copilot })
      if (!r.ok) return fail('sales.sale.record', r.error)
      const res = offerSaved('sales.sale.record', r.data as Record<string, unknown>, (r.data as { already_recorded?: boolean }).already_recorded ? 'Sale already recorded' : 'Sale recorded', person)
      res.links.push({ label: 'Open my workspace', to: BOOK_PATH })
      return res
    }

    case 'sales_book': {
      let member: MemberRef | undefined
      if (p.member && p.member !== 'me') {
        const found = await findMember(p.member)
        if (found.result) return found.result
        member = found.member
      }
      const r = await tools.call('sales.book.grid', { scope: p.member === 'me' ? 'mine' : 'team', member_id: member?.member_id })
      if (!r.ok) return fail('sales.book.grid', r.error)
      const d = r.data as { rows: Array<{ name: string; client_number: string; stage: string }>; totals: Record<string, number> }
      if (member) context.member = member
      const who = member ? ` referred to or assigned to ${member.name}` : p.member === 'me' ? ' assigned to you' : ' in your team view'
      const t = d.totals ?? {}
      return {
        ...base, ...stamp, job: 'sales.book.grid', status: 'retrieved', title: member ? `${member.name.split(' ')[0]}’s referrals and sales` : 'Client grid', data: d,
        summary: d.rows.length
          ? `${d.rows.length} ${cat} client${d.rows.length === 1 ? '' : 's'}${who}: ${t.new_enquiry ?? 0} new enquir${t.new_enquiry === 1 ? 'y' : 'ies'}, ${t.offer_sent ?? 0} offer sent, ${t.accepted ?? 0} accepted, ${t.sold ?? 0} sold. Open any row for its offers and communications.`
          : `No ${cat} clients${who} yet.`,
        links: [{ label: 'Open in my workspace', to: member ? `${BOOK_PATH}?member=${member.member_id}` : p.member === 'me' ? `${BOOK_PATH}?scope=mine` : BOOK_PATH }],
      }
    }
  }
  return fail(null, { code: 'failed', message: 'Unsupported sales request.' })
}
