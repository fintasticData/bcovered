import { z } from 'zod'
import { defineTool, STAFF, type ToolDef } from './registry'

export const communicationTools = [
  defineTool({
    name: 'communication.prepare_draft',
    description: 'Prepare a preview-only message draft. Nothing is sent from this demo.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid(),
      channel: z.enum(['email', 'whatsapp', 'in_app']),
      template: z.string(),
      subject: z.string().optional(),
      body: z.string().min(5),
      related_quote_id: z.uuid().optional(),
    }),
    run: ({ repo, jobId }, input) => {
      const consent = repo.find(
        'customer_consents',
        (c) => c.customer_id === input.customer_id && c.purpose === 'processing' && c.granted && !c.revoked_at,
      )
      return repo.insert('communications', {
        customer_id: input.customer_id,
        channel: input.channel,
        template: input.template,
        subject: input.subject ?? null,
        body: input.body,
        status: consent ? 'draft' : 'cancelled',
        preview_only: true,
        related_quote_id: input.related_quote_id ?? null,
        job_id: jobId ?? null,
      })
    },
    auditEntity: (r) => ({ table: 'communications', id: r.id }),
  }),
] as unknown as ToolDef[]
