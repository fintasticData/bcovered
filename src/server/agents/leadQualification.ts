import type { ContactDetails, Customer, Lead, MotorDetails } from '../db/schema'
import { describeVehicle, missingMotorFields } from '../domain/motor'
import type { StepContext, StepOutcome } from '../jobs/runner'

export interface MotorLeadInputs {
  source: 'ava' | 'broker_copilot'
  details: MotorDetails
  contact?: ContactDetails
  consent?: { processing: boolean; marketing: boolean; notice_version: string }
  conversation_id?: string
  lead_id?: string
}

export function runQualifyStep(ctx: StepContext): StepOutcome {
  const inputs = ctx.job.inputs as unknown as MotorLeadInputs

  if (inputs.lead_id) {
    const { lead, customer } = ctx.call<{ lead: Lead; customer: Customer }>('lead.get', { lead_id: inputs.lead_id })
    ctx.link({ customer_id: customer.id, lead_id: lead.id })
    return {
      kind: 'done',
      output: { customer_id: customer.id, lead_id: lead.id, reused: true, summary: `Reused lead for ${customer.full_name}` },
    }
  }

  if (!inputs.consent?.processing) throw new Error('POPIA processing consent is required before creating records')
  const contact = inputs.contact ?? {}
  const { customer, created } = ctx.call<{ customer: Customer; created: boolean }>('customer.create', {
    full_name: contact.full_name,
    email: contact.email,
    phone: contact.phone,
    customer_type: 'personal',
  })
  ctx.call('customer.record_consent', {
    customer_id: customer.id,
    purpose: 'processing',
    granted: true,
    source: inputs.source,
    notice_version: inputs.consent.notice_version,
  })
  ctx.call('customer.record_consent', {
    customer_id: customer.id,
    purpose: 'marketing',
    granted: inputs.consent.marketing,
    source: inputs.source,
    notice_version: inputs.consent.notice_version,
  })
  ctx.call('customer.create_portal_user', { customer_id: customer.id })
  if (inputs.conversation_id) {
    ctx.call('customer.link_conversation', { customer_id: customer.id, conversation_id: inputs.conversation_id })
  }

  const missing = missingMotorFields(inputs.details)
  const lead = ctx.call<Lead>('lead.create', {
    customer_id: customer.id,
    conversation_id: inputs.conversation_id ?? null,
    line: 'personal',
    product_category: 'motor',
    urgency: 'medium',
    vehicle: inputs.details,
    summary: `${inputs.source === 'ava' ? 'Ava conversation' : 'Broker request'}: ${describeVehicle(inputs.details)} motor cover enquiry.`,
    missing_info: missing,
    source: inputs.source,
  })
  ctx.link({ customer_id: customer.id, lead_id: lead.id })
  return {
    kind: 'done',
    output: {
      customer_id: customer.id,
      lead_id: lead.id,
      reused: !created,
      summary: created ? `Customer profile created for ${customer.full_name}` : `Existing customer ${customer.full_name} reused`,
    },
  }
}
