/**
 * Demo VIP customers whose Supabase book is sample-only.
 * Live `/my` would 500/not_found — they must use `/demo/my`.
 */
export const SAMPLE_BOOK_PORTAL_EMAILS = new Set([
  'naledi.vip@example.demo',
  'thandi.walkthrough@example.demo',
])

export function isSampleBookPortalEmail(email: string | null | undefined): boolean {
  return Boolean(email && SAMPLE_BOOK_PORTAL_EMAILS.has(email.trim().toLowerCase()))
}

/** Map a live My Page path onto the demo sample portal. */
export function toSamplePortalPath(pathname: string): string {
  if (pathname === '/my' || pathname.startsWith('/my/')) {
    return `/demo/my${pathname.slice('/my'.length)}`
  }
  return '/demo/my'
}

export function samplePortalHome(): '/demo/my' {
  return '/demo/my'
}
