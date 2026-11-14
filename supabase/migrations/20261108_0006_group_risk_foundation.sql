-- InsureFlow AI / B-Covered: group risk and retirement fund foundation (employers' schemes, employments, salaries,
-- memberships, funds, participations and contribution rules). Employers are commercial customers, never organisations.
-- Not yet applied: the demo runs on in-browser tables in src/server/db/benefitsSchema.ts that mirror this file.
-- Apply after 20261108_0005_financial_controls.sql, to the dedicated insureflow-dev project only.

begin;

create table group_schemes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  employer_customer_id uuid not null references customers(id),
  provider_id uuid not null references insurers(id),
  name text not null,
  benefit_type_key text not null references benefit_types(key),
  policy_number text,
  status text not null default 'active' check (status in ('active','terminated')),
  effective_from date not null, renewal_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table scheme_rule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  scheme_id uuid not null references group_schemes(id) on delete cascade,
  employer_customer_id uuid not null references customers(id),
  version int not null,
  effective_from date not null, effective_to date,
  rules jsonb not null,
  created_at timestamptz not null default now(),
  unique (scheme_id, version),
  check (effective_to is null or effective_to > effective_from)
);

create table employments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  person_id uuid not null references persons(id),
  employer_customer_id uuid not null references customers(id),
  employee_number text not null,
  category text not null default 'general',
  status text not null default 'active' check (status in ('active','terminated')),
  start_date date not null, end_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index employments_active_number_idx on employments (employer_customer_id, employee_number) where status = 'active';

create table salary_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  employment_id uuid not null references employments(id) on delete cascade,
  employer_customer_id uuid not null references customers(id),
  salary_type text not null check (salary_type in ('basic','pensionable')),
  annual_amount numeric(18,2) not null check (annual_amount >= 0),
  effective_from date not null, effective_to date,
  source_batch_id uuid references import_batches(id),
  source text not null check (source in ('verified','declared','extracted','inferred')),
  value_basis text not null default 'reported' check (value_basis in ('reported','calculated','estimated','adjusted')),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index salary_current_idx on salary_history (employment_id, salary_type) where effective_to is null;

create table scheme_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  scheme_id uuid not null references group_schemes(id),
  employment_id uuid not null references employments(id),
  employer_customer_id uuid not null references customers(id),
  person_id uuid not null references persons(id),
  status text not null default 'active' check (status in ('active','exited')),
  joined_on date not null, exited_on date,
  cover_amount numeric(18,2), above_free_cover_limit boolean not null default false,
  underwriting_status text not null default 'not_required' check (underwriting_status in ('not_required','required','outstanding','accepted')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index scheme_membership_active_idx on scheme_memberships (scheme_id, employment_id) where status = 'active';

create table retirement_funds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  name text not null,
  fund_type text not null check (fund_type in ('pension','provident','umbrella_pension','umbrella_provident','preservation','retirement_annuity')),
  registration_number text,
  administrator_id uuid not null references insurers(id),
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table fund_participations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_id uuid not null references retirement_funds(id),
  employer_customer_id uuid not null references customers(id),
  participation_number text,
  effective_from date not null, effective_to date,
  status text not null default 'active' check (status in ('active','terminated')),
  created_at timestamptz not null default now()
);

create table fund_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  fund_id uuid not null references retirement_funds(id),
  participation_id uuid not null references fund_participations(id),
  employment_id uuid references employments(id),
  employer_customer_id uuid not null references customers(id),
  person_id uuid not null references persons(id),
  member_number text not null,
  category text not null default 'general',
  status text not null default 'active' check (status in ('active','exited','preserved','retired','deceased')),
  joined_on date not null, exited_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (fund_id, member_number)
);

create table contribution_rule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  participation_id uuid not null references fund_participations(id) on delete cascade,
  employer_customer_id uuid not null references customers(id),
  version int not null,
  effective_from date not null, effective_to date,
  rules jsonb not null,
  created_at timestamptz not null default now(),
  unique (participation_id, version)
);

alter table financial_exceptions add constraint financial_exceptions_fund_fk foreign key (fund_id) references retirement_funds(id);
alter table correction_schedules add constraint correction_schedules_fund_fk foreign key (fund_id) references retirement_funds(id);

create index employments_employer_idx on employments (employer_customer_id, status);
create index employments_person_idx on employments (person_id);
create index salary_employment_idx on salary_history (employment_id, effective_from);
create index scheme_members_scheme_idx on scheme_memberships (scheme_id, status);
create index fund_members_participation_idx on fund_memberships (participation_id, status);

do $$
declare t text;
begin
  foreach t in array array['group_schemes','scheme_rule_versions','employments','salary_history','scheme_memberships','retirement_funds','fund_participations','fund_memberships','contribution_rule_versions'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

commit;
