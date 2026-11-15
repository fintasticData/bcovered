// Runs one small Russ "Generate leads" search end to end against the deployed lead-research Edge Function, as the demo
// broker Thabo Nkosi in Sample: parse, create, step until it stops, then checks the saved rows and that a replayed create
// returns the same run.
//   node scripts/leadgen-smoke.mjs ["request text"] [count]
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
const FN = `${URL_}/functions/v1/lead-research`
const TEXT = process.argv[2] ?? 'Find 20 motor repair workshops within 10 km of Carnival City, Brakpan, with public business emails. I want prospects for commercial property cover.'
const COUNT = Number(process.argv[3] ?? 3)

const signIn = async (email) => {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'BCovered-Demo-2026!' }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`sign-in ${email}: ${JSON.stringify(j)}`)
  return j.access_token
}

let failures = 0
const check = (label, cond, detail) => {
  console.log(`${cond ? '  ✓' : '  ✖'} ${label}${!cond && detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 800)}` : ''}`)
  if (!cond) failures++
}

const token = await signIn('thabo.nkosi@bcovered.demo')
const call = async (path, init = {}) => {
  const r = await fetch(`${FN}${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  return { status: r.status, body: await r.json().catch(() => null) }
}

console.log('Parse')
const parsed = await call('/parse', { method: 'POST', body: JSON.stringify({ text: TEXT }) })
check('filters extracted', parsed.status === 200 && parsed.body?.filters?.area, parsed.body)
console.log('   ', JSON.stringify(parsed.body?.filters))
check('function kept distinct from industry', parsed.body?.filters?.business_function && parsed.body.filters.business_function !== parsed.body.filters.industry, parsed.body?.filters)

const key = `smoke-${Date.now()}`
const filters = { ...parsed.body.filters, requested_count: COUNT }
const created = await call('/runs', { method: 'POST', body: JSON.stringify({ category: 'sample', prompt: TEXT, filters, idempotency_key: key }) })
check('run created', created.status === 200 && created.body?.run?.id, created.body)
const replay = await call('/runs', { method: 'POST', body: JSON.stringify({ category: 'sample', prompt: TEXT, filters, idempotency_key: key }) })
check('replayed create returns the same run', replay.body?.run?.id === created.body?.run?.id, replay.body)

const id = created.body.run.id
const worker = `smoke-worker-${Date.now()}`
let run = created.body.run
for (let i = 0; i < 40 && !['completed', 'failed', 'cancelled'].includes(run.status); i++) {
  const t = Date.now()
  const r = await call(`/runs/${id}/step`, { method: 'POST', body: JSON.stringify({ category: 'sample', worker }) })
  if (r.status !== 200) {
    console.log(`   step ${i + 1}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    if (r.status >= 500) continue
    break
  }
  run = r.body.run
  const p = run.outputs.progress
  console.log(`   step ${i + 1} (${((Date.now() - t) / 1000).toFixed(1)}s): ${run.status} · ${p.step} · found ${p.found}/${p.requested} · searches ${p.searches_used} · pages ${p.pages_fetched} · $${p.cost_usd}`)
}

console.log('Result')
console.log('   ', run.outputs.summary)
check('run stopped with a reason', ['count_reached', 'budget_exhausted', 'no_more_candidates'].includes(run.outputs.stop_reason), run.outputs)
check('area findings carry source URLs', (run.outputs.area_findings ?? []).every((f) => /^https?:\/\//.test(f.source_url)), run.outputs.area_findings)
console.log(`    ${run.outputs.area_findings?.length ?? 0} area findings; ${run.outputs.rejected?.length ?? 0} candidates rejected`)
for (const f of run.outputs.area_findings ?? []) console.log(`    · ${f.finding.slice(0, 110)} [${f.source_url}]`)
for (const l of run.leads) console.log(`    + ${l.business_name} <${l.email}> ${l.area} · email on ${l.evidence.email_source_url}`)
for (const r of (run.outputs.rejected ?? []).slice(0, 8)) console.log(`    - ${r.business_name}: ${r.reason}`)
check('every lead has a published email and evidence URLs', run.leads.every((l) => l.email && l.evidence?.email_source_url && l.evidence?.location_source_url && l.evidence?.activity_source_url), run.leads)
check('every lead links to a saved lead row', run.leads.every((l) => l.lead_id), run.leads)

const reopened = await call(`/runs/${id}?category=sample`)
check('reopened run returns the same leads', reopened.body?.run?.leads?.length === run.leads.length, reopened.body)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
