import { rand } from '@/lib/quote'
import type { MotorDetails } from '../db/schema'

export const MOTOR_FIELDS: Array<{ key: keyof MotorDetails; label: string }> = [
  { key: 'make', label: 'Vehicle make' },
  { key: 'model', label: 'Vehicle model' },
  { key: 'year', label: 'Year' },
  { key: 'value', label: 'Approximate value' },
  { key: 'condition', label: 'New or used' },
  { key: 'usage', label: 'Usage' },
  { key: 'parking', label: 'Overnight parking' },
  { key: 'tracker', label: 'Tracking device' },
  { key: 'driver_age', label: 'Regular driver age' },
  { key: 'licence_years', label: 'Years licensed' },
  { key: 'claims_last_3_years', label: 'Claims in last 3 years' },
  { key: 'cover_type', label: 'Cover type' },
]

export const missingMotorFields = (d: MotorDetails) =>
  MOTOR_FIELDS.filter((f) => d[f.key] === undefined).map((f) => f.label)

export const describeVehicle = (d: MotorDetails) =>
  [d.year, d.make, d.model].filter(Boolean).join(' ') || 'Vehicle'

const COVER_LABEL: Record<NonNullable<MotorDetails['cover_type']>, string> = {
  comprehensive: 'Comprehensive',
  third_party_fire_theft: 'Third party, fire and theft',
  third_party: 'Third party only',
}
const PARKING_LABEL: Record<NonNullable<MotorDetails['parking']>, string> = {
  garage: 'Locked garage',
  carport: 'Carport',
  secure_complex: 'Secure complex',
  driveway: 'Driveway behind a gate',
  street: 'Street',
}

export function formatMotorField(key: keyof MotorDetails, d: MotorDetails): string {
  const v = d[key]
  if (v === undefined) return '–'
  switch (key) {
    case 'value':
      return rand(v as number)
    case 'tracker':
      return v ? 'Fitted' : 'None'
    case 'usage':
      return v === 'business' ? 'Business' : 'Private'
    case 'condition':
      return v === 'new' ? 'New' : 'Used'
    case 'parking':
      return PARKING_LABEL[v as NonNullable<MotorDetails['parking']>]
    case 'cover_type':
      return COVER_LABEL[v as NonNullable<MotorDetails['cover_type']>]
    case 'driver_age':
      return `${v} years old`
    case 'licence_years':
      return `${v} years`
    default:
      return String(v)
  }
}
