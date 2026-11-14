import type { QeExcess, QeInsurerQuote, QeQuotedItem, QeResult } from '@/lib/qe/types'
import { deepFreeze } from './freeze'

/** Placeholder request number; getSampleQuotes stamps a fresh one on every submission. */
const TEMPLATE_REQUEST_ID = 0

const DEMO_NOTE = {
  messageTypeID: 1,
  messageTypeName: 'Details',
  message: 'Sample figures for demonstration only. Not an insurer quotation and cannot be accepted as cover.',
}

const basic = (value: number): QeExcess[] => [{ name: 'Basic', description: 'Basic excess', value }]

function vehicleItem(quoteItemID: number, quoted: { premium: number; excess: number } | null): QeQuotedItem {
  return {
    quoteItemID,
    name: 'Vehicle',
    index: 1,
    premium: quoted?.premium ?? 0,
    // QE documents statusID 1 for No Quote; 2 for Quoted is a demo assumption.
    statusID: quoted ? 2 : 1,
    status: quoted ? 'Quoted' : 'No Quote',
    breakdown: [],
    valueAddedProducts: [],
    messages: quoted
      ? []
      : [{ messageTypeID: 900301, messageTypeName: 'QuoteItem', message: 'Vehicle outside this insurer’s demo acceptance criteria.' }],
    excess: quoted ? basic(quoted.excess) : [],
  }
}

function insurerQuote(fields: {
  insurerID: number
  insurerName: string
  insurerReference: string
  quoteID: number
  item: QeQuotedItem
}): QeInsurerQuote {
  const hasQuote = fields.item.status === 'Quoted'
  return {
    status: 'Complete',
    statusID: 3,
    selectedID: 0,
    superseded: false,
    submitDate: '0001-01-01T00:00:00',
    selectedCode: null,
    contactId: '',
    message: '',
    insurerID: fields.insurerID,
    insurerParentID: 0,
    insurerName: fields.insurerName,
    insurerReference: fields.insurerReference,
    insurerImage: '',
    validDays: hasQuote ? 30 : 0,
    requestID: TEMPLATE_REQUEST_ID,
    quoteID: fields.quoteID,
    hasExpired: false,
    hasQuote,
    quoteDate: null,
    quoteExpires: null,
    totalPremium: fields.item.premium,
    vapPremium: 0,
    vaP3PPremium: 0,
    items: [fields.item],
    fees: [],
    valueAddedProducts: [],
    messages: [DEMO_NOTE],
    history: [],
  }
}

/** Completed result shaped like QE guide Appendix B.3, with three fictional insurers and fixed premiums. */
export const SAMPLE_MOTOR_RESULT: Readonly<QeResult> = deepFreeze<QeResult>({
  requestID: TEMPLATE_REQUEST_ID,
  status: 'Complete',
  requestStatus: 'Open',
  isComplete: true,
  expectedInsurers: 3,
  completedInsurers: 3,
  elapsedSeconds: 0,
  estimatedSecondsRemaining: null,
  quotes: [
    insurerQuote({
      insurerID: 9001,
      insurerName: 'Demo Insurer A',
      insurerReference: 'DEMO-A-0001',
      quoteID: 700101,
      item: vehicleItem(800101, { premium: 780, excess: 5000 }),
    }),
    insurerQuote({
      insurerID: 9002,
      insurerName: 'Demo Insurer B',
      insurerReference: 'DEMO-B-0001',
      quoteID: 700102,
      item: vehicleItem(800102, { premium: 855, excess: 3500 }),
    }),
    insurerQuote({
      insurerID: 9003,
      insurerName: 'Demo Insurer C',
      insurerReference: 'DEMO-C-0001',
      quoteID: 700103,
      item: vehicleItem(800103, null),
    }),
  ],
})
