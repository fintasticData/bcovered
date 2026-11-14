// Russ and the franchise sales channel. Fixed rules turn a broker's message into franchise jobs on the bcovered-mcp server:
// set up a franchisee and outlet with its routing, list franchise enquiries (for example the ones nobody has contacted), and
// show outlet sales or performance for a period. Results use the planner's turn and step shapes.
// No imports, so the copilot-agent Edge Function and Vitest share this file.

type Category = 'sample' | 'live'
type CopilotId = 'ar' | 'ava' | 'russ'
type Outcome = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }

export type FranchiseIntent = 'franchise_setup' | 'franchise_enquiries' | 'franchise_sales'

export interface FranchiseTools {
  call(name: string, args: Record<string, unknown>): Promise<Outcome>
}

interface Choice {
  record_type: string
  id: string
  number: string | null
  name: string
  category: Category
  detail?: string | null
  open_path?: string | null
}

export interface FranchiseTurnInput {
  copilot: CopilotId
  category: Category
  text: string
  conversation_id: string
  message_id: string
  steps?: Record<number, { values?: Record<string, string>; choice?: Choice | Record<string, unknown> | null }>
  context?: Record<string, unknown>
  origin?: string
}

interface Link {
  label: string
  to: string
  copy?: string
}

export interface FranchiseStep {
  index: number
  clause: string
  intent: FranchiseIntent
  job: string | null
  handled_by: 'russ'
  handed_off: boolean
  status: 'saved' | 'retrieved' | 'needs_choice' | 'needs_input' | 'failed' | 'refused'
  title: string
  summary: string
  category: Category
  subject?: null
  data?: unknown
  receipt?: { reference: string; record_type: string; summary: string; open_path: string; replayed: boolean; category: Category } | null
  choice_kind?: 'record'
  choices?: Choice[]
  input?: { field: string; label: string; placeholder?: string }
  error?: { code: string; message: string } | null
  links: Link[]
}

export const FRANCHISE_PATH = '/broker/franchise'

// ------------------------------------------------------------------ Rules

const SETUP = [
  /\b(set ?up|register|onboard|add|create|open|reopen|sign up)\b[^.]*\bfranchis(?:e|ee|ees)\b/i,
  /\badd\b[^.]*\b(outlet|branch|store|location|dealership)\b[^.]*\b(to|for|under)\b/i,
]
const SALES = [
  /\b(which|what)\s+outlets?\b/i,
  /\boutlets?\b[^.]*\b(sales|sold|sell|brought|bring|produc\w*|perform\w*|conver\w*)\b/i,
  /\bfranchis\w*\b[^.]*\b(sales|sold|perform\w*|conver\w*)\b/i,
]
const ENQUIRIES = [/\b(franchise|outlet)s?\b[^.]*\b(enquir(?:y|ies)|leads|referrals)\b/i, /\b(enquir(?:y|ies)|leads|referrals)\b[^.]*\b(franchise|outlet)s?\b/i]

export function franchiseIntentOf(text: string): FranchiseIntent | null {
  const t = text.trim()
  if (SETUP.some((re) => re.test(t))) return 'franchise_setup'
  if (ENQUIRIES.some((re) => re.test(t)) && !/\b(which|what)\s+outlets?\b/i.test(t)) return 'franchise_enquiries'
  if (SALES.some((re) => re.test(t))) return 'franchise_sales'
  return null
}

const NAME = "[A-Z][A-Za-z0-9&'’.\\-]*(?:\\s+(?:[A-Z][A-Za-z0-9&'’.\\-]*|&|and|of|de|van|du))*"
/** Case-insensitive keywords in front of a case-sensitive name pattern. */
const ci = (words: string) => words.split('|').map((w) => w.replace(/[a-z]/gi, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`)).join('|')
const clean = (s: string | undefined | null) => {
  const v = (s ?? '').replace(/[.,;:!?]+$/, '').replace(/['’]s$/, '').replace(/\s+(?:and|of|de|van|du|&)$/i, '').trim()
  return v.length >= 2 ? v : null
}
export const emailOf = (t: string) => t.match(/[^\s@,;<>()]+@[^\s@,;<>()]+\.[A-Za-z]{2,}/)?.[0] ?? null
export const phoneOf = (t: string) => t.match(/(?:\+?27|\b0)(?:[\s-]?\d){9}\b/)?.[0]?.trim() ?? null

export interface SetupParams {
  partner_name: string | null
  outlet_name: string | null
  service_area: string | null
  receiving: string | null
  sales_mode: 'refer' | 'sell' | null
  manager_name: string | null
  manager_email: string | null
  manager_phone: string | null
}

export function franchiseSetupParams(text: string): SetupParams {
  const t = text.trim()
  const PLACE = 'outlet|branch|store|location|dealership'
  const addTo = t.match(new RegExp(`\\b(?:${ci('add')})\\s+(?:an?\\s+|the\\s+|another\\s+|its\\s+)?(${NAME})\\s+(${PLACE})\\s+(?:to|for|under)\\s+(${NAME})`))
  const partner =
    clean(t.match(new RegExp(`\\b(?:${ci('set up|setup|register|onboard|create|add|sign up')})\\s+(${NAME})\\s+as\\s+(?:a\\s+|an\\s+|our\\s+|the\\s+)?(?:new\\s+)?${ci('franchis')}`))?.[1]) ??
    clean(t.match(new RegExp(`\\b${ci('franchisee')}\\s+(?:called\\s+|named\\s+)?(${NAME})`))?.[1]) ??
    clean(addTo?.[3])
  const its = t.match(new RegExp(`\\b(?:${ci('add|with|and|plus')})\\s+(?:its|their|the|an?|one)\\s+(${NAME})\\s+(${PLACE})\\b`))
  const called = t.match(new RegExp(`\\b(?:${PLACE})\\s+(?:called|named)\\s+(${NAME})`))
  const inArea = t.match(new RegExp(`\\b(?:${PLACE})\\s+(?:in|at)\\s+(${NAME})`))
  const stem = clean(addTo?.[1]) ?? clean(its?.[1]) ?? clean(inArea?.[1])
  const kind = (addTo?.[2] ?? its?.[2] ?? 'outlet').toLowerCase()
  const outlet = clean(called?.[1]) ?? (stem ? (new RegExp(`\\b(${PLACE})$`, 'i').test(stem) ? stem : `${stem} ${kind}`) : null)
  const area = clean(t.match(new RegExp(`\\b(?:covering|serving|service area)\\s+(${NAME})`))?.[1]) ?? clean(inArea?.[1]) ?? stem
  const receiving = clean(
    t.match(new RegExp(`\\b(?:${ci('route|send|assign|direct|forward|give')})\\b[^.]*?\\bto\\s+(${NAME})`))?.[1]?.split(/\s+/).slice(0, 2).join(' '),
  )
  const manager =
    clean(t.match(new RegExp(`\\b${ci('invite')}\\s+(${NAME})\\s+as\\s+(?:the\\s+|its\\s+)?(?:outlet\\s+)?manager`))?.[1]) ??
    clean(t.match(new RegExp(`\\b(?:manager|managed by)\\s+(?:is\\s+)?(${NAME})`))?.[1])
  const sales_mode = /\bsells?\s+(?:at|in)\s+(?:the\s+)?outlet\b|\bsell(?:s|ing)?\s+(?:themselves|directly|on site)\b|\bsell at outlet\b/i.test(t)
    ? 'sell'
    : /\brefers?\s+(?:to\s+)?(?:the\s+|a\s+)?broker\b|\brefer(?:ral)? only\b/i.test(t)
      ? 'refer'
      : null
  return {
    partner_name: partner,
    outlet_name: outlet,
    service_area: area,
    receiving: receiving && partner && receiving === partner ? null : receiving,
    sales_mode,
    manager_name: manager,
    manager_email: manager || /\bmanager\b/i.test(t) ? emailOf(t) : null,
    manager_phone: manager ? phoneOf(t) : null,
  }
}

export function enquiryStatusIn(text: string): 'uncontacted' | 'contacted' | 'offered' | 'sold' | null {
  const t = text.toLowerCase()
  if (/\b(nobody|no one|no-one|not|never|un)\b[^.]*\bcontacted\b|\buncontacted\b|\b(haven'?t|hasn'?t|have not|has not) been (contacted|called)\b|\bwaiting for (a )?(call|contact)\b|\bnot yet called\b/.test(t)) {
    return 'uncontacted'
  }
  if (/\b(sold|converted|closed)\b/.test(t)) return 'sold'
  if (/\b(offered|offer sent|with an offer)\b/.test(t)) return 'offered'
  if (/\bcontacted\b/.test(t)) return 'contacted'
  return null
}

/** Period in South African dates: this month (default), last month, this week, today, this year, last N days. */
export function periodIn(text: string, now = new Date()): { from: string; to: string; label: string } {
  const sa = new Date(now.getTime() + 2 * 3_600_000)
  const y = sa.getUTCFullYear()
  const m = sa.getUTCMonth()
  const d = sa.getUTCDate()
  const iso = (dt: Date) => dt.toISOString().slice(0, 10)
  const day = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd))
  const t = text.toLowerCase()
  if (/\blast month\b/.test(t)) return { from: iso(day(y, m - 1, 1)), to: iso(day(y, m, 0)), label: 'last month' }
  if (/\btoday\b/.test(t)) return { from: iso(day(y, m, d)), to: iso(day(y, m, d)), label: 'today' }
  if (/\bthis week\b/.test(t)) {
    const back = (sa.getUTCDay() + 6) % 7
    return { from: iso(day(y, m, d - back)), to: iso(day(y, m, d)), label: 'this week' }
  }
  if (/\b(this year|year to date|ytd)\b/.test(t)) return { from: iso(day(y, 0, 1)), to: iso(day(y, m, d)), label: 'this year' }
  const lastN = t.match(/\blast (\d{1,3}) days\b/)
  if (lastN) return { from: iso(day(y, m, d - Number(lastN[1]) + 1)), to: iso(day(y, m, d)), label: `the last ${lastN[1]} days` }
  return { from: iso(day(y, m, 1)), to: iso(day(y, m, d)), label: 'this month' }
}

// ------------------------------------------------------------------ Execution

const when = (iso: string) => {
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const pct = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? `${Math.round(Number(v) * 100)}%` : '–')

interface Member {
  member_id?: string
  id?: string
  name: string
  referral_code?: string
  number?: string | null
  detail?: string | null
}

export async function runFranchiseTurn(input: FranchiseTurnInput, tools: FranchiseTools) {
  const intent = franchiseIntentOf(input.text) ?? 'franchise_sales'
  const step = await runFranchiseStep(intent, input, tools)
  return { copilot: input.copilot, category: input.category, reply: step.summary, steps: [step], context: input.context ?? {} }
}

export async function runFranchiseStep(intent: FranchiseIntent, input: FranchiseTurnInput, tools: FranchiseTools): Promise<FranchiseStep> {
  const { category } = input
  const cat = category === 'live' ? 'Live' : 'Sample'
  const values = input.steps?.[0]?.values ?? {}
  const rawChoice = input.steps?.[0]?.choice
  const choice = rawChoice && typeof rawChoice === 'object' && 'record_type' in rawChoice ? (rawChoice as Choice) : null
  const key = `${input.conversation_id}:${input.message_id}:0`
  const abs = (path: string) => `${(input.origin ?? '').replace(/\/$/, '')}${path}`
  const base = {
    index: 0, clause: input.text.trim(), intent, handled_by: 'russ' as const, handed_off: input.copilot === 'ava', category, links: [] as Link[],
  }
  const fail = (job: string | null, error: { code: string; message: string }, title = 'Not completed'): FranchiseStep => ({
    ...base, job, title, error, summary: error.message,
    status: error.code === 'forbidden' || error.code === 'category_mismatch' ? 'refused' : error.code === 'needs_input' ? 'needs_input' : 'failed',
  })

  if (intent === 'franchise_setup') {
    const p = franchiseSetupParams(input.text)
    const partner = values.partner_name?.trim() || p.partner_name
    if (!partner) {
      return {
        ...base, job: 'franchise.setup', status: 'needs_input', title: 'Which franchisee?', summary: 'Give the franchisee’s business name, for example “Benoni Motors”.',
        input: { field: 'partner_name', label: 'Franchisee name', placeholder: 'e.g. Benoni Motors' },
      }
    }
    const receivingName = values.receiving?.trim() || p.receiving
    const r = await tools.call('franchise.setup', {
      partner_name: partner,
      outlet_name: values.outlet_name?.trim() || p.outlet_name || undefined,
      service_area: p.service_area ?? undefined,
      receiving_member_id: choice?.record_type === 'team_member' ? choice.id : undefined,
      receiving_member_name: choice?.record_type === 'team_member' ? undefined : receivingName ?? undefined,
      sales_mode: p.sales_mode ?? undefined,
      manager_name: p.manager_name ?? undefined,
      manager_email: p.manager_email ?? undefined,
      manager_phone: p.manager_phone ?? undefined,
      idempotency_key: key,
      copilot: 'russ',
    })
    if (!r.ok) {
      if (r.error.code === 'needs_input' && /receive enquiries/i.test(r.error.message)) {
        return { ...fail('franchise.setup', r.error, 'Who receives the enquiries?'), input: { field: 'receiving', label: 'Receiving broker', placeholder: 'e.g. Lerato' } }
      }
      if (r.error.code === 'needs_input' && /team/i.test(r.error.message)) {
        return { ...fail('franchise.setup', r.error, 'Receiving broker not found'), input: { field: 'receiving', label: 'Receiving broker', placeholder: 'A name on your team' } }
      }
      return fail('franchise.setup', r.error)
    }
    const d = r.data as Record<string, unknown> & {
      outcome?: string; reason?: string; choices?: Member[]; summary?: string; replayed?: boolean; invite_path?: string | null
      outlet?: { id: string; label: string; referral_code: string; referral_path: string; receiving?: { name: string } | null }
    }
    if (d.outcome === 'needs_input' && d.reason === 'ambiguous_member') {
      return {
        ...base, job: 'franchise.setup', status: 'needs_choice', title: `Which “${receivingName}”?`, summary: String(d.summary), choice_kind: 'record',
        choices: (d.choices ?? []).map((m) => ({
          record_type: 'team_member', id: String(m.member_id ?? m.id), number: m.referral_code ?? m.number ?? null, name: m.name, category, detail: m.detail ?? null,
        })),
      }
    }
    if (d.outcome === 'needs_input') {
      return {
        ...base, job: 'franchise.setup', status: 'needs_input', title: 'Which outlet?', summary: String(d.summary),
        input: { field: 'outlet_name', label: 'Outlet name', placeholder: 'e.g. Benoni outlet' },
      }
    }
    const o = d.outlet!
    const link = abs(o.referral_path)
    const qr = `${FRANCHISE_PATH}?tab=franchisees&outlet=${o.id}&qr=1`
    return {
      ...base, job: 'franchise.setup', status: 'saved', title: d.created_partner ? 'Franchisee set up' : d.created_outlet ? 'Outlet added' : 'Franchisee reopened', data: d,
      receipt: { reference: o.referral_code, record_type: 'franchise_outlet', summary: String(d.summary), open_path: String(d.open_path ?? qr), replayed: Boolean(d.replayed), category },
      summary: `${String(d.summary)}${d.replayed ? ' (already saved; not repeated)' : ''}. Customer link: ${link}. Customers who scan the QR code see “${o.label}” before they submit.${d.invite_path ? ' The outlet manager’s private sign-in invitation is ready to send.' : ''}`,
      links: [
        { label: 'Copy customer link', to: o.referral_path, copy: link },
        { label: 'Download QR code', to: qr },
        { label: 'Share on WhatsApp', to: `https://wa.me/?text=${encodeURIComponent(`Need cover? Request a quote through ${o.label}: ${link}`)}` },
        ...(d.invite_path ? [{ label: 'Copy manager invitation', to: d.invite_path, copy: abs(d.invite_path) }] : []),
        { label: 'Open outlet', to: String(d.open_path ?? qr) },
      ],
    }
  }

  if (intent === 'franchise_enquiries') {
    const status = enquiryStatusIn(input.text)
    const r = await tools.call('franchise.enquiries.grid', { status: status ?? undefined, limit: 200 })
    if (!r.ok) return fail('franchise.enquiries.grid', r.error)
    const d = r.data as {
      rows: Array<{ reference: string; name: string; phone: string | null; received_at: string; client?: { client_number: string } | null; outlet: { label: string }; handler: { name: string } | null }>
      totals: Record<string, number>
    }
    const what = status === 'uncontacted' ? 'nobody has contacted yet' : status === 'contacted' ? 'contacted, awaiting an offer' : status === 'offered' ? 'with an offer sent' : status === 'sold' ? 'sold' : 'received'
    const listed = d.rows.slice(0, 3).map((x) => `${x.reference} ${x.name} (${x.client?.client_number ?? x.phone ?? 'no number'}) from ${x.outlet.label}, ${x.handler?.name ?? 'unassigned'}, received ${when(x.received_at)}`)
    const path = `${FRANCHISE_PATH}?tab=enquiries${status ? `&status=${status}` : ''}`
    return {
      ...base, job: 'franchise.enquiries.grid', status: 'retrieved', title: status === 'uncontacted' ? 'Franchise enquiries not yet contacted' : 'Franchise enquiries', data: { ...d, status },
      summary: d.rows.length
        ? `${plural(d.rows.length, `${cat} franchise enquiry`, `${cat} franchise enquiries`)} ${what}: ${listed.join('; ')}${d.rows.length > 3 ? '; …' : ''}. Open a row to log the call and set the follow-up.`
        : `No ${cat} franchise enquiries ${what}.`,
      links: [{ label: 'Open franchise enquiries', to: path }],
    }
  }

  const period = periodIn(input.text)
  const performance = /\b(perform\w*|conver\w*|enquir\w*|intake)\b/i.test(input.text) && !/\bsales\b/i.test(input.text)
  const liveHint = category === 'sample' ? ' Switch to Live for live totals.' : ''
  if (performance) {
    const r = await tools.call('franchise.performance', { from: period.from, to: period.to })
    if (!r.ok) return fail('franchise.performance', r.error)
    const d = r.data as { rows: Array<{ label: string; enquiries: number; sold: number; conversion: number | null }>; totals: { outlets: number; enquiries: number; offered: number; sold: number; conversion: number | null }; note?: string | null }
    const top = d.rows.filter((x) => x.enquiries > 0).slice(0, 3).map((x) => `${x.label}: ${x.sold}/${x.enquiries} (${pct(x.conversion)})`)
    return {
      ...base, job: 'franchise.performance', status: 'retrieved', title: `Outlet performance ${period.label}`, data: { ...d, period },
      summary: d.totals.enquiries
        ? `${plural(d.totals.enquiries, 'enquiry', 'enquiries')} received ${period.label} (${cat}) across ${plural(d.totals.outlets, 'outlet', 'outlets')}: ${d.totals.offered} offered, ${d.totals.sold} sold, ${pct(d.totals.conversion)} conversion. ${top.join('; ')}.${liveHint}`
        : `No ${cat} franchise enquiries received ${period.label}.${d.note ? ` ${d.note}` : liveHint}`,
      links: [{ label: 'Open outlet performance', to: `${FRANCHISE_PATH}?tab=outlets&from=${period.from}&to=${period.to}` }],
    }
  }
  const r = await tools.call('franchise.sales', { from: period.from, to: period.to })
  if (!r.ok) return fail('franchise.sales', r.error)
  const d = r.data as { by_outlet: Array<{ label: string; sales: number }>; totals: { sales: number; outlets: number }; note?: string | null }
  const by = d.by_outlet.slice(0, 5).map((x) => `${x.label} ${x.sales}`)
  return {
    ...base, job: 'franchise.sales', status: 'retrieved', title: `Sales by outlet ${period.label}`, data: { ...d, period },
    summary: d.totals.sales
      ? `${plural(d.totals.sales, 'confirmed sale', 'confirmed sales')} from ${plural(d.totals.outlets, 'outlet', 'outlets')} ${period.label} (${cat}, by sale date): ${by.join(', ')}. Select a total to see the sales with enquiry, client number and seller.${liveHint}`
      : `No ${cat} confirmed franchise sales ${period.label}.${d.note ? ` ${d.note}` : liveHint}`,
    links: [{ label: 'Open sales by outlet', to: `${FRANCHISE_PATH}?tab=outlets&view=sales&from=${period.from}&to=${period.to}` }],
  }
}
