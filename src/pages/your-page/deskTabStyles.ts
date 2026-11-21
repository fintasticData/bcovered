import { cn } from '@/lib/utils'

/** Shared My Page / My Business Page desk + portal nav pill styles (deep teal selected). */
export function deskTabClass(isActive: boolean) {
  return cn(
    'rounded-full px-3 py-1.5 text-sm font-semibold transition',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
    isActive ? 'bg-brand-800 text-white' : 'text-navy-700 hover:bg-navy-100',
  )
}
