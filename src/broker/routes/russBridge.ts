// Russ in the copilot panel, for Routes: runs are held in the browser (synced to Supabase), answered through api.routes.
import { api } from '@/api/client'
import type { EntityRef, StepResult, TurnContext, TurnResult } from '@/copilot/api'
import type { DataCategory } from '@/lib/supabase/category'
import { getRoute } from '@/routes'
import { guidePath, routeTurnFor, runRussRouteTurn, type RouteOps } from '@/routes/russ'

const russOps: RouteOps = {
  start: (b) => api.routes.start(b, 'russ'),
  progress: (id) => api.routes.progress(id),
  runAction: (b) => api.routes.runAction(b, 'russ'),
}

export const isRouteTurn = (text: string, context: TurnContext) => Boolean(routeTurnFor(text, context.route_run_id))

const step = (
  index: number,
  s: Omit<StepResult, 'index' | 'intent' | 'job' | 'handled_by' | 'handed_off' | 'category'>,
  handedOff = false,
  category: DataCategory = 'sample',
): StepResult => ({
  index,
  intent: 'route',
  job: null,
  handled_by: 'russ',
  handed_off: handedOff,
  category,
  ...s,
})

/** Answers a Route request, or returns null so the message goes to the database copilot as usual. */
export async function routeTurn(
  text: string,
  context: TurnContext,
  category: DataCategory,
  fromCopilot: 'ava' | 'russ' | 'ar' = 'russ',
): Promise<TurnResult | null> {
  const handedOff = fromCopilot === 'ava'
  if (!isRouteTurn(text, context)) return null

  const asked = routeTurnFor(text, context.route_run_id)
  const defId = asked && asked !== 'continue' ? asked.id : null
  const def = defId ? getRoute(defId) : null
  if (def?.category === 'sample' && category !== 'sample') {
    return {
      copilot: 'russ',
      category,
      reply: 'This Demo Route runs on Sample clients. Switch to Demo to continue, or start a Production-eligible Route.',
      steps: [
        step(
          0,
          {
            clause: text,
            status: 'refused',
            title: 'Switch to Demo',
            summary: 'Demo Quotes and other Sample-only Routes need Demo mode.',
            links: [{ label: 'Open Routes', to: '/broker/routes' }],
          },
          handedOff,
          category,
        ),
      ],
      context,
    }
  }

  const person = context.person?.record_type === 'client' ? context.person : null
  const turn = await runRussRouteTurn(russOps, {
    text,
    run_id: context.route_run_id ?? null,
    person_id: person?.id ?? null,
  })
  if (!turn) return null

  const run = turn.progress.run
  const client = (run.state.client ?? null) as { person_id: string; client_number: string; name: string } | null
  const subject: EntityRef | null = client
    ? {
        record_type: 'client',
        id: client.person_id,
        number: client.client_number,
        name: client.name,
        category: run.category,
        open_path: `/broker/customers/people/${client.person_id}`,
      }
    : person
  const steps: StepResult[] = turn.ran.map((r, i) =>
    step(i, { clause: text, status: 'saved', title: r.label, summary: r.summary, subject, links: [{ label: 'Open guide', to: guidePath(run.id, r.action_id) }] }, handedOff, run.category),
  )
  if (turn.plan && turn.plan.length > 1) {
    steps.unshift(
      step(
        0,
        {
          clause: text,
          status: 'retrieved',
          title: `Plan: ${turn.plan.length} jobs`,
          summary: turn.plan.map((p) => `${p.title} (${p.status})`).join('; '),
          subject,
          links: turn.plan.map((p) => ({ label: p.title, to: '/broker/routes' })),
        },
        handedOff,
        run.category,
      ),
    )
  }
  const progressLine = `${turn.route.title}: ${turn.progress.done_count} of ${turn.progress.total_count} actions done`
  if (turn.complete) {
    steps.push(
      step(
        steps.length,
        { clause: text, status: 'retrieved', title: `${turn.route.title} complete`, summary: progressLine, subject, links: [{ label: 'Open guide', to: guidePath(run.id) }] },
        handedOff,
        run.category,
      ),
    )
  } else if (turn.paused_at) {
    steps.push(
      step(
        steps.length,
        {
          clause: text,
          status: 'needs_input',
          title: `Needs you: ${turn.paused_at.label}`,
          summary: `${turn.paused_at.reason ?? turn.paused_at.handover} ${progressLine}.`,
          subject,
          links: [{ label: `Open guide: ${turn.paused_at.label}`, to: turn.guide_path }],
        },
        handedOff,
        run.category,
      ),
    )
  }
  return {
    copilot: handedOff ? 'ava' : 'russ',
    category: run.category,
    reply: handedOff ? `Russ handled this route step. ${turn.reply}` : turn.reply,
    steps,
    context: { ...context, person: subject ?? context.person ?? null, route_run_id: run.id },
  }
}
