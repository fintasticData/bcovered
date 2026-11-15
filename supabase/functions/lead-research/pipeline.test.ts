// Grounding rules for Russ "Generate leads": an email, activity or location is kept only when a fetched page shows it.
// Runs under vitest (npm test); fal and the network are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./fal.ts', () => ({
  chat: vi.fn(),
  MODELS: { reader: 'test/reader', area: 'test/area', search: 'test/search' },
  FalError: class extends Error {},
}))

import { chat } from './fal.ts'
import { extractEmails, htmlToText, quoteAppears, safeUrl, type Page } from './fetchPage.ts'
import { emailBelongs, fallbackParse, normaliseCandidate, verifyCandidate, type Spend } from './pipeline.ts'
import { Filters, Lead } from './schema.ts'

const chatMock = vi.mocked(chat)
const filters = Filters.parse({ area: 'Carnival City, Brakpan', radius_km: 10, business_function: 'Vehicle repair', category: 'Workshop', industry: 'Automotive', cover_type: 'Commercial property', requested_count: 20 })
const localities = ['Carnival City', 'Brakpan', 'Dalpark', 'Benoni']

const HOME = `<html><head><title>East Rand Auto Repairs</title></head><body>
  <nav><a href="/contact-us">Contact us</a></nav>
  <h1>East Rand Auto Repairs</h1><p>We offer on-site repairs and full mechanical services for all vehicle makes.</p>
  <footer>Website by <a href="mailto:hello@webcrafters.co.za">hello@webcrafters.co.za</a></footer></body></html>`
const CONTACT = `<html><body><h2>Contact</h2><address>12 Voortrekker Road, Dalpark, Brakpan, 1541</address>
  <p>Email: <a href="mailto:info@eastrandauto.co.za">info@eastrandauto.co.za</a></p></body></html>`

function mockSite(pages: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
    const html = pages[String(input)]
    return html ? new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })
  }))
}

const reading = (over: Record<string, unknown> = {}) => ({
  content: JSON.stringify({
    matches_filters: true,
    business_name: 'East Rand Auto Repairs',
    email: 'info@eastrandauto.co.za',
    email_source_url: 'https://eastrandauto.co.za/contact-us',
    address: '12 Voortrekker Road, Dalpark, Brakpan, 1541',
    locality: 'Dalpark',
    location_quote: '12 Voortrekker Road, Dalpark, Brakpan',
    location_source_url: 'https://eastrandauto.co.za/contact-us',
    business_function: 'Vehicle repair',
    activity_quote: 'We offer on-site repairs and full mechanical services',
    activity_source_url: 'https://eastrandauto.co.za/',
    category: 'Workshop',
    industry: 'Automotive',
    cover_fit: 'The workshop advertises on-site repairs from its premises, so its building and equipment are exposed.',
    ...over,
  }),
  citations: [],
  cost_usd: 0.001,
  model: 'test/reader',
})

const candidate = { business_name: 'East Rand Auto Repairs', website: 'https://eastrandauto.co.za/', source_url: null, locality: 'Brakpan', address: null }
const spend = (): Spend => ({ cost_usd: 0, searches: 0, pages: 0 })

beforeEach(() => {
  mockSite({ 'https://eastrandauto.co.za/': HOME, 'https://eastrandauto.co.za/contact-us': CONTACT })
})
afterEach(() => {
  vi.unstubAllGlobals()
  chatMock.mockReset()
})

describe('page reading', () => {
  it('finds emails in text, mailto links and Cloudflare-encoded links, and skips placeholders', () => {
    const key = 0x2a
    const cf = key.toString(16) + [...'ops@workshop.co.za'].map((ch) => (ch.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('')
    const html = `<a href="mailto:Sales@Workshop.co.za?subject=Hi">x</a><span data-cfemail="${cf}"></span> logo@2x.png you@example.com admin@workshop.co.za`
    const emails = extractEmails(html, htmlToText(html))
    expect(emails).toContain('sales@workshop.co.za')
    expect(emails).toContain('ops@workshop.co.za')
    expect(emails).toContain('admin@workshop.co.za')
    expect(emails).not.toContain('logo@2x.png')
    expect(emails).not.toContain('you@example.com')
  })

  it('accepts only public http(s) URLs', () => {
    expect(safeUrl('https://eastrandauto.co.za/contact')).not.toBeNull()
    expect(safeUrl('http://localhost:3000')).toBeNull()
    expect(safeUrl('http://192.168.1.10/')).toBeNull()
    expect(safeUrl('https://site.co.za:8443/')).toBeNull()
    expect(safeUrl('ftp://site.co.za/')).toBeNull()
  })

  it('matches quotes regardless of case, punctuation and spacing, but not paraphrases', () => {
    const text = 'We offer ON-SITE repairs,\n and full mechanical services.'
    expect(quoteAppears('we offer on-site repairs and full mechanical services', text)).toBe(true)
    expect(quoteAppears('We do mobile repairs at your premises', text)).toBe(false)
  })
})

describe('email ownership', () => {
  const page = (url: string, text: string): Page => ({ url, final_url: url, title: null, text, links: [], emails: [], retrieved_at: new Date().toISOString() })

  it("keeps the business's own domain and personal mailboxes on its own site", () => {
    const p = page('https://eastrandauto.co.za/contact', '')
    expect(emailBelongs('info@eastrandauto.co.za', p, 'eastrandauto.co.za', 'East Rand Auto Repairs')).toBe(true)
    expect(emailBelongs('eastrandauto@gmail.com', p, 'eastrandauto.co.za', 'East Rand Auto Repairs')).toBe(true)
  })

  it("rejects a web designer's or another firm's address shown on the business's site", () => {
    const p = page('https://www.onpointmechanics.co.za/contact', '')
    expect(emailBelongs('info@accountantsop.com', p, 'onpointmechanics.co.za', 'On Point Mechanics')).toBe(false)
  })

  it('on a directory page, keeps an email only when it sits next to the business name', () => {
    const listing = page('https://directory.co.za/brakpan', `Brakpan panel beaters\nEast Rand Auto Repairs - 12 Voortrekker Rd - info@eastrandauto.co.za\n${'x '.repeat(400)}\nOther Motors - claims@othermotors.co.za`)
    expect(emailBelongs('info@eastrandauto.co.za', listing, 'eastrandauto.co.za', 'East Rand Auto Repairs')).toBe(true)
    expect(emailBelongs('claims@othermotors.co.za', listing, 'eastrandauto.co.za', 'East Rand Auto Repairs')).toBe(false)
  })
})

describe('verifyCandidate', () => {
  it('saves a lead whose email, activity and location all appear on fetched pages', async () => {
    chatMock.mockResolvedValue(reading())
    const v = await verifyCandidate(candidate, filters, localities, 10, spend())
    expect(v.reason).toBeNull()
    expect(v.lead).toMatchObject({
      email: 'info@eastrandauto.co.za',
      email_source_url: 'https://eastrandauto.co.za/contact-us',
      activity_source_url: 'https://eastrandauto.co.za/',
      location_source_url: 'https://eastrandauto.co.za/contact-us',
      area: 'Dalpark',
      location_basis: 'locality_match',
      research: { assets: 'unknown', current_insurance: 'unknown', purchasing_intent: 'unknown' },
    })
    expect(Lead.safeParse(v.lead).success).toBe(true)
  })

  it('never keeps an email the model made up; it uses one the page shows', async () => {
    chatMock.mockResolvedValue(reading({ email: 'owner@eastrandauto.co.za' }))
    const v = await verifyCandidate(candidate, filters, localities, 10, spend())
    expect(v.lead?.email).toBe('info@eastrandauto.co.za')
  })

  it('rejects a business whose pages publish no email, even when its domain is known', async () => {
    mockSite({ 'https://eastrandauto.co.za/': HOME.replace(/<footer>[\s\S]*<\/footer>/, ''), 'https://eastrandauto.co.za/contact-us': CONTACT.replace(/<p>Email[\s\S]*?<\/p>/, '') })
    chatMock.mockResolvedValue(reading())
    const v = await verifyCandidate(candidate, filters, localities, 10, spend())
    expect(v.lead).toBeNull()
    expect(v.reason).toBe('No email is published on its pages')
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('rejects when the only email belongs to the web designer', async () => {
    mockSite({ 'https://eastrandauto.co.za/': HOME, 'https://eastrandauto.co.za/contact-us': CONTACT.replace(/<p>Email[\s\S]*?<\/p>/, '') })
    const v = await verifyCandidate(candidate, filters, localities, 10, spend())
    expect(v.lead).toBeNull()
    expect(v.reason).toBe('The emails on its pages belong to another organisation')
  })

  it('rejects an activity quote that is not on any page', async () => {
    chatMock.mockResolvedValue(reading({ activity_quote: 'Mobile mechanics who come to you anywhere in Gauteng' }))
    const v = await verifyCandidate(candidate, filters, localities, 10, spend())
    expect(v.lead).toBeNull()
    expect(v.reason).toBe('The business activity is not shown on its pages')
  })

  it('rejects a business located outside the requested area', async () => {
    mockSite({ 'https://eastrandauto.co.za/': HOME, 'https://eastrandauto.co.za/contact-us': CONTACT.replace('Dalpark, Brakpan', 'Sandton, Johannesburg') })
    chatMock.mockResolvedValue(reading({ location_quote: '12 Voortrekker Road, Sandton, Johannesburg', address: '12 Voortrekker Road, Sandton, Johannesburg', locality: 'Sandton' }))
    const v = await verifyCandidate(candidate, filters, localities, 10, spend())
    expect(v.lead).toBeNull()
    expect(v.reason).toBe('The published location is outside the requested area')
  })

  it('respects the page budget', async () => {
    chatMock.mockResolvedValue(reading())
    const s = spend()
    await verifyCandidate(candidate, filters, localities, 1, s)
    expect(s.pages).toBe(1)
  })
})

describe('candidate clean-up', () => {
  it('never treats a directory, social page or PDF as the business website', () => {
    expect(normaliseCandidate({ ...candidate, website: 'https://fixmyride.co.za/members', source_url: null })).toMatchObject({ website: null, source_url: 'https://fixmyride.co.za/members' })
    expect(normaliseCandidate({ ...candidate, website: null, source_url: 'https://www.linkedin.com/company/x' })).toBeNull()
    expect(normaliseCandidate({ ...candidate, website: null, source_url: 'https://www.ford.co.za/network/gauteng.pdf' })).toBeNull()
    expect(normaliseCandidate(candidate)).toMatchObject({ website: 'https://eastrandauto.co.za/' })
  })
})

describe('request parsing fallback', () => {
  it('reads count, radius, area and cover from the example request without a model', () => {
    const f = fallbackParse('Find 20 motor repair workshops within 10 km of Carnival City, Brakpan, with public business emails. I want prospects for commercial property cover.')
    expect(f).toMatchObject({ requested_count: 20, radius_km: 10, area: 'Carnival City, Brakpan', cover_type: 'Commercial Property' })
  })
})
