// Synthetic October 2026 files for Karoo Logistics: the employer payroll and the Kalahari administrator contribution
// schedule. Built from the same roster as the seed, with the deliberate differences listed in OCTOBER_SCENARIO.
import type { ContributionRules } from '../db/benefitsSchema'
import { DEMO_PERIOD, karooJoiner, karooRoster, OCTOBER_SCENARIO, type RosterEntry } from '../db/benefitsSeed'
import { toCsv } from '../domain/controls/parse'

const RULES: ContributionRules['categories'] = { general: { employer_pct: 7.5, employee_pct: 7.5 }, management: { employer_pct: 10, employee_pct: 7.5 } }
const period = DEMO_PERIOD.slice(0, 7)

/** Salary and category as they appear on the October payroll. */
export function octoberPayrollEntry(e: RosterEntry): { salary: number; category: RosterEntry['category'] } {
  const increased = OCTOBER_SCENARIO.salaryIncreases.includes(e.n)
  return {
    salary: increased ? Math.round((e.monthly_salary * 1.07) / 50) * 50 : e.monthly_salary,
    category: e.n === OCTOBER_SCENARIO.categoryChange ? 'management' : e.category,
  }
}

export function karooPayrollCsv(): string {
  const rows: Array<Array<string | number>> = []
  const push = (e: RosterEntry) => {
    const { salary, category } = octoberPayrollEntry(e)
    rows.push([e.employee_number, e.id_number, e.surname, e.first_names, e.dob, category, salary.toFixed(2), period])
  }
  karooRoster()
    .filter((e) => e.n !== OCTOBER_SCENARIO.leaver)
    .forEach((e) => {
      push(e)
      if (e.n === OCTOBER_SCENARIO.duplicate) push(e)
    })
  push(karooJoiner())
  return toCsv(['Employee No', 'ID Number', 'Surname', 'First Names', 'Date of Birth', 'Category', 'Pensionable Salary', 'Period'], rows)
}

/** The administrator still uses September salaries and categories, and still lists the leaver. */
export function kalahariScheduleCsv(): string {
  const rows = karooRoster().map((e) => {
    const rate = RULES[e.category]
    const er = Math.round(e.monthly_salary * rate.employer_pct) / 100
    const ee = Math.round(e.monthly_salary * rate.employee_pct) / 100
    const id = e.n === OCTOBER_SCENARIO.idTypoOnAdminSchedule ? `${e.id_number.slice(0, 7)}${(Number(e.id_number[7]) + 1) % 10}${e.id_number.slice(8)}` : e.id_number
    return [e.member_number, id, e.surname, er.toFixed(2), ee.toFixed(2), period]
  })
  return toCsv(['Member No', 'ID Number', 'Surname', 'Employer Contribution', 'Employee Contribution', 'Period'], rows)
}
