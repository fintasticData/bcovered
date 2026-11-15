// The research steps behind a lead search: read the broker's request, research the area, find candidate businesses and
// verify each one against its own public pages. Models suggest; the code only keeps what the fetched pages show.
import { chat, MODELS } from './fal.ts'
import { contactLinks, fetchPage, hostOf, quoteAppears, type Page } from './fetchPage.ts'
import {
  AreaFinding, AreaResearch, Candidate, Lead, ParsedFilters, Verification, parseJsonObject,
  type Candidate as CandidateT, type Filters, type Lead as LeadT, type ParsedFilters as ParsedFiltersT,
} from './schema.ts'

export interface Spend {
  cost_usd: number
  searches: number
  pages: number
}

const describe = (f: Filters) =>
  [
    `Area: ${f.area}${f.radius_km ? ` (within ${f.radius_km} km)` : ''}`,
    f.business_function ? `Business function (what the business does): ${f.business_function}` : null,
    f.category ? `Business category: ${f.category}` : null,
    f.industry ? `Industry (wider sector): ${f.industry}` : null,
    `Cover the broker wants to offer: ${f.cover_type}`,
  ].filter(Boolean).join('\n')

export const areaTokens = (area: string) =>
  area.split(/[,/]| near | in /i).map((s) => s.trim()).filter((s) => s.length >= 3)

// ------------------------------------------------------------------ 1. Read the request
const PARSE_SYSTEM = [
  "You extract a broker's lead-search request into JSON for a South African insurance brokerage.",
  'Fields: area (place to search, keep landmark and town, e.g. "Carnival City, Brakpan"), radius_km (number or null),',
  'business_function (the activity the businesses perform, e.g. "Vehicle repair"), category (the kind of business, e.g. "Workshop"),',
  'industry (the wider sector, e.g. "Automotive"), cover_type (the insurance cover the broker wants to offer, e.g. "Commercial property"),',
  'requested_count (integer number of leads asked for, or null).',
  'Keep business_function distinct from industry: the function narrows a wider industry. Use null for anything the request does not state or clearly imply.',
  'Respond with JSON only.',
].join(' ')

export function fallbackParse(text: string): ParsedFiltersT {
  const t = text.replace(/\s+/g, ' ')
  const count = t.match(/\b(?:find|get|generate|source|give me)\s+(\d{1,3})\b/i)?.[1] ?? t.match(/\b(\d{1,3})\s+(?:leads?|prospects?|businesses|companies)\b/i)?.[1]
  const radius = t.match(/(\d+(?:\.\d+)?)\s*km\b/i)?.[1]
  const area = t.match(/\b(?:km|kilometres?)\s+(?:of|from|around)\s+([^.]+?)(?:,?\s+with\b|\.|$)/i)?.[1] ?? t.match(/\b(?:in|near|around)\s+([A-Z][^.]+?)(?:,?\s+with\b|\.|$)/)?.[1]
  const cover = t.match(/\bfor\s+([a-z ]+?)\s+(?:cover|insurance)\b/i)?.[1]
  const fn = t.match(/\b(?:find|get|source)\s+(?:\d+\s+)?([a-z ]+?)\s+(?:within|in|near|around)\b/i)?.[1]
  return ParsedFilters.parse({
    area: area?.trim() ?? null,
    radius_km: radius ? Number(radius) : null,
    business_function: fn?.trim() ?? null,
    category: null,
    industry: null,
    cover_type: cover ? cover.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    requested_count: count ? Math.min(50, Number(count)) : null,
  })
}

export async function parseRequest(text: string): Promise<{ filters: ParsedFiltersT; cost_usd: number; source: 'model' | 'rules' }> {
  try {
    const r = await chat({ model: MODELS.reader, system: PARSE_SYSTEM, user: text.slice(0, 2000), maxTokens: 300, json: true, tag: 'leadgen-parse' })
    const parsed = ParsedFilters.safeParse(parseJsonObject(r.content))
    if (parsed.success && parsed.data.area) return { filters: parsed.data, cost_usd: r.cost_usd, source: 'model' }
  } catch {
    /* fall through to the rule parser */
  }
  return { filters: fallbackParse(text), cost_usd: 0, source: 'rules' }
}

// ------------------------------------------------------------------ 2. Area research
const AREA_SYSTEM = [
  'You research local business conditions for a South African insurance broker. Use current web sources.',
  'Return JSON only: {"findings":[{"finding":string,"relevance_to_cover":string,"source_url":string,"published_on":"YYYY-MM-DD"|null}],',
  '"localities":[string],"summary":string}.',
  'findings: 4 to 8 area-wide observations (local business activity, crime, weather, infrastructure, load-shedding, flooding, economic or industry trends) that matter for the requested cover.',
  'Each finding must come from one specific source page you cite; give that page URL in source_url and its publication date if shown.',
  'Do not describe individual businesses. localities: suburbs and towns inside the requested radius. summary: 2 to 3 sentences.',
].join(' ')

const normUrl = (u: string) => u.trim().replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase()

export async function researchArea(f: Filters, spend: Spend) {
  const r = await chat({ model: MODELS.area, system: AREA_SYSTEM, user: describe(f), maxTokens: 1400, search: true, tag: 'leadgen-area' })
  spend.cost_usd += r.cost_usd
  spend.searches += 1
  const parsed = AreaResearch.safeParse(parseJsonObject(r.content))
  const cited = new Set(r.citations.map(normUrl))
  const findings = (parsed.success ? parsed.data.findings : [])
    .map((x) => AreaFinding.safeParse(x))
    .filter((x) => x.success)
    .map((x) => x.data!)
    .filter((x) => !cited.size || cited.has(normUrl(x.source_url)))
  const localities = [...new Set([...areaTokens(f.area), ...(parsed.success ? parsed.data.localities : [])].map((s) => s.trim()))].slice(0, 40)
  return { findings, localities, summary: parsed.success ? parsed.data.summary : null, citations: r.citations.slice(0, 30) }
}

// ------------------------------------------------------------------ 3. Discovery
const DISCOVER_SYSTEM = [
  'You find real, currently operating businesses for a South African insurance broker, using live web search.',
  'Return JSON only: {"candidates":[{"business_name":string,"website":string|null,"source_url":string,"locality":string|null,"address":string|null}]}.',
  "List only businesses that have their own website with contact details. website is the business's own domain (never a directory, marketplace, PDF, Facebook or LinkedIn page).",
  'source_url is the page where you found the business. Only list businesses located in the requested area and matching the business function.',
  'Never invent websites or addresses; use null when unknown.',
].join(' ')

/** Directories, social networks and documents: never a business's own site, and rarely worth a page read. */
const NOT_OWN_SITE = /(^|\.)(linkedin|facebook|instagram|twitter|x|tiktok|youtube|yellowpages|sayellow|goafricaonline|mechanicbuddy|fixmyride|junkmail|gumtree|snupit|cylex|brabys|hellopeter|infobel|yelp|tripadvisor|google|wikipedia|bizcommunity|cybo|zaubee|showme|locanto|autotrader|cars|carmag)\.[a-z.]+$/i
const DOCUMENT = /\.(pdf|docx?|xlsx?|pptx?)(\?|$)/i

export function normaliseCandidate(c: CandidateT): CandidateT | null {
  const ownLike = (u: string | null) => {
    const host = hostOf(u)
    return Boolean(u && host && !NOT_OWN_SITE.test(host) && !DOCUMENT.test(u))
  }
  const website = ownLike(c.website) ? c.website : null
  const listing = c.source_url && !DOCUMENT.test(c.source_url) && !/(^|\.)(linkedin|facebook|instagram)\./i.test(hostOf(c.source_url) ?? '') ? c.source_url : null
  const source = listing ?? (c.website && !website && !DOCUMENT.test(c.website) ? c.website : null)
  if (!website && !source) return null
  return { ...c, website, source_url: source }
}

/** Each search looks somewhere new, so repeated searches do not return the same handful of businesses. */
const ANGLES = [
  'the best-known businesses',
  'smaller independent businesses with their own websites',
  'businesses listed in local business directories or chamber of commerce listings',
  'specialist businesses within the business function',
  'businesses in industrial parks and business parks',
]

export async function discover(f: Filters, localities: string[], exclude: string[], want: number, spend: Spend, round = 0): Promise<CandidateT[]> {
  const focus = localities.length ? localities[round % localities.length] : null
  const user = [
    describe(f),
    localities.length ? `Places within the radius: ${localities.slice(0, 25).join(', ')}` : null,
    focus ? `Focus this search on ${focus}.` : null,
    `Search angle: ${ANGLES[round % ANGLES.length]}.`,
    `Find up to ${want} different businesses.`,
    exclude.length ? `Do not repeat these (already checked): ${exclude.slice(-60).join('; ')}` : null,
  ].filter(Boolean).join('\n')
  const r = await chat({ model: MODELS.search, system: DISCOVER_SYSTEM, user, maxTokens: 1600, search: true, tag: 'leadgen-discover' })
  spend.cost_usd += r.cost_usd
  spend.searches += 1
  const raw = parseJsonObject(r.content) as { candidates?: unknown[] } | null
  return (Array.isArray(raw?.candidates) ? raw!.candidates : [])
    .map((c) => Candidate.safeParse(c))
    .filter((c) => c.success)
    .map((c) => normaliseCandidate(c.data!))
    .filter((c): c is CandidateT => c !== null)
    .sort((a, b) => Number(Boolean(b.website)) - Number(Boolean(a.website)))
}

// ------------------------------------------------------------------ 4. Verification
const VERIFY_SYSTEM = [
  'You check whether one business qualifies as a lead for a South African insurance broker, using ONLY the page texts provided.',
  'Return JSON only with: matches_filters (boolean), reason (why not, if false), business_name (as published), email (must be copied exactly from the provided emails list),',
  'email_source_url, address (as published), locality (suburb or town from the address), location_quote (exact text copied from a page that shows the address or locality),',
  'location_source_url, business_function (the activity the pages show), activity_quote (exact text copied from a page showing that activity), activity_source_url,',
  'category, industry, phone, cover_fit (one or two sentences: why the requested cover fits, grounded only in the observed activity).',
  'matches_filters is true only if the pages show the business performs the requested business function and is located in the requested area.',
  'Never infer assets, current insurance or purchasing intent. Quotes must be verbatim substrings of the page text.',
].join(' ')

export interface Verified {
  lead: LeadT | null
  reason: string | null
}

const nameWords = (name: string) =>
  name.toLowerCase().replace(/\(pty\)|\bltd\b|\bcc\b|\binc\b|\bthe\b|\band\b/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length >= 3)

const nameAppears = (name: string, text: string) => {
  const words = nameWords(name)
  const t = text.toLowerCase()
  return words.length > 0 && words.filter((w) => t.includes(w)).length >= Math.ceil(words.length * 0.6)
}

const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|me|mweb|telkomsa|vodamail|iafrica|webmail|absamail|lantic|global|wol|polka|netactive|xsinet|afrihost|cybersmart|axxess)\./i

/**
 * Whether a published email is this business's address rather than a web designer's, a group's or a neighbouring
 * listing's: on the business's own site it must use the site's domain, a personal mailbox or a domain that shares the
 * business's name; on any other page it must sit right next to the business's name.
 */
export function emailBelongs(email: string, page: Page, ownHost: string | null, businessName: string) {
  const domain = email.split('@')[1] ?? ''
  const onOwnSite = ownHost !== null && hostOf(page.final_url) === ownHost
  if (onOwnSite) {
    if (domain === ownHost || domain.endsWith(`.${ownHost}`) || ownHost.endsWith(`.${domain}`)) return true
    if (FREE_MAIL.test(email)) return true
    const label = domain.split('.')[0]
    return nameWords(businessName).some((w) => label.includes(w)) || (ownHost.split('.')[0].length >= 4 && label.includes(ownHost.split('.')[0]))
  }
  const text = page.text.toLowerCase()
  const at = text.indexOf(email)
  if (at < 0) return false
  const window = text.slice(Math.max(0, at - 500), at + 200)
  const words = nameWords(businessName)
  return words.length > 0 && words.filter((w) => window.includes(w)).length >= Math.ceil(words.length * 0.6)
}

export async function verifyCandidate(
  c: CandidateT,
  f: Filters,
  localities: string[],
  pagesLeft: number,
  spend: Spend,
): Promise<Verified> {
  const pages: Page[] = []
  const fetchOne = async (url: string | null) => {
    if (!url || pages.length >= pagesLeft || pages.some((p) => p.url === url || p.final_url === url)) return null
    spend.pages += 1
    const p = await fetchPage(url)
    if (p) pages.push(p)
    return p
  }

  const home = await fetchOne(c.website)
  if (home) for (const link of contactLinks(home, 2)) await fetchOne(link)
  const ownHost = hostOf(home?.final_url ?? c.website)
  const ownPages = pages.filter((p) => hostOf(p.final_url) === ownHost)
  const ownEmail = ownPages.some((p) => p.emails.some((e) => emailBelongs(e, p, ownHost, c.business_name)))
  if (!ownEmail && c.source_url && hostOf(c.source_url) !== ownHost) {
    const listing = await fetchOne(c.source_url)
    if (listing && !nameAppears(c.business_name, listing.text)) pages.splice(pages.indexOf(listing), 1)
  }
  if (!pages.length) return { lead: null, reason: 'No public page could be retrieved' }

  // Every email a page shows, with the page that shows it; the business's own site first.
  const emailPages = new Map<string, string>()
  let foreign = 0
  for (const p of [...pages].sort((a, b) => Number(hostOf(b.final_url) === ownHost) - Number(hostOf(a.final_url) === ownHost))) {
    for (const e of p.emails) {
      if (emailPages.has(e)) continue
      if (emailBelongs(e, p, ownHost, c.business_name)) emailPages.set(e, p.final_url)
      else foreign++
    }
  }
  if (!emailPages.size) {
    return { lead: null, reason: foreign ? 'The emails on its pages belong to another organisation' : 'No email is published on its pages' }
  }

  const budget = 16_000
  const per = Math.floor(budget / pages.length)
  const user = JSON.stringify({
    request: { area: f.area, radius_km: f.radius_km, places_within_radius: localities.slice(0, 25), business_function: f.business_function, category: f.category, industry: f.industry, cover_type: f.cover_type },
    candidate: { business_name: c.business_name, website: c.website },
    emails: [...emailPages].map(([email, url]) => ({ email, page: url })),
    pages: pages.map((p) => ({ url: p.final_url, title: p.title, text: p.text.slice(0, per) })),
  })
  const r = await chat({ model: MODELS.reader, system: VERIFY_SYSTEM, user, maxTokens: 700, json: true, tag: 'leadgen-verify' })
  spend.cost_usd += r.cost_usd
  const v = Verification.safeParse(parseJsonObject(r.content))
  if (!v.success) return { lead: null, reason: 'The page reading could not be validated' }
  const x = v.data
  if (!x.matches_filters) return { lead: null, reason: x.reason ?? 'Does not match the requested business function or area' }

  // Grounding checks: nothing is kept unless the fetched pages show it.
  const chosen = x.email && emailPages.has(x.email) ? x.email : [...emailPages.keys()].find((e) => ownHost && e.endsWith(`@${ownHost}`)) ?? [...emailPages.keys()][0]
  const emailUrl = emailPages.get(chosen)!
  const pageWith = (quote: string | null, preferred: string | null) =>
    [...pages].sort((a, b) => Number(b.final_url === preferred) - Number(a.final_url === preferred)).find((p) => quoteAppears(quote, p.text)) ?? null
  const activityPage = pageWith(x.activity_quote, x.activity_source_url)
  if (!activityPage || !x.business_function) return { lead: null, reason: 'The business activity is not shown on its pages' }
  const locationPage = pageWith(x.location_quote, x.location_source_url)
  if (!locationPage) return { lead: null, reason: 'The location is not shown on its pages' }
  const where = `${x.location_quote} ${x.address ?? ''}`.toLowerCase()
  const listed = localities.find((l) => where.includes(l.toLowerCase()))
  const named = areaTokens(f.area).find((l) => where.includes(l.toLowerCase()))
  if (!listed && !named) return { lead: null, reason: 'The published location is outside the requested area' }

  const lead = Lead.safeParse({
    business_name: x.business_name ?? c.business_name,
    email: chosen,
    area: x.locality && where.includes(x.locality.toLowerCase()) ? x.locality : (listed ?? named),
    address: x.address,
    website: home?.final_url ?? c.website,
    phone: x.phone,
    business_function: x.business_function,
    category: x.category ?? f.category,
    industry: x.industry ?? f.industry,
    cover_fit: x.cover_fit ?? `Observed activity: ${x.business_function}.`,
    email_source_url: emailUrl,
    location_source_url: locationPage.final_url,
    activity_source_url: activityPage.final_url,
    activity_quote: x.activity_quote,
    location_basis: listed ? 'locality_match' : 'area_named',
    retrieved_at: pages.find((p) => p.final_url === emailUrl)?.retrieved_at ?? new Date().toISOString(),
    research: {
      observed_activity: x.activity_quote,
      location_quote: x.location_quote,
      assets: 'unknown',
      current_insurance: 'unknown',
      purchasing_intent: 'unknown',
      candidate_source_url: c.source_url,
    },
  })
  if (!lead.success) return { lead: null, reason: 'The verified details were incomplete' }
  return { lead: lead.data, reason: null }
}
