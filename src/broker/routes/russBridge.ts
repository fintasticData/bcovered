// Russ in the copilot panel, for Routes: runs are held in the browser, so a Route request is answered here (through
// api.routes, acting as Russ) instead of by the database copilot. The result is shown as ordinary step cards.
import { api } from '@/api/client'
import type { EntityRef, StepResult, TurnContext, TurnResult } from '@/copilot/api'
import type { DataCategory } from '@/lib/supabase/category'
import { guidePath, routeTurnFor, runRussRouteTurn, type RouteOps } from '@/routes/russ'

const russOps: RouteOps = {
  start: (b) => api.routes.start(b, 'russ'),
  progress: (id) => api.routes.progress(id),
  runAction: (b) => api.routes.runAction(b, 'russ'),
}

export const isRouteTurn = (text: string, context: TurnContext) => Boolean(routeTurnFor(text, context.route_run_id))

const step = (index: number, s: Omit<StepResult, 'index' | 'intent' | 'job' | 'handled_by' | 'handed_off' | 'category'>): StepResult => ({
  index,
  intent: 'route',
  job: null,
  handled_by: 'russ',
  handed_off: false,
  category: 'sample',
  ...s,
})

/** Answers a Route request, or returns null so the message goes to the database copilot as usual. */
export async function routeTurn(text: string, context: TurnContext, category: DataCategory): Promise<TurnResult | null> {
  if (!isRouteTurn(text, context)) return null
  if (category !== 'sample') {
    return {
      copilot: 'russ',
      category,
      reply: 'Routes run on Sample clients. Switch to Sample to prepare motor quotes.',
      steps: [step(0, { clause: text, status: 'refused', title: 'Switch to Sample', summary: 'Routes run on Sample clients with Demo · Sample quotes. Switch to Sample, then ask again.', links: [] })],
      context,
    }
  }
  const person = context.person?.record_type === 'client' ? context.person : null
  const turn = await runRussRouteTurn(russOps, { text, run_id: context.route_run_id ?? null, person_id: person?.id ?? null })
  if (!turn) return null

  const run = turn.progress.run
  const client = (run.state.client ?? null) as { person_id: string; client_number: string; name: string } | null
  const subject: EntityRef | null = client
    ? { record_type: 'client', id: client.person_id, number: client.client_number, name: client.name, category: 'sample', open_path: `/broker/book/clients/${client.person_id}` }
    : person
  const steps: StepResult[] = turn.ran.map((r, i) =>
    step(i, { clause: text, status: 'saved', title: r.label, summary: r.summary, subject, links: [{ label: 'Open guide', to: guidePath(run.id, r.action_id) }] }),
  )
  const progressLine = `${turn.route.title}: ${turn.progress.done_count} of ${turn.progress.total_count} actions done`
  if (turn.complete) {
    steps.push(step(steps.length, { clause: text, status: 'retrieved', title: `${turn.route.title} complete`, summary: progressLine, subject, links: [{ label: 'Open guide', to: guidePath(run.id) }] }))
  } else if (turn.paused_at) {
    steps.push(
      step(steps.length, {
        clause: text,
        status: 'needs_input',
        title: `Needs you: ${turn.paused_at.label}`,
        summary: `${turn.paused_at.reason ?? turn.paused_at.handover} ${progressLine}.`,
        subject,
        links: [{ label: `Open guide: ${turn.paused_at.label}`, to: turn.guide_path }],
      }),
    )
  }
  return {
    copilot: 'russ',
    category: 'sample',
    reply: turn.reply,
    steps,
    context: { ...context, person: subject ?? context.person ?? null, route_run_id: run.id },
  }
}
