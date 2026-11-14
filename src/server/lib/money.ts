const whole = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const exact = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Whole rands for agent replies, for example "R 1 500 000". */
export const randWhole = (n: number | null | undefined) => (n === null || n === undefined ? '–' : whole.format(Math.round(n)).replace('ZAR', 'R'))

/** Rands and cents for reconciliation figures, for example "R 1 841,25". */
export const randExact = (n: number) => exact.format(n).replace('ZAR', 'R')
