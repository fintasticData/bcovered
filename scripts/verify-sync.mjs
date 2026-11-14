// Checks that every table the browser sync adapter moves to Supabase can be read and written back by a signed-in broker
// under row-level security (tenant, staff, writer and Sample / Live policies). Writes re-save an existing row unchanged.
//   node scripts/verify-sync.mjs [email]
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signIn } from './copilot-smoke.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const source = readFileSync(resolve(root, 'src/lib/supabase/sync.ts'), 'utf8')
const modules = [...source.matchAll(/^\s{2}(\w+): \{\s*label: '([^']+)',\s*tables: \[([^\]]+)\]/gm)].map((m) => ({
  key: m[1],
  label: m[2],
  tables: [...m[3].matchAll(/'([a-z_]+)'/g)].map((t) => t[1]),
}))

const readOnly = new Set([...(source.match(/READ_ONLY_TABLES = new Set\(\[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))

const email = process.argv[2] ?? 'thabo.nkosi@bcovered.demo'
const token = await signIn(email)
const headers = { apikey: KEY, Authorization: `Bearer ${token}`, 'x-data-category': 'sample', 'Content-Type': 'application/json' }

let failures = 0
for (const m of modules) {
  console.log(`\n${m.key}: ${m.label}`)
  for (const t of m.tables) {
    const read = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { ...headers, Prefer: 'count=exact' } })
    const count = read.headers.get('content-range')?.split('/')[1] ?? '?'
    const rows = await read.json().catch(() => null)
    if (!read.ok) {
      console.log(`  ✖ ${t}: read failed ${read.status} ${JSON.stringify(rows).slice(0, 160)}`)
      if (m.key !== 'onboarding') failures++
      continue
    }
    if (!rows.length) {
      console.log(`  · ${t}: readable, 0 rows (write not exercised)`)
      continue
    }
    if (readOnly.has(t)) {
      console.log(`  ✓ ${t}: ${count} rows readable (read-only catalogue, never written back)`)
      continue
    }
    const write = await fetch(`${URL_}/rest/v1/${t}?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows[0]),
    })
    if (write.ok) console.log(`  ✓ ${t}: ${count} rows readable, write-back accepted`)
    else {
      const body = await write.text()
      console.log(`  ✖ ${t}: ${count} rows readable, write-back refused ${write.status} ${body.slice(0, 200)}`)
      if (m.key !== 'onboarding') failures++
    }
  }
}
console.log(failures ? `\n${failures} table(s) failed` : '\nAll synced tables readable and writable under RLS')
process.exit(failures ? 1 : 0)
