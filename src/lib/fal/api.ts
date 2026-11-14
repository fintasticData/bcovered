// fal.ai from the browser: every call goes through the fal-ai Edge Function, which holds the fal key and needs a
// signed-in Supabase user. Nothing here ever sees a key.
import { SUPABASE_KEY, SUPABASE_URL, supabaseAuth } from '@/lib/supabase/client'

export class FalError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface FalUsage {
  prompt_tokens?: number
  completion_tokens?: number
  cost_usd?: number
}

export interface FalHealth {
  configured: boolean
  key: string | null
  key_names: string[]
  llm_model: string
  image_endpoints: string[]
}

export interface FalImage {
  url: string
  content_type?: string
  width?: number
  height?: number
}

export type FalImageStatus =
  | { status: 'IN_QUEUE' | 'IN_PROGRESS'; queue_position: number | null }
  | { status: 'FAILED'; error: string; error_type: string | null }
  | { status: 'COMPLETED'; result: { images?: FalImage[]; image?: FalImage; [k: string]: unknown }; inference_seconds: number | null }

/** Public routes (health, answer) work signed out; every other route needs the signed-in user's token. */
async function call<T>(path: string, init?: RequestInit, opts: { public?: boolean } = {}): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new FalError(503, 'Supabase is not configured for this build.')
  const token = await supabaseAuth.accessToken()
  if (!token && !opts.public) throw new FalError(401, 'Sign in to use fal.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fal-ai${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new FalError(res.status, (body?.error ?? `fal request failed (${res.status})`) as string)
  return body as T
}

export const falApi = {
  health: () => call<FalHealth>('/health', undefined, { public: true }),
  answer: (question: string) =>
    call<{ answer: string; model: string; usage: FalUsage }>('/answer', { method: 'POST', body: JSON.stringify({ question }) }, { public: true }),
  chat: (input: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; json?: boolean; max_tokens?: number; temperature?: number }) =>
    call<{ content: string; model: string; usage: FalUsage }>('/chat', { method: 'POST', body: JSON.stringify(input) }),
  intake: (input: { text: string; draft: { reply: string } }) =>
    call<{ reply: string; model: string; usage: FalUsage }>('/intake', { method: 'POST', body: JSON.stringify(input) }),
  submitImage: (endpoint_id: string, input: Record<string, unknown>) =>
    call<{ request_id: string; endpoint_id: string }>('/image', { method: 'POST', body: JSON.stringify({ endpoint_id, input }) }),
  imageStatus: (endpoint_id: string, request_id: string) =>
    call<FalImageStatus>(`/image/${request_id}?endpoint_id=${encodeURIComponent(endpoint_id)}`),
  pricing: (endpoint_ids: string[]) =>
    call<{ prices: Array<{ endpoint_id: string; unit_price: number; unit: string; currency: string }> }>(
      `/pricing?endpoint_id=${encodeURIComponent(endpoint_ids.join(','))}`,
    ),
}

/** Queues an image and polls until fal finishes. fal media URLs are temporary: copy anything worth keeping. */
export async function generateImage(endpoint_id: string, input: Record<string, unknown>, opts: { intervalMs?: number; timeoutMs?: number } = {}) {
  const { request_id } = await falApi.submitImage(endpoint_id, input)
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000)
  while (Date.now() < deadline) {
    const s = await falApi.imageStatus(endpoint_id, request_id)
    if (s.status === 'COMPLETED') return { request_id, ...s }
    if (s.status === 'FAILED') throw new FalError(422, s.error)
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1500))
  }
  throw new FalError(504, `The image is still being generated (request ${request_id}).`)
}
