// Signs in as a demo broker and exercises the copilot database jobs directly (PostgREST RPC), then through the MCP server
// and the copilot agent. Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (or the NEXT_PUBLIC_ names) from .env.
//   node scripts/copilot-smoke.mjs [rpc|mcp|agent|all]
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const PASSWORD = 'BCovered-Demo-2026!'

export async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`sign-in ${email}: ${JSON.stringify(j)}`)
  return j.access_token
}

export async function rpc(token, fn, args, category = 'sample') {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-data-category': category },
    body: JSON.stringify(args),
  })
  const j = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, body: j }
}

let failures = 0
const check = (label, cond, detail) => {
  console.log(`${cond ? '  ✓' : '  ✖'} ${label}${!cond && detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : ''}`)
  if (!cond) failures++
}

async function rpcChecks() {
  console.log('Database jobs (RPC as Thabo Nkosi, Sample)')
  const thabo = await signIn('thabo.nkosi@bcovered.demo')
  const s = await rpc(thabo, 'copilot_search_records', { p_category: 'sample', p_query: 'Naid' })
  check('partial surname search returns both Priya Naidoo and Priyanka Naidu', s.ok && ['Priya Naidoo', 'Priyanka Naidu'].every((n) => s.body.some((x) => x.name === n)), s.body)
  const exact = await rpc(thabo, 'copilot_search_records', { p_category: 'sample', p_query: 'CL-S1001' })
  check('exact client number matches Priya Naidoo first', exact.ok && exact.body[0]?.name === 'Priya Naidoo' && exact.body[0]?.match === 'exact', exact.body)
  const similar = await rpc(thabo, 'copilot_search_records', { p_category: 'sample', p_query: 'Priya Naidu' })
  check('similar spelling finds both', similar.ok && similar.body.length >= 2, similar.body)
  const mismatch = await rpc(thabo, 'copilot_search_records', { p_category: 'live', p_query: 'Naid' }, 'sample')
  check('category in body must match the connection category', !mismatch.ok && mismatch.body?.message === 'category_mismatch', mismatch.body)
  const live = await rpc(thabo, 'copilot_search_records', { p_category: 'live', p_query: 'Naid' }, 'live')
  check('Live search never returns Sample records', live.ok && !live.body.some((x) => x.category !== 'live' || x.id.startsWith('c0000000') || /-S\d/.test(x.number ?? '')), live.body)
  const priya = s.body.find((x) => x.name === 'Priya Naidoo')
  const ov = await rpc(thabo, 'copilot_record_overview', { p_category: 'sample', p_record_type: 'client', p_id: priya.id, p_scope: 'all' })
  check('overview lists motor policy and life application', ov.ok && ov.body.policies.some((p) => p.cover_type === 'motor') && ov.body.policies.some((p) => p.status === 'application_submitted'), ov.body)
  return { thabo, priya, overview: ov.body }
}

/** Minimal MCP Streamable HTTP client: JSON or server-sent-event responses. */
export async function mcp(token, method, params, category = 'sample', id = Math.floor(Math.random() * 1e9)) {
  const r = await fetch(`${URL_}/functions/v1/bcovered-mcp/mcp`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'x-data-category': category,
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const text = await r.text()
  if (!r.ok) return { httpError: r.status, text }
  const payload = r.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).find((m) => m.id === id)
    : JSON.parse(text)
  return payload
}

async function mcpChecks(ctx) {
  console.log('MCP server (bcovered-mcp as Thabo Nkosi)')
  const thabo = ctx?.thabo ?? (await signIn('thabo.nkosi@bcovered.demo'))
  const init = await mcp(thabo, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'copilot-smoke', version: '1' } })
  check('initialize returns server info', init?.result?.serverInfo?.name === 'bcovered-mcp', init)
  const list = await mcp(thabo, 'tools/list', {})
  const names = list?.result?.tools?.map((t) => t.name) ?? []
  check('tools/list exposes shared, Ava and Russ jobs', ['records.search', 'interaction.record', 'ava.life_application.create', 'russ.scheme.overview'].every((n) => names.includes(n)), names)
  check('tools carry copilot metadata', list?.result?.tools?.find((t) => t.name === 'ava.policies.list')?._meta?.copilot === 'ava', list?.result?.tools?.[0])
  const search = await mcp(thabo, 'tools/call', { name: 'records.search', arguments: { query: 'Naid' } })
  const found = search?.result?.structuredContent?.data ?? []
  check('tools/call records.search finds the Naidoo/Naidu pair', found.some((x) => x.name === 'Priya Naidoo') && found.some((x) => x.name === 'Priyanka Naidu'), search)
  const noHeader = await fetch(`${URL_}/functions/v1/bcovered-mcp/mcp`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${thabo}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  check('requests without a category are refused', noHeader.status === 400, noHeader.status)
  return { thabo }
}

export async function agent(token, path, body, method = 'POST') {
  const r = await fetch(`${URL_}/functions/v1/copilot-agent${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

async function agentChecks(ctx) {
  console.log('Copilot agent (copilot-agent as Thabo Nkosi)')
  const thabo = ctx?.thabo ?? (await signIn('thabo.nkosi@bcovered.demo'))
  const health = await agent(thabo, '/health', null, 'GET')
  check('health: signed in, MCP reachable, Sample available', health.body?.signed_in && health.body?.mcp?.ok && health.body?.sample?.available, health.body)
  console.log(`      Live available: ${health.body?.live?.available} · token hook claims: ${health.body?.hook_claims}`)

  const conversation_id = crypto.randomUUID()
  const message_id = `smoke-${Date.now()}`
  const text = 'Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application'
  const first = await agent(thabo, '/turn', { copilot: 'ar', category: 'sample', text, conversation_id, message_id })
  check('brief example: account found, note waits for wording, life application retrieved', JSON.stringify(first.body?.steps?.map((s) => s.status)) === '["retrieved","needs_input","retrieved"]', first.body)
  check('tools were discovered over MCP', first.body?.tools_discovered >= 16, first.body?.tools_discovered)
  const body = `Smoke test ${message_id}: asked to review the excess`
  const second = await agent(thabo, '/turn', { copilot: 'ar', category: 'sample', text, conversation_id, message_id, steps: { 1: { values: { body } } } })
  const note = second.body?.steps?.[1]
  check('note saved with reference, client number and policy number', note?.status === 'saved' && /^NT-S\d+/.test(note.receipt?.reference) && note.receipt?.client_number === 'CL-S1001' && note.receipt?.policy_number === 'PRO-MV-220145', note)
  const retry = await agent(thabo, '/turn', { copilot: 'ar', category: 'sample', text, conversation_id, message_id, steps: { 1: { values: { body } } } })
  check('retrying the same message replays the receipt instead of writing again', retry.body?.steps?.[1]?.receipt?.replayed === true && retry.body.steps[1].receipt.reference === note?.receipt?.reference, retry.body?.steps?.[1])
  const policyView = await rpc(thabo, 'copilot_get_policy', { p_category: 'sample', p_policy_id: note?.policy?.id })
  check('the note is on the motor policy record', policyView.ok && policyView.body.interactions.filter((i) => i.body === body).length === 1, policyView.body?.interactions)

  const life = await agent(thabo, '/turn', { copilot: 'ava', category: 'sample', text: 'Start a life application for Priyanka Naidu R650', conversation_id: crypto.randomUUID(), message_id: `life-${Date.now()}` })
  const app = life.body?.steps?.[0]
  check('Ava creates a life application against an existing client', app?.status === 'saved' && /^PL-S\d+/.test(app.receipt?.reference) && app.receipt?.client_number === 'CL-S1002', app)
  const fresh = await agent(thabo, '/turn', { copilot: 'ar', category: 'sample', text: 'Show the latest life application for CL-S1002', conversation_id: crypto.randomUUID(), message_id: `fresh-${Date.now()}` })
  check('a fresh conversation retrieves it by client number', fresh.body?.steps?.[0]?.policy?.reference === app?.receipt?.reference, fresh.body?.steps?.[0])

  const both = await agent(thabo, '/turn', { copilot: 'ar', category: 'sample', text: 'Show policies for CL-S1001', conversation_id: crypto.randomUUID(), message_id: `both-${Date.now()}` })
  const lines = new Set((both.body?.steps?.[0]?.data ?? []).map((p) => p.line))
  check('AR returns short-term and long-term records for one client with links', lines.has('short_term_personal') && lines.has('individual_life') && both.body.steps[0].links.length >= 2, both.body?.steps?.[0])

  const liveAccount = await rpc(thabo, 'copilot_create_account', { p_category: 'live', p_name: 'Naidoo household', p_type: 'personal', p_idempotency_key: 'smoke-live-naidoo-account', p_copilot: 'ar' }, 'live')
  check('a Live account can be created in Live (same name as a Sample account)', liveAccount.ok && /^AC-\d+/.test(liveAccount.body?.reference), liveAccount.body)
  const crossLink = await rpc(thabo, 'copilot_record_interaction', { p_category: 'sample', p_body: 'should never save', p_idempotency_key: `smoke-cross-${Date.now()}`, p_customer_id: liveAccount.body?.id }, 'sample')
  check('a Sample write cannot link to the Live account', !crossLink.ok && ['not_found', 'category_mismatch'].includes(crossLink.body?.message), crossLink.body)
  const spoof = await rpc(thabo, 'copilot_record_interaction', { p_category: 'sample', p_body: 'should never save', p_idempotency_key: `smoke-spoof-${Date.now()}`, p_customer_id: liveAccount.body?.id }, 'live')
  check('claiming Sample over a Live connection is refused', !spoof.ok && spoof.body?.message === 'category_mismatch', spoof.body)

  const kagiso = await signIn('kagiso.molefe@highveldadvisory.example.demo')
  const theirs = await rpc(kagiso, 'copilot_search_records', { p_category: 'sample', p_query: 'Naidoo' })
  check('another brokerage cannot find B-Covered clients', theirs.ok ? !theirs.body.some((x) => x.name === 'Priya Naidoo') : true, theirs.body)
  const peek = await rpc(kagiso, 'copilot_record_overview', { p_category: 'sample', p_record_type: 'client', p_id: 'c0000000-0000-4000-8000-000000000001' })
  check('another brokerage cannot open a B-Covered client by ID', !peek.ok, peek.body)
  const write = await rpc(kagiso, 'copilot_record_interaction', { p_category: 'sample', p_body: 'should never save', p_idempotency_key: `smoke-other-${Date.now()}`, p_person_id: 'c0000000-0000-4000-8000-000000000001' })
  check('another brokerage cannot write to a B-Covered client', !write.ok, write.body)
  return { thabo }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const mode = process.argv[2] ?? 'rpc'
  let ctx
  if (mode === 'rpc' || mode === 'all') ctx = await rpcChecks()
  if (mode === 'mcp' || mode === 'all') ctx = { ...ctx, ...(await mcpChecks(ctx)) }
  if (mode === 'agent' || mode === 'all') ctx = { ...ctx, ...(await agentChecks(ctx)) }
  if (failures) {
    console.log(`\n${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll checks passed')
}
