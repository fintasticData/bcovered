// Simple service-provider directory finder. No area trends, email optional.
// Browser drives one step at a time: discover batch → save one provider per step.
import { Hono } from 'hono'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const KEY_NAMES = ['BCOVERED_FAL_API_KEY', 'FAL_KEY'] as const
const FAL_KEY = KEY_NAMES.map((n) => Deno.env.get(n)).find(Boolean) ?? null
const SEARCH_MODEL = Deno.env.get('BCOVERED_FAL_SEARCH_MODEL') ?? 'perplexity/sonar-pro'
const CHAT_URL = 'https://fal.run/openrouter/router/openai/v1/chat/completions'

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
    const status = code === 'forbidden' ? 403 : code === 'not_found' ? 404 : 502
    throw new RpcError(status, code, String(body?.details ?? body?.message ?? `Database call ${fn} failed`))
  }
  return body as T
}

function parseJsonObject(text: string): Json | null {
  const raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence?.[1]?.trim() ?? raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Json
  } catch {
    return null
  }
}

async function chat(system: string, user: string, maxTokens = 1800) {
  if (!FAL_KEY) throw new Error('fal is not configured: set BCOVERED_FAL_API_KEY on the Edge Function.')
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', 'X-Fal-Tags': 'provider-find' },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      // Sonar via OpenRouter rejects json_object; ask for JSON in the prompt and parse.
      web_search_options: { search_context_size: 'medium' },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = json?.error?.message ?? json?.detail ?? `status ${res.status}`
    throw new Error(`Search failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200)}`)
  }
  const content = typeof json?.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content : ''
  const cost = Number(json?.usage?.cost)
  return { content, cost_usd: Number.isFinite(cost) ? cost : 0 }
}

type Found = {
  trading_name: string
  phone: string | null
  email: string | null
  website: string | null
  street_address: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  source_url: string | null
}

function normaliseFound(raw: Json): Found | null {
  const name = typeof raw.trading_name === 'string' ? raw.trading_name.trim() : ''
  if (!name) return null
  const phone = typeof raw.phone === 'string' && raw.phone.trim() ? raw.phone.trim() : null
  const email = typeof raw.email === 'string' && raw.email.trim() ? raw.email.trim().toLowerCase() : null
  const website = typeof raw.website === 'string' && raw.website.trim() ? raw.website.trim() : null
  if (!phone && !email && !website) return null
  return {
    trading_name: name,
    phone,
    email,
    website,
    street_address: typeof raw.street_address === 'string' ? raw.street_address.trim() || null : null,
    suburb: typeof raw.suburb === 'string' ? raw.suburb.trim() || null : typeof raw.locality === 'string' ? raw.locality.trim() || null : null,
    city: typeof raw.city === 'string' ? raw.city.trim() || null : null,
    province: typeof raw.province === 'string' ? raw.province.trim() || null : null,
    postal_code: typeof raw.postal_code === 'string' ? raw.postal_code.trim() || null : null,
    source_url: typeof raw.source_url === 'string' ? raw.source_url.trim() || null : null,
  }
}

const DISCOVER_SYSTEM = [
  'You find real, currently operating trade service providers in South Africa for a broker directory.',
  'Return JSON only: {"providers":[{"trading_name":string,"phone":string|null,"email":string|null,"website":string|null,"street_address":string|null,"suburb":string|null,"city":string|null,"province":string|null,"postal_code":string|null,"source_url":string|null}]}.',
  'Prefer phone numbers. Email is optional. Include street address and suburb/city whenever published.',
  'Only include providers with at least one of: phone, email, or website.',
  'Never invent contact details or addresses — use null when unknown.',
  'Do not write market trends, commentary, or insurance analysis. Directory facts only.',
].join(' ')

type RunOutputs = {
  phase: string
  queue: Found[]
  saved: Array<Json>
  rejected: Array<{ trading_name: string; reason: string }>
  seen_names: string[]
  progress: { found: number; requested: number; searches_used: number; step: string; elapsed_ms: number }
  stop_reason: string | null
  summary: string | null
  last_added?: Json | null
}

const app = new Hono().basePath('/provider-find')
app.options('*', () => new Response(null, { headers: CORS }))

app.get('/health', (c) => c.json({ configured: Boolean(FAL_KEY), model: SEARCH_MODEL }, 200, CORS))

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS' || c.req.path.endsWith('/health')) return next()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: c.req.header('Authorization') ?? '', apikey: ANON_KEY },
  })
  const user = res.ok ? await res.json().catch(() => null) : null
  if (typeof user?.id !== 'string') return c.json({ error: 'Sign in to find providers.' }, 401, CORS)
  await next()
})

app.onError((e, c) => {
  if (e instanceof RpcError) return c.json({ error: e.message, code: e.code }, e.status as 400, CORS)
  return c.json({ error: e instanceof Error ? e.message : String(e) }, 500, CORS)
})

app.post('/runs', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    category?: string
    area?: string
    trade_code?: string | null
    trade_label?: string | null
    trade_type_id?: string | null
    requested_count?: number
    idempotency_key?: string
  } | null
  const category = body?.category === 'live' ? 'live' : body?.category === 'sample' ? 'sample' : null
  if (!category) return c.json({ error: 'category must be sample or live' }, 400, CORS)
  if (!body?.area?.trim()) return c.json({ error: 'Area is required.' }, 400, CORS)
  if (!body?.trade_type_id) return c.json({ error: 'Choose a trade category so providers can be filed.' }, 400, CORS)

  const run = await rpc<{ id: string; status: string }>(c.req.header('Authorization') ?? '', category, 'provider_find_create_run', {
    p_category: category,
    p_area: body.area.trim(),
    p_trade_code: body.trade_code ?? null,
    p_trade_label: body.trade_label ?? null,
    p_requested_count: body.requested_count ?? 10,
    p_idempotency_key: body.idempotency_key ?? null,
  })

  // stash trade_type_id on outputs for steps
  const full = await rpc<Json>(c.req.header('Authorization') ?? '', category, 'provider_find_get_run', {
    p_category: category,
    p_job_id: run.id,
  })
  const outputs = { ...(full.outputs as RunOutputs), trade_type_id: body.trade_type_id }
  await rpc(c.req.header('Authorization') ?? '', category, 'provider_find_update_run', {
    p_category: category,
    p_job_id: run.id,
    p_status: 'running',
    p_outputs: outputs,
    p_worker: 'browser',
  })

  return c.json({ run: { ...full, status: 'running', outputs } }, 200, CORS)
})

app.get('/runs/:id', async (c) => {
  const category = c.req.query('category') as Category
  if (category !== 'sample' && category !== 'live') return c.json({ error: 'category must be sample or live' }, 400, CORS)
  const run = await rpc(c.req.header('Authorization') ?? '', category, 'provider_find_get_run', {
    p_category: category,
    p_job_id: c.req.param('id'),
  })
  return c.json({ run }, 200, CORS)
})

app.post('/runs/:id/cancel', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { category?: string } | null
  const category = body?.category === 'live' ? 'live' : 'sample'
  const run = await rpc(c.req.header('Authorization') ?? '', category, 'provider_find_cancel_run', {
    p_category: category,
    p_job_id: c.req.param('id'),
  })
  return c.json({ run }, 200, CORS)
})

app.post('/runs/:id/step', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { category?: string; worker?: string } | null
  const category = body?.category === 'live' ? 'live' : body?.category === 'sample' ? 'sample' : null
  if (!category) return c.json({ error: 'category must be sample or live' }, 400, CORS)
  const auth = c.req.header('Authorization') ?? ''
  const id = c.req.param('id')
  const run = (await rpc<Json>(auth, category, 'provider_find_get_run', { p_category: category, p_job_id: id })) as {
    id: string
    status: string
    cancel_requested: boolean
    inputs: { area: string; trade_code?: string | null; trade_label?: string | null; requested_count: number }
    outputs: RunOutputs & { trade_type_id?: string }
  }

  if (['completed', 'failed', 'cancelled'].includes(run.status) || run.cancel_requested) {
    return c.json({ run, done: true }, 200, CORS)
  }

  const out: RunOutputs & { trade_type_id?: string } = {
    phase: run.outputs?.phase ?? 'discover',
    queue: Array.isArray(run.outputs?.queue) ? run.outputs.queue : [],
    saved: Array.isArray(run.outputs?.saved) ? run.outputs.saved : [],
    rejected: Array.isArray(run.outputs?.rejected) ? run.outputs.rejected : [],
    seen_names: Array.isArray(run.outputs?.seen_names) ? run.outputs.seen_names : [],
    progress: run.outputs?.progress ?? {
      found: 0,
      requested: run.inputs.requested_count,
      searches_used: 0,
      step: 'Working',
      elapsed_ms: 0,
    },
    stop_reason: run.outputs?.stop_reason ?? null,
    summary: run.outputs?.summary ?? null,
    trade_type_id: run.outputs?.trade_type_id,
    last_added: null,
  }

  const requested = run.inputs.requested_count ?? 10
  const trade = run.inputs.trade_label || run.inputs.trade_code || 'trade service'
  const area = run.inputs.area

  // Refill queue when empty and we still need more
  if (out.queue.length === 0 && out.progress.found < requested && out.progress.searches_used < 6) {
    out.progress.step = `Searching ${trade} near ${area}`
    const user = [
      `Find up to ${Math.min(8, requested - out.progress.found + 2)} real ${trade} providers near ${area}, South Africa.`,
      'Include phone when published. Email optional.',
      'Capture street address, suburb and city for maps when available.',
      out.seen_names.length ? `Do not repeat: ${out.seen_names.slice(-40).join('; ')}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const r = await chat(DISCOVER_SYSTEM, user)
    out.progress.searches_used += 1
    const parsed = parseJsonObject(r.content)
    const list = Array.isArray(parsed?.providers) ? (parsed!.providers as Json[]) : []
    for (const item of list) {
      const n = normaliseFound(item)
      if (!n) continue
      const key = n.trading_name.toLowerCase()
      if (out.seen_names.some((s) => s.toLowerCase() === key)) continue
      out.seen_names.push(n.trading_name)
      out.queue.push(n)
    }
    if (out.queue.length === 0) {
      out.phase = 'done'
      out.stop_reason = 'no_more_candidates'
      out.progress.step = 'No more providers found'
      out.summary = `Added ${out.progress.found} provider${out.progress.found === 1 ? '' : 's'} to your directory.`
      const updated = await rpc(auth, category, 'provider_find_update_run', {
        p_category: category,
        p_job_id: id,
        p_status: 'completed',
        p_outputs: out,
        p_worker: body?.worker ?? 'browser',
      })
      return c.json({ run: updated, done: true }, 200, CORS)
    }
    // Return after discover so the UI can show progress before the first save.
    out.phase = 'save'
    out.progress.step = `Found ${out.queue.length} to add`
    const afterDiscover = await rpc(auth, category, 'provider_find_update_run', {
      p_category: category,
      p_job_id: id,
      p_status: 'running',
      p_outputs: out,
      p_worker: body?.worker ?? 'browser',
    })
    return c.json({ run: afterDiscover, done: false, last_added: null }, 200, CORS)
  }

  // Save one provider this step
  const next = out.queue.shift()
  if (!next) {
    out.phase = 'done'
    out.stop_reason = 'count_reached'
    out.progress.step = 'Done'
    out.summary = `Added ${out.progress.found} provider${out.progress.found === 1 ? '' : 's'} to your directory.`
    const updated = await rpc(auth, category, 'provider_find_update_run', {
      p_category: category,
      p_job_id: id,
      p_status: 'completed',
      p_outputs: out,
      p_worker: body?.worker ?? 'browser',
    })
    return c.json({ run: updated, done: true }, 200, CORS)
  }

  out.progress.step = `Saving ${next.trading_name}`
  try {
    if (!out.trade_type_id) throw new Error('Missing trade type for this search.')
    const saved = await rpc<Json>(auth, category, 'provider_find_save', {
      p_category: category,
      p_job_id: id,
      p_trade_type_id: out.trade_type_id,
      p_provider: next,
    })
    out.saved = [...out.saved, saved]
    out.last_added = saved
    out.progress.found = out.saved.length
  } catch (e) {
    out.rejected = [
      ...out.rejected,
      { trading_name: next.trading_name, reason: e instanceof Error ? e.message : 'Could not save' },
    ].slice(-40)
    out.last_added = null
  }

  const done = out.progress.found >= requested
  if (done) {
    out.phase = 'done'
    out.stop_reason = 'count_reached'
    out.progress.step = 'Done'
    out.summary = `Added ${out.progress.found} provider${out.progress.found === 1 ? '' : 's'} to your directory.`
  }

  const updated = await rpc(auth, category, 'provider_find_update_run', {
    p_category: category,
    p_job_id: id,
    p_status: done ? 'completed' : 'running',
    p_outputs: out,
    p_worker: body?.worker ?? 'browser',
  })

  return c.json({ run: updated, done, last_added: out.last_added }, 200, CORS)
})

Deno.serve(app.fetch)
