import type { AssistantAdapter } from './adapter'
import { deterministicAdapter } from './deterministic'
import { falAdapter } from './fal'

export const ADAPTERS: AssistantAdapter[] = [deterministicAdapter, falAdapter]

export const getAssistantAdapter = (): AssistantAdapter => ADAPTERS.find((a) => a.available) ?? deterministicAdapter

export { initialIntakeState, PRIVACY_NOTICE_VERSION, type IntakeState } from './adapter'
