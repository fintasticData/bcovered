-- InsureFlow AI / B-Covered: normalised baseline that 0004–0008 depend on (approval types, roles, policies, provider types).
-- Not yet applied. Named 0003b so it sorts after 20261107_0003_risk_twin_v2.sql and before 20261108_0004_life_foundation.sql.
-- The demo runs on in-browser tables in src/server/db that mirror this file. Apply to the dedicated insureflow-dev project only.

begin;

-- Approval types become a lookup table instead of a check constraint that every migration has to rewrite.
create table approval_types (
  key text primary key,
  label text not null
);
insert into approval_types (key, label) values
  ('quote_proposal_release', 'Release a quote proposal to the customer'),
  ('policy_change', 'Change a policy'),
  ('claim_submission', 'Submit a claim'),
  ('external_communication', 'Send an external communication'),
  ('sensitive_record_update', 'Update a sensitive record'),
  ('bulk_campaign', 'Send a bulk campaign'),
  ('renewal_recommendation', 'Recommend a renewal'),
  ('underwriting_submission', 'Release an underwriting submission pack'),
  ('risk_assessment_signoff', 'Sign off a risk assessment'),
  ('risk_investigation_review', 'Review a risk investigation')
on conflict (key) do nothing;

alter table approval_requests drop constraint approval_requests_approval_type_check;
alter table approval_requests add constraint approval_requests_approval_type_fk foreign key (approval_type) references approval_types(key);

create table roles (
  key text primary key,
  label text not null,
  is_staff boolean not null default false
);
insert into roles (key, label, is_staff) values
  ('visitor', 'Public visitor', false),
  ('customer', 'Customer', false),
  ('broker', 'Broker', true),
  ('claims_admin', 'Claims administrator', true),
  ('manager', 'Manager', true),
  ('admin', 'Administrator', true)
on conflict (key) do nothing;

-- Providers: insurers, fund administrators, investment managers and cell captive insurers share one table.
alter table insurers add column provider_type text not null default 'insurer'
  check (provider_type in ('insurer','fund_administrator','investment_manager','cell_captive_insurer','other'));

-- One policy table for brokerage-placed and existing policies across short-term and long-term lines.
create table policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  line text not null check (line in ('short_term_personal','short_term_commercial','individual_life','group_risk')),
  provider_id uuid not null references insurers(id),
  product_version_id uuid,
  record_of_advice_id uuid,
  adviser_id uuid references app_users(id),
  policy_number text,
  origin text not null check (origin in ('placed','existing_declared','existing_extracted','existing_imported')),
  status text not null check (status in ('proposed','application_submitted','underwriting','accepted','in_force','lapsed','reinstated','cancelled','matured','declined','not_taken_up')),
  underwriting_status text check (underwriting_status in ('not_started','requirements_outstanding','requirements_complete','decided')),
  premium_amount numeric(14,2),
  premium_frequency text check (premium_frequency in ('monthly','quarterly','annually','single')),
  inception_date date,
  anniversary_month int check (anniversary_month between 1 and 12),
  source text not null check (source in ('verified','declared','extracted','inferred')),
  job_id uuid references jobs(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index policies_customer_idx on policies (customer_id);
create index policies_tenant_line_idx on policies (tenant_id, line, status);

alter table policies enable row level security;
create policy tenant_isolation on policies
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
alter table approval_types enable row level security;
create policy approval_types_read on approval_types for select using (true);
alter table roles enable row level security;
create policy roles_read on roles for select using (true);

commit;
