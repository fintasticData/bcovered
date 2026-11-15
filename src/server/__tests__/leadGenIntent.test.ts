import { describe, expect, it } from 'vitest'
import { leadGenerationTurn, leadGenIntentOf } from '../../../supabase/functions/copilot-agent/planner'

describe('Russ generate-leads intent', () => {
  it('recognises research requests for new prospects in an area', () => {
    expect(leadGenIntentOf('Find 20 motor repair workshops within 10 km of Carnival City, Brakpan, with public business emails. I want prospects for commercial property cover.')).toBe(true)
    expect(leadGenIntentOf('Generate leads for bakeries in Benoni')).toBe(true)
    expect(leadGenIntentOf('Source 15 prospects near Menlyn for business interruption cover')).toBe(true)
  })

  it('leaves record requests to the planner', () => {
    expect(leadGenIntentOf('Show my leads')).toBe(false)
    expect(leadGenIntentOf('Open leads')).toBe(false)
    expect(leadGenIntentOf('Show Ubuntu Foods')).toBe(false)
    expect(leadGenIntentOf('Show schemes for Karoo Logistics')).toBe(false)
    expect(leadGenIntentOf('Add a note to Priya Naidoo’s motor policy: called about renewal')).toBe(false)
  })

  it('returns one lead search step carrying the request and message id for an idempotent run', () => {
    const turn = leadGenerationTurn({ copilot: 'ar', category: 'sample', text: 'Generate leads for bakeries in Benoni', context: {}, message_id: 'msg-123456' })
    expect(turn.steps).toHaveLength(1)
    expect(turn.steps[0]).toMatchObject({
      job: 'russ.leads.generate',
      intent: 'lead_generation',
      handled_by: 'russ',
      handed_off: true,
      status: 'needs_input',
      data: { prompt: 'Generate leads for bakeries in Benoni', message_id: 'msg-123456', run_id: null },
    })
  })
})
