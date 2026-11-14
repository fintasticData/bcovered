-- InsureFlow AI / B-Covered: shared financial controls (imports, matching, reconciliation, exceptions, corrections, evidence).
-- Not yet applied: the demo runs on in-browser tables in src/server/db/controlsSchema.ts that mirror this file.
-- Apply after 20261108_0004_life_foundation.sql, to the dedicated insureflow-dev project only.
-- fund_id and portfolio_id gain foreign keys in 0006 and 0007, once those tables exist.

begin;

insert into approval_types (key, label) values
  ('import_commit', 'Commit an approved import batch to the register'),
  ('correction_schedule', 'Release a contribution correction schedule'),
  ('exception_write_off', 'Write off or close a financial exception')
on conflict (key) do nothing;

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  name text not null,
  source_kind text not null check (source_kind in ('insurer','fund_administrator','employer_payroll','investment_manager','bank','cell_captive_insurer','brokerage','manual')),
  provider_id uuid references insurers(id),
  customer_id uuid references customers(id),
  channel text not null check (channel in ('api','csv','excel','sftp','manual')),
  dataset text not null check (dataset in ('payroll_schedule','contribution_schedule','investment_holdings','transfer_schedule','cell_financials')),
  mapping jsonb not null default '{}', mapping_version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, name, dataset)
);

-- A file is imported once per source; a correction arrives as a new batch that supersedes the old one.
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_source_id uuid not null references data_sources(id),
  reporting_period date check (reporting_period is null or extract(day from reporting_period) = 1),
  file_name text, file_sha256 text not null, storage_path text,
  row_count int not null default 0, valid_count int, error_count int,
  status text not null default 'uploaded' check (status in ('uploaded','validating','validated','matched','awaiting_approval','committed','rejected','superseded','failed')),
  supersedes_batch_id uuid references import_batches(id),
  approval_id uuid references approval_requests(id),
  job_id uuid references jobs(id),
  uploaded_by uuid references app_users(id), uploaded_by_agent text,
  is_demo_fixture boolean not null default false,
  committed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (data_source_id, file_sha256)
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number int not null,
  raw jsonb not null, normalised jsonb,
  validation_errors jsonb not null default '[]',
  match_status text not null default 'pending' check (match_status in ('pending','matched','probable','new','unmatched','duplicate','excluded')),
  matched_person_id uuid references persons(id),
  match_confidence numeric(4,3) check (match_confidence between 0 and 1),
  match_basis text,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create table reconciliation_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  key text not null, name text not null, version int not null default 1,
  left_dataset text not null, right_dataset text not null,
  match_keys jsonb not null, compare_fields jsonb not null, tolerances jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, key, version)
);

create table reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  definition_id uuid not null references reconciliation_definitions(id),
  reporting_period date not null,
  customer_id uuid references customers(id),
  scope_ref jsonb not null default '{}',
  left_batch_id uuid references import_batches(id), right_batch_id uuid references import_batches(id),
  status text not null default 'running' check (status in ('running','completed','failed','superseded')),
  currency char(3) not null default 'ZAR',
  left_total numeric(18,2), right_total numeric(18,2), difference_total numeric(18,2),
  matched_count int not null default 0, difference_count int not null default 0,
  left_only_count int not null default 0, right_only_count int not null default 0,
  job_id uuid references jobs(id), run_by uuid references app_users(id), run_by_agent text,
  created_at timestamptz not null default now(), completed_at timestamptz
);

create table reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  run_id uuid not null references reconciliation_runs(id) on delete cascade,
  match_key text not null, label text not null,
  person_id uuid references persons(id),
  left_row_id uuid references import_rows(id), right_row_id uuid references import_rows(id),
  outcome text not null check (outcome in ('matched','within_tolerance','difference','left_only','right_only','duplicate')),
  field text,
  measure text not null default 'amount' check (measure in ('amount','units','price','count')),
  left_value numeric(24,8), right_value numeric(24,8), difference numeric(24,8),
  currency char(3),
  created_at timestamptz not null default now()
);

create table financial_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  run_id uuid references reconciliation_runs(id),
  reconciliation_item_id uuid references reconciliation_items(id),
  customer_id uuid references customers(id),
  fund_id uuid, portfolio_id uuid,
  category text not null check (category in ('missing_contribution','incorrect_amount','late_submission','unmatched_member','unallocated_payment','duplicate','valuation_difference','missing_transaction','unit_allocation','fee_difference','missing_price','transfer_difference','data_quality','other')),
  title text not null,
  amount numeric(18,2), currency char(3) not null default 'ZAR',
  severity text not null check (severity in ('critical','high','medium','low')),
  status text not null default 'open' check (status in ('open','investigating','awaiting_third_party','resolved','written_off','false_positive')),
  assigned_to uuid references app_users(id), due_date timestamptz,
  proposed_by_agent text, dedupe_key text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index financial_exceptions_dedupe_idx on financial_exceptions (tenant_id, dedupe_key)
  where dedupe_key is not null and status in ('open','investigating','awaiting_third_party');

create table exception_resolutions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  exception_id uuid not null references financial_exceptions(id) on delete cascade,
  resolution text not null check (resolution in ('corrected_at_source','correction_schedule','payment_received','write_off','explained','false_positive')),
  note text not null, amount_resolved numeric(18,2),
  approval_id uuid references approval_requests(id),
  resolved_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  check (resolution <> 'write_off' or approval_id is not null)
);

create table audit_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  entity_table text not null, entity_id uuid not null,
  kind text not null check (kind in ('source_file','extract','correspondence','calculation','finding','report')),
  storage_path text, sha256 text not null, description text, content jsonb,
  captured_by uuid references app_users(id), captured_by_agent text,
  created_at timestamptz not null default now()
);

create table correction_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  run_id uuid not null references reconciliation_runs(id),
  customer_id uuid references customers(id),
  fund_id uuid,
  reporting_period date not null,
  lines jsonb not null default '[]', total numeric(18,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','released','rejected')),
  approval_id uuid references approval_requests(id), job_id uuid references jobs(id),
  released_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index import_batches_source_idx on import_batches (data_source_id, reporting_period, status);
create index import_rows_batch_idx on import_rows (batch_id, match_status);
create index import_rows_person_idx on import_rows (matched_person_id);
create index recon_runs_period_idx on reconciliation_runs (tenant_id, reporting_period, status);
create index recon_items_run_idx on reconciliation_items (run_id, outcome);
create index fin_exceptions_open_idx on financial_exceptions (tenant_id, severity) where status in ('open','investigating','awaiting_third_party');
create index audit_evidence_entity_idx on audit_evidence (entity_table, entity_id);

do $$
declare t text;
begin
  foreach t in array array['data_sources','import_batches','import_rows','reconciliation_definitions','reconciliation_runs','reconciliation_items','financial_exceptions','exception_resolutions','correction_schedules'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

-- Evidence is append-only: there is no update or delete policy, and a trigger refuses changes even for the table owner.
alter table audit_evidence enable row level security;
create policy evidence_read on audit_evidence for select
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy evidence_insert on audit_evidence for insert
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create function audit_evidence_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_evidence is append-only';
end $$;
create trigger audit_evidence_no_update before update or delete on audit_evidence
  for each row execute function audit_evidence_immutable();

commit;
