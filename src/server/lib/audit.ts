import type { Json, TableName } from '../db/schema'
import type { Repo } from '../db/store'
import type { Actor } from '../tools/registry'

export function audit(
  repo: Repo,
  actor: Actor,
  action: string,
  entity: { table: TableName; id: string } | null,
  change: { before?: unknown; after?: unknown } = {},
  jobId: string | null = null,
) {
  repo.insert('audit_events', {
    actor_type: actor.type,
    actor_id: actor.id,
    action,
    entity_table: entity?.table ?? null,
    entity_id: entity?.id ?? null,
    before: (change.before === undefined ? null : structuredClone(change.before)) as Json,
    after: (change.after === undefined ? null : structuredClone(change.after)) as Json,
    job_id: jobId,
  })
}
