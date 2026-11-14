import type { QeMotorRequest } from '@/lib/qe/types'
import { deepFreeze } from './freeze'

/** Fictional sample client, based on QE guide Appendix A.1. ID number and consent are sample values only. */
export const SAMPLE_MOTOR_REQUEST: Readonly<QeMotorRequest> = deepFreeze<QeMotorRequest>({
  hasITCConsent: true,
  source: 'ExternalAPI',
  policyholder: {
    name: 'Lerato',
    surname: 'Sample',
    idNumber: '8301075073084',
    mobile: '0821234567',
    email: 'lerato.sample@example.com',
    address: {
      postalCode: '3629',
      suburb: 'Westville',
      street: '1 Test Street',
    },
    licence: {
      code: '3',
      issueDate: '01 Jan 2005',
    },
    noClaim: {
      noClaimYears: 3,
      insuredYears: 5,
    },
  },
  vehicles: [
    {
      meadCode: '12345678',
      year: 2020,
      colour: 'White',
      cover: '0',
    },
  ],
})
