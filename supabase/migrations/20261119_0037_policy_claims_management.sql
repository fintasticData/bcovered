-- Policy & Claims Management foundation: insured items, effective-dated versions,
-- service requests, claims, activity, numbering, media owners, RLS, RPCs, sample seed.

-- ------------------------------------------------------------------ numbering
alter table number_sequences drop constraint if exists number_sequences_kind_check;
alter table number_sequences add constraint number_sequences_kind_check
  check (kind in ('client','account','note','task','policy','enquiry','offer','sale','service_request','claim'));

create or replace function app.next_number(p_tenant uuid, p_kind text, p_category text) returns text
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into number_sequences (tenant_id, kind, data_category) values (p_tenant, p_kind, p_category)
  on conflict (tenant_id, kind, data_category) do update set last_value = number_sequences.last_value + 1
  returning last_value into v;
  return (case p_kind
    when 'client' then 'CL' when 'account' then 'AC' when 'note' then 'NT' when 'policy' then 'PL'
    when 'enquiry' then 'EN' when 'offer' then 'OF' when 'sale' then 'SL'
    when 'service_request' then 'PSR' when 'claim' then 'CLM' else 'TK' end)
    || (case p_category when 'sample' then '-S' else '-' end) || v;
end $$;
revoke all on function app.next_number(uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ tables
create table if not exists insured_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  person_id uuid not null,
  item_type text not null check (item_type in ('vehicle','building','contents')),
  status text not null check (status in ('awaiting_cover','covered','replaced','removed')),
  display_label text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category)
);
create index if not exists insured_items_person_idx on insured_items (tenant_id, data_category, person_id);

create table if not exists policy_cover (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  policy_id uuid not null,
  person_id uuid not null,
  customer_id uuid not null,
  sale_id uuid,
  created_at timestamptz not null default now(),
  unique (policy_id, data_category),
  unique (id, data_category),
  foreign key (policy_id, data_category) references policies (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category)
);
create index if not exists policy_cover_person_idx on policy_cover (tenant_id, data_category, person_id);

create table if not exists policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  policy_id uuid not null,
  version_no int not null,
  entered_at timestamptz not null default now(),
  effective_at timestamptz not null,
  superseded_at timestamptz,
  terms jsonb not null default '{}'::jsonb,
  created_by uuid references app_users(id),
  unique (policy_id, version_no, data_category),
  unique (id, data_category),
  foreign key (policy_id, data_category) references policies (id, data_category)
);
create index if not exists policy_versions_asof_idx on policy_versions (policy_id, effective_at);

create table if not exists policy_version_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  policy_version_id uuid not null,
  insured_item_id uuid not null,
  item_terms jsonb not null default '{}'::jsonb,
  unique (policy_version_id, insured_item_id),
  foreign key (policy_version_id, data_category) references policy_versions (id, data_category),
  foreign key (insured_item_id, data_category) references insured_items (id, data_category)
);

create table if not exists policy_service_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text,
  person_id uuid not null,
  policy_id uuid not null,
  insured_item_id uuid,
  request_type text not null check (request_type in ('vehicle_replacement','endorsement','renewal','cancellation')),
  status text not null check (status in ('requested','in_review','awaiting_customer','awaiting_confirmation','confirmed','declined','withdrawn')),
  owner_member_id uuid references sales_team_members(id),
  next_action text,
  due_at timestamptz,
  requested_effective_at timestamptz,
  confirmed_effective_at timestamptz,
  confirmation_source text,
  insurer_reference text,
  requested_change jsonb not null default '{}'::jsonb,
  current_snapshot jsonb,
  outcome_reason text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (policy_id, data_category) references policies (id, data_category)
);
create unique index if not exists policy_service_requests_ref_key on policy_service_requests (tenant_id, data_category, reference);

create table if not exists policy_endorsements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  policy_id uuid not null,
  service_request_id uuid,
  from_version_id uuid,
  to_version_id uuid not null,
  confirmation_source text not null,
  confirmed_effective_at timestamptz not null,
  insurer_reference text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (policy_id, data_category) references policies (id, data_category),
  foreign key (service_request_id, data_category) references policy_service_requests (id, data_category),
  foreign key (to_version_id, data_category) references policy_versions (id, data_category)
);

create table if not exists policy_service_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  request_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references app_users(id),
  note text,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (request_id, data_category) references policy_service_requests (id, data_category)
);
create unique index if not exists psr_events_idem_uidx
  on policy_service_request_events (request_id, idempotency_key) where idempotency_key is not null;

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text,
  person_id uuid not null,
  policy_id uuid,
  policy_version_id uuid,
  version_review_needed boolean not null default false,
  version_review_reason text,
  original_policy_version_id uuid,
  incident_at timestamptz not null,
  incident_time_unknown boolean not null default false,
  incident_type text not null,
  description text not null,
  status text not null check (status in (
    'reported','in_review','awaiting_evidence','submitted_to_insurer','under_assessment',
    'awaiting_insurer_update','decision_received','closed'
  )),
  owner_member_id uuid references sales_team_members(id),
  next_action text,
  due_at timestamptz,
  insurer_reference text,
  submission_channel text,
  submitted_at timestamptz,
  decision text,
  decision_source text,
  settlement_amount numeric(14,2),
  closure_reason text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category)
);
create unique index if not exists claims_ref_key on claims (tenant_id, data_category, reference);
create index if not exists claims_person_idx on claims (tenant_id, data_category, person_id);

create table if not exists claim_affected_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  claim_id uuid not null,
  insured_item_id uuid,
  display_label text not null,
  item_type text not null,
  snapshot jsonb not null default '{}'::jsonb,
  foreign key (claim_id, data_category) references claims (id, data_category)
);

create table if not exists claim_evidence_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  claim_id uuid not null,
  label text not null,
  status text not null check (status in ('outstanding','received','waived')) default 'outstanding',
  media_asset_id uuid,
  created_at timestamptz not null default now(),
  foreign key (claim_id, data_category) references claims (id, data_category)
);

create table if not exists claim_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  claim_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references app_users(id),
  note text,
  visibility text not null default 'internal' check (visibility in ('internal','shared')),
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (claim_id, data_category) references claims (id, data_category)
);
create unique index if not exists claim_events_idem_uidx
  on claim_events (claim_id, idempotency_key) where idempotency_key is not null;

create table if not exists case_shared_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  claim_id uuid,
  request_id uuid,
  body text not null,
  shared_with_customer boolean not null default false,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ media owners
alter table public.media_assets drop constraint if exists media_assets_owner_table_check;
alter table public.media_assets add constraint media_assets_owner_table_check
  check (owner_table is null or owner_table in (
    'organisations','sales_offers','sales_sales','persons','commercial_assets',
    'policy_service_requests','claims','policy_versions','insured_items'
  ));

-- ------------------------------------------------------------------ triggers for refs
create or replace function app.assign_pc_reference() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'policy_service_requests' and new.reference is null then
    new.reference := app.next_number(new.tenant_id, 'service_request', new.data_category);
  elsif tg_table_name = 'claims' and new.reference is null then
    new.reference := app.next_number(new.tenant_id, 'claim', new.data_category);
  end if;
  return new;
end $$;
drop trigger if exists assign_pc_reference on policy_service_requests;
create trigger assign_pc_reference before insert on policy_service_requests for each row execute function app.assign_pc_reference();
drop trigger if exists assign_pc_reference on claims;
create trigger assign_pc_reference before insert on claims for each row execute function app.assign_pc_reference();

-- ------------------------------------------------------------------ RLS
alter table insured_items enable row level security;
alter table policy_cover enable row level security;
alter table policy_versions enable row level security;
alter table policy_version_items enable row level security;
alter table policy_service_requests enable row level security;
alter table policy_endorsements enable row level security;
alter table policy_service_request_events enable row level security;
alter table claims enable row level security;
alter table claim_affected_items enable row level security;
alter table claim_evidence_requirements enable row level security;
alter table claim_events enable row level security;
alter table case_shared_notes enable row level security;

drop policy if exists insured_items_staff on insured_items;
create policy insured_items_staff on insured_items for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category() and (not app.book_restricted() or app.can_see_person(person_id)))
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_cover_staff on policy_cover;
create policy policy_cover_staff on policy_cover for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category() and (not app.book_restricted() or app.can_see_person(person_id)))
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_service_requests_staff on policy_service_requests;
create policy policy_service_requests_staff on policy_service_requests for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category() and (not app.book_restricted() or app.can_see_person(person_id)))
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists claims_staff on claims;
create policy claims_staff on claims for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category() and (not app.book_restricted() or app.can_see_person(person_id)))
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_versions_staff on policy_versions;
create policy policy_versions_staff on policy_versions for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_version_items_staff on policy_version_items;
create policy policy_version_items_staff on policy_version_items for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_endorsements_staff on policy_endorsements;
create policy policy_endorsements_staff on policy_endorsements for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_service_request_events_staff on policy_service_request_events;
create policy policy_service_request_events_staff on policy_service_request_events for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists claim_affected_items_staff on claim_affected_items;
create policy claim_affected_items_staff on claim_affected_items for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists claim_evidence_requirements_staff on claim_evidence_requirements;
create policy claim_evidence_requirements_staff on claim_evidence_requirements for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists claim_events_staff on claim_events;
create policy claim_events_staff on claim_events for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists case_shared_notes_staff on case_shared_notes;
create policy case_shared_notes_staff on case_shared_notes for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

-- Customer access: own person rows
drop policy if exists insured_items_customer on insured_items;
create policy insured_items_customer on insured_items for select to authenticated
  using (data_category = app.active_category() and person_id in (
    select cp.person_id from customer_persons cp where cp.customer_id = app.my_customer_id()
  ));

drop policy if exists claims_customer on claims;
create policy claims_customer on claims for select to authenticated
  using (data_category = app.active_category() and person_id in (
    select cp.person_id from customer_persons cp where cp.customer_id = app.my_customer_id()
  ));

drop policy if exists policy_service_requests_customer on policy_service_requests;
create policy policy_service_requests_customer on policy_service_requests for select to authenticated
  using (data_category = app.active_category() and person_id in (
    select cp.person_id from customer_persons cp where cp.customer_id = app.my_customer_id()
  ));
