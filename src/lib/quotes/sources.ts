/** How a quote comparison was produced. Live insurer APIs are shown but disabled in this MVP. */
export type QuoteSource = 'sample_fixed' | 'sample_ai' | 'manual' | 'live'

export const QUOTE_SOURCE_LABEL: Record<QuoteSource, string> = {
  sample_fixed: 'Sample · fixed demo',
  sample_ai: 'Sample · Russ / fal AI',
  manual: 'Manual capture',
  live: 'Live insurer quote',
}

export const QUOTE_SOURCE_HELP: Record<QuoteSource, string> = {
  sample_fixed: 'Deterministic demo premiums. Never real insurer prices.',
  sample_ai: 'Russ asks fal to invent a full SAMPLE comparison for this risk. Still not binding cover.',
  manual: 'You type insurer, product and premium yourself (broker capture).',
  live: 'Connected insurer APIs — not enabled in this build.',
}

export function isQuoteSourceEnabled(source: QuoteSource): boolean {
  return source !== 'live'
}

export function quoteSourceBadge(source: QuoteSource): { label: string; tone: 'sample' | 'manual' | 'live' } {
  if (source === 'manual') return { label: 'Manual', tone: 'manual' }
  if (source === 'live') return { label: 'Live (unavailable)', tone: 'live' }
  return { label: source === 'sample_ai' ? 'SAMPLE · AI' : 'SAMPLE · fixed', tone: 'sample' }
}
