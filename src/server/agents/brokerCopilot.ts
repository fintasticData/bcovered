import { rand } from '@/lib/quote'
import type { ApprovalRequest, ComparisonSummary, Customer, Insurer, Lead, Quote, QuoteOption } from '../db/schema'
import { describeVehicle, formatMotorField } from '../domain/motor'
import type { StepContext, StepOutcome } from '../jobs/runner'

export function composeBrokerSummary(
  customer: Customer,
  lead: Lead,
  comparison: ComparisonSummary,
  options: QuoteOption[],
  insurers: Insurer[],
  brokerNote?: string | null,
): string {
  const v = lead.qualification.vehicle ?? {}
  const risk = lead.qualification.risk
  const lines = [
    `${customer.full_name}: ${describeVehicle(v)} (${formatMotorField('value', v)}), ${formatMotorField('cover_type', v).toLowerCase()}, ${formatMotorField('usage', v).toLowerCase()} use.`,
    `${options.length} simulated options: ${[...options]
      .sort((a, b) => a.option_label.localeCompare(b.option_label))
      .map((o) => `${o.option_label} ${insurers.find((i) => i.id === o.insurer_id)?.name ?? ''} ${rand(o.monthly_premium)} pm, excess ${rand(o.excess)}`)
      .join('; ')}.`,
    ...comparison.trade_offs,
    risk?.referral_triggers.length
      ? `Referral triggers: ${risk.referral_triggers.join('; ')}.`
      : 'No referral triggers found by the Risk Agent.',
    'Broker to confirm suitability and disclosures before release. Figures are simulated, not insurer quotations.',
  ]
  if (brokerNote) lines.unshift(`Revised after broker note: “${brokerNote}”.`)
  return lines.join(' ')
}

export function runSummaryStep(ctx: StepContext): StepOutcome {
  const { job } = ctx
  if (!job.quote_id || !job.lead_id) throw new Error('Summary needs a quote and lead')
  const { lead, customer } = ctx.call<{ lead: Lead; customer: Customer }>('lead.get', { lead_id: job.lead_id })
  const { options } = ctx.call<{ options: QuoteOption[] }>('quote.get', { quote_id: job.quote_id })
  const comparison = ctx.call<ComparisonSummary>('quote.compare', { quote_id: job.quote_id })
  const lastNote = ctx.call<ApprovalRequest[]>('approval.search', { status: ['changes_requested'] })
    .filter((a) => a.job_id === job.id)
    .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))[0]?.decision_note
  const summary = composeBrokerSummary(customer, lead, comparison, options, ctx.repo.list('insurers'), lastNote)
  ctx.call('quote.prepare_proposal', { quote_id: job.quote_id, broker_summary: summary })
  return { kind: 'done', output: { summary: 'Comparison summary prepared for broker review', broker_summary: summary } }
}

export function runApprovalStep(ctx: StepContext): StepOutcome {
  const { job } = ctx
  if (!job.quote_id || !job.lead_id) throw new Error('Approval needs a quote and lead')
  const { quote } = ctx.call<{ quote: Quote }>('quote.get', { quote_id: job.quote_id })
  const { lead, customer } = ctx.call<{ lead: Lead; customer: Customer }>('lead.get', { lead_id: job.lead_id })
  if (!quote.proposal) throw new Error('No proposal to approve')
  const approval = ctx.call<ApprovalRequest>('approval.request', {
    approval_type: 'quote_proposal_release',
    subject_table: 'quotes',
    subject_id: quote.id,
    summary: `Release ${quote.proposal.options.length}-option motor comparison to ${customer.full_name}`,
    proposed_changes: quote.proposal,
    risk_flags: lead.qualification.risk?.referral_triggers ?? [],
    evidence: [
      { label: 'Job', ref: job.id },
      { label: 'Lead', ref: lead.id },
      { label: 'Quote', ref: quote.id },
    ],
  })
  ctx.call('lead.update_status', { lead_id: lead.id, status: 'proposal_pending' })
  return { kind: 'await_approval', approval_id: approval.id, output: { approval_id: approval.id, summary: 'Broker approval requested' } }
}

export function runReleaseStep(ctx: StepContext): StepOutcome {
  if (!ctx.job.quote_id) throw new Error('Release needs a quote')
  ctx.call('quote.release_proposal', { quote_id: ctx.job.quote_id })
  return { kind: 'done', output: { summary: 'Proposal released to the customer portal' } }
}
