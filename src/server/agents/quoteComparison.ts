import { rand } from '@/lib/quote'
import type { ComparisonSummary, Quote, QuoteOption } from '../db/schema'
import type { StepContext, StepOutcome } from '../jobs/runner'

export function runQuoteStep(ctx: StepContext): StepOutcome {
  const leadId = ctx.job.lead_id
  if (!leadId) throw new Error('Quote comparison needs a lead')
  ctx.call('lead.update_status', { lead_id: leadId, status: 'quoting' })
  const quote = ctx.call<Quote>('quote.create_request', { lead_id: leadId })
  ctx.link({ quote_id: quote.id })
  const options = ctx.call<QuoteOption[]>('quote.get_demo_options', { quote_id: quote.id })
  const comparison = ctx.call<ComparisonSummary>('quote.compare', { quote_id: quote.id })
  const cheapest = options.find((o) => o.id === comparison.cheapest_option_id)
  return {
    kind: 'done',
    output: {
      quote_id: quote.id,
      options: options.length,
      summary: `${options.length} simulated options prepared, from ${rand(cheapest?.monthly_premium ?? 0)} pm`,
    },
  }
}
