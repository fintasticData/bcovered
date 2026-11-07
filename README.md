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

## Demo mode architecture (no database yet)

```
src/api/client.ts      the UI's only entry point; each method maps to a planned /api/v1 FastAPI route
src/server/api.ts      request handlers (auth by demo identity, role checks)
src/server/db/         typed tables mirroring supabase/migrations/*.sql, persisted to localStorage
src/server/tools/      typed tool registry: validation, role checks, audit, idempotency, approval enforcement
src/server/jobs/       durable job runner: steps, agent runs, tool calls, pause/resume/cancel/retry, reload recovery
src/server/agents/     orchestrator + lead, risk, quote, broker copilot and approval steps
src/server/llm/        assistant adapter interface, deterministic adapter, fal.ai placeholder
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

1. Create the dedicated InsureFlow Supabase project (not `aivoortrekker`) and apply
   `supabase/migrations/20261106_0001_insureflow_core.sql`.
2. Port `src/server/tools`, `jobs` and `agents` to Python (Pydantic models mirror `src/server/db/schema.ts`). The FastAPI
   service connects as a dedicated non-owner role so row-level security applies, and sets `app.tenant_id` per transaction.
3. Replace the bodies in `src/api/client.ts` with `fetch` calls to the same routes; job events move to server-sent events.
4. Configure `FAL_KEY` on the backend only. LLM keys and service-role keys never reach the browser.
