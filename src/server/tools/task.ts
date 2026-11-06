import { z } from 'zod'
import type { Task } from '../db/commercialSchema'
import type { Repo } from '../db/store'
import { defineTool, STAFF, type ToolDef } from './registry'

export interface NewTask {
  customer_id?: string | null
  subject_table?: string | null
  subject_id?: string | null
  kind: Task['kind']
  audience: Task['audience']
  title: string
  detail?: string | null
  assigned_to?: string | null
  due_in_days?: number
  dedupe_key?: string | null
}

/** Creates a task unless an open task with the same dedupe key exists, so re-runs never duplicate requests. */
export function createTask(repo: Repo, createdBy: string | null, jobId: string | null, t: NewTask): { task: Task; created: boolean } {
  if (t.dedupe_key) {
    const open = repo.find('tasks', (x) => x.dedupe_key === t.dedupe_key && x.status === 'open')
    if (open) return { task: open, created: false }
  }
  const task = repo.insert('tasks', {
    customer_id: t.customer_id ?? null,
    subject_table: t.subject_table ?? null,
    subject_id: t.subject_id ?? null,
    kind: t.kind,
    audience: t.audience,
    title: t.title,
    detail: t.detail ?? null,
    status: 'open',
    assigned_to: t.assigned_to ?? null,
    due_date: t.due_in_days ? new Date(Date.now() + t.due_in_days * 86_400_000).toISOString() : null,
    created_by_agent: createdBy,
    job_id: jobId,
    dedupe_key: t.dedupe_key ?? null,
  })
  return { task, created: true }
}

export const taskTools = [
  defineTool({
    name: 'task.create',
    description: 'Create a document request, information request or broker review task.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid().nullable().optional(),
      subject_table: z.string().nullable().optional(),
      subject_id: z.uuid().nullable().optional(),
      kind: z.enum(['document_request', 'information_request', 'broker_review', 'follow_up']),
      audience: z.enum(['customer', 'broker']),
      title: z.string().min(3),
      detail: z.string().nullable().optional(),
      assigned_to: z.uuid().nullable().optional(),
      due_in_days: z.number().int().min(1).max(90).optional(),
      dedupe_key: z.string().nullable().optional(),
    }),
    run: ({ repo, actor, jobId }, input) => createTask(repo, actor.type === 'agent' ? actor.id : null, jobId ?? null, input),
    auditEntity: (r) => ({ table: 'tasks', id: r.task.id }),
  }),

  defineTool({
    name: 'task.update',
    description: 'Mark a task done or cancelled.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ task_id: z.uuid(), status: z.enum(['open', 'done', 'cancelled']) }),
    run: ({ repo }, { task_id, status }) => repo.update('tasks', task_id, { status }),
    auditEntity: (r) => ({ table: 'tasks', id: r.id }),
  }),
] as unknown as ToolDef[]
