import type { Json } from '../../db/schema'
import { dobFromSaId, isValidSaId } from '../life/identity'
import { parseAmount } from './money'

export interface Validated {
  normalised: Record<string, Json>
  errors: string[]
}

const periodOf = (raw: string) => {
  const m = raw.trim().match(/^(\d{4})[-/](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-01` : null
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

export function validatePayrollRow(row: Record<string, string>, reportingPeriod: string | null): Validated {
  const errors: string[] = []
  const salary = parseAmount(row.monthly_salary)
  const period = row.period ? periodOf(row.period) : reportingPeriod
  if (!row.employee_number) errors.push('Employee number is missing')
  if (!row.surname) errors.push('Surname is missing')
  if (!row.id_number) errors.push('ID number is missing')
  else if (!isValidSaId(row.id_number)) errors.push('ID number fails the South African ID check')
  if (salary === null) errors.push('Pensionable salary is not an amount')
  else if (salary <= 0 || salary > 2_000_000) errors.push('Pensionable salary is outside the expected range')
  if (row.date_of_birth && !isDate(row.date_of_birth)) errors.push('Date of birth is not a date')
  if (row.id_number && row.date_of_birth && isValidSaId(row.id_number) && dobFromSaId(row.id_number) !== row.date_of_birth) errors.push('Date of birth does not match the ID number')
  if (reportingPeriod && period && period !== reportingPeriod) errors.push(`Row period ${period.slice(0, 7)} differs from the batch period ${reportingPeriod.slice(0, 7)}`)
  if (row.category && !['general', 'management'].includes(row.category.toLowerCase())) errors.push(`Unknown member category “${row.category}”`)
  return {
    normalised: {
      employee_number: row.employee_number?.trim() ?? '',
      id_number: row.id_number?.replace(/\s/g, '') ?? '',
      surname: row.surname?.trim() ?? '',
      first_names: row.first_names?.trim() ?? '',
      date_of_birth: row.date_of_birth || null,
      category: (row.category || 'general').toLowerCase(),
      monthly_salary: salary,
      period,
    },
    errors,
  }
}

export function validateContributionRow(row: Record<string, string>, reportingPeriod: string | null): Validated {
  const errors: string[] = []
  const er = parseAmount(row.employer_contribution)
  const ee = parseAmount(row.employee_contribution)
  const period = row.period ? periodOf(row.period) : reportingPeriod
  if (!row.member_number) errors.push('Member number is missing')
  if (er === null) errors.push('Employer contribution is not an amount')
  if (ee === null) errors.push('Employee contribution is not an amount')
  if ((er ?? 0) < 0 || (ee ?? 0) < 0) errors.push('Negative contribution')
  if (row.id_number && !isValidSaId(row.id_number)) errors.push('ID number fails the South African ID check (matched on member number instead)')
  if (reportingPeriod && period && period !== reportingPeriod) errors.push(`Row period ${period.slice(0, 7)} differs from the batch period ${reportingPeriod.slice(0, 7)}`)
  return {
    normalised: {
      member_number: row.member_number?.trim() ?? '',
      id_number: row.id_number?.replace(/\s/g, '') ?? '',
      surname: row.surname?.trim() ?? '',
      employer_contribution: er,
      employee_contribution: ee,
      period,
    },
    errors,
  }
}

export function validateHoldingRow(row: Record<string, string>): Validated {
  const errors: string[] = []
  const units = parseAmount(row.units)
  const price = row.unit_price ? parseAmount(row.unit_price) : null
  if (!row.instrument) errors.push('Instrument is missing')
  if (units === null) errors.push('Units are not a number')
  if (row.unit_price && price === null) errors.push('Price is not a number')
  return { normalised: { instrument: row.instrument?.trim() ?? '', units, unit_price: price }, errors }
}

/** Row messages that are warnings rather than errors: the row can still be matched and reconciled. */
const NON_BLOCKING = /matched on member number instead/

export const isBlocking = (errors: string[]) => errors.some((e) => !NON_BLOCKING.test(e))
