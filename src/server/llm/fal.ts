import type { AssistantAdapter } from './adapter'

/**
 * Placeholder for the fal.ai LLM adapter. API keys must never reach the browser, so this adapter only becomes
 * available inside the FastAPI backend with FAL_KEY configured. It will request JSON matching IntakeTurn,
 * validate it, and fall back to the deterministic adapter when validation fails.
 */
export const falAdapter: AssistantAdapter = {
  id: 'fal',
  label: 'fal.ai (server-side)',
  available: false,
  unavailableReason: 'Runs server-side only. Configure FAL_KEY on the FastAPI backend to enable it.',
  intakeTurn: async () => {
    throw new Error('fal.ai adapter is not configured in browser demo mode')
  },
}
