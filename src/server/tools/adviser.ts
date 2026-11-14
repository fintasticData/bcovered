import { z } from 'zod'
import { FAIS_LABEL, type AdviserAuthorisation, type FaisCategory, type ProductVersion } from '../db/lifeSchema'
import type { Repo } from '../db/store'
import { ToolError } from '../lib/errors'
import { defineTool, STAFF, type ToolDef } from './registry'

const FAIS = Object.keys(FAIS_LABEL) as [FaisCategory, ...FaisCategory[]]

export interface AuthorisationCheck {
  authorised: boolean
  authorisation: AdviserAuthorisation | null
  reason: string
}

/** Whether a representative may advise on a FAIS product category on a date. */
export function checkAuthorisation(repo: Repo, userId: string, category: FaisCategory, onDate = new Date().toISOString().slice(0, 10)): AuthorisationCheck {
  const user = repo.get('app_users', userId)
  if (!user) return { authorised: false, authorisation: null, reason: 'Unknown user' }
  const rows = repo.list('adviser_authorisations', (a) => a.user_id === userId && a.product_category === category)
  const valid = rows.find((a) => ['active', 'under_supervision'].includes(a.status) && a.effective_from <= onDate && (!a.effective_to || a.effective_to >= onDate))
  if (valid) {
    return {
      authorised: true,
      authorisation: valid,
      reason: `${user.full_name} is authorised for ${FAIS_LABEL[category]}${valid.status === 'under_supervision' ? ' under supervision' : ''}.`,
    }
  }
  const lapsed = rows.find((a) => !['active', 'under_supervision'].includes(a.status))
  return {
    authorised: false,
    authorisation: null,
    reason: lapsed
      ? `${user.full_name}’s authorisation for ${FAIS_LABEL[category]} is ${lapsed.status}.`
      : `${user.full_name} is not authorised for ${FAIS_LABEL[category]}. Assign the case to an adviser who is.`,
  }
}

export function assertAuthorised(repo: Repo, userId: string, category: FaisCategory): AdviserAuthorisation {
  const check = checkAuthorisation(repo, userId, category)
  if (!check.authorised) throw new ToolError('forbidden', check.reason)
  return check.authorisation!
}

/** The product version in force on a date. */
export function versionOn(repo: Repo, productId: string, onDate = new Date().toISOString().slice(0, 10)): ProductVersion | undefined {
  return repo
    .list('product_versions', (v) => v.product_id === productId && v.effective_from <= onDate && (!v.effective_to || v.effective_to > onDate))
    .sort((a, b) => b.version - a.version)[0]
}

export const adviserTools = [
  defineTool({
    name: 'adviser.check_authorisation',
    description: 'Check whether a representative is authorised for a FAIS product category today.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ user_id: z.uuid(), category: z.enum(FAIS) }),
    run: ({ repo }, { user_id, category }) => checkAuthorisation(repo, user_id, category),
  }),

  defineTool({
    name: 'product.get_version',
    description: 'The effective-dated rules of a product on a date.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ product_id: z.uuid(), on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    run: ({ repo }, { product_id, on_date }) => {
      const version = versionOn(repo, product_id, on_date)
      if (!version) throw new ToolError('not_found', 'No version of this product is in force on that date')
      return { product: repo.require('products', product_id), version, benefits: repo.list('product_benefits', (b) => b.product_version_id === version.id) }
    },
  }),
] as unknown as ToolDef[]
