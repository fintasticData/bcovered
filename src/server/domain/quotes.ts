import { rand } from '@/lib/quote'
import type { ComparisonSummary, CoverageKey, Insurer, ProposalPayload, Quote, QuoteOption } from '../db/schema'

export function compareOptions(options: QuoteOption[]): ComparisonSummary {
  if (options.length === 0) throw new Error('No options to compare')
  const byPremium = [...options].sort((a, b) => a.monthly_premium - b.monthly_premium)
  const byExcess = [...options].sort((a, b) => a.excess - b.excess)
  const cheapest = byPremium[0]
  const priciest = byPremium[byPremium.length - 1]
  const lowestExcess = byExcess[0]

  const tradeOffs: string[] = []
  if (cheapest.id !== lowestExcess.id) {
    tradeOffs.push(
      `${cheapest.option_label} has the lowest premium (${rand(cheapest.monthly_premium)} pm) but an excess of ${rand(cheapest.excess)}; ` +
        `${lowestExcess.option_label} lowers the excess to ${rand(lowestExcess.excess)} for ${rand(lowestExcess.monthly_premium - cheapest.monthly_premium)} more per month.`,
    )
  } else {
    tradeOffs.push(`${cheapest.option_label} has both the lowest premium and the lowest excess.`)
  }
  const courtesy = options.filter((o) => has(o, 'courtesy_vehicle'))
  if (courtesy.length && courtesy.length < options.length) {
    tradeOffs.push(`Only ${courtesy.map((o) => o.option_label).join(' and ')} ${courtesy.length === 1 ? 'includes' : 'include'} a courtesy vehicle.`)
  }
  tradeOffs.push(`Premiums differ by ${rand(priciest.monthly_premium - cheapest.monthly_premium)} per month across the panel.`)

  return {
    cheapest_option_id: cheapest.id,
    lowest_excess_option_id: lowestExcess.id,
    highest_premium_option_id: priciest.id,
    premium_spread_monthly: priciest.monthly_premium - cheapest.monthly_premium,
    trade_offs: tradeOffs,
  }
}

const has = (o: QuoteOption, key: CoverageKey) => o.inclusions.some((i) => i.key === key && i.included)

export function buildProposalPayload(
  quote: Quote,
  options: QuoteOption[],
  brokerSummary: string,
  agent: string,
): ProposalPayload {
  const sorted = [...options].sort((a, b) => a.option_label.localeCompare(b.option_label))
  return {
    quote_id: quote.id,
    options: sorted.map((o) => ({
      id: o.id,
      option_label: o.option_label,
      insurer_id: o.insurer_id,
      monthly_premium: o.monthly_premium,
      annual_premium: o.annual_premium,
      excess: o.excess,
      sum_insured: o.sum_insured,
    })),
    comparison: compareOptions(sorted),
    broker_summary: brokerSummary,
    prepared_by_agent: agent,
  }
}

export interface QuoteAnswer {
  answer: string
  citations: Array<{ option_label: string; field: string; value: string }>
  grounded: boolean
}

/** Answers comparison questions only from the stored structured option fields. */
export function answerQuoteQuestion(question: string, options: QuoteOption[], insurers: Insurer[]): QuoteAnswer {
  const q = question.toLowerCase()
  const name = (o: QuoteOption) => `${o.option_label} (${insurers.find((i) => i.id === o.insurer_id)?.name ?? 'insurer'})`
  const sorted = (f: (o: QuoteOption) => number) => [...options].sort((a, b) => f(a) - f(b))
  const cite = (o: QuoteOption, field: string, value: string) => ({ option_label: o.option_label, field, value })

  if (/excess/.test(q)) {
    const list = sorted((o) => o.excess)
    const pick = /highest|most|biggest/.test(q) ? list[list.length - 1] : list[0]
    return {
      answer: `${name(pick)} has the ${pick === list[0] ? 'lowest' : 'highest'} excess at ${rand(pick.excess)}. For comparison: ${list
        .map((o) => `${o.option_label} ${rand(o.excess)}`)
        .join(', ')}.`,
      citations: list.map((o) => cite(o, 'excess', rand(o.excess))),
      grounded: true,
    }
  }
  if (/annual|year/.test(q)) {
    return {
      answer: options.map((o) => `${name(o)}: ${rand(o.annual_premium)} per year`).join('. ') + '.',
      citations: options.map((o) => cite(o, 'annual_premium', rand(o.annual_premium))),
      grounded: true,
    }
  }
  if (/cheap|lowest premium|lowest price|least expensive|cheapest|expensive|premium|price|cost/.test(q)) {
    const list = sorted((o) => o.monthly_premium)
    const pick = /expensive|highest|most/.test(q) && !/least/.test(q) ? list[list.length - 1] : list[0]
    return {
      answer: `${name(pick)} has the ${pick === list[0] ? 'lowest' : 'highest'} simulated premium at ${rand(pick.monthly_premium)} per month.`,
      citations: list.map((o) => cite(o, 'monthly_premium', rand(o.monthly_premium))),
      grounded: true,
    }
  }
  const feature: Array<[RegExp, CoverageKey]> = [
    [/courtesy|car hire|rental|hire car/, 'courtesy_vehicle'],
    [/windscreen|glass/, 'windscreen'],
    [/roadside|tow|breakdown/, 'roadside'],
    [/theft|hijack|stolen/, 'theft_hijacking'],
  ]
  const match = feature.find(([re]) => re.test(q))
  if (match) {
    const key = match[1]
    const rows = options.map((o) => ({ o, item: o.inclusions.find((i) => i.key === key) }))
    return {
      answer: rows.map(({ o, item }) => `${name(o)}: ${item ? item.detail : 'not stated'}`).join('. ') + '.',
      citations: rows.map(({ o, item }) => cite(o, item?.label ?? key, item?.detail ?? 'not stated')),
      grounded: true,
    }
  }
  if (/recommend|best|should i|which one|choose/.test(q)) {
    return {
      answer:
        'I can explain the trade-offs, but choosing an option is advice that a licensed broker must give. ' +
        'Ask about premiums, excesses or a specific benefit, or request the broker summary.',
      citations: [],
      grounded: false,
    }
  }
  return {
    answer:
      'I can only answer from the structured quote fields: premiums, annual cost, excesses, theft and hijacking, windscreen, roadside assistance and courtesy vehicle. I could not find that in the options.',
    citations: [],
    grounded: false,
  }
}
