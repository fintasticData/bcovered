// Retrieves public pages and reads what they literally say: visible text, links and the email addresses they display.
// An email counts only when it appears on the page (as text, a mailto: link or Cloudflare's encoded form of one).

export interface Page {
  url: string
  final_url: string
  title: string | null
  text: string
  links: Array<{ href: string; label: string }>
  emails: string[]
  retrieved_at: string
}

const USER_AGENT = 'Mozilla/5.0 (compatible; BCoveredLeadResearch/1.0; +https://bcovered.co.za)'
const MAX_BYTES = 1_500_000
const MAX_TEXT = 60_000

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i
const PLACEHOLDER_EMAIL = /(@(example|domain|email|yourdomain|sentry|wixpress|sentry-next)\.)|(^(name|your|you|user|email|john|jane)@)|\.(png|jpe?g|gif|webp|svg|css|js)$/i

export function safeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.port && !['80', '443'].includes(u.port)) return null
    if (PRIVATE_HOST.test(u.hostname) || u.username || u.password) return null
    if (!u.hostname.includes('.')) return null
    u.hash = ''
    return u
  } catch {
    return null
  }
}

export const hostOf = (raw: string | null | undefined) => safeUrl(raw)?.hostname.replace(/^www\./i, '').toLowerCase() ?? null

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#64': '@', commat: '@', period: '.' }
function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** Cloudflare email obfuscation: the page publishes the address, encoded with a one-byte XOR key. */
function decodeCfEmail(hex: string) {
  try {
    const key = parseInt(hex.slice(0, 2), 16)
    let out = ''
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
    return out
  } catch {
    return ''
  }
}

const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi

export function extractEmails(html: string, text: string): string[] {
  const found = new Set<string>()
  const add = (e: string) => {
    const v = e.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]
    if (v.length <= 254 && /^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(v) && !PLACEHOLDER_EMAIL.test(v)) found.add(v)
  }
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'>\s]+)["']/gi)) add(decodeURIComponent(decodeEntities(m[1])))
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) add(decodeCfEmail(m[1]))
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) add(decodeCfEmail(m[1]))
  for (const m of text.matchAll(EMAIL_RE)) add(m[0])
  return [...found]
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/address|\/footer|\/header)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, MAX_TEXT)
}

function extractLinks(html: string, base: URL) {
  const out: Array<{ href: string; label: string }> = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(decodeEntities(m[1]), base)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      u.hash = ''
      out.push({ href: u.toString(), label: htmlToText(m[2]).slice(0, 80) })
    } catch {
      /* skip malformed links */
    }
    if (out.length >= 300) break
  }
  return out
}

export async function fetchPage(raw: string, timeoutMs = 9000): Promise<Page | null> {
  const url = safeUrl(raw)
  if (!url) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-ZA,en;q=0.9' },
    })
    const finalUrl = safeUrl(res.url) ?? url
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/html|text\/plain/i.test(type)) {
      await res.body?.cancel()
      return null
    }
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
    }
    await reader.cancel().catch(() => undefined)
    const buf = new Uint8Array(size)
    let off = 0
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.byteLength, size - off)), off)
      off += c.byteLength
      if (off >= size) break
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    const text = htmlToText(html)
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    return {
      url: url.toString(),
      final_url: finalUrl.toString(),
      title: title ? decodeEntities(title).trim().slice(0, 200) : null,
      text,
      links: extractLinks(html, finalUrl),
      emails: extractEmails(html, text),
      retrieved_at: new Date().toISOString(),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Same-site pages most likely to show contact details and the business address. */
export function contactLinks(page: Page, limit = 2): string[] {
  const host = hostOf(page.final_url)
  const scored = page.links
    .filter((l) => hostOf(l.href) === host && l.href !== page.final_url)
    .map((l) => {
      const s = `${l.href} ${l.label}`.toLowerCase()
      const score = /contact/.test(s) ? 3 : /(find-us|location|where|branch|about)/.test(s) ? 1 : 0
      return { href: l.href, score }
    })
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
  const out = [...new Set(scored.map((l) => l.href))].slice(0, limit)
  if (!out.length) {
    const base = new URL(page.final_url)
    out.push(new URL('/contact', base).toString(), new URL('/contact-us', base).toString())
  }
  return out.slice(0, limit)
}

/** Case- and whitespace-insensitive check that a quote really appears in the page text. */
export function quoteAppears(quote: string | null | undefined, text: string) {
  if (!quote) return false
  const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^a-z0-9@.'"&-]+/g, ' ').trim()
  const q = norm(quote)
  return q.length >= 8 && norm(text).includes(q)
}
