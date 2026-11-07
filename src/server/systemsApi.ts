// Systems section handlers (/api/v1/systems). Managers and admins only.
import { principal, requireRole, type Auth } from './api'
import type { Role } from './db/schema'
import { buildCatalogue, type SystemsCatalogue } from './systems/catalogue'
import { answerSystemsQuestion, type SystemsAnswer } from './systems/copilot'

export const SYSTEMS_ROLES: Role[] = ['manager', 'admin']

export function getSystemsCatalogue(auth: Auth): SystemsCatalogue {
  const p = principal(auth)
  requireRole(p, SYSTEMS_ROLES)
  return buildCatalogue(p.repo)
}

export function askSystemsCopilot(auth: Auth, body: { question: string }): SystemsAnswer {
  const p = principal(auth)
  requireRole(p, SYSTEMS_ROLES)
  return answerSystemsQuestion(buildCatalogue(p.repo), body.question.slice(0, 500))
}
