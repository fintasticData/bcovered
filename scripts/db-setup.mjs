#!/usr/bin/env node
// Applies supabase/migrations/*.sql in filename order to the dedicated InsureFlow database, once each.
//
//   npm run db:status                       list applied and pending migrations
//   npm run db:setup -- --dry-run           show what would run
//   npm run db:setup                        apply pending migrations (asks for confirmation)
//   npm run db:setup -- --yes               apply without the confirmation prompt
//   npm run db:setup -- --hook-registered   continue past 0010 once the access token hook is registered
//
// Connection: SUPABASE_DB_URL (or DATABASE_URL) from the environment or .env.local. Use the session pooler URI from
// Supabase > Connect; the direct db.<ref>.supabase.co host is IPv6-only on most plans.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

// The schema must never land in these projects (README: dedicated insureflow-dev project only).
const FORBIDDEN_PROJECT_REFS = { nrxakqdgbomnfftvoaqy: 'AIVoortrekker' };

// 0011's restrictive policies assume the JWT claims added by the hook from 0010.
const HOOK_MIGRATION = '20261110_0010_brokerage_onboarding.sql';

const args = new Set(process.argv.slice(2));
const command = args.has('status') ? 'status' : 'up';
const dryRun = args.has('--dry-run');
const assumeYes = args.has('--yes');
const hookRegistered = args.has('--hook-registered');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function loadConnectionString() {
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
  const raw = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!raw) {
    fail('Set SUPABASE_DB_URL in .env.local (see .env.example), e.g.\n  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('SUPABASE_DB_URL is not a valid URL. URL-encode special characters in the password (for example @ as %40).');
  }
  const text = `${url.username} ${url.hostname}`;
  for (const [ref, name] of Object.entries(FORBIDDEN_PROJECT_REFS)) {
    if (text.includes(ref)) fail(`Refusing to run against the ${name} project (${ref}). Use the dedicated insureflow-dev project.`);
  }
  // pg lets sslmode in the URL override the ssl option below, so it is removed here.
  url.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false }, display: `${url.hostname}:${url.port || 5432}${url.pathname}` };
}

function readMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(migrationsDir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      // Files 0003 onwards carry their own begin/commit; each file runs inside the runner's single transaction instead,
      // so the migration and its bookkeeping row commit or roll back together.
      const body = sql.replace(/^\s*(begin|commit);\s*$/gim, '');
      return { name, sql: body, checksum };
    });
}

async function ensureMetaTable(client) {
  await client.query(`
    create schema if not exists insureflow_meta;
    revoke all on schema insureflow_meta from public;
    create table if not exists insureflow_meta.applied_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      applied_by text not null default current_user
    );
  `);
}

async function readApplied(client) {
  const { rows } = await client.query('select name, checksum, applied_at from insureflow_meta.applied_migrations order by name');
  return new Map(rows.map((row) => [row.name, row]));
}

async function confirm(question) {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) fail('Not an interactive terminal: re-run with --yes to confirm.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} Type "yes" to continue: `);
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

function printHookInstructions() {
  console.log(`
Next manual step before 0011:
  1. Supabase dashboard > Authentication > Hooks > Customize Access Token (JWT) Claims.
  2. Choose Postgres, schema "public", function "custom_access_token_hook", and enable it.
  3. Re-run: npm run db:setup -- --hook-registered
`);
}

async function main() {
  const migrations = readMigrations();
  if (migrations.length === 0) fail(`No .sql files in ${migrationsDir}`);

  const { connectionString, ssl, display } = loadConnectionString();
  const client = new pg.Client({ connectionString, ssl, application_name: 'insureflow-db-setup' });
  await client.connect().catch((error) => {
    const reason = error.message || error.code || error.errors?.map((e) => e.message).join('; ') || String(error);
    fail(`Could not connect to ${display}: ${reason}`);
  });

  try {
    await ensureMetaTable(client);
    const applied = await readApplied(client);

    const changed = migrations.filter((m) => applied.has(m.name) && applied.get(m.name).checksum !== m.checksum);
    const pending = migrations.filter((m) => !applied.has(m.name));

    console.log(`\nDatabase: ${display}\n`);
    for (const m of migrations) {
      const row = applied.get(m.name);
      const state = !row ? 'pending ' : row.checksum !== m.checksum ? 'CHANGED ' : 'applied ';
      const when = row ? `  ${row.applied_at.toISOString()}` : '';
      console.log(`  ${state} ${m.name}${when}`);
    }
    console.log('');

    if (changed.length > 0) {
      fail(`${changed.length} applied migration(s) were edited afterwards. Add a new migration file instead of changing applied ones.`);
    }

    if (command === 'status') return;

    if (pending.length === 0) {
      console.log('✔ Database is up to date.');
      return;
    }

    if (applied.size === 0) {
      const { rows } = await client.query(`select to_regclass('public.organisations') is not null as exists`);
      if (rows[0].exists) {
        fail('public.organisations already exists but no migrations are recorded. This is not an empty InsureFlow database; check the target.');
      }
    }

    const hookIndex = pending.findIndex((m) => m.name === HOOK_MIGRATION);
    const hookAlreadyApplied = applied.has(HOOK_MIGRATION);
    let toRun = pending;
    if (!hookRegistered) {
      if (hookIndex >= 0) toRun = pending.slice(0, hookIndex + 1);
      else if (hookAlreadyApplied) toRun = [];
    }

    if (toRun.length === 0) {
      console.log(`${HOOK_MIGRATION} is applied; the remaining migrations wait for the access token hook.`);
      printHookInstructions();
      return;
    }

    console.log(`Will apply ${toRun.length} migration(s):`);
    for (const m of toRun) console.log(`  → ${m.name}`);
    console.log('');

    if (dryRun) {
      console.log('Dry run: nothing applied.');
      return;
    }

    if (!(await confirm(`Apply to ${display}?`))) {
      console.log('Cancelled. Nothing applied.');
      return;
    }

    for (const m of toRun) {
      process.stdout.write(`  applying ${m.name} … `);
      const started = Date.now();
      try {
        await client.query('begin');
        await client.query(m.sql);
        await client.query('insert into insureflow_meta.applied_migrations (name, checksum) values ($1, $2)', [m.name, m.checksum]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => {});
        console.log('failed');
        const where = error.position ? ` (character ${error.position})` : '';
        fail(`${m.name} rolled back${where}: ${error.message}${error.detail ? `\n  ${error.detail}` : ''}`);
      }
      console.log(`done (${Date.now() - started} ms)`);
    }

    const stoppedAtHook = !hookRegistered && toRun.at(-1)?.name === HOOK_MIGRATION && toRun.length < pending.length;
    if (stoppedAtHook) {
      console.log(`\n✔ Applied up to ${HOOK_MIGRATION}.`);
      printHookInstructions();
    } else {
      console.log('\n✔ Database is up to date.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => fail(error.message));
