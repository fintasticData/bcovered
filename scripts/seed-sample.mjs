// Builds supabase/seed/sample_fixtures.sql from the browser demo seed (src/server/db/seed.ts) plus the copilot test pair,
// every copilot record labelled Sample with client, account and policy numbers assigned.
//   node scripts/seed-sample.mjs            write the SQL file only
//   node scripts/seed-sample.mjs --load     also load it through the seed-loader Edge Function and create the demo staff logins
// Loading needs SEED_LOADER_URL (defaults to the bcovered project) and SEED_LOADER_SECRET (or node_modules/.cache/seed-secret.txt).
import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(root, 'node_modules/.cache')
mkdirSync(cacheDir, { recursive: true })

export const DEMO_PASSWORD = 'BCovered-Demo-2026!'

/** Tables that carry the Sample / Live category (mirrors 20261114_0012_copilot_records.sql). */
const CATEGORY_TABLES = new Set([
  'customers', 'persons', 'customer_persons', 'policies', 'policy_parties', 'leads', 'quotes', 'needs_analyses', 'life_quotes',
  'records_of_advice', 'tasks', 'communications', 'conversations', 'conversation_messages', 'business_profiles', 'group_schemes',
  'employments', 'scheme_memberships',
])

async function loadSeed() {
  const out = resolve(cacheDir, 'seed-bundle.mjs')
  await build({
    stdin: {
      contents: "export { seedTables, SEED_IDS, TENANT_ID } from './src/server/db/seed'\nexport { BX } from './src/server/db/benefitsSeed'\n",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    tsconfig: resolve(root, 'tsconfig.json'),
    logLevel: 'error',
  })
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`)
}

const C = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** The copilot acceptance pair: two similarly named clients, each with a motor policy and a life record. */
function copilotFixtures({ TENANT_ID, SEED_IDS, BX }, now) {
  const t = TENANT_ID
  const ts = new Date(now - 45 * 86_400_000).toISOString()
  const recent = new Date(now - 12 * 86_400_000).toISOString()
  const life = BX.providers?.highveld ?? SEED_IDS.insurers.karoo
  const person = (id, first_names, surname, dob, gender) => ({
    id, tenant_id: t, first_names, surname, preferred_name: null, date_of_birth: dob, gender, id_type: null, id_lookup_hash: null,
    id_last4: null, date_of_death: null, is_synthetic: true, created_at: ts, updated_at: ts,
  })
  const customer = (id, full_name, email, phone, region) => ({
    id, tenant_id: t, customer_type: 'personal', full_name, email, phone, region, status: 'active', is_synthetic: true, created_by: null,
    data_origin: 'demo', created_at: ts, updated_at: ts,
  })
  const link = (id, customer_id, person_id, role, is_primary) => ({
    id, tenant_id: t, customer_id, person_id, role, is_primary, effective_from: '2025-03-01', effective_to: null, created_at: ts,
  })
  const policy = (id, customer_id, line, provider_id, policy_number, status, premium, cover_type, created_at = ts) => ({
    id, tenant_id: t, customer_id, line, provider_id, product_version_id: null, record_of_advice_id: null, adviser_id: SEED_IDS.users.broker,
    policy_number, origin: status === 'application_submitted' ? 'placed' : 'existing_declared', status,
    underwriting_status: status === 'application_submitted' ? 'requirements_outstanding' : null, premium_amount: premium,
    premium_frequency: 'monthly', inception_date: status === 'in_force' ? '2025-03-01' : null, anniversary_month: status === 'in_force' ? 3 : null,
    source: 'declared', job_id: null, data_origin: 'demo', cover_type, created_at, updated_at: created_at,
  })
  const party = (id, policy_id, person_id, role) => ({
    id, tenant_id: t, policy_id, person_id, role, share_pct: null, effective_from: '2025-03-01', effective_to: null, created_at: ts,
  })
  return {
    persons: [
      person(C(1), 'Priya', 'Naidoo', '1988-04-12', 'female'),
      person(C(2), 'Priyanka', 'Naidu', '1991-09-03', 'female'),
      person(C(3), 'Rajesh', 'Naidoo', '1985-11-27', 'male'),
    ],
    customers: [
      customer(C(101), 'Naidoo household', 'priya.naidoo@example.demo', '0825550401', 'KwaZulu-Natal'),
      customer(C(102), 'Priyanka Naidu', 'priyanka.naidu@example.demo', '0835550402', 'Gauteng'),
    ],
    customer_persons: [
      link(C(201), C(101), C(1), 'self', true),
      link(C(202), C(101), C(3), 'spouse', false),
      link(C(203), C(102), C(2), 'self', true),
    ],
    policies: [
      policy(C(301), C(101), 'short_term_personal', SEED_IDS.insurers.protea, 'PRO-MV-220145', 'in_force', 1240, 'motor'),
      policy(C(302), C(101), 'short_term_personal', SEED_IDS.insurers.karoo, 'KM-HH-330410', 'in_force', 610, 'home'),
      policy(C(303), C(101), 'individual_life', life, null, 'application_submitted', 780, 'life', recent),
      policy(C(304), C(102), 'short_term_personal', SEED_IDS.insurers.baobab, 'BG-MV-418833', 'in_force', 980, 'motor'),
      policy(C(305), C(102), 'individual_life', life, 'HVL-80221145', 'in_force', 540, 'life'),
    ],
    policy_parties: [
      party(C(401), C(303), C(1), 'policyholder'),
      party(C(402), C(303), C(1), 'life_insured'),
      party(C(403), C(305), C(2), 'policyholder'),
      party(C(404), C(305), C(2), 'life_insured'),
    ],
  }
}

const COVER_FROM_NUMBER = [[/-MV-/, 'motor'], [/-HH-/, 'home'], [/-CO-|-CT-/, 'contents'], [/-CP-/, 'commercial_package']]
function coverType(p) {
  if (p.cover_type) return p.cover_type
  if (p.line === 'individual_life') return 'life'
  if (p.line === 'group_risk') return 'group_life'
  const hit = COVER_FROM_NUMBER.find(([re]) => re.test(p.policy_number ?? ''))
  return hit ? hit[1] : p.line === 'short_term_commercial' ? 'commercial_package' : 'other'
}

export async function buildSampleSql(now = Date.now()) {
  const mod = await loadSeed()
  const tables = mod.seedTables(now)
  const extra = copilotFixtures(mod, now)
  for (const [name, rows] of Object.entries(extra)) tables[name] = [...(tables[name] ?? []), ...rows]

  const counters = new Map()
  const next = (tenant, kind) => {
    const key = `${tenant}:${kind}`
    const v = (counters.get(key) ?? 1000) + 1
    counters.set(key, v)
    return v
  }
  const prefix = { client: 'CL', account: 'AC', policy: 'PL', task: 'TK' }
  const number = (tenant, kind) => `${prefix[kind]}-S${next(tenant, kind)}`

  // Stable numbers: the copilot pair first so Priya Naidoo is always CL-S1001 within B-Covered.
  const byFixtureFirst = (a, b) => Number(b.id.startsWith('c0000000')) - Number(a.id.startsWith('c0000000')) || a.id.localeCompare(b.id)
  for (const p of [...(tables.persons ?? [])].sort(byFixtureFirst)) p.client_number ??= number(p.tenant_id, 'client')
  for (const c of [...(tables.customers ?? [])].sort(byFixtureFirst)) c.account_number ??= number(c.tenant_id, 'account')
  for (const p of [...(tables.policies ?? [])].sort(byFixtureFirst)) {
    p.reference ??= number(p.tenant_id, 'policy')
    p.cover_type = coverType(p)
  }
  for (const k of tables.tasks ?? []) k.reference ??= number(k.tenant_id, 'task')

  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (CATEGORY_TABLES.has(name)) row.data_category = 'sample'
      if ((name === 'customers' || name === 'policies') && !row.data_origin) row.data_origin = 'demo'
      if (name === 'audit_events') row.actor_scope ??= 'tenant'
      if (name === 'app_users' && row.role !== 'customer') row.active_organisation_id ??= row.tenant_id
    }
  }

  const lines = [
    '-- Generated by scripts/seed-sample.mjs from src/server/db/seed.ts plus the copilot test pair. Every person and company is fictional.',
    '-- Loads with foreign-key triggers off (replica mode); rows that break a check constraint are skipped and reported.',
    'begin;',
    'set local session_replication_role = replica;',
    'create temp table if not exists seed_report (t text, r jsonb);',
    `create or replace function pg_temp.seed_load(p_table text, p_rows jsonb) returns void language plpgsql as $f$
declare cols text; n int := 0; failed int := 0; errs text[] := '{}'; r jsonb;
begin
  if to_regclass('public.' || quote_ident(p_table)) is null then
    insert into pg_temp.seed_report values (p_table, jsonb_build_object('skipped', 'no such table'));
    return;
  end if;
  select string_agg(quote_ident(c.column_name), ',' order by c.ordinal_position) into cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table and c.is_generated = 'NEVER'
     and exists (select 1 from jsonb_array_elements(p_rows) x where x ? c.column_name);
  begin
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', p_table, cols, cols, p_table) using p_rows;
    get diagnostics n = row_count;
  exception when others then
    n := 0;
    for r in select * from jsonb_array_elements(p_rows) loop
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', p_table, cols, cols, p_table) using jsonb_build_array(r);
        n := n + 1;
      exception when others then
        failed := failed + 1;
        if coalesce(array_length(errs, 1), 0) < 3 then errs := errs || (sqlerrm || ' :: ' || left(r::text, 240)); end if;
      end;
    end loop;
  end;
  insert into pg_temp.seed_report values (p_table, jsonb_build_object('rows', jsonb_array_length(p_rows), 'inserted', n, 'failed', failed, 'errors', to_jsonb(errs)));
end $f$;`,
  ]
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows) || rows.length === 0) continue
    const json = JSON.stringify(rows)
    if (json.includes('$seed$')) throw new Error(`Table ${name} contains the dollar-quote marker`)
    lines.push(`select pg_temp.seed_load('${name}', $seed$${json}$seed$::jsonb);`)
  }
  for (const [key, v] of counters) {
    const [tenant, kind] = key.split(':')
    lines.push(
      `insert into number_sequences (tenant_id, kind, data_category, last_value) values ('${tenant}', '${kind}', 'sample', ${v}) ` +
        `on conflict (tenant_id, kind, data_category) do update set last_value = greatest(number_sequences.last_value, excluded.last_value);`,
    )
  }
  lines.push('commit;', 'select t, r from pg_temp.seed_report order by t;')

  const staff = (tables.app_users ?? []).filter((u) => u.role !== 'customer')
  return { sql: lines.join('\n') + '\n', staff, tenant: mod.TENANT_ID }
}

async function post(body) {
  const url = process.env.SEED_LOADER_URL ?? 'https://cgwgmzpcrvimoqaxgoop.supabase.co/functions/v1/seed-loader'
  const secretFile = resolve(cacheDir, 'seed-secret.txt')
  const secret = process.env.SEED_LOADER_SECRET ?? (existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : '')
  if (!secret) throw new Error('Set SEED_LOADER_SECRET to load the seed')
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-seed-secret': secret }, body: JSON.stringify(body) })
  const json = await res.json().catch(async () => ({ ok: false, error: await res.text() }))
  if (!res.ok || !json.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 2000)}`)
  return json.result
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  const { sql, staff } = await buildSampleSql()
  const file = resolve(root, 'supabase/seed/sample_fixtures.sql')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, sql)
  console.log(`Wrote ${file} (${(sql.length / 1024).toFixed(0)} KB)`)
  if (process.argv.includes('--load')) {
    const report = await post({ action: 'sql', sql })
    for (const row of report) {
      const r = row.r
      const flag = r.failed ? '  ✖' : r.skipped ? '  –' : '  ✓'
      console.log(`${flag} ${row.t}: ${r.skipped ?? `${r.inserted}/${r.rows} inserted${r.failed ? `, ${r.failed} failed` : ''}`}`)
      for (const e of r.errors ?? []) console.log(`      ${e}`)
    }
    const users = await post({
      action: 'create_users',
      users: staff.map((u) => ({ id: u.id, email: u.email, password: DEMO_PASSWORD, full_name: u.full_name })),
    })
    for (const u of users) console.log(`  login ${u.email}: ${u.status === 200 ? 'created' : `${u.status} ${u.msg ?? ''}`}`)
  }
}
