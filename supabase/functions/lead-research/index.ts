// Russ "Generate leads". The browser drives a run one bounded step at a time (POST /runs/:id/step) so progress is visible,
// a refresh can resume it and nothing outlives the Edge Function time limit. Every database write goes through the
// leadgen_* SQL functions as the signed-in broker, so tenant, Sample / Live and role checks stay in row-level security.
import { Hono } from 'hono'
import { FAL_KEY, FalError, MODELS } from './fal.ts'
import { discover, parseRequest, researchArea, verifyCandidate, type Spend } from './pipeline.ts'
import { hostOf } from './fetchPage.ts'
import { Budget, CreateRun, Filters, StepRequest, type AreaFinding, type Candidate } from './schema.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const envNum = (name: string, fallback: number) => {
  const v = Number(Deno.env.get(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const DEFAULT_BUDGET: Budget = {
  max_seconds: envNum('LEADGEN_MAX_SECONDS', 300),
  max_searches: envNum('LEADGEN_MAX_SEARCHES', 10),
  max_page_fetches: envNum('LEADGEN_MAX_PAGE_FETCHES', 80),
  max_cost_usd: envNum('LEADGEN_MAX_COST_USD', 0.75),
}
const MAX_COUNT = envNum('LEADGEN_MAX_COUNT', 50)
/** Work per step call; the browser calls again until the run stops. */
const SLICE_MS = 40_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-data-category',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Category = 'sample' | 'live'
type Json = Record<string, unknown>

class RpcError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

async function rpc<T = Json>(auth: string, category: Category, fn: string, args: Json): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: ANON_KEY, 'Content-Type': 'application/json', 'x-data-category': category },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = String(body?.message ?? 'failed')
    const status = code === 'forbidden' ? 403 : code === 'not_found' ? 404 : code === 'conflict' ? 409 : code === 'needs_input' || code === 'validation' ? 400 : 502
    throw new RpcError(status, code, String(body?.details ?? body?.message ?? `Database call ${fn} failed (${res.status})`))
  }
  return body as T
}

async function cancelRequested(auth: string, category: Category, id: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${id}&select=cancel_requested`, {
    headers: { Authorization: auth, apikey: ANON_KEY, 'x-data-category': category },
  })
  const rows = (await res.json().catch(() => [])) as Array<{ cancel_requested?: boolean }>
  return rows[0]?.cancel_requested === true
}

interface Progress {
  found: number
  requested: number
  searches_used: number
  pages_fetched: number
  candidates_checked: number
  cost_usd: number
  elapsed_ms: number
  step: string
}
interface Outputs {
  phase: 'area' | 'discover' | 'done'
  area_findings: AreaFinding[]
  area_summary?: string | null
  localities: string[]
  candidates: Candidate[]
  seen_hosts: string[]
  seen_names: string[]
  rejected: Array<{ business_name: string; reason: string; url: string | null }>
  empty_searches?: number
  last_error?: string | null
  stop_reason: string | null
  summary: string | null
  progress: Progress
}
interface Run {
  id: string
  status: string
  cancel_requested: boolean
  inputs: { prompt?: string; filters: unknown; budget: Partial<Budget> }
  outputs: Outputs
  leads: unknown[]
}

/** Internal queues stay in the database; the browser gets the findings, progress and saved leads. */
const publicRun = (run: Run | null) => {
  if (!run) return null
  const { candidates: _c, seen_hosts: _h, seen_names: _n, ...outputs } = run.outputs ?? ({} as Outputs)
  return { ...run, outputs: { ...outputs, queued: run.outputs?.candidates?.length ?? 0 } }
}

const STOP_TEXT: Record<string, string> = {
  count_reached: 'Stopped because the requested number was reached.',
  budget_exhausted: 'Stopped because the search budget (time, searches, page reads or cost) ran out.',
  cancelled: 'Stopped because you cancelled the search.',
  no_more_candidates: 'Stopped because no further matching businesses could be found in the area.',
  failed: 'Stopped because the research service kept failing.',
}

const app = new Hono().basePath('/lead-research')
app.options('*', () => new Response(null, { headers: CORS }))

app.get('/health', (c) =>
  c.json({ configured: Boolean(FAL_KEY), models: MODELS, budget: DEFAULT_BUDGET, max_count: MAX_COUNT }, 200, CORS),
)

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS' || c.req.path.endsWith('/health')) return next()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: c.req.header('Authorization') ?? '', apikey: ANON_KEY } })
  const user = res.ok ? await res.json().catch(() => null) : null
  if (typeof user?.id !== 'string') return c.json({ error: 'Sign in to search for leads.' }, 401, CORS)
  await next()
})

app.onError((e, c) => {
  if (e instanceof RpcError) return c.json({ error: e.message, code: e.code }, e.status as 400, CORS)
  if (e instanceof FalError) return c.json({ error: e.message, code: 'research_unavailable' }, 502, CORS)
  return c.json({ error: e instanceof Error ? e.message : String(e) }, 500, CORS)
})

app.post('/parse', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text || text.length > 4000) return c.json({ error: 'Send the request text (4,000 characters at most).' }, 400, CORS)
  const r = await parseRequest(text)
  const filters = { ...r.filters, cover_type: r.filters.cover_type ?? 'Commercial property', requested_count: Math.min(MAX_COUNT, r.filters.requested_count ?? 20) }
  return c.json({ filters, source: r.source, cost_usd: r.cost_usd, budget: DEFAULT_BUDGET, max_count: MAX_COUNT }, 200, CORS)
})

app.get('/runs', async (c) => {
  const category = c.req.query('category') as Category
  if (category !== 'sample' && category !== 'live') return c.json({ error: 'category must be sample or live' }, 400, CORS)
  const runs = await rpc(c.req.header('Authorization') ?? '', category, 'leadgen_list_runs', { p_category: category, p_limit: 25 })
  return c.json({ runs }, 200, CORS)
})

app.post('/runs', async (c) => {
  const parsed = CreateRun.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Check the search filters.', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400, CORS)
  const { category, prompt, filters, idempotency_key, budget } = parsed.data
  const merged = Budget.parse({ ...DEFAULT_BUDGET, ...(budget ?? {}) })
  const run = await rpc<Run>(c.req.header('Authorization') ?? '', category, 'leadgen_create_run', {
    p_category: category,
    p_prompt: prompt,
    p_filters: { ...filters, requested_count: Math.min(MAX_COUNT, filters.requested_count) },
    p_budget: merged,
    p_idempotency_key: idempotency_key,
  })
  return c.json({ run: publicRun(run) }, 200, CORS)
})

app.get('/runs/:id', async (c) => {
  const category = c.req.query('category') as Category
  if (category !== 'sample' && category !== 'live') return c.json({ error: 'category must be sample or live' }, 400, CORS)
  const run = await rpc<Run>(c.req.header('Authorization') ?? '', category, 'leadgen_get_run', { p_category: category, p_job_id: c.req.param('id') })
  return c.json({ run: publicRun(run) }, 200, CORS)
})

app.post('/runs/:id/cancel', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { category?: Category } | null
  const category = body?.category
  if (category !== 'sample' && category !== 'live') return c.json({ error: 'category must be sample or live' }, 400, CORS)
  const run = await rpc<Run>(c.req.header('Authorization') ?? '', category, 'leadgen_cancel_run', { p_category: category, p_job_id: c.req.param('id') })
  return c.json({ run: publicRun(run) }, 200, CORS)
})

app.post('/runs/:id/step', async (c) => {
  const parsed = StepRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Send category and worker.' }, 400, CORS)
  const { category, worker } = parsed.data
  const auth = c.req.header('Authorization') ?? ''
  const id = c.req.param('id')
  const claim = await rpc<{ claimed: boolean; run: Run }>(auth, category, 'leadgen_claim', { p_category: category, p_job_id: id, p_worker: worker, p_lease_seconds: 90 })
  if (!claim.run) return c.json({ error: 'That lead search is not available in this category.' }, 404, CORS)
  if (!claim.claimed) return c.json({ run: publicRun(claim.run), busy: !['completed', 'failed', 'cancelled'].includes(claim.run.status) }, 200, CORS)

  const run = claim.run
  const filters = Filters.parse(run.inputs.filters)
  const budget = Budget.parse({ ...DEFAULT_BUDGET, ...(run.inputs.budget ?? {}) })
  const out: Outputs = {
    ...run.outputs,
    candidates: run.outputs.candidates ?? [],
    seen_hosts: run.outputs.seen_hosts ?? [],
    seen_names: run.outputs.seen_names ?? [],
    rejected: run.outputs.rejected ?? [],
    localities: run.outputs.localities ?? [],
    area_findings: run.outputs.area_findings ?? [],
  }
  const p: Progress = { ...run.outputs.progress, found: run.leads.length, requested: filters.requested_count }
  const spend: Spend = { cost_usd: p.cost_usd ?? 0, searches: p.searches_used ?? 0, pages: p.pages_fetched ?? 0 }
  const started = Date.now()
  const baseElapsed = p.elapsed_ms ?? 0

  const sync = () => {
    p.cost_usd = Math.round(spend.cost_usd * 10000) / 10000
    p.searches_used = spend.searches
    p.pages_fetched = spend.pages
    p.elapsed_ms = baseElapsed + (Date.now() - started)
  }
  const save = async (status?: string, step?: [string, string]) => {
    sync()
    const updated = await rpc<Run>(auth, category, 'leadgen_update_run', {
      p_category: category,
      p_job_id: id,
      p_worker: worker,
      p_outputs: { ...out, progress: p },
      p_status: status ?? null,
      p_step_key: step?.[0] ?? null,
      p_step_status: step?.[1] ?? null,
    })
    return c.json({ run: publicRun(updated) }, 200, CORS)
  }
  const finish = async (reason: string) => {
    out.phase = 'done'
    out.stop_reason = reason
    out.summary = `${p.found} of ${p.requested} found with published emails. ${STOP_TEXT[reason] ?? ''}`.trim()
    p.step = 'Finished'
    const status = reason === 'cancelled' ? 'cancelled' : reason === 'failed' ? 'failed' : 'completed'
    return save(status, ['find_businesses', reason === 'cancelled' ? 'cancelled' : 'completed'])
  }
  const outOfBudget = () => {
    sync()
    return p.elapsed_ms >= budget.max_seconds * 1000 || spend.cost_usd >= budget.max_cost_usd || spend.pages >= budget.max_page_fetches
  }

  if (run.cancel_requested) return finish('cancelled')
  if (p.found >= p.requested) return finish('count_reached')

  try {
    if (out.phase === 'area') {
      p.step = 'Researching the area'
      try {
        const area = await researchArea(filters, spend)
        out.area_findings = area.findings
        out.area_summary = area.summary
        out.localities = area.localities
      } catch (e) {
        out.last_error = e instanceof Error ? e.message : String(e)
        out.localities = out.localities.length ? out.localities : filters.area.split(',').map((s) => s.trim()).filter(Boolean)
      }
      out.phase = 'discover'
      p.step = 'Finding businesses'
      await rpc(auth, category, 'leadgen_update_run', { p_category: category, p_job_id: id, p_worker: worker, p_outputs: {}, p_step_key: 'area_research', p_step_status: 'completed' })
      return save(undefined, ['find_businesses', 'running'])
    }

    while (Date.now() - started < SLICE_MS) {
      if (await cancelRequested(auth, category, id)) return finish('cancelled')
      if (p.found >= p.requested) return finish('count_reached')
      if (outOfBudget()) return finish('budget_exhausted')

      if (!out.candidates.length) {
        if (spend.searches >= budget.max_searches) return finish('budget_exhausted')
        if ((out.empty_searches ?? 0) >= 3) return finish('no_more_candidates')
        p.step = 'Searching for more businesses'
        const want = Math.min(15, Math.max(6, (p.requested - p.found) * 2))
        const found = await discover(filters, out.localities, out.seen_names, want, spend, spend.searches)
        const fresh = found.filter((x) => {
          const host = hostOf(x.website)
          const name = x.business_name.toLowerCase()
          return !(host && out.seen_hosts.includes(host)) && !out.seen_names.some((n) => n.toLowerCase() === name)
        })
        out.empty_searches = fresh.length ? 0 : (out.empty_searches ?? 0) + 1
        out.candidates.push(...fresh.slice(0, 20))
        await save()
        continue
      }

      const cand = out.candidates.shift()!
      const host = hostOf(cand.website)
      if (host) out.seen_hosts.push(host)
      out.seen_names.push(cand.business_name)
      p.step = `Checking ${cand.business_name}`
      p.candidates_checked = (p.candidates_checked ?? 0) + 1
      const v = await verifyCandidate(cand, filters, out.localities, Math.max(0, budget.max_page_fetches - spend.pages), spend)
      if (v.lead) {
        const saved = await rpc<{ match_saved: boolean }>(auth, category, 'leadgen_save_lead', { p_category: category, p_job_id: id, p_lead: { ...v.lead, is_sample: false } })
        if (saved?.match_saved) p.found += 1
      } else {
        out.rejected = [...out.rejected, { business_name: cand.business_name, reason: v.reason ?? 'Not verified', url: cand.website ?? cand.source_url }].slice(-60)
      }
      out.last_error = null
      await save()
    }
    p.step = 'Continuing'
    return save()
  } catch (e) {
    if (e instanceof RpcError && e.code === 'conflict') throw e
    out.last_error = e instanceof Error ? e.message : String(e)
    await save().catch(() => null)
    throw e
  }
})

Deno.serve(app.fetch)
