import { rand } from '@/lib/quote'

/** R18m, R1.35m or R450 000: compact enough for chat and summaries without losing precision. */
export const compactRand = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `R${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m` : rand(n)
