import { falApi } from '@/lib/fal/api'
import type { AssistantAdapter, IntakeState } from './adapter'
import { deterministicAdapter } from './deterministic'

const enabled = String((import.meta.env as Record<string, string | undefined>)?.VITE_ASSISTANT_ADAPTER ?? '').trim().toLowerCase() === 'fal'

const QUESTION =
  /\?|^\s*(what|how|which|why|when|where|who|do|does|should|can|could|is|are|will|would)\b|\b(typically|estimate|roughly|how much|what (cover|insurance|items))\b/i

/** Steps where the customer is giving consent or personal details: answers there go to the deterministic intake only. */
const DETAIL_STAGES: IntakeState['stage'][] = ['consent', 'declined', 'contact', 'confirm']

export const isGeneralQuestion = (state: IntakeState, text: string) => !DETAIL_STAGES.includes(state.stage) && QUESTION.test(text)

/**
 * fal.ai on top of the deterministic intake. The deterministic adapter still decides every slot, consent step and
 * submission. fal answers general insurance questions (then the intake carries on) and otherwise rewrites the reply,
 * both through the fal-ai Edge Function, which holds BCOVERED_FAL_API_KEY. Any failure keeps the deterministic reply.
 */
export const falAdapter: AssistantAdapter = {
  id: 'fal',
  label: 'fal.ai answers and wording on the deterministic intake (server-side)',
  available: enabled,
  unavailableReason: enabled
    ? undefined
    : 'Set VITE_ASSISTANT_ADAPTER=fal to turn it on. Needs BCOVERED_FAL_API_KEY as a secret on the fal-ai Edge Function.',
  intakeTurn: async (state, userText) => {
    const turn = await deterministicAdapter.intakeTurn(state, userText)
    if (isGeneralQuestion(state, userText)) {
      try {
        const { answer } = await falApi.answer(userText)
        const next = turn.reply.replace(/^Sorry, I didn't catch that\.\s*/i, '')
        return { ...turn, reply: `${answer}\n\n${next}` }
      } catch {
        return turn
      }
    }
    try {
      const { reply } = await falApi.intake({ text: userText, draft: { reply: turn.reply } })
      return { ...turn, reply }
    } catch {
      return turn
    }
  },
}
