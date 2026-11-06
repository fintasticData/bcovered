import { z } from 'zod'
import { defineTool, STAFF, type ToolDef } from '../tools/registry'
import { archiveJob, cancelJob, pauseJob, resumeJob, retryJob } from './runner'

const jobId = z.object({ job_id: z.uuid() })

// Job state changes are audited inside the runner, so these tools are not marked as side effects.
export const jobTools = [
  defineTool({
    name: 'job.pause',
    description: 'Pause a queued or running job before its next step.',
    allow: STAFF,
    sideEffect: false,
    input: jobId,
    run: ({ repo, actor }, { job_id }) => pauseJob(repo, actor, job_id),
  }),
  defineTool({
    name: 'job.resume',
    description: 'Resume a paused job, or one waiting for information.',
    allow: STAFF,
    sideEffect: false,
    input: jobId,
    run: ({ repo, actor }, { job_id }) => resumeJob(repo, actor, job_id),
  }),
  defineTool({
    name: 'job.cancel',
    description: 'Cancel a job. No further steps, messages or record changes will run.',
    allow: STAFF,
    sideEffect: false,
    input: jobId,
    run: ({ repo, actor }, { job_id }) => cancelJob(repo, actor, job_id),
  }),
  defineTool({
    name: 'job.retry',
    description: 'Retry a failed job from the failed step.',
    allow: STAFF,
    sideEffect: false,
    input: jobId,
    run: ({ repo, actor }, { job_id }) => retryJob(repo, actor, job_id),
  }),
  defineTool({
    name: 'job.archive',
    description: 'Archive a finished job.',
    allow: STAFF,
    sideEffect: false,
    input: jobId,
    run: ({ repo, actor }, { job_id }) => archiveJob(repo, actor, job_id),
  }),
] as unknown as ToolDef[]
