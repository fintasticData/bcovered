# Policy & Claims Management — handover

## Routes changed

| Path | Purpose |
|---|---|
| `/broker/policies` | Defaults to **Policies** (customer-linked). Service requests are a secondary queue; start changes from a selected policy. |
| `/broker/policies/:policyId` | Policy detail tabs: Overview · Schedule · Rates · Transactions · Claims |
| `/broker/policies/requests/new` | Vehicle replacement form (notes → draft) |
| `/broker/policies/requests/:requestId` | Service request detail + workflow + schedule compare |
| `/broker/claims` | Claims queue; multi-select opens **right Russ slideout** |
| `/broker/claims/new` | Report incident (notes → draft) |
| `/broker/claims/:claimId` | Claim detail + settlement ledger + Tasks slideout |
| `/broker/routes` | What you wanna do! guided routes |
| `/my` → **My items & cover** | Current cover vs history |
| `/my/claims/new` | Customer guided incident report |

Client record tabs: **Policies** and **Claims** (Tasks slideout on Policies).

## Migrations

- [supabase/migrations/20261119_0037_policy_claims_management.sql](../supabase/migrations/20261119_0037_policy_claims_management.sql) — tables, numbering, RLS  
- [supabase/migrations/20261119_0038_policy_claims_rpcs.sql](../supabase/migrations/20261119_0038_policy_claims_rpcs.sql) — list/detail RPCs  
- [supabase/migrations/20261119_0039_policy_claims_writes.sql](../supabase/migrations/20261119_0039_policy_claims_writes.sql) — write/confirm/claim/Russ RPCs  
- [supabase/migrations/20261119_0040_policy_claims_sample_seed.sql](../supabase/migrations/20261119_0040_policy_claims_sample_seed.sql) — original sample  
- [supabase/migrations/20261119_0041_russ_claim_intake.sql](../supabase/migrations/20261119_0041_russ_claim_intake.sql) — customer claim + schedule compare  
- [supabase/migrations/20261119_0046_pc_file_policy.sql](../supabase/migrations/20261119_0046_pc_file_policy.sql) — `pc_file_policy`  
- [supabase/migrations/20261119_0047_pc_file_policy_items.sql](../supabase/migrations/20261119_0047_pc_file_policy_items.sql) — file items  
- [supabase/migrations/20261119_0048_confirm_cover_handoff.sql](../supabase/migrations/20261119_0048_confirm_cover_handoff.sql) — confirm cover sync  
- [supabase/migrations/20261119_0052_pc_rates_transactions_russ.sql](../supabase/migrations/20261119_0052_pc_rates_transactions_russ.sql) — premium rates, policy/claim ledgers, overlap guard, Russ summarise/follow-ups, extended details  
- [supabase/migrations/20261119_0053_pc_walkthrough_seed.sql](../supabase/migrations/20261119_0053_pc_walkthrough_seed.sql) — Oct→1 Nov motor, settlement R12k, home storm, depot claim  
- [supabase/migrations/20261119_0054_pc_motor_walkthrough_excess.sql](../supabase/migrations/20261119_0054_pc_motor_walkthrough_excess.sql) — distinct Oct R5 000 / Nov R7 500 excesses, 1 Nov boundary claim, schedule-review claim, `as_of_excess` on claim detail  

Applied to project `cgwgmzpcrvimoqaxgoop` (bcovered) via Supabase MCP.

### Motor walkthrough update (0054)

```sql
update policy_versions set terms = terms || jsonb_build_object('excess', 5000) where id = 'c1111111-0000-4000-8000-00000000a020';
update policy_versions set terms = terms || jsonb_build_object('excess', 7500) where id = 'c1111111-0000-4000-8000-00000000a021';
-- claim2 → 2025-11-01 / v2; claim …a033 → version_review_needed, reason 'Schedule review required'
```

### Single alter / create (ledgers)

```sql
create table if not exists public.policy_premium_rates ( /* amount ZAR, frequency, effective_from/to, source_ref */ );
create table if not exists public.policy_transactions ( /* due|collection|reversal|refund|commission */ );
create table if not exists public.claim_transactions ( /* payment|reversal|recovery */ );
alter table public.claim_affected_items
  add column if not exists section_code text,
  add column if not exists policy_version_id uuid;
```

### Russ bulk RPCs

```sql
create or replace function public.pc_russ_summarise_cover(p_claim_id uuid, p_loss_at timestamptz default null, p_idempotency_key text default null, p_category text default null) returns jsonb;
create or replace function public.pc_russ_create_followups(p_claim_id uuid, p_idempotency_key text default null, p_category text default null) returns jsonb;
create or replace function public.pc_record_claim_transaction(...) returns jsonb;
create or replace function public.pc_record_premium_rate(...) returns jsonb;
```

## Sample verification

| Scenario | Expected |
|---|---|
| Oct schedule → 1 Nov replacement | Same policy ID; customer sees current vehicle + history |
| Loss 28 Oct | Corolla · excess **R5 000** · schedule v1 |
| Loss 1 Nov | Tucson · excess **R7 500** · schedule v2 |
| Missing schedule | Intake saved · **Schedule review required** · excess unresolved |
| Settlement claim | Approved R12 000; payments R8 000 + R4 000; outstanding 0; recovery R1 000 separate |
| Premium | R850 then R920 with effective dates; collection after collection txn |
| Home storm | One claim, buildings + contents sections |
| Depot | Commercial equipment claim on second sample person |
| Russ 3 claims | Follow-ups idempotent on retry |

## Desktop slideout

- [`src/broker/shared/RightSlideout.tsx`](../src/broker/shared/RightSlideout.tsx)  
- Claims: [`ClaimsRussSlideout`](../src/broker/claims/ClaimsRussSlideout.tsx) — summarise cover / missing evidence / create follow-ups  
- Tasks: [`PolicyTasksSlideout`](../src/broker/policies/PolicyTasksSlideout.tsx)

## Claim-linked repair quotes

- Gate: `decision_received` + `approved` / `partially_approved` unlocks claim jobs  
- Migrations: [20261121_0081_claim_service_quotes.sql](../supabase/migrations/20261121_0081_claim_service_quotes.sql), [20261121_0082_claim_service_quotes_demo_seed.sql](../supabase/migrations/20261121_0082_claim_service_quotes_demo_seed.sql)  
- Review: `/broker/claims/03766623-19d9-40e5-8737-06af43ac61d7?view=fintastic` (CLM-S1007 burglary) → **Get repair quotes**  
- Providers: `/broker/concierge/providers?claimId=03766623-19d9-40e5-8737-06af43ac61d7&job=1`  
- Customer: Your Page → Claims → focus CLM-S1007 (type-aware star, not motor template)

```sql
alter table public.service_jobs
  add constraint service_jobs_claim_fk
  foreign key (claim_id, data_category) references public.claims (id, data_category);
create index if not exists service_jobs_claim_idx
  on public.service_jobs (tenant_id, data_category, claim_id)
  where claim_id is not null;
```

## Where to review

1. Demo mode → Customer Area → CL-S1001 → **Policies** / **Claims** / **Items & cover**  
2. `/broker/policies` → open **PRO-MV-220145** → Schedule (v1 R5 000 vs v2 R7 500)  
3. `/broker/claims` → CLM-S1001 (28 Oct Corolla R5 000) · CLM-S1002 (1 Nov Tucson R7 500) · CLM-S1006 (Schedule review required) · **CLM-S1007** (burglary quotes)  
4. `/broker/claims/new?personId=…&policyId=…` → enter loss date → preview vehicle/excess  
5. `/broker/claims` → select 3 → **Open Russ actions** → Create follow-ups (retry stays skipped)  
6. Claim settlement sample → Settlement panel shows outstanding / recoveries  
7. `/my` → Current cover vs History; no commission lines  
8. `/broker/routes` → Confirm issued policy / Report a claim guides  
9. Concierge providers with `?claimId=` → Create job header shows claim reference  

## Manual insurer steps (still optional)

- Record submission channel + insurer reference  
- Record decision source before close  
- No live insurer API  
