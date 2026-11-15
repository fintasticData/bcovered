import { beforeEach, describe, expect, it } from 'vitest'
import { ensureClientAccount, getSessionUser, listIdentities, NO_TENANT } from '../api'
import { signUp } from '../onboardingApi'
import { db, identity, Repo } from '../db/store'
import { TENANT_ID } from '../db/seed'

describe('client account promotion', () => {
  beforeEach(() => {
    db.reset()
  })

  it('creates a customer in Client zone on sign-up', () => {
    const { user_id } = signUp({ email: 'clinton.reddy@example.test', password: 'password1', full_name: 'Clinton Reddy' })
    const user = identity.user(user_id)!
    expect(user.role).toBe('customer')
    expect(user.customer_id).toBeTruthy()
    expect(user.tenant_id).toBe(TENANT_ID)
    const session = getSessionUser({ userId: user_id })
    expect(session?.home).toBe('/my')
    expect(session?.role).toBe('customer')
  })

  it('promotes an older visitor signup into a customer', () => {
    const legacyId = db.transaction(() => {
      const repo = new Repo(NO_TENANT)
      const user = repo.insert('app_users', {
        email: 'legacy.visitor@example.test',
        full_name: 'Legacy Visitor',
        role: 'visitor',
        customer_id: null,
        active_organisation_id: null,
      })
      repo.insert('auth_identities', {
        user_id: user.id,
        email: 'legacy.visitor@example.test',
        password_salt: 'salt',
        password_hash: 'hash',
      })
      return user.id
    })
    const promoted = ensureClientAccount(legacyId)!
    expect(promoted.role).toBe('customer')
    expect(promoted.customer_id).toBeTruthy()
    expect(promoted.tenant_id).toBe(TENANT_ID)
    const session = getSessionUser({ userId: legacyId })
    expect(session?.role).toBe('customer')
    expect(session?.home).toBe('/my')
  })

  it('lists BCovered customers under demo identities after sign-up', () => {
    const { user_id } = signUp({ email: 'ava.client@example.test', password: 'password1', full_name: 'Ava Client' })
    const found = listIdentities().find((i) => i.user_id === user_id)
    expect(found?.home).toBe('/my')
    expect(found?.role).toBe('customer')
  })
})
