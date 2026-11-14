// Private motor subset of the QE External Quote API (request sections 5.1-5.7, response section 7).
// Option-coded fields are QE option codes sent as strings.

export interface QeAddress {
  postalCode: string
  suburb: string
  street?: string
}

export interface QeLicence {
  code?: string
  issueDate?: string
}

export interface QeNoClaim {
  noClaimYears?: number
  insuredYears?: number
}

export interface QePolicyholder {
  name: string
  surname: string
  idNumber: string
  mobile?: string
  email?: string
  address: QeAddress
  licence?: QeLicence
  noClaim?: QeNoClaim
}

export interface QeVehicle {
  meadCode: string
  year: number
  colour?: string
  cover?: CoverCode
}

export interface QeMotorRequest {
  hasITCConsent?: boolean
  source?: string
  policyholder: QePolicyholder
  vehicles: QeVehicle[]
}

export interface QeMessage {
  messageTypeID: number
  messageTypeName: string
  message: string
}

export interface QeExcess {
  name: string
  description: string
  value: number
}

export type QeItemStatus = 'Quoted' | 'No Quote' | 'Declined'

export interface QeQuotedItem {
  quoteItemID: number
  name: string
  index: number
  premium: number
  statusID: number
  status: QeItemStatus
  breakdown: Array<{ name: string; value: number }>
  valueAddedProducts: unknown[]
  messages: QeMessage[]
  excess: QeExcess[]
}

export interface QeInsurerQuote {
  status: string
  statusID: number
  selectedID: number
  superseded: boolean
  submitDate: string
  selectedCode: string | null
  contactId: string
  message: string
  insurerID: number
  insurerParentID: number
  insurerName: string
  insurerReference: string
  insurerImage: string
  validDays: number
  requestID: number
  quoteID: number
  hasExpired: boolean
  hasQuote: boolean
  quoteDate: string | null
  quoteExpires: string | null
  totalPremium: number
  vapPremium: number
  vaP3PPremium: number
  items: QeQuotedItem[]
  fees: unknown[]
  valueAddedProducts: unknown[]
  messages: QeMessage[]
  history: unknown[]
}

export interface QeResult {
  requestID: number
  status: 'Pending' | 'Generating' | 'Complete'
  requestStatus: string
  isComplete: boolean
  expectedInsurers: number
  completedInsurers: number
  elapsedSeconds: number
  estimatedSecondsRemaining: number | null
  quotes: QeInsurerQuote[] | null
}

export const COVER_OPTIONS = [
  { code: '0', label: 'Comprehensive' },
  { code: '1', label: 'Third party fire and theft' },
  { code: '2', label: 'Third party only' },
  { code: '7', label: 'Theft only' },
  { code: '8', label: 'Total loss' },
] as const

export type CoverCode = (typeof COVER_OPTIONS)[number]['code']

/** The broker-editable fields, held as input strings until the request is built. */
export interface MotorQuoteForm {
  name: string
  surname: string
  mobile: string
  email: string
  street: string
  suburb: string
  postalCode: string
  meadCode: string
  year: string
  cover: CoverCode
}

export type MotorFormErrors = Partial<Record<keyof MotorQuoteForm, string>>
