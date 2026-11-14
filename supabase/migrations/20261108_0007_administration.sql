-- InsureFlow AI / B-Covered: administration oversight (member movements, benefit events, administrator valuations with
-- two-pot components, balance statements), investment oversight and fund transfers.
-- Not yet applied: the demo runs on in-browser tables in src/server/db/benefitsSchema.ts that mirror this file.
-- Apply after 20261108_0006_group_risk_foundation.sql, to the dedicated insureflow-dev project only.

begin;

insert into approval_types (key, label) values ('movement_submission', 'Approve an insurer movement schedule') on conflict (key) do nothing;

create table member_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  employer_customer_id uuid not null references customers(id),
  scheme_id uuid references group_schemes(id),
  fund_id uuid references retirement_funds(id),
  employment_id uuid references employments(id),
  person_id uuid references persons(id),
  movement_type text not null check (movement_type in ('joiner','leaver','salary_change','category_change')),
  effective_date date not null,
  processing_date timestamptz not null default now(),
  source_batch_id uuid references import_batches(id),
  before jsonb, after jsonb,
  cover_before numeric(18,2), cover_after numeric(18,2),
  status text not null default 'detected' check (status in ('detected','awaiting_approval','approved','applied','rejected')),
  approval_id uuid references approval_requests(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- B-Covered's own progress and the provider's official decision are separate columns, never one status.
create table benefit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  arrangement text not null check (arrangement in ('group_scheme','retirement_fund','policy')),
  scheme_id uuid references group_schemes(id),
  fund_id uuid references retirement_funds(id),
  policy_id uuid references policies(id),
  person_id uuid not null references persons(id),
  employer_customer_id uuid references customers(id),
  event_type text not null check (event_type in ('death','disability','funeral','critical_illness','retirement','resignation','retrenchment','withdrawal','preservation','transfer','savings_withdrawal')),
  event_date date not null,
  broker_status text not null default 'notified' check (broker_status in ('notified','documents_outstanding','submitted','with_provider','closed')),
  provider_decision text check (provider_decision in ('pending','admitted','declined','paid')),
  provider_decision_date date, provider_reference text,
  amount_claimed numeric(18,2), amount_paid numeric(18,2),
  section_37c boolean not null default false,
  tax_directive_status text check (tax_directive_status in ('not_required','requested','issued')),
  outstanding_requirements jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (provider_decision is null or provider_decision = 'pending' or provider_reference is not null)
);

-- Administrator-reported values only; B-Covered never calculates official member balances.
create table administrator_valuations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_membership_id uuid not null references fund_memberships(id),
  fund_id uuid not null references retirement_funds(id),
  employer_customer_id uuid not null references customers(id),
  person_id uuid not null references persons(id),
  valuation_date date not null,
  vested_component numeric(18,2) not null default 0,
  savings_component numeric(18,2) not null default 0,
  retirement_component numeric(18,2) not null default 0,
  total_value numeric(18,2) not null,
  source_batch_id uuid references import_batches(id),
  source_reference text not null,
  value_basis text not null default 'reported' check (value_basis = 'reported'),
  created_at timestamptz not null default now(),
  unique (fund_membership_id, valuation_date)
);

create table fund_balance_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_id uuid not null references retirement_funds(id),
  employer_customer_id uuid references customers(id),
  period_start date not null, period_end date not null,
  opening_balance numeric(18,2) not null, contributions numeric(18,2) not null default 0,
  transfers_in numeric(18,2) not null default 0, transfers_out numeric(18,2) not null default 0,
  withdrawals numeric(18,2) not null default 0, benefit_payments numeric(18,2) not null default 0,
  investment_returns numeric(18,2) not null default 0, fees numeric(18,2) not null default 0,
  closing_balance numeric(18,2) not null,
  source_reference text not null,
  value_basis text not null default 'reported' check (value_basis = 'reported'),
  created_at timestamptz not null default now()
);

create table investment_portfolios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_id uuid not null references retirement_funds(id),
  manager_id uuid not null references insurers(id),
  name text not null,
  mandate jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table investment_holdings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  portfolio_id uuid not null references investment_portfolios(id) on delete cascade,
  source_kind text not null check (source_kind in ('administrator','investment_manager')),
  instrument text not null, asset_class text not null,
  units numeric(24,6) not null, unit_price numeric(18,8), market_value numeric(18,2),
  valuation_date date not null,
  source_batch_id uuid references import_batches(id),
  source_reference text not null,
  value_basis text not null default 'reported' check (value_basis in ('reported','calculated','estimated','adjusted')),
  created_at timestamptz not null default now(),
  unique (portfolio_id, source_kind, instrument, valuation_date)
);

create table investment_valuations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  portfolio_id uuid not null references investment_portfolios(id) on delete cascade,
  valuation_date date not null,
  market_value numeric(18,2) not null,
  net_cash_flow numeric(18,2) not null default 0,
  source_reference text not null,
  value_basis text not null default 'reported' check (value_basis in ('reported','calculated','estimated','adjusted')),
  created_at timestamptz not null default now(),
  unique (portfolio_id, valuation_date)
);

create table investment_benchmarks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  portfolio_id uuid not null references investment_portfolios(id) on delete cascade,
  period_end date not null,
  benchmark_return numeric(12,8) not null,
  source_reference text not null,
  created_at timestamptz not null default now(),
  unique (portfolio_id, period_end)
);

create table fund_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  transfer_type text not null check (transfer_type in ('section_14','individual','other')),
  transferor_fund_id uuid not null references retirement_funds(id),
  transferee_fund_id uuid not null references retirement_funds(id),
  employer_customer_id uuid references customers(id),
  stage text not null default 'initiate' check (stage in ('initiate','validate','prepare_schedules','reconcile','obtain_approvals','submit','monitor','confirm_allocations','close')),
  effective_date date not null,
  milestones jsonb not null default '[]',
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (transferor_fund_id <> transferee_fund_id)
);

create table transfer_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  transfer_id uuid not null references fund_transfers(id) on delete cascade,
  person_id uuid not null references persons(id),
  fund_membership_id uuid references fund_memberships(id),
  transfer_value_reported numeric(18,2), value_received numeric(18,2),
  vested_component numeric(18,2), savings_component numeric(18,2), retirement_component numeric(18,2),
  status text not null default 'pending' check (status in ('pending','reconciled','difference','missing')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (transfer_id, person_id)
);

alter table financial_exceptions add constraint financial_exceptions_portfolio_fk foreign key (portfolio_id) references investment_portfolios(id);

create index movements_employer_idx on member_movements (employer_customer_id, status);
create index benefit_events_person_idx on benefit_events (person_id);
create index benefit_events_open_idx on benefit_events (tenant_id, broker_status) where broker_status <> 'closed';
create index valuations_fund_idx on administrator_valuations (fund_id, valuation_date);
create index holdings_portfolio_idx on investment_holdings (portfolio_id, valuation_date, source_kind);
create index transfer_members_transfer_idx on transfer_members (transfer_id, status);

do $$
declare t text;
begin
  foreach t in array array['member_movements','benefit_events','administrator_valuations','fund_balance_statements','investment_portfolios','investment_holdings','investment_valuations','investment_benchmarks','fund_transfers','transfer_members'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

commit;
