// Shared SA suburb / postal lookup for the Quote Engine address shape (QeAddress)
// and Concierge directory Area. Swap `lookupQeSuburbs` to the live QE API when ready.
import type { QeAddress } from './types'

export type QeSuburbHit = {
  /** Stable id for list keys (sample catalog or future API id). */
  id: string
  suburb: string
  postalCode: string
  /** Optional town/city for display (not part of QeAddress). */
  city?: string
  province?: string
}

/** Demo catalog aligned with QE policyholder.address (suburb + postalCode). */
export const QE_SAMPLE_SUBURBS: QeSuburbHit[] = [
  { id: 'qe-westville-3629', suburb: 'Westville', postalCode: '3629', city: 'Durban', province: 'KwaZulu-Natal' },
  { id: 'qe-umhlanga-4320', suburb: 'Umhlanga', postalCode: '4320', city: 'Durban', province: 'KwaZulu-Natal' },
  { id: 'qe-berea-4001', suburb: 'Berea', postalCode: '4001', city: 'Durban', province: 'KwaZulu-Natal' },
  { id: 'qe-claremont-7708', suburb: 'Claremont', postalCode: '7708', city: 'Cape Town', province: 'Western Cape' },
  { id: 'qe-sea-point-8005', suburb: 'Sea Point', postalCode: '8005', city: 'Cape Town', province: 'Western Cape' },
  { id: 'qe-bellville-7530', suburb: 'Bellville', postalCode: '7530', city: 'Cape Town', province: 'Western Cape' },
  { id: 'qe-stellenbosch-7600', suburb: 'Stellenbosch', postalCode: '7600', city: 'Stellenbosch', province: 'Western Cape' },
  { id: 'qe-somerset-west-7130', suburb: 'Somerset West', postalCode: '7130', city: 'Somerset West', province: 'Western Cape' },
  { id: 'qe-sandton-2196', suburb: 'Sandton', postalCode: '2196', city: 'Johannesburg', province: 'Gauteng' },
  { id: 'qe-parkhurst-2193', suburb: 'Parkhurst', postalCode: '2193', city: 'Johannesburg', province: 'Gauteng' },
  { id: 'qe-rosebank-2196', suburb: 'Rosebank', postalCode: '2196', city: 'Johannesburg', province: 'Gauteng' },
  { id: 'qe-bryanston-2191', suburb: 'Bryanston', postalCode: '2191', city: 'Johannesburg', province: 'Gauteng' },
  { id: 'qe-midrand-1685', suburb: 'Midrand', postalCode: '1685', city: 'Midrand', province: 'Gauteng' },
  { id: 'qe-benoni-1501', suburb: 'Benoni', postalCode: '1501', city: 'Benoni', province: 'Gauteng' },
  { id: 'qe-kempton-1619', suburb: 'Kempton Park', postalCode: '1619', city: 'Kempton Park', province: 'Gauteng' },
  { id: 'qe-centurion-0157', suburb: 'Centurion', postalCode: '0157', city: 'Centurion', province: 'Gauteng' },
  { id: 'qe-pretoria-0002', suburb: 'Pretoria', postalCode: '0002', city: 'Pretoria', province: 'Gauteng' },
  { id: 'qe-bloemfontein-9301', suburb: 'Bloemfontein', postalCode: '9301', city: 'Bloemfontein', province: 'Free State' },
  { id: 'qe-gqeberha-6001', suburb: 'Gqeberha', postalCode: '6001', city: 'Gqeberha', province: 'Eastern Cape' },
  { id: 'qe-east-london-5201', suburb: 'East London', postalCode: '5201', city: 'East London', province: 'Eastern Cape' },
]

export function formatQeSuburbLabel(hit: Pick<QeSuburbHit, 'suburb' | 'city' | 'postalCode'>): string {
  const place = hit.city && hit.city.toLowerCase() !== hit.suburb.toLowerCase() ? `${hit.suburb}, ${hit.city}` : hit.suburb
  return hit.postalCode ? `${place} (${hit.postalCode})` : place
}

/** Area string for Concierge find/filter — suburb (+ city when useful). */
export function formatQeAreaLabel(hit: Pick<QeSuburbHit, 'suburb' | 'city'>): string {
  if (hit.city && hit.city.toLowerCase() !== hit.suburb.toLowerCase()) return `${hit.suburb}, ${hit.city}`
  return hit.suburb
}

export function toQeAddress(hit: QeSuburbHit, street?: string): QeAddress {
  return {
    suburb: hit.suburb,
    postalCode: hit.postalCode,
    ...(street ? { street } : {}),
  }
}

/**
 * Lookup suburbs for typeahead.
 * Today: sample catalog. Later: call the QE External Quote address/suburb API here
 * (same QeAddress shape) and map results into QeSuburbHit[].
 */
export async function lookupQeSuburbs(query: string, opts?: { signal?: AbortSignal; limit?: number }): Promise<QeSuburbHit[]> {
  const limit = opts?.limit ?? 10
  const q = query.trim().toLowerCase()
  // Preserve abort semantics for callers that race requests.
  if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // Placeholder for live API:
  // if (import.meta.env.VITE_QE_ADDRESS_API_URL) { ... fetch and map to QeSuburbHit }

  const pool = !q
    ? QE_SAMPLE_SUBURBS
    : QE_SAMPLE_SUBURBS.filter(
        (h) =>
          h.suburb.toLowerCase().includes(q) ||
          h.postalCode.includes(q) ||
          (h.city?.toLowerCase().includes(q) ?? false) ||
          (h.province?.toLowerCase().includes(q) ?? false),
      )
  return pool.slice(0, limit)
}
