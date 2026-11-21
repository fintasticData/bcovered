import { beforeEach, describe, expect, it } from 'vitest'
import { captureLead, closeLead, getLead, listLeads } from '../api'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { invokeTool } from '../tools'

const broker = { userId: SEED_IDS.users.broker }

beforeEach(() => db.reset())

describe('person-first lead capture', () => {
  it('captures a person without cover and adds a second opportunity under the same customer', () => {
    const first = captureLead(broker, { kind: 'person', full_name: 'Lerato M.', phone: '0825550199', notes: 'Walk-in' })
    expect(first.created).toBe(true)
    expect(first.lead.status).toBe('lead')
    expect(first.lead.product_category).toBeNull()
    expect(first.person_id).toBeTruthy()
    expect(first.open_path).toMatch(/^\/broker\/customers\/people\//)

    const second = captureLead(broker, { kind: 'person', full_name: 'Lerato M.', phone: '0825550199', product_category: 'motor' })
    expect(second.created).toBe(false)
    expect(second.customer.id).toBe(first.customer.id)
    expect(second.lead.id).not.toBe(first.lead.id)
    expect(second.lead.product_category).toBe('motor')
    expect(second.person_id).toBe(first.person_id)

    const detail = getLead(broker, { lead_id: second.lead.id })
    expect(detail.sibling_opportunities).toHaveLength(2)
    expect(detail.person_id).toBe(first.person_id)
    expect(detail.customer_area_path).toBe(first.open_path)

    const closed = closeLead(broker, { lead_id: first.lead.id, reason: 'Declined', closed_at_stage: 'lead' })
    expect(closed.status).toBe('closed')
    expect(closed.closed_reason).toBe('Declined')
    expect(closed.closed_at_stage).toBe('lead')

    const rows = listLeads(broker).filter((l) => l.customer_id === first.customer.id)
    expect(rows.some((l) => l.status === 'closed')).toBe(true)
    expect(rows.some((l) => l.status === 'lead' && l.product_category === 'motor')).toBe(true)
  })

  it('captures a business into Customer Area businesses', () => {
    const captured = captureLead(broker, {
      kind: 'business',
      full_name: 'CARtime Test Gardens',
      email: 'office@cartime-test.example.demo',
      region: 'Montague Gardens',
    })
    expect(captured.created).toBe(true)
    expect(captured.business_profile_id).toBeTruthy()
    expect(captured.open_path).toMatch(/^\/broker\/customers\/businesses\//)
    const detail = getLead(broker, { lead_id: captured.lead.id })
    expect(detail.business_profile_id).toBe(captured.business_profile_id)
    expect(detail.customer_area_path).toBe(captured.open_path)
  })

  it('marks an opportunity live when the linked policy is in force', () => {
    const { lead, customer } = captureLead(broker, {
      kind: 'person',
      full_name: 'Priya N.',
      email: 'priya.n.live@example.demo',
      product_category: 'motor',
    })
    const repo = new Repo(TENANT_ID)
    const pol = repo.insert('policies', {
      customer_id: customer.id,
      line: 'short_term_personal',
      provider_id: SEED_IDS.insurers.protea,
      policy_number: 'TEST-LIVE-1',
      origin: 'placed',
      status: 'in_force',
      underwriting_status: 'accepted',
      premium_amount: 500,
      premium_frequency: 'monthly',
      is_simulated: true,
      created_by: null,
    } as never)
    const live = invokeTool<{ status: string; policy_id: string }>(
      'lead.mark_live',
      { lead_id: lead.id, policy_id: pol.id },
      { repo, actor: { type: 'user', id: SEED_IDS.users.broker, role: 'broker' } },
    )
    expect(live.status).toBe('live')
    expect(live.policy_id).toBe(pol.id)
  })
})
