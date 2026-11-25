import { CopilotError } from '@/copilot/api'
import { referralApi } from '@/copilot/salesApi'
import { supabase } from '@/lib/supabase/client'

export type WebsiteChannel = 'quick_quote' | 'call_back' | 'concierge' | 'contact'

export type WebsiteEnquiryInput = {
  first_names: string
  surname: string
  phone: string
  email: string
  interest: string
  message?: string
  consent: boolean
  channel: WebsiteChannel
  /** Defaults to sample — migration site must not silently create live records. */
  category?: 'sample' | 'live'
}

export type WebsiteEnquiryResult = {
  ok: true
  reference: string
  referrer_name: string
  brokerage: string
  category: 'sample' | 'live'
  channel: WebsiteChannel
  person_id?: string | null
  customer_id?: string | null
}

function clientKey(channel: WebsiteChannel) {
  return `mig:${channel}:${crypto.randomUUID()}`
}

/** Split a single full-name field into first + surname for create_enquiry. */
export function splitName(full: string): { first_names: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_names: '', surname: '' }
  if (parts.length === 1) return { first_names: parts[0], surname: parts[0] }
  return { first_names: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1]! }
}

/**
 * Public website intake → existing Customer / sales_enquiries path.
 * Prefers website_submit_enquiry; falls back to referral_submit_enquiry (NALEDI-MZRL) if the RPC is missing.
 */
export async function submitWebsiteEnquiry(input: WebsiteEnquiryInput): Promise<WebsiteEnquiryResult> {
  const category = input.category ?? 'sample'
  const key = clientKey(input.channel)
  const payload = {
    p_first_names: input.first_names.trim(),
    p_surname: input.surname.trim(),
    p_phone: input.phone.trim() || null,
    p_email: input.email.trim() || null,
    p_interest: input.interest.trim() || null,
    p_message: input.message?.trim() || null,
    p_consent: input.consent,
    p_client_key: key,
    p_category: category,
    p_channel: input.channel,
  }

  const { data, error } = await supabase.rpc('website_submit_enquiry', payload)

  if (!error && data && typeof data === 'object' && (data as { ok?: boolean }).ok) {
    return data as WebsiteEnquiryResult
  }

  // Fallback when migration not yet applied on another environment.
  if (error && /could not find|does not exist|PGRST202|42883/i.test(error.message + (error.details ?? ''))) {
    const fallback = await referralApi.submit({
      code: import.meta.env.VITE_MIGRATION_REFERRAL_CODE || 'NALEDI-MZRL',
      first_names: input.first_names,
      surname: input.surname,
      phone: input.phone,
      email: input.email,
      interest: `${input.interest} · ${input.channel}`,
      message: input.message ?? '',
      consent: input.consent,
      client_key: key,
      category,
    })
    return {
      ok: true,
      reference: fallback.reference,
      referrer_name: fallback.referrer_name,
      brokerage: fallback.brokerage,
      category: fallback.category,
      channel: input.channel,
    }
  }

  if (error) {
    throw new CopilotError(400, error.details || error.message)
  }
  throw new CopilotError(400, 'Enquiry could not be saved.')
}

export function enquiryErrorMessage(err: unknown): string {
  if (err instanceof CopilotError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong sending your enquiry. Please try again or email support@bcovered.co.za.'
}
