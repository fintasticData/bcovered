import { z } from 'zod'
import { abandonRun, listRoutes, listRuns, progress, runAction, startOrResume, type RouteActor } from '@/routes'
import { agentLabel } from '../agents/catalog'
import type { Json } from '../db/schema'
import type { Repo } from '../db/store'
import { defineTool, STAFF, type Actor, type ToolDef } from './registry'

const json = z.custom<Json>(() => true)

/** Who the run records as having done an action: the signed-in person's name, or the copilot's. */
export function routeActor(repo: Repo, actor: Actor): RouteActor {
  if (actor.type === 'agent') return { type: 'agent', id: actor.id, name: agentLabel(actor.id) }
  return { type: 'user', id: actor.id, name: repo.get('app_users', actor.id)?.full_name ?? 'You' }
}

export const routeTools = [
  defineTool({
    name: 'route.list',
    description: 'List the Routes (guided business processes) and the runs in this workspace.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({}),
    run: ({ repo }) => ({
      routes: listRoutes().map((d) => ({ id: d.id, title: d.title, outcome: d.outcome, badge: d.badge ?? null, phases: d.phases.map((p) => ({ title: p.title, actions: p.actions.map((a) => a.label) })) })),
      runs: listRuns(repo),
    }),
  }),

  defineTool({
    name: 'route.start',
    description: 'Start a Route for a client, or resume the active run for the same Route and client.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ definition_id: z.string().min(1), subject_id: z.string().min(1).nullable().optional() }),
    run: ({ repo, actor }, input) => {
      const { run, resumed } = startOrResume(repo, routeActor(repo, actor), input)
      return { run_id: run.id, resumed, subject_id: run.subject_id }
    },
    auditEntity: (r) => ({ table: 'route_runs', id: r.run_id }),
  }),

  defineTool({
    name: 'route.progress',
    description: 'A Route run: phases, each action’s status (done, available, blocked with what is missing, stale), the next action and the working data.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ run_id: z.string().min(1) }),
    run: ({ repo }, { run_id }) => progress(repo, run_id),
  }),

  defineTool({
    name: 'route.action.run',
    description: 'Run one Route action with its input. Prerequisites, confirmation and validation are checked; a Supabase receipt is required for actions that write to the client record.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      run_id: z.string().min(1),
      action_id: z.string().min(1),
      input: z.record(z.string(), json).default({}),
      receipt: json.optional(),
      effect_error: z.string().nullable().optional(),
      key: z.string().min(8).nullable().optional(),
    }),
    run: ({ repo, actor }, body) => ({ run_id: body.run_id, action_id: body.action_id, ...runAction(repo, routeActor(repo, actor), body) }),
    auditEntity: (r) => ({ table: 'route_runs', id: r.run_id }),
  }),

  defineTool({
    name: 'route.abandon',
    description: 'Close an active Route run without finishing it.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ run_id: z.string().min(1) }),
    run: ({ repo }, { run_id }) => ({ run_id: abandonRun(repo, run_id).id }),
    auditEntity: (r) => ({ table: 'route_runs', id: r.run_id }),
  }),
] as unknown as ToolDef[]
