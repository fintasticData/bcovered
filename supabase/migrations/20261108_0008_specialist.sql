-- InsureFlow AI / B-Covered: cell captives, trustee governance, forensic investigations and commission records.
-- Not yet applied: the demo runs on in-browser tables in src/server/db/specialistSchema.ts that mirror this file.
-- Apply after 20261108_0007_administration.sql, to the dedicated insureflow-dev project only.

begin;

create table cell_arrangements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  cell_owner_customer_id uuid not null references customers(id),
  insurer_id uuid not null references insurers(id),
  name text not null,
  agreement_reference text not null,
  terms jsonb not null,
  status text not null default 'active' check (status in ('active','terminated')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table cell_financial_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  cell_id uuid not null references cell_arrangements(id) on delete cascade,
  cell_owner_customer_id uuid not null references customers(id),
  period_end date not null,
  gross_written_premium numeric(18,2) not null, reinsurance_premium numeric(18,2) not null default 0,
  unearned_premium_movement numeric(18,2) not null default 0,
  claims_paid numeric(18,2) not null default 0, outstanding_claims_movement numeric(18,2) not null default 0, ibnr_movement numeric(18,2) not null default 0,
  acquisition_costs numeric(18,2) not null default 0, management_expenses numeric(18,2) not null default 0,
  investment_income numeric(18,2) not null default 0,
  capital_requirement numeric(18,2), reserves_held numeric(18,2),
  source_batch_id uuid references import_batches(id),
  source_reference text not null,
  value_basis text not null default 'reported' check (value_basis in ('reported','calculated','estimated','adjusted')),
  created_at timestamptz not null default now(),
  unique (cell_id, period_end)
);

-- Recorded decisions name the body that took them; B-Covered records, it does not decide.
create table governance_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_id uuid not null references retirement_funds(id),
  kind text not null check (kind in ('meeting','resolution','action_item','risk','decision')),
  title text not null, detail text,
  status text not null default 'open' check (status in ('open','done','noted')),
  owner text, due_date date,
  decided_by_trustees text,
  recorded_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (kind not in ('decision','resolution') or decided_by_trustees is not null)
);

create table trustee_packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_id uuid not null references retirement_funds(id),
  period_end date not null,
  sections jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','issued')),
  prepared_by_agent text,
  issued_by uuid references app_users(id), issued_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'issued' or issued_by is not null)
);

create table investigations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  title text not null, scope text not null,
  status text not null default 'open' check (status in ('open','closed')),
  opened_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table investigation_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  investigation_id uuid not null references investigations(id) on delete cascade,
  title text not null, detail text not null,
  basis text not null check (basis in ('record_supported','hypothesis')),
  evidence_ids jsonb not null default '[]',
  recorded_by uuid references app_users(id), recorded_by_agent text,
  created_at timestamptz not null default now(),
  check (basis <> 'record_supported' or (recorded_by is not null and jsonb_array_length(evidence_ids) > 0))
);

create table commission_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid references customers(id),
  policy_id uuid references policies(id),
  scheme_id uuid references group_schemes(id),
  fund_id uuid references retirement_funds(id),
  provider_id uuid not null references insurers(id),
  period date not null,
  commission_type text not null check (commission_type in ('initial','ongoing','fee')),
  amount numeric(18,2) not null,
  source_reference text not null,
  value_basis text not null default 'reported' check (value_basis in ('reported','calculated','estimated','adjusted')),
  created_at timestamptz not null default now()
);

create index cell_periods_idx on cell_financial_periods (cell_id, period_end);
create index governance_fund_idx on governance_items (fund_id, kind, status);
create index findings_investigation_idx on investigation_findings (investigation_id);
create index commission_period_idx on commission_records (tenant_id, period);

do $$
declare t text;
begin
  foreach t in array array['cell_arrangements','cell_financial_periods','governance_items','trustee_packs','investigations','investigation_findings','commission_records'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

commit;
