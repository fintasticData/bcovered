// fal OpenRouter router: Gemini Flash for structured reading, Perplexity Sonar for live web search with citations.
const KEY_NAMES = ['BCOVERED_FAL_API_KEY', 'FAL_KEY'] as const
const KEY_NAME = KEY_NAMES.find((n) => Deno.env.get(n)) ?? null
export const FAL_KEY = KEY_NAME ? Deno.env.get(KEY_NAME)! : null
export const MODELS = {
  reader: Deno.env.get('BCOVERED_FAL_LLM_MODEL') ?? 'google/gemini-2.5-flash',
  area: Deno.env.get('BCOVERED_FAL_AREA_MODEL') ?? 'perplexity/sonar',
  search: Deno.env.get('BCOVERED_FAL_SEARCH_MODEL') ?? 'perplexity/sonar-pro',
}
const CHAT_URL = 'https://fal.run/openrouter/router/openai/v1/chat/completions'

export interface ChatResult {
  content: string
  citations: string[]
  cost_usd: number
  model: string
}

export class FalError extends Error {}

export async function chat(opts: {
  model: string
  system: string
  user: string
  maxTokens: number
  json?: boolean
  search?: boolean
  tag?: string
}): Promise<ChatResult> {
  if (!FAL_KEY) throw new FalError(`fal is not configured: set ${KEY_NAMES[0]} as an Edge Function secret.`)
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    max_tokens: opts.maxTokens,
    temperature: 0.1,
  }
  if (opts.json) body.response_format = { type: 'json_object' }
  if (opts.search) body.web_search_options = { search_context_size: 'medium' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 55_000)
  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json', ...(opts.tag ? { 'X-Fal-Tags': opts.tag } : {}) },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const detail = json?.error?.message ?? json?.detail ?? `status ${res.status}`
      throw new FalError(`fal ${opts.model}: ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 240)}`)
    }
    const message = json?.choices?.[0]?.message
    const content = typeof message?.content === 'string' ? message.content : ''
    const annotations: Array<{ url_citation?: { url?: string } }> = Array.isArray(message?.annotations) ? message.annotations : []
    const legacy: string[] = Array.isArray(json?.citations) ? json.citations : []
    const citations = [...new Set([...annotations.map((a) => a.url_citation?.url).filter((u): u is string => typeof u === 'string'), ...legacy])]
    const cost = Number(json?.usage?.cost)
    return { content, citations, cost_usd: Number.isFinite(cost) ? cost : 0, model: json?.model ?? opts.model }
  } catch (e) {
    if (e instanceof FalError) throw e
    throw new FalError(`fal ${opts.model}: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    clearTimeout(timer)
  }
}
