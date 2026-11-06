import type { ContactDetails, MotorDetails } from '../db/schema'

export const PRIVACY_NOTICE_VERSION = 'privacy-2026-01'

export type Intent = 'motor_quote' | 'claim' | 'other_product' | 'greeting' | 'unknown'

export type Slot =
  | 'make_model'
  | 'year'
  | 'value'
  | 'condition_usage'
  | 'parking'
  | 'driver'
  | 'claims'
  | 'cover_type'
  | 'consent'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'marketing'
  | 'confirm'

export interface IntakeState {
  intent: Intent | null
  stage: 'collecting' | 'consent' | 'declined' | 'contact' | 'confirm' | 'submitted'
  details: MotorDetails
  contact: ContactDetails
  consent: { processing?: boolean; marketing?: boolean }
  asking: Slot | null
}

export interface IntakeTurn {
  reply: string
  state: IntakeState
  quick_replies: string[]
  links?: Array<{ label: string; to: string }>
  /** True when the customer has confirmed and the workflow should start. */
  submit: boolean
}

export interface AssistantAdapter {
  id: 'deterministic' | 'fal'
  label: string
  available: boolean
  unavailableReason?: string
  intakeTurn(state: IntakeState, userText: string): Promise<IntakeTurn>
}

export const initialIntakeState = (): IntakeState => ({
  intent: null,
  stage: 'collecting',
  details: {},
  contact: {},
  consent: {},
  asking: null,
})
