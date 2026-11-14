// AR, Ava and Russ copilot agent. Each turn: discover the jobs on the bcovered-mcp server (tools/list), plan with fixed rules,
// resolve records, call jobs (tools/call) as the signed-in broker in the active category, log the outcome and return
// per-step results. Typeahead search and the jobs menu use the same MCP server.
import { Hono } from 'hono'
import { runTurn, type Category, type CopilotId, type JobName, type ToolOutcome, type ToolPort, type TurnInput } from './planner.ts'
import { franchiseIntentOf, runFranchiseTurn } from './franchise.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const MCP_URL = `${SUPABASE_URL}/functions/v1/bcovered-mcp/mcp`
const PROTOCOL = '2025-06-18'

interface McpTool {
  name: string
  title?: string
  description?: string
  inputSchema?: unknown
  _meta?: { copilot?: string; write?: boolean; lines?: string[] }
}

class McpClient implements ToolPort {
  private seq = 0
  private session: string | null = null
  tools: McpTool[] = []

  constructor(private auth: string, private category: Category) {}

  private async send(method: string, params: unknown, notification = false) {
    const id = notification ? undefined : ++this.seq
    const headers: Record<string, string> = {
      Authorization: this.auth,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'x-data-category': this.category,
      'MCP-Protocol-Version': PROTOCOL,
    }
    if (this.session) headers['Mcp-Session-Id'] = this.session
    const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }) })
    this.session = res.headers.get('mcp-session-id') ?? this.session
    if (notification) {
      await res.body?.cancel()
      return null
    }
    const text = await res.text()
    if (!res.ok) throw new Error(`MCP ${method} failed (${res.status}): ${text.slice(0, 300)}`)
    const message = res.headers.get('content-type')?.includes('text/event-stream')
      ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).find((m) => m.id === id)
      : JSON.parse(text)
    if (message?.error) throw new Error(`MCP ${method}: ${message.error.message}`)
    return message?.result
  }

  async connect() {
    await this.send('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'copilot-agent', version: '1.0.0' } })
    await this.send('notifications/initialized', {}, true)
    const list = await this.send('tools/list', {})
    this.tools = list?.tools ?? []
    return this
  }

  async call(name: JobName, args: Record<string, unknown>): Promise<ToolOutcome> {
    if (!this.tools.some((t) => t.name === name)) return { ok: false, error: { code: 'not_found', message: `The MCP server does not offer ${name}.` } }
    const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null))
    try {
      const result = await this.send('tools/call', { name, arguments: clean })
      const sc = result?.structuredContent as { ok?: boolean; data?: unknown; error?: { code: string; message: string } } | undefined
      if (sc?.ok) return { ok: true, data: sc.data }
      return { ok: false, error: sc?.error ?? { code: 'failed', message: result?.content?.[0]?.text ?? 'The job failed.' } }
    } catch (e) {
      return { ok: false, error: { code: 'failed', message: e instanceof Error ? e.message : String(e) } }
    }
  }
}

async function rest(auth: string, category: Category, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: ANON_KEY, 'Content-Type': 'application/json', 'x-data-category': category },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, body }
}

const OUTCOME: Record<string, string> = { retrieved: 'retrieved', needs_choice: 'needs_input', needs_input: 'needs_input', failed: 'failed', refused: 'refused' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-data-category',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const categoryOf = (v: unknown): Category | null => (v === 'sample' || v === 'live' ? v : null)
const copilotOf = (v: unknown): CopilotId | null => (v === 'ar' || v === 'ava' || v === 'russ' ? v : null)
const uuidish = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

const app = new Hono().basePath('/copilot-agent')
app.options('*', () => new Response(null, { headers: CORS }))

app.post('/turn', async (c) => {
  const auth = c.req.header('Authorization') ?? ''
  const body = (await c.req.json().catch(() => null)) as Partial<TurnInput> | null
  const category = categoryOf(body?.category)
  const copilot = copilotOf(body?.copilot)
  if (!body || !category || !copilot || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000) {
    return c.json({ error: 'Send copilot (ar, ava or russ), category (sample or live) and the message text.' }, 400, CORS)
  }
  const conversation_id = uuidish(body.conversation_id) ? body.conversation_id! : crypto.randomUUID()
  const message_id = typeof body.message_id === 'string' && body.message_id.length >= 6 ? body.message_id : crypto.randomUUID()
  let mcp: McpClient
  try {
    mcp = await new McpClient(auth, category).connect()
  } catch (e) {
    return c.json({ error: `The MCP server is unavailable: ${e instanceof Error ? e.message : String(e)}` }, 502, CORS)
  }
  const origin = typeof body.origin === 'string' && /^https?:\/\/[^\s/]+$/.test(body.origin) ? body.origin : c.req.header('Origin') ?? ''
  const turn = { copilot, category, text: body.text, entities: body.entities ?? [], context: body.context ?? {}, conversation_id, message_id, steps: body.steps ?? {}, origin }
  const result = franchiseIntentOf(body.text) ? await runFranchiseTurn(turn, mcp) : await runTurn(turn, mcp)
  await Promise.all(
    result.steps
      .filter((s) => s.status !== 'saved')
      .map((s) =>
        rest(auth, category, 'copilot_log_action', {
          p_category: category,
          p_copilot: s.handled_by === 'ar' ? copilot : s.handled_by,
          p_tool: s.job ?? 'planner',
          p_args: { clause: s.clause, intent: s.intent, subject: s.subject?.id ?? null },
          p_outcome: OUTCOME[s.status],
          p_affected: s.subject ? [{ table: s.subject.record_type === 'client' ? 'persons' : 'customers', id: s.subject.id, reference: s.subject.number }] : [],
          p_error: s.error?.message ?? null,
          p_conversation_id: conversation_id,
        }).catch(() => null),
      ),
  )
  return c.json({ ...result, conversation_id, message_id, tools_discovered: mcp.tools.length }, 200, CORS)
})

app.get('/search', async (c) => {
  const category = categoryOf(c.req.query('category'))
  const q = c.req.query('q') ?? ''
  if (!category) return c.json({ error: 'category must be sample or live' }, 400, CORS)
  if (q.trim().length < 2) return c.json({ results: [] }, 200, CORS)
  const kinds = c.req.query('kinds')?.split(',').filter((k) => ['client', 'account', 'policy'].includes(k))
  try {
    const mcp = await new McpClient(c.req.header('Authorization') ?? '', category).connect()
    const r = await mcp.call('records.search', { query: q, kinds: kinds?.length ? kinds : undefined, limit: 10 })
    if (!r.ok) return c.json({ error: r.error }, r.error.code === 'forbidden' ? 403 : 400, CORS)
    return c.json({ results: r.data }, 200, CORS)
  } catch (e) {
    return c.json({ error: { code: 'unavailable', message: e instanceof Error ? e.message : String(e) } }, 502, CORS)
  }
})

app.get('/jobs', async (c) => {
  const category = categoryOf(c.req.query('category')) ?? 'sample'
  try {
    const mcp = await new McpClient(c.req.header('Authorization') ?? '', category).connect()
    return c.json({ tools: mcp.tools.map((t) => ({ name: t.name, title: t.title, description: t.description, copilot: t._meta?.copilot, write: t._meta?.write })) }, 200, CORS)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502, CORS)
  }
})

app.get('/health', async (c) => {
  const auth = c.req.header('Authorization') ?? ''
  const [sample, live] = await Promise.all([rest(auth, 'sample', 'copilot_whoami', {}), rest(auth, 'live', 'copilot_whoami', {})])
  let mcp: { ok: boolean; tools: number; error?: string } = { ok: false, tools: 0 }
  try {
    const client = await new McpClient(auth, 'sample').connect()
    mcp = { ok: true, tools: client.tools.length }
  } catch (e) {
    mcp = { ok: false, tools: 0, error: e instanceof Error ? e.message : String(e) }
  }
  const who = sample.ok ? sample.body : null
  const signedIn = Boolean(who?.user_id && who?.tenant_id)
  const liveActive = live.ok && live.body?.active_category === 'live'
  return c.json(
    {
      signed_in: signedIn,
      user: who ? { name: who.name, role: who.role, brokerage: who.brokerage, can_write: who.can_write } : null,
      hook_claims: Boolean(who?.hook_claims),
      mcp,
      sample: { available: signedIn && who?.active_category === 'sample' && who?.is_staff },
      live: {
        available: signedIn && liveActive,
        reason: !signedIn ? 'Sign in with a brokerage account to use Live.' : liveActive ? null : 'Your role cannot use Live records.',
      },
    },
    200,
    CORS,
  )
})

Deno.serve(app.fetch)
