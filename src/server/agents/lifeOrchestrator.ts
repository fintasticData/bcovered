import type { LifeQuote, LifeQuoteOption, NeedsAnalysis, Policy, RecordOfAdvice } from '../db/lifeSchema'
import type { Job, Json } from '../db/schema'
import type { Repo } from '../db/store'
import { createJob, registerWorkflow, type StepContext } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import { assertAuthorised } from '../tools/adviser'
import { rand } from '../tools/life'
import type { Actor } from '../tools/registry'
import { TERMINAL_STATUSES } from './commercialOrchestrator'

export const LIFE_ADVICE = 'life_advice_to_issue'

export interface LifeAdviceInputs {
  customer_id: string
  person_id: string
  adviser_id: string
  smoker: boolean
}

const inputsOf = (ctx: StepContext) => ctx.job.inputs as unknown as LifeAdviceInputs
const out = (ctx: StepContext, key: string) => (ctx.repo.require('jobs', ctx.job.id).outputs ?? {})[key] as Record<string, Json> | undefined

registerWorkflow({
  type: LIFE_ADVICE,
  title: 'Life advice: needs analysis to issued policy',
  restartOnChangesFrom: 'advice',
  steps: [
    {
      key: 'needs',
      name: 'Analyse needs from the financial profile and existing cover',
      agent: 'life_sales',
      run: (ctx) => {
        const i = inputsOf(ctx)
        const analysis = ctx.call<NeedsAnalysis>('life.analyse_needs', { customer_id: i.customer_id, person_id: i.person_id, adviser_id: i.adviser_id })
        const gaps = analysis.needs.filter((n) => n.shortfall > 0)
        return {
          kind: 'done',
          output: { needs_analysis_id: analysis.id, summary: gaps.length ? `Shortfalls: ${gaps.map((g) => `${g.label} ${rand(g.shortfall)}`).join(', ')}` : 'No shortfall found' },
        }
      },
    },
    {
      key: 'quote',
      name: 'Prepare simulated quotes from the panel’s rate tables',
      agent: 'life_sales',
      run: (ctx) => {
        const r = ctx.call<{ quote: LifeQuote; options: LifeQuoteOption[] }>('life.prepare_quote', { needs_analysis_id: out(ctx, 'needs')!.needs_analysis_id, smoker: inputsOf(ctx).smoker })
        return { kind: 'done', output: { life_quote_id: r.quote.id, summary: `${r.options.length} options from ${rand(Math.min(...r.options.map((o) => o.monthly_premium)))} per month (simulated)` } }
      },
    },
    {
      key: 'advice',
      name: 'Draft the Record of Advice and wait for the adviser’s sign-off',
      agent: 'life_sales',
      run: (ctx) => {
        const r = ctx.call<{ roa: RecordOfAdvice; approval_id: string }>('life.draft_roa', { life_quote_id: out(ctx, 'quote')!.life_quote_id, adviser_id: inputsOf(ctx).adviser_id })
        return { kind: 'await_approval', approval_id: r.approval_id, output: { roa_id: r.roa.id, approval_id: r.approval_id, summary: `Draft Record of Advice v${r.roa.version} waiting for the adviser` } }
      },
    },
    {
      key: 'application',
      name: 'Prepare the application and wait for approval to submit',
      agent: 'life_sales',
      run: (ctx) => {
        const r = ctx.call<{ policy: Policy; approval_id: string }>('life.prepare_application', { roa_id: out(ctx, 'advice')!.roa_id })
        ctx.link({ customer_id: r.policy.customer_id })
        return { kind: 'await_approval', approval_id: r.approval_id, output: { policy_id: r.policy.id, approval_id: r.approval_id, summary: 'Application prepared; submission held for approval' } }
      },
    },
    {
      key: 'submit',
      name: 'Record the submission and expected underwriting requirements',
      agent: 'life_underwriting',
      run: (ctx) => {
        const r = ctx.call<{ policy: Policy; requirements: unknown[] }>('life.submit_application', { policy_id: out(ctx, 'application')!.policy_id })
        return { kind: 'done', output: { policy_id: r.policy.id, summary: `${r.requirements.length} underwriting requirement${r.requirements.length === 1 ? '' : 's'} to follow up` } }
      },
    },
    {
      key: 'underwriting',
      name: 'Create follow-ups for outstanding requirements',
      agent: 'life_underwriting',
      run: (ctx) => {
        const r = ctx.call<{ outstanding: number }>('life.track_underwriting', { policy_id: out(ctx, 'submit')!.policy_id })
        return { kind: 'done', output: { summary: `${r.outstanding} follow-up task${r.outstanding === 1 ? '' : 's'}; the insurer’s decision is recorded by a person` } }
      },
    },
  ],
})

export function activeLifeCase(repo: Repo, customerId: string): Job | undefined {
  return repo
    .list('jobs', (j) => j.workflow_type === LIFE_ADVICE && j.customer_id === customerId && !TERMINAL_STATUSES.includes(j.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

/** Starts life advice for a client. The adviser must hold the long-term FAIS category before any work starts. */
export function startLifeAdvice(repo: Repo, actor: Actor, inputs: LifeAdviceInputs): { job: Job; reused: boolean } {
  assertAuthorised(repo, inputs.adviser_id, 'lt_b1')
  const active = activeLifeCase(repo, inputs.customer_id)
  if (active) return { job: active, reused: true }
  if (!repo.find('financial_profiles', (f) => f.person_id === inputs.person_id && f.status === 'current')) {
    throw new ToolError('validation', 'Capture a financial profile for this client before starting life advice')
  }
  const count = repo.list('jobs', (j) => j.workflow_type === LIFE_ADVICE && j.customer_id === inputs.customer_id).length
  const job = createJob(repo, {
    workflow_type: LIFE_ADVICE,
    inputs: inputs as unknown as Record<string, Json>,
    initiated_by: actor,
    links: { customer_id: inputs.customer_id },
    idempotency_key: `life-advice:${inputs.customer_id}:${count}`,
  })
  return { job, reused: false }
}
