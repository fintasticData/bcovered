# InsureFlow AI – agentic short-term insurance brokerage demo

InsureFlow AI is the platform; **BCovered** is the first (fictional) brokerage tenant on it. Everything here is synthetic: people,
insurers, premiums and quotes. Simulated results are labelled everywhere and can never be accepted as cover.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: intake, tools, approvals, job controls, full slice
npm run build    # strict TypeScript + production bundle
```

## Vertical slice in this build

Visitor enquiry → Ava qualification → persisted lead → simulated comparison → broker approval → customer proposal.

| Where | What to check |
| --- | --- |
| `/demo` | Demo Studio: start Scenario 1, reset demo data |
| `/assist` | Ava chat with live progress, agent activity and captured details |
| `/broker/approvals` | Approve, reject or request changes (role: Thabo Nkosi) |
| `/broker/workspace` | Broker Copilot (≈40%) + result, execution plan and customer context (≈60%) |
| `/broker/jobs` | Durable jobs with pause, resume, cancel, retry and archive |
| `/portal` | Released proposal for the customer (role: Sarah Jacobs, after Scenario 1) |
| `/help`, `/faq`, `/updates` | Help centre, FAQ by topic, and system updates as release threads (content in `src/data/`) |

Switch identity with the **Demo as …** button in the header. No passwords or real credentials exist.

## Commercial module (Addendum 02, Priority 1)

Business conversation → structured company profile → Business Risk Twin → exposure assessment → draft underwriting submission → broker review.
It runs as one durable job (`commercial_discovery_review`) on the same orchestrator, tool registry, approval engine and audit log.

| Where | What to check |
| --- | --- |
| `/demo` → Commercial → Scenario A | Plays the fictional Kasi Kitchen Group (three Johannesburg restaurants) into the Business Discovery Agent |
| `/business`, `/business/industries`, `/business/cover` | Public commercial pages: 14 industry templates and 25 cover sections |
| `/business/risk-review` | Business Discovery Agent chat with live agent activity and captured facts |
| `/broker/commercial` | Commercial Copilot (≈40%) + results, execution plan, Risk Twin and approval (≈60%). Try “Review Ubuntu Foods and identify outstanding insurance questions” |
| `/broker/commercial/clients/:id` | Risk Twin map, exposures with explained advisory priority, provenance-labelled profile, requests |
| `/broker/commercial/submissions/:id` | Submission editor: Current / Suggested / Apply to draft, sections, pack preview, export, approval |
| `/portal/business`, `/portal/business/risk-profile` | Customer view as Nomsa Dlamini: review status, document requests, provenance labels |

Guardrails: exposures are “potential” and never confirmed as covered without analysed wording; priority is advisory and lists its
inputs; agents cannot overwrite verified values or approve; any pack change makes a pending approval stale; nothing is sent to an
insurer. New tables mirror `supabase/migrations/20261106_0002_commercial_core.sql` (not yet applied).

## AR, Ava and Russ: database copilots (Supabase + MCP)

Ava works with **people** (personal clients, motor, home, contents, individual life), Russ with **businesses** (business
accounts, commercial cover, group schemes). **AR** splits a request and routes each part. There is no language model: fixed
rules plan each turn and call named **MCP jobs** on the `bcovered` Supabase project (`cgwgmzpcrvimoqaxgoop`) as the
signed-in broker.

| Where | What to check |
| --- | --- |
| `/broker/workspace` (AR by default; `?copilot=ava` / `russ`) | Records mode: Sample / Live switch, `@` record dropdown, `/` jobs menu, step cards with references and Open record. Workflows mode: the earlier lenses (Ava: personal lines, life; Russ: commercial, controls) |
| `/broker/people/:personId` | Ask Ava, client number and dated activity from Supabase |
| `/broker/personal/policies/:policyId` | Personal policy with notes and activity (notes saved by Ava appear here) |
| `/broker/accounts/:accountId` | Account people, policies, schemes, notes and history; Ask Ava or Ask Russ |
| `/broker/commercial/clients/:profileId`, `/broker/life/policies/:policyId` | Ask Russ / Ask Ava with the record selected |
| `/sign-in` | Brokerage staff database sign-in (Supabase Auth) |

**How it fits together**

- `supabase/functions/bcovered-mcp`: the MCP server (Streamable HTTP, mcp-lite). It offers 44 jobs: shared, `ava.*`, `russ.*`,
  the sales book and the franchise channel. Each job calls a `copilot_*`, `sales_*` or `franchise_*` Postgres function as the
  caller. No service-role key is used.
- `supabase/functions/copilot-agent`: `/turn`, `/search`, `/jobs` and `/health`. It discovers jobs with `tools/list` and calls
  them with `tools/call`. The rule planner is `supabase/functions/copilot-agent/planner.ts`, which is shared with the
  frontend types and tested in `src/server/__tests__/copilotPlanner.test.ts`.
- **Numbers:** clients (`persons.client_number`, CL-), accounts (`customers.account_number`, AC-), policies (`policies.reference`,
  PL-), notes (NT-) and follow-ups (TK-) are allocated by the `number_sequences` table. Sample numbers carry an `S` (CL-S1001).
- **Sample / Live:** `data_category` is stored on every client record. The `x-data-category` header and restrictive
  row-level security scope each request, and composite foreign keys stop a Sample record linking to a Live one.
- **Logging:** `copilot_actions` records who asked, which copilot acted, the job, the affected records and the outcome.
  Writes are idempotent per `conversation:message:step`.
- **Broker modules on Supabase** (`src/lib/supabase/sync.ts`, `VITE_SUPABASE_MODULES`): while a broker is signed in, the
  copilot, personal, commercial, benefits, controls, funds and specialist modules load from Supabase and write every
  change through.
  - Product catalogue tables are read-only.
  - Onboarding is opt-in because its writes need the database functions.
  - Identity tables stay in the browser.
- **Demo sign-in:** “Demo as …” signs brokerage staff in to Supabase Auth with `VITE_DEMO_STAFF_PASSWORD` (Sample brokerage only).

**Scripts**

- `node scripts/seed-sample.mjs [--load]`: builds or loads `supabase/seed/sample_fixtures.sql` and the demo logins.
- `node scripts/copilot-smoke.mjs all`: end-to-end checks through RPC, MCP and the agent.
- `node scripts/verify-sync.mjs`: confirms every synced table can be read and written under row-level security.
- `node scripts/gen-supabase-columns.mjs`: regenerates the column map used by the sync adapter. Needs `SUPABASE_DB_URL`
  now that the `seed-loader` fallback is disabled.
- `npm run db:schema`: regenerates the live schema snapshot behind Systems > Database (Live ERD, Live tables).

**Still to configure for Live**

1. Register `public.custom_access_token_hook` (Authentication > Hooks). Until then, tenant and role come from the active membership.
2. Create Supabase Auth logins for real brokers.
3. Import Live clients.
4. Record the POPIA transfer basis (EU region).

## Systems section (managers and admins)

Database, frontend, backend and APIs, integrations, agents and copilots, workflows and jobs, and audit, with a Systems Copilot
(≈40%) beside the editor (≈60%). Sign in as Naledi Mokoena (manager) to see it.

| Where | What to check |
| --- | --- |
| `/broker/systems` | Components and status, next steps |
| `/broker/systems/database` (Live ERD, default) | ERD of the tables in the `bcovered` project, by area, with foreign keys; click a table to open it |
| `/broker/systems/database?view=live_tables` | Every live table: columns, types, keys, row-level security policy count, rows, referenced by, Edge Functions that reach it |
| `/broker/systems/database?view=functions` | Edge Functions: flow diagram, routes, access, secrets (names only), database functions, tables, callers |
| `/broker/systems/database?view=erd` | Normalised target schema: ERD per area, tables, screens → tables, plan and instance steps |
| `/broker/systems/agents` | Agents, copilots, tools and usage in this browser |

**Live database and Edge Functions.** The live views read a snapshot of the `bcovered` project in
`src/server/systems/liveSchema.generated.ts` (121 tables, 337 foreign keys, 520 row-level security policies, 21 recorded
migrations). Refresh it after a migration with `npm run db:schema` (needs `SUPABASE_DB_URL` or `SUPABASE_ACCESS_TOKEN` in
`.env.local`). The Edge Function catalogue is `src/server/systems/edgeFunctions.ts`; update its version numbers after a deploy.

| Edge Function | Status | What it does |
| --- | --- | --- |
| `copilot-agent` | Active, JWT checked | AR, Ava and Russ turns, @ search, / jobs menu, health. MCP client of `bcovered-mcp`; logs to `copilot_actions` |
| `bcovered-mcp` | Active, JWT checked | MCP server with 44 jobs; each runs a `copilot_*`, `sales_*` or `franchise_*` Postgres function as the caller |
| `fal-ai` | Active, checks the user itself | fal.ai chat, Ava’s public answers, intake wording, images, prices. `BCOVERED_FAL_API_KEY` is set |
| `seed-loader` | Disabled (410) | Loaded the Sample seed; deployed only, no source here. Delete when no longer needed |

The target schema lives in `src/server/systems/plannedSchema.ts` and the route map in `src/server/systems/screens.ts`;
`src/server/__tests__/systems.test.ts` fails if a route, table, demo table, live table or Edge Function falls out of alignment.
30 target tables are not created in `bcovered` yet (listed under each area of the Live ERD). Decision recorded: the frontend
reads Supabase directly under row-level security, with consequential writes in database functions and agents in Edge Functions.

## Life, Benefits, Funds and Controls (Option A brief and Addendum 01)

Russ (Russell) is B-Covered’s staff assistant; Ava stays customer-facing. Russ prepares work through typed tools and
workflows; licensed people approve. Everything is synthetic and in this browser. No insurer, administrator, payroll, manager
or bank is connected, and migrations `20261108_0004` to `0009` are not applied anywhere.

| Where | What to check |
| --- | --- |
| `/broker/workspace` | Russ. Try the addendum requests, for example “Reconcile the October payroll against the administrator contribution schedule” |
| `/broker/life` | Russ · Life & Benefits. “Start life advice for Johan van der Merwe” (as Lerato Dube or Naledi Mokoena; Thabo Nkosi is not authorised for long-term) |
| `/broker/people`, `/broker/people/:id` | One person record across client, policy, employee, scheme and fund roles; Person 360 |
| `/broker/life/advice/:id` | Record of Advice editor: Russ’s suggestions (≈40%) beside the editor (≈60%), Apply to draft, sign-off |
| `/broker/life/policies/:id`, `/broker/life/servicing` | Insurer decisions labelled insurer-reported; beneficiary changes via approval; servicing queue |
| `/broker/benefits/employers/:id` | Employer 360, movements and “Process movements and recalculate cover” |
| `/broker/controls/imports`, `/reconciliations`, `/exceptions` | Imports (CSV or pasted Excel rows), cent-exact reconciliation, exceptions and corrections |
| `/broker/funds/:id`, `/broker/investments/:id`, `/broker/transfers/:id` | Two-pot values as reported, roll-forward, holdings reconciliation, TWR/MWR, Section 14 stages |
| `/broker/cells/:id`, `/broker/governance`, `/broker/investigations`, `/broker/executive`, `/broker/compliance` | Specialist reporting, trustee packs, forensic workspace, separate executive measures, open regulatory questions |
| `/portal/life`, `/portal/employer`, `/portal/cell` | Johan van der Merwe; Karabo Sithole (Karoo Logistics HR, sees only Karoo); Mpho Radebe (cell owner, sees only their cell) |

Code: `src/server/db/{life,controls,benefits,specialist}Schema.ts`, `benefitsSeed.ts`; tools in `src/server/tools/{person,adviser,life,controls,funds,specialist,growth}.ts`;
pure logic in `src/server/domain/{life,controls,funds,investments,cells}/`; workflows in `src/server/agents/{lifeOrchestrator,controlsOrchestrator,russ}.ts`;
handlers in `src/server/{life,controls,funds,specialist}Api.ts`; adapters in `src/server/integrations/adapters.ts`. Open regulatory questions live in
`src/data/complianceQuestions.ts` and must be answered by compliance before production activation.

## External broker onboarding and brokerage workspaces

Independent brokerages join by **invitation** (B-Covered invites the owner) or **application** (`/brokers/join`), set up with Russ,
are reviewed and approved by B-Covered staff, **activated in a separate step**, then invite their team, import their client book
and enable insurers one by one. Each brokerage is an isolated workspace. Platform approval is not regulatory authorisation.

Runs on **local in-browser tables only**. The matching Supabase migrations are written but **not applied**, pending the client
agreement: `supabase/migrations/20261108_0003b_normalised_baseline.sql`, `20261110_0010_brokerage_onboarding.sql`,
`20261110_0011_split_staff_policies.sql`.

| Who (Demo as …) | Where | What to check |
| --- | --- | --- |
| Pieter Botha (onboarding reviewer) | `/platform/onboarding` → Highveld Advisory | Start review, item decisions, feedback vs internal notes, request information, approve, then activate separately |
| Kagiso Molefe (Highveld owner) | `/onboarding/:section` | Navigation, Russ (Chat, Suggestions, Tasks, Review, about 40%) and editor (about 60%), autosave, resubmission |
| Nomvula Khoza (platform admin) | `/platform/brokerages`, `/platform/invitations` | Suspend and reinstate with reasons, owner invitations with single-use expiring links |
| Anele Mahlangu (Acacia owner) | `/broker`, `/broker/imports/client-book`, `/broker/settings/insurers` | First-use home, CSV/XLSX import with mapping, duplicates, retry and error report, insurer access steps |
| Sam Pillay (Acacia and Coastline) | header workspace switcher | Explicit switching; each workspace shows only its own records |
| Fatima Essop (read-only), Grace Mokoena (compliance) | `/broker/settings/team` | Read access only; writes refused by the service layer |
| Public visitor | `/brokers/join`, `/brokers/invite/demo-invite-umhlanga-2026` | Create an account (local stand-in for Supabase Auth), start or resume an application, accept an invitation once |

How isolation is enforced (`src/server/db/store.ts`, `src/server/api.ts`): `principal()` resolves the active brokerage from the
person's explicit workspace choice and active membership; the tenant repository filters every read and write; read-only roles get
a repository that refuses writes; onboarding, suspended and closed brokerages get one that refuses operational tables; internal
reviewer notes are readable by platform repositories only; platform staff use a repository that cannot read clients or policies.
Quoting only uses insurers with `insurer_access.status = 'enabled'`. Tests: `src/server/__tests__/onboarding.test.ts`.

Code: `src/server/onboardingApi.ts`, `src/server/clientBookApi.ts`, `src/server/agents/onboardingRuss.ts`,
`src/server/onboarding/{config,domain,extraction,insurers}.ts`, tables in `src/server/db/onboardingSchema.ts`, seed in
`src/server/db/onboardingSeed.ts`; UI in `src/onboarding/`, `src/platform/`, `src/broker/{home,settings,imports}/`.

Still open (business decisions and credentials): brokerage types and checklists per type and module, platform packages and fees,
retention periods (5 years placeholder), the POPIA transfer statement wording, platform reviewer names, SMTP for invitation email,
insurer API specifications and credentials, and an OCR/LLM for document extraction (today: labelled-line parsing for text files,
labelled “simulated” values otherwise).

## Demo mode architecture (no database yet)

```
src/api/client.ts      the UI's only entry point; each method maps to a planned /api/v1 FastAPI route
src/server/api.ts      request handlers (auth by demo identity, role checks)
src/server/db/         typed tables mirroring supabase/migrations/*.sql, persisted to localStorage
src/server/tools/      typed tool registry: validation, role checks, audit, idempotency, approval enforcement
src/server/jobs/       durable job runner: steps, agent runs, tool calls, pause/resume/cancel/retry, reload recovery
src/server/agents/     orchestrator + lead, risk, quote, broker copilot and approval steps
src/server/llm/        assistant adapter interface, deterministic adapter, fal.ai wording adapter (VITE_ASSISTANT_ADAPTER=fal)
src/lib/fal/           browser client for the fal-ai Edge Function (chat, intake wording, images, prices)
src/server/insurers/   demo insurer adapter (fixed figures for the 2022 Corolla fixture)
```

### Known limitations

- **Approvals are enforced in the service layer, which currently runs in the browser.** The rules (agents cannot approve,
  release requires an approved request whose payload hash still matches) are real, but true server-side enforcement arrives
  when `src/server` moves behind FastAPI.
- Data lives in `localStorage` for this browser only (open two tabs to watch broker and customer side by side).
- Ava uses a deterministic, scripted motor intake. It does not pretend to be a general LLM; off-script requests get an honest
  "available in a later phase" answer.
- Payload hashing uses a fast non-cryptographic hash; the backend will use SHA-256.

## Switching to FastAPI + Supabase later

1. Create the dedicated InsureFlow Supabase project (not `aivoortrekker`), copy `.env.example` to `.env.local` with its
   session pooler URI, then run `npm run db:status` and `npm run db:setup`. The script applies `supabase/migrations/*.sql`
   in order, once each (tracked in `insureflow_meta.applied_migrations`), refuses the AIVoortrekker project, and stops after
   0010 until the access token hook is registered (`npm run db:setup -- --hook-registered` to finish).
2. Port `src/server/tools`, `jobs` and `agents` to Python (Pydantic models mirror `src/server/db/schema.ts`). The FastAPI
   service connects as a dedicated non-owner role so row-level security applies, and sets `app.tenant_id` per transaction.
3. Replace the bodies in `src/api/client.ts` with `fetch` calls to the same routes; job events move to server-sent events.
4. Configure `FAL_KEY` on the backend only. LLM keys and service-role keys never reach the browser.
5. fal.ai already runs in the `fal-ai` Edge Function. Set `BCOVERED_FAL_API_KEY` (fal API preset) as its secret; it falls
   back to `FAL_KEY`. `BCOVERED_LOCAL_FAL_API_KEY` (full access) stays in the local `.env` for scripts and is never deployed.
