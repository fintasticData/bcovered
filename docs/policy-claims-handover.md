# Policy & Claims Management — handover

## Routes changed

| Path | Purpose |
|---|---|
| `/broker/policies` | Brokerage-wide policies + service requests |
| `/broker/policies/:policyId` | Policy detail (shared) |
| `/broker/policies/requests/new` | Vehicle replacement form (notes → draft) |
| `/broker/policies/requests/:requestId` | Service request detail + workflow + schedule compare |
| `/broker/claims` | Brokerage-wide claims queue (multi-select follow-ups, max 12) |
| `/broker/claims/new` | Report incident (notes → draft) |
| `/broker/claims/:claimId` | Claim detail + workflow + Russ evidence request |
| `/my` → **My claims** | Customer claim list |
| `/my/claims/new` | Customer guided incident report (`pc_customer_create_claim`) |
| `/claims` | Redirects to `/my?tab=claims` (legacy demo at `/claims/demo`) |

Client record tabs: **Policies** and **Claims** on `ClientRecordPanel` (Customer Area + My workspace).

Nav: More → Short-term Personal → **Policies** / **Claims**.

Ava (Customer Area): suggestion/starter **Report an incident from notes** / **Report a claim for …** when a person is selected; planner job `pc.claim.create` → `pc_create_claim`.

## Migrations

- [supabase/migrations/20261119_0037_policy_claims_management.sql](../supabase/migrations/20261119_0037_policy_claims_management.sql) — tables, numbering PSR/CLM, media owners, RLS  
- [supabase/migrations/20261119_0038_policy_claims_rpcs.sql](../supabase/migrations/20261119_0038_policy_claims_rpcs.sql) — list/detail RPCs  
- [supabase/migrations/20261119_0039_policy_claims_writes.sql](../supabase/migrations/20261119_0039_policy_claims_writes.sql) — write/confirm/claim/Russ RPCs  
- [supabase/migrations/20261119_0040_policy_claims_sample_seed.sql](../supabase/migrations/20261119_0040_policy_claims_sample_seed.sql) — sample Thandi motor + claims  
- [supabase/migrations/20261119_0041_russ_claim_intake.sql](../supabase/migrations/20261119_0041_russ_claim_intake.sql) — `pc_customer_create_claim`, `pc_russ_compare_schedule`

Applied to project `cgwgmzpcrvimoqaxgoop` (bcovered) via Supabase MCP.

### Single alter (media owners) for quick copy

```sql
alter table public.media_assets drop constraint if exists media_assets_owner_table_check;
alter table public.media_assets add constraint media_assets_owner_table_check
  check (owner_table is null or owner_table in (
    'organisations','sales_offers','sales_sales','persons','commercial_assets',
    'policy_service_requests','claims','policy_versions','insured_items'
  ));
```

### Russ / customer write RPCs (0041)

```sql
-- Customer self-serve claim (same seed/version path as staff create)
create or replace function public.pc_customer_create_claim(
  p_incident_at timestamptz,
  p_incident_time_unknown boolean,
  p_incident_type text,
  p_description text,
  p_policy_id uuid default null,
  p_item_ids uuid[] default '{}',
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb;

-- Diff revised schedule fields vs requested_change; approve records event only
create or replace function public.pc_russ_compare_schedule(
  p_request_id uuid,
  p_proposed jsonb,
  p_approve boolean default false,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb;
```

## Sample verification

| Scenario | Expected (sample) |
|---|---|
| 12 Nov accident after 15 Nov replacement | CLM-S1001 linked to policy version 1 (Toyota) |
| Outstanding photos | CLM-S1002 `awaiting_evidence` |
| Confirmed replacement | PSR sample confirmed; v2 Hyundai current |
| Dual entry | Client → Policies and `/broker/policies` share same IDs |

## Manual insurer steps (R1)

- Record “sent to insurer” on service requests (`awaiting_confirmation`)
- Record claim submission channel + insurer reference
- Record decision source (email/portal/authorised party) before close
- No live insurer API

## Where to review

1. Customer Area → sample client → Ava **Report an incident from notes** / Claims tab → `/broker/claims/new` notes strip  
2. Claim detail → Russ · **Check missing claim evidence** → **Approve and request evidence** (status `awaiting_evidence` + shared note)  
3. `/my` → My claims → **Report an incident** → `/my/claims/new`  
4. Policies → vehicle replacement request → Russ · **Compare revised schedule** → Confirm replacement  
5. More → Claims → filter Overdue → select up to 12 → **Prepare follow-ups for selected**  
