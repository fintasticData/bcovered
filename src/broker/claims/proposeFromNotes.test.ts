import { describe, expect, it } from 'vitest'
import { proposeClaimFromNotes, proposeVehicleReplacementFromNotes } from './proposeFromNotes'

describe('proposeClaimFromNotes', () => {
  it('fills date, type and matched item from free text', () => {
    const draft = proposeClaimFromNotes(
      'Client called: rear-ended in the Polo on 12 Nov 2026 around 14:30.',
      [{ id: 'item-1', display_label: '2018 VW Polo' }],
    )
    expect(draft.incident_date).toBe('2026-11-12')
    expect(draft.incident_time).toBe('14:30')
    expect(draft.incident_type).toBe('motor_accident')
    expect(draft.item_ids).toEqual(['item-1'])
    expect(draft.description).toMatch(/rear-ended/)
  })
})

describe('proposeVehicleReplacementFromNotes', () => {
  it('parses bought vehicle details', () => {
    const draft = proposeVehicleReplacementFromNotes(
      "I've sold my Polo and bought a 2022 Toyota Corolla CA 123-456 effective 15 Nov 2026",
    )
    expect(draft.make).toMatch(/Toyota/i)
    expect(draft.model).toMatch(/Corolla/i)
    expect(draft.year).toBe('2022')
    expect(draft.registration).toMatch(/CA/i)
  })
})
