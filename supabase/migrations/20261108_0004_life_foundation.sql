-- InsureFlow AI / B-Covered: Life & Benefits foundation (people, advisers, products, advice, long-term policies).
-- Not yet applied: the demo runs on in-browser tables in src/server/db/lifeSchema.ts that mirror this file.
-- Target shape: requires the normalised baseline planned in src/server/systems/plannedSchema.ts, which creates
-- organisations, app_users, customers, insurers, jobs, approval_types, approval_requests and policies (with line, status,
-- premium, product_version_id and record_of_advice_id). Apply to the dedicated insureflow-dev project only.

begin;

insert into approval_types (key, label) values
  ('record_of_advice_signoff', 'Sign off a Record of Advice'),
  ('application_submission', 'Submit a life application to the insurer'),
  ('beneficiary_change', 'Change beneficiary nominations')
on conflict (key) do nothing;

-- One row per human. id_lookup_hash is a keyed hash of the normalised ID number computed server-side; the full number is
-- held in a restricted table outside this schema.
create table persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  first_names text not null, surname text not null, preferred_name text,
  date_of_birth date,
  gender text check (gender in ('female','male','other','undisclosed')),
  id_type text check (id_type in ('sa_id','passport','other')),
  id_lookup_hash text, id_last4 text,
  date_of_death date,
  is_synthetic boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, id_lookup_hash)
);

create table customer_persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id) on delete cascade,
  person_id uuid not null references persons(id),
  role text not null check (role in ('self','spouse','dependant','contact','director')),
  is_primary boolean not null default false,
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(),
  unique (customer_id, person_id, role, effective_from)
);
create unique index customer_persons_self_idx on customer_persons (customer_id) where role = 'self' and effective_to is null;

create table person_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  person_id uuid not null references persons(id) on delete cascade,
  related_person_id uuid not null references persons(id) on delete cascade,
  relationship text not null check (relationship in ('spouse','life_partner','child','parent','sibling','other_dependant','other')),
  is_financial_dependant boolean not null default false,
  effective_from date not null default current_date, effective_to date,
  source text not null check (source in ('verified','declared','extracted','inferred')),
  created_at timestamptz not null default now(),
  check (person_id <> related_person_id)
);

create table financial_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  person_id uuid not null references persons(id) on delete cascade,
  version int not null,
  status text not null default 'current' check (status in ('current','superseded')),
  occupation text,
  employment_status text check (employment_status in ('employed','self_employed','unemployed','retired','student','other')),
  gross_monthly_income numeric(14,2), net_monthly_income numeric(14,2),
  monthly_obligations numeric(14,2), outstanding_debt numeric(16,2),
  objectives jsonb not null default '[]', risk_profile text, field_sources jsonb not null default '{}',
  captured_by uuid references app_users(id), job_id uuid references jobs(id),
  created_at timestamptz not null default now(),
  unique (person_id, version)
);
create unique index financial_profiles_current_idx on financial_profiles (person_id) where status = 'current';

-- Product categories must match the FSP licence before activation (see the compliance register).
create table adviser_authorisations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  user_id uuid not null references app_users(id),
  fsp_rep_number text,
  product_category text not null check (product_category in ('lt_a','lt_b1','lt_b1a','lt_b2','lt_b2a','lt_c','retail_pension','pension_fund_benefits','st_personal','st_personal_a1','st_commercial')),
  status text not null default 'active' check (status in ('active','under_supervision','suspended','debarred','lapsed')),
  supervisor_id uuid references app_users(id),
  effective_from date not null, effective_to date,
  verified_by uuid references app_users(id), verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, product_category, effective_from)
);

create table access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  user_id uuid not null references app_users(id),
  scope_type text not null check (scope_type in ('customer','employer','fund','cell')),
  scope_id uuid not null,
  granted_by uuid references app_users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index access_grants_active_idx on access_grants (user_id, scope_type, scope_id) where revoked_at is null;

create table benefit_types (
  key text primary key,
  line text not null check (line in ('individual_life','group_risk','retirement')),
  label text not null
);
insert into benefit_types (key, line, label) values
  ('life','individual_life','Life cover'), ('funeral','individual_life','Funeral cover'),
  ('disability_lump_sum','individual_life','Disability lump sum'), ('income_protection','individual_life','Income protection'),
  ('critical_illness','individual_life','Critical illness'), ('credit_life','individual_life','Credit life'),
  ('endowment','individual_life','Endowment'), ('retirement_annuity','retirement','Retirement annuity'),
  ('group_life','group_risk','Group life'), ('group_funeral','group_risk','Group funeral'),
  ('group_disability_lump_sum','group_risk','Group disability lump sum'), ('group_income_protection','group_risk','Group income protection'),
  ('spouse_life','group_risk','Spouse and dependant life'), ('group_critical_illness','group_risk','Group critical illness');

create table products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references insurers(id),
  line text not null check (line in ('individual_life','group_risk','retirement')),
  name text not null, product_code text, fais_category text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (provider_id, name)
);

create table product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  version int not null, effective_from date not null, effective_to date,
  rules jsonb not null default '{}',
  source text not null check (source in ('provider_document','provider_api','manual')), source_reference text,
  created_at timestamptz not null default now(),
  unique (product_id, version),
  check (effective_to is null or effective_to > effective_from)
);

create table product_benefits (
  id uuid primary key default gen_random_uuid(),
  product_version_id uuid not null references product_versions(id) on delete cascade,
  benefit_type_key text not null references benefit_types(key),
  kind text not null default 'core' check (kind in ('core','rider')),
  min_cover numeric(16,2), max_cover numeric(16,2), min_entry_age int, max_entry_age int, cease_age int,
  waiting_period_months int, exclusions jsonb not null default '[]',
  unique (product_version_id, benefit_type_key, kind)
);

create table needs_analyses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  person_id uuid not null references persons(id),
  financial_profile_id uuid references financial_profiles(id),
  adviser_id uuid references app_users(id),
  needs jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','complete','superseded')),
  job_id uuid references jobs(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table life_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  person_id uuid not null references persons(id),
  needs_analysis_id uuid references needs_analyses(id),
  status text not null default 'draft' check (status in ('draft','compared','recommended','expired')),
  assumptions jsonb not null default '{}',
  valid_until timestamptz not null,
  job_id uuid references jobs(id),
  is_simulated boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table life_quote_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  life_quote_id uuid not null references life_quotes(id) on delete cascade,
  provider_id uuid not null references insurers(id),
  product_version_id uuid not null references product_versions(id),
  label text not null,
  benefits jsonb not null default '[]',
  monthly_premium numeric(14,2) not null, policy_fee numeric(10,2) not null default 0,
  underwriting_expected jsonb not null default '[]',
  source text not null check (source in ('simulated_rate_table','provider_api','provider_document','manual')),
  is_simulated boolean not null default true,
  created_at timestamptz not null default now(),
  unique (life_quote_id, label)
);

create table records_of_advice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  person_id uuid not null references persons(id),
  needs_analysis_id uuid references needs_analyses(id),
  life_quote_id uuid references life_quotes(id),
  recommended_option_id uuid references life_quote_options(id),
  adviser_id uuid not null references app_users(id),
  adviser_authorisation_id uuid references adviser_authorisations(id),
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','signed_off','delivered','superseded')),
  content jsonb not null default '{}', suggestions jsonb not null default '{}',
  is_replacement boolean not null default false,
  payload_hash text, approval_id uuid references approval_requests(id), job_id uuid references jobs(id),
  delivered_at timestamptz, acknowledged_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table policies
  add constraint policies_product_version_fk foreign key (product_version_id) references product_versions(id),
  add constraint policies_roa_fk foreign key (record_of_advice_id) references records_of_advice(id);

create table policy_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  policy_id uuid not null references policies(id) on delete cascade,
  person_id uuid not null references persons(id),
  role text not null check (role in ('policyholder','life_insured','premium_payer','beneficiary','cessionary')),
  share_pct numeric(5,2) check (share_pct > 0 and share_pct <= 100),
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(),
  check (role = 'beneficiary' or share_pct is null)
);

create table policy_benefits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  policy_id uuid not null references policies(id) on delete cascade,
  life_insured_person_id uuid references persons(id),
  benefit_type_key text not null references benefit_types(key),
  kind text not null default 'core' check (kind in ('core','rider')),
  sum_assured numeric(16,2), monthly_benefit numeric(14,2), premium numeric(14,2), loading_pct numeric(6,2),
  exclusions jsonb not null default '[]',
  status text not null default 'proposed' check (status in ('proposed','active','ceased','claimed')),
  effective_from date not null, effective_to date,
  source text not null check (source in ('verified','declared','extracted','inferred')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Broker-recorded status and insurer-reported status are separate facts.
create table policy_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  policy_id uuid not null references policies(id) on delete cascade,
  status text not null,
  reported_by text not null check (reported_by in ('broker','insurer','system')),
  note text, document_ref text, actor_user_id uuid references app_users(id),
  occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);

-- Requirement names and statuses only; medical results never enter this schema.
create table underwriting_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  policy_id uuid not null references policies(id) on delete cascade,
  requirement text not null,
  status text not null default 'outstanding' check (status in ('outstanding','received','waived')),
  source text not null check (source in ('product_rules','insurer')),
  requested_at timestamptz not null default now(), received_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (policy_id, requirement)
);

create index persons_name_idx on persons (tenant_id, surname, first_names);
create index customer_persons_person_idx on customer_persons (person_id);
create index policy_parties_person_idx on policy_parties (person_id, role);
create index policy_benefits_policy_idx on policy_benefits (policy_id);
create index policy_status_events_idx on policy_status_events (policy_id, occurred_at);
create index roa_customer_idx on records_of_advice (customer_id, status);
create index underwriting_open_idx on underwriting_requirements (policy_id) where status = 'outstanding';

do $$
declare t text;
begin
  foreach t in array array['persons','customer_persons','person_relationships','financial_profiles','adviser_authorisations','access_grants','needs_analyses','life_quotes','life_quote_options','records_of_advice','policy_parties','policy_benefits','policy_status_events','underwriting_requirements'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
  foreach t in array array['benefit_types','products','product_versions','product_benefits'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy reference_read on %I for select using (true)', t);
  end loop;
end $$;

commit;
