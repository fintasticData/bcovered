import type { AssistantAdapter } from './adapter'
import { deterministicAdapter } from './deterministic'
import { falAdapter } from './fal'

export const ADAPTERS: AssistantAdapter[] = [deterministicAdapter, falAdapter]

/** A switched-on server adapter wins; the deterministic adapter is the always-available fallback. */
export const getAssistantAdapter = (): AssistantAdapter => ADAPTERS.find((a) => a.id !== 'deterministic' && a.available) ?? deterministicAdapter

export { initialIntakeState, PRIVACY_NOTICE_VERSION, type IntakeState } from './adapter'
