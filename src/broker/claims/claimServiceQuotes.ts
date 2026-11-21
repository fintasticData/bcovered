import { INCIDENT_TYPES } from '@/broker/claims/claimLabels'
import type { ServiceJob } from '@/api/serviceProviders'

/** Incident type → preferred service trade codes (mirrors app.claim_suggested_trade_codes). */
export const INCIDENT_TRADE_CODES: Record<string, string[]> = {
  motor_accident: ['motor_body', 'towing'],
  vehicle_theft: ['towing', 'motor_body', 'locksmith'],
  burglary: ['locksmith', 'glazier', 'appliance_repair', 'contents_restore'],
  water_damage: ['plumber', 'appliance_repair', 'contents_restore'],
  storm_hail: ['glazier', 'plumber', 'contents_restore'],
}

export function incidentTypeToTradeCodes(incidentType: string | null | undefined): string[] {
  if (!incidentType) return []
  return INCIDENT_TRADE_CODES[incidentType] ?? []
}

export function incidentTypeLabel(incidentType: string | null | undefined): string {
  if (!incidentType) return 'Claim'
  return INCIDENT_TYPES.find((t) => t.value === incidentType)?.label ?? incidentType.replace(/_/g, ' ')
}

export function isMotorishIncident(incidentType: string | null | undefined): boolean {
  return incidentType === 'motor_accident' || incidentType === 'vehicle_theft'
}

/** Insurer acceptance gate — matches app.claim_allows_service_quotes. */
export function claimQuotesUnlocked(input: {
  status?: string | null
  decision?: string | null
  quotes_unlocked?: boolean | null
}): boolean {
  if (typeof input.quotes_unlocked === 'boolean') return input.quotes_unlocked
  return (
    input.status === 'decision_received' &&
    (input.decision === 'approved' || input.decision === 'partially_approved')
  )
}

export function claimHeadline(input: {
  incidentType?: string | null
  statusLabel?: string | null
  reference?: string | null
}): string {
  const type = incidentTypeLabel(input.incidentType)
  const status = input.statusLabel?.trim()
  if (status) return `${type}: ${status}`
  return `${type} claim${input.reference ? ` · ${input.reference}` : ''}`
}

export function claimItemCardTitle(incidentType: string | null | undefined): string {
  if (isMotorishIncident(incidentType)) return 'Vehicle / covered item'
  if (incidentType === 'burglary') return 'Home contents'
  if (incidentType === 'water_damage' || incidentType === 'storm_hail') return 'Affected property'
  return 'Affected cover'
}

export function claimProviderCardTitle(incidentType: string | null | undefined): string {
  if (isMotorishIncident(incidentType)) return 'Your repairer'
  return 'Service provider'
}

export type QuoteSummaryLine = {
  providerName: string
  tradeLabel: string
  feeZar: number | null
  status: string
  isCurrent: boolean
}

export function collectClaimQuoteLines(jobs: ServiceJob[] | null | undefined): QuoteSummaryLine[] {
  const lines: QuoteSummaryLine[] = []
  for (const job of jobs ?? []) {
    const allocs = job.allocations?.length
      ? job.allocations
      : job.current_allocation
        ? [job.current_allocation]
        : []
    for (const a of allocs) {
      lines.push({
        providerName: a.provider_name ?? 'Provider',
        tradeLabel: job.trade_label,
        feeZar: a.quoted_callout_fee_zar ?? job.quoted_callout_fee_zar,
        status: a.status,
        isCurrent: Boolean(a.is_current ?? job.current_allocation?.id === a.id),
      })
    }
  }
  return lines
}

export function primaryProviderFromJobs(jobs: ServiceJob[] | null | undefined): {
  name: string
  lines: string[]
  quoteCount: number
} | null {
  const quotes = collectClaimQuoteLines(jobs)
  if (!quotes.length) return null
  const current = quotes.find((q) => q.isCurrent) ?? quotes[0]
  const fee =
    current.feeZar != null ? `Quote R${Number(current.feeZar).toLocaleString('en-ZA')}` : 'Quote pending'
  return {
    name: current.providerName,
    lines: [current.tradeLabel, fee, `${quotes.length} quote${quotes.length === 1 ? '' : 's'} on this claim`],
    quoteCount: quotes.length,
  }
}
