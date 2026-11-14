// fal.ai for BCovered: language model chat, Ava's general insurance answers, intake reply wording, queued image
// generation and price lookups. The fal key never leaves this function. /health and /answer are public (Ava serves
// website visitors; /answer is length-capped and rate-limited per IP); every other route needs a signed-in user.
import { Hono, type Context, type Next } from 'hono'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
/** Checked in order; the first one set is used. Keys are added here, never renamed. */
const KEY_NAMES = ['BCOVERED_FAL_API_KEY', 'FAL_KEY'] as const
const KEY_NAME = KEY_NAMES.find((n) => Deno.env.get(n)) ?? null
const FAL_KEY = KEY_NAME ? Deno.env.get(KEY_NAME)! : null
const LLM_MODEL = Deno.env.get('BCOVERED_FAL_LLM_MODEL') ?? 'google/gemini-2.5-flash'
const CHAT_URL = 'https://fal.run/openrouter/router/openai/v1/chat/completions'

/** Image models callers may queue. Token-metered ones are priced per output token, so resolution drives cost. */
export const IMAGE_ENDPOINTS = [
  'google/nano-banana-2.1',
  'google/nano-banana-2.1/edit',
  'fal-ai/nano-banana-pro',
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/nano-banana/edit',
  'openai/gpt-image-2',
  'openai/gpt-image-2/edit',
  'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  'fal-ai/bytedance/seedream/v5/lite/edit',
  'fal-ai/flux/schnell',
  'fal-ai/flux/dev',
  'fal-ai/flux-2-pro',
  'fal-ai/flux-pro/kontext',
  'fal-ai/birefnet/v2',
] as const

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Role = 'system' | 'user' | 'assistant'
interface ChatMessage {
  role: Role
  content: string
}
interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
}

class FalError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function fal(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.error?.message ?? body?.detail ?? body?.error ?? `fal request failed (${res.status})`
    const upstream = res.status >= 500 || res.status === 401 || res.status === 403
    throw new FalError(upstream ? 502 : res.status, `fal: ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`)
  }
  return body
}

async function chat(messages: ChatMessage[], opts: { maxTokens: number; temperature: number; json: boolean }) {
  const body = await fal(CHAT_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new FalError(502, 'The language model returned no text.')
  const usage: Usage = body?.usage ?? {}
  return { content, model: body?.model ?? LLM_MODEL, usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, cost_usd: usage.cost } }
}

/** fal queue status and result URLs use the owner/app part of the endpoint ID only. */
const queueBase = (endpoint: string) => `https://queue.fal.run/${endpoint.split('/').slice(0, 2).join('/')}`

const isImageEndpoint = (v: unknown): v is (typeof IMAGE_ENDPOINTS)[number] => typeof v === 'string' && (IMAGE_ENDPOINTS as readonly string[]).includes(v)
const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

const INTAKE_SYSTEM = [
  "You are Ava, BCovered's motor insurance intake assistant for South African customers.",
  'Rewrite the draft reply so it reads warm, plain and concise.',
  'Keep every question, figure, name and instruction from the draft. Ask nothing the draft does not ask.',
  'Never add prices, advice, promises, cover decisions or facts that are not in the draft.',
  'Use South African English and Rand amounts exactly as written.',
  'Respond with JSON only: {"reply": string}.',
].join(' ')

const ANSWER_SYSTEM = [
  "You are Ava, the AI assistant on BCovered, a South African insurance brokerage platform. Answer general insurance questions from South African individuals and businesses in plain language.",
  'When asked what to insure, list the covers typically relevant to that situation and say in a few words why each matters.',
  'When asked about cost, give only broad indicative ranges in Rand (per month or per year), state the assumptions you used and the main factors that move the price, and say clearly that it is a rough indication, not a quote.',
  'Never recommend a specific insurer or product, never say someone is or will be covered, and never give financial advice. Say that a licensed BCovered broker confirms cover and price.',
  'Write plain text only, no Markdown: short lines, bullets start with "• ", about 220 words at most, South African English.',
  'If the question is not about insurance, say briefly that you can only help with insurance questions.',
  'Respond with JSON only: {"answer": string}.',
].join(' ')

/** Per-instance sliding window. Edge instances are short-lived, so this limits bursts rather than daily spend. */
const ANSWER_LIMIT = { max: 20, windowMs: 10 * 60_000 }
const answerHits = new Map<string, number[]>()
function allowAnswer(ip: string) {
  const now = Date.now()
  const recent = (answerHits.get(ip) ?? []).filter((t) => now - t < ANSWER_LIMIT.windowMs)
  if (recent.length >= ANSWER_LIMIT.max) return false
  answerHits.set(ip, [...recent, now])
  return true
}

const PUBLIC_PATHS = ['/fal-ai/health', '/fal-ai/answer']

const app = new Hono().basePath('/fal-ai')
app.options('*', () => new Response(null, { headers: CORS }))

app.get('/health', (c) =>
  c.json({ configured: Boolean(FAL_KEY), key: KEY_NAME, key_names: KEY_NAMES, llm_model: LLM_MODEL, image_endpoints: IMAGE_ENDPOINTS }, 200, CORS),
)

app.use('*', async (c: Context, next: Next) => {
  if (c.req.method === 'OPTIONS') return next()
  if (!FAL_KEY) return c.json({ error: `fal is not configured: set ${KEY_NAMES[0]} as an Edge Function secret.` }, 503, CORS)
  if (PUBLIC_PATHS.includes(c.req.path)) return next()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: c.req.header('Authorization') ?? '', apikey: ANON_KEY } })
  const user = res.ok ? await res.json().catch(() => null) : null
  if (typeof user?.id !== 'string') return c.json({ error: 'Sign in to use fal.' }, 401, CORS)
  await next()
})

app.onError((e, c) => {
  const status = e instanceof FalError ? e.status : 500
  return c.json({ error: e.message }, status as 400, CORS)
})

app.post('/chat', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { messages?: unknown; json?: unknown; max_tokens?: unknown; temperature?: unknown } | null
  const messages: Array<Partial<ChatMessage>> = body && Array.isArray(body.messages) ? body.messages : []
  const valid = messages.every((m) => ['system', 'user', 'assistant'].includes(String(m?.role)) && typeof m?.content === 'string')
  const chars = messages.reduce((n, m) => n + (typeof m?.content === 'string' ? m.content.length : 0), 0)
  if (!messages.length || messages.length > 40 || !valid || chars > 24_000) {
    return c.json({ error: 'Send 1 to 40 messages with role system, user or assistant and text content (24,000 characters at most).' }, 400, CORS)
  }
  const result = await chat(messages as ChatMessage[], {
    maxTokens: clampInt(body?.max_tokens, 1, 2000, 600),
    temperature: typeof body?.temperature === 'number' ? Math.min(2, Math.max(0, body.temperature)) : 0.4,
    json: body?.json === true,
  })
  return c.json(result, 200, CORS)
})

app.post('/answer', async (c) => {
  const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (!allowAnswer(ip)) return c.json({ error: 'Too many questions in a short time. Please try again in a few minutes.' }, 429, CORS)
  const body = (await c.req.json().catch(() => null)) as { question?: unknown } | null
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > 1000) return c.json({ error: 'Send a question of 1,000 characters at most.' }, 400, CORS)
  const result = await chat(
    [
      { role: 'system', content: ANSWER_SYSTEM },
      { role: 'user', content: question },
    ],
    { maxTokens: 700, temperature: 0.3, json: true },
  )
  let answer: unknown
  try {
    answer = JSON.parse(result.content)?.answer
  } catch {
    answer = null
  }
  if (typeof answer !== 'string' || !answer.trim()) throw new FalError(502, 'The language model did not return a usable answer.')
  return c.json({ answer: answer.trim().slice(0, 2400), model: result.model, usage: result.usage }, 200, CORS)
})

app.post('/intake', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { text?: unknown; draft?: { reply?: unknown } } | null
  const text = typeof body?.text === 'string' ? body.text.slice(0, 2000) : ''
  const draft = typeof body?.draft?.reply === 'string' ? body.draft.reply : ''
  if (!draft.trim() || draft.length > 2000) return c.json({ error: 'Send the draft reply (2,000 characters at most) and the customer text.' }, 400, CORS)
  const result = await chat(
    [
      { role: 'system', content: INTAKE_SYSTEM },
      { role: 'user', content: JSON.stringify({ customer_said: text, draft_reply: draft }) },
    ],
    { maxTokens: 400, temperature: 0.3, json: true },
  )
  let reply: unknown
  try {
    reply = JSON.parse(result.content)?.reply
  } catch {
    reply = null
  }
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 1200) throw new FalError(502, 'The language model did not return a usable reply.')
  return c.json({ reply: reply.trim(), model: result.model, usage: result.usage }, 200, CORS)
})

app.post('/image', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { endpoint_id?: unknown; input?: Record<string, unknown> } | null
  const endpoint = body?.endpoint_id ?? IMAGE_ENDPOINTS[0]
  const input = body?.input && typeof body.input === 'object' ? { ...body.input } : {}
  if (!isImageEndpoint(endpoint)) return c.json({ error: `endpoint_id must be one of: ${IMAGE_ENDPOINTS.join(', ')}` }, 400, CORS)
  const needsPrompt = endpoint !== 'fal-ai/birefnet/v2'
  if (needsPrompt && (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000)) {
    return c.json({ error: 'input.prompt is required (4,000 characters at most).' }, 400, CORS)
  }
  if ('num_images' in input) input.num_images = clampInt(input.num_images, 1, 4, 1)
  delete input.sync_mode
  const queued = await fal(`https://queue.fal.run/${endpoint}`, { method: 'POST', body: JSON.stringify(input) })
  return c.json({ request_id: queued.request_id, endpoint_id: endpoint }, 202, CORS)
})

app.get('/image/:request_id', async (c) => {
  const endpoint = c.req.query('endpoint_id')
  const id = c.req.param('request_id')
  if (!isImageEndpoint(endpoint) || !/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Send a known endpoint_id and the request_id from POST /image.' }, 400, CORS)
  const status = await fal(`${queueBase(endpoint)}/requests/${id}/status`)
  if (status.status !== 'COMPLETED') return c.json({ status: status.status, queue_position: status.queue_position ?? null }, 200, CORS)
  if (status.error) return c.json({ status: 'FAILED', error: status.error, error_type: status.error_type ?? null }, 200, CORS)
  const result = await fal(`${queueBase(endpoint)}/requests/${id}`)
  return c.json({ status: 'COMPLETED', result, inference_seconds: status.metrics?.inference_time ?? null }, 200, CORS)
})

app.get('/pricing', async (c) => {
  const ids = (c.req.query('endpoint_id') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!ids.length || ids.length > 50 || ids.some((i) => !/^[\w.-]+(\/[\w.-]+)+$/.test(i))) {
    return c.json({ error: 'Send endpoint_id as a comma-separated list of 1 to 50 fal endpoint IDs.' }, 400, CORS)
  }
  const body = await fal(`https://api.fal.ai/v1/models/pricing?${ids.map((i) => `endpoint_id=${encodeURIComponent(i)}`).join('&')}`)
  return c.json({ prices: body.prices ?? [] }, 200, CORS)
})

Deno.serve(app.fetch)
