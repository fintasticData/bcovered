import { describe, expect, it } from 'vitest'
import { resolveCoverOnLossDate } from './resolveCoverOnLossDate'

const versions = [
  {
    id: 'v1',
    version_no: 1,
    effective_at: '2025-10-01T00:00:00+02:00',
    superseded_at: '2025-11-01T00:00:00+02:00',
    terms: { excess: 5000 },
    items: [{ id: 'old', display_label: '2019 Toyota Corolla', item_type: 'vehicle' }],
  },
  {
    id: 'v2',
    version_no: 2,
    effective_at: '2025-11-01T00:00:00+02:00',
    superseded_at: null,
    terms: { excess: 7500 },
    items: [{ id: 'new', display_label: '2024 Hyundai Tucson', item_type: 'vehicle' }],
  },
]

describe('resolveCoverOnLossDate', () => {
  it('resolves Oct loss to Corolla and R5000', () => {
    const r = resolveCoverOnLossDate(versions, '2025-10-28T14:30:00+02:00', false)
    expect(r?.review_needed).toBe(false)
    if (r && !r.review_needed) {
      expect(r.version_id).toBe('v1')
      expect(r.excess).toBe(5000)
      expect(r.item_labels[0]).toContain('Corolla')
    }
  })

  it('resolves 1 Nov boundary to Tucson and R7500', () => {
    const r = resolveCoverOnLossDate(versions, '2025-11-01T09:00:00+02:00', false)
    expect(r?.review_needed).toBe(false)
    if (r && !r.review_needed) {
      expect(r.version_id).toBe('v2')
      expect(r.excess).toBe(7500)
      expect(r.item_labels[0]).toContain('Tucson')
    }
  })

  it('flags schedule review when no version covers the date', () => {
    const r = resolveCoverOnLossDate(versions, '2025-09-20T11:00:00+02:00', false)
    expect(r?.review_needed).toBe(true)
    if (r?.review_needed) {
      expect(r.reason).toBe('Schedule review required')
      expect(r.excess).toBeNull()
    }
  })
})
