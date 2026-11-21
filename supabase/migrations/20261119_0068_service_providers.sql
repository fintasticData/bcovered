-- Service providers directory + service jobs / allocations for VIP Concierge.
-- Applied via MCP as service_providers_tables on bcovered (cgwgmzpcrvimoqaxgoop).

-- ------------------------------------------------------------------ media owners
alter table public.media_assets drop constraint if exists media_assets_owner_table_check;
alter table public.media_assets add constraint media_assets_owner_table_check
  check (owner_table is null or owner_table in (
    'organisations','sales_offers','sales_sales','persons','commercial_assets',
    'policy_service_requests','claims','policy_versions','insured_items',
    'claim_evidence_requirements','concierge_requests','service_jobs'
  ));

-- ------------------------------------------------------------------ trade catalog
create table if not exists public.service_trade_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  code text not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, data_category, code),
  unique (id, data_category)
);

-- ------------------------------------------------------------------ providers
create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  trading_name text not null,
  contact_person text,
  phone text,
  email text,
  operating_hours jsonb not null default '{}'::jsonb,
  after_hours_available boolean not null default false,
  standard_callout_fee_zar numeric(12,2),
  after_hours_callout_fee_zar numeric(12,2),
  preferred boolean not null default false,
  active boolean not null default true,
  internal_notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  check (phone is not null or email is not null)
);
create index if not exists service_providers_tenant_active_idx
  on service_providers (tenant_id, data_category, active, trading_name);

create table if not exists public.service_provider_trades (
  provider_id uuid not null,
  data_category text not null,
  trade_type_id uuid not null,
  primary key (provider_id, trade_type_id),
  foreign key (provider_id, data_category) references service_providers (id, data_category) on delete cascade,
  foreign key (trade_type_id, data_category) references service_trade_types (id, data_category)
);

create table if not exists public.service_provider_areas (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,
  data_category text not null,
  area_label text not null,
  area_kind text not null check (area_kind in ('suburb','town','postcode')),
  area_norm text generated always as (lower(trim(area_label))) stored,
  foreign key (provider_id, data_category) references service_providers (id, data_category) on delete cascade
);
create index if not exists service_provider_areas_norm_idx
  on service_provider_areas (provider_id, area_norm);

create table if not exists public.service_provider_insurer_panels (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,
  data_category text not null,
  insurer_id uuid not null references insurers(id),
  trade_type_id uuid not null,
  active boolean not null default true,
  foreign key (provider_id, data_category) references service_providers (id, data_category) on delete cascade,
  foreign key (trade_type_id, data_category) references service_trade_types (id, data_category),
  unique (provider_id, insurer_id, trade_type_id)
);

-- ------------------------------------------------------------------ jobs + allocations
create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  concierge_request_id uuid,
  claim_id uuid,
  policy_id uuid,
  insured_item_id uuid,
  person_id uuid not null,
  customer_id uuid not null,
  trade_type_id uuid not null,
  work_description text not null,
  urgency text not null check (urgency in ('emergency','same_day','standard','scheduled')),
  preferred_window jsonb not null default '{}'::jsonb,
  service_address text not null,
  status text not null check (status in (
    'draft','seeking_provider','awaiting_acceptance','scheduled','in_progress','completed','declined','cancelled'
  )) default 'seeking_provider',
  authority_status text not null default 'pending'
    check (authority_status in ('pending','recorded','not_required')),
  payment_responsibility text not null default 'unconfirmed'
    check (payment_responsibility in ('customer','insurer','unconfirmed')),
  quoted_callout_fee_zar numeric(12,2),
  agreed_amount_zar numeric(12,2),
  appointment_at timestamptz,
  completed_at timestamptz,
  outcome jsonb not null default '{}'::jsonb,
  next_action text,
  responsible_party text not null default 'concierge'
    check (responsible_party in ('customer','concierge','provider','insurer')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (trade_type_id, data_category) references service_trade_types (id, data_category),
  foreign key (concierge_request_id, data_category) references concierge_requests (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category),
  check (concierge_request_id is not null or claim_id is not null)
);
create index if not exists service_jobs_request_idx
  on service_jobs (concierge_request_id, data_category) where concierge_request_id is not null;
create index if not exists service_jobs_customer_idx
  on service_jobs (tenant_id, data_category, customer_id, status);

create table if not exists public.service_job_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  job_id uuid not null,
  provider_id uuid not null,
  attempt_no int not null,
  is_current boolean not null default true,
  status text not null check (status in (
    'proposed','notified','accepted','declined','cancelled','superseded'
  )) default 'proposed',
  provider_notified_at timestamptz,
  acceptance_channel text check (acceptance_channel is null or acceptance_channel in ('phone','email','portal','other')),
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  shared_customer_fields jsonb not null default '{}'::jsonb,
  quoted_callout_fee_zar numeric(12,2),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (job_id, attempt_no),
  unique (id, data_category),
  foreign key (job_id, data_category) references service_jobs (id, data_category) on delete cascade,
  foreign key (provider_id, data_category) references service_providers (id, data_category)
);
create unique index if not exists service_job_one_current_alloc
  on service_job_allocations (job_id) where is_current;
create index if not exists service_job_allocations_provider_idx
  on service_job_allocations (provider_id, data_category, is_current);

-- ------------------------------------------------------------------ RLS
alter table service_trade_types enable row level security;
alter table service_providers enable row level security;
alter table service_provider_trades enable row level security;
alter table service_provider_areas enable row level security;
alter table service_provider_insurer_panels enable row level security;
alter table service_jobs enable row level security;
alter table service_job_allocations enable row level security;

drop policy if exists stt_staff on service_trade_types;
create policy stt_staff on service_trade_types for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists sp_staff on service_providers;
create policy sp_staff on service_providers for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists spt_staff on service_provider_trades;
create policy spt_staff on service_provider_trades for all to authenticated
  using (
    app.is_staff() and data_category = app.active_category()
    and exists (
      select 1 from service_providers p
      where p.id = provider_id and p.tenant_id = app.tenant_id() and p.data_category = service_provider_trades.data_category
    )
  )
  with check (
    app.is_staff() and data_category = app.active_category()
    and exists (
      select 1 from service_providers p
      where p.id = provider_id and p.tenant_id = app.tenant_id() and p.data_category = service_provider_trades.data_category
    )
  );

drop policy if exists spa_staff on service_provider_areas;
create policy spa_staff on service_provider_areas for all to authenticated
  using (
    app.is_staff() and data_category = app.active_category()
    and exists (
      select 1 from service_providers p
      where p.id = provider_id and p.tenant_id = app.tenant_id() and p.data_category = service_provider_areas.data_category
    )
  )
  with check (
    app.is_staff() and data_category = app.active_category()
    and exists (
      select 1 from service_providers p
      where p.id = provider_id and p.tenant_id = app.tenant_id() and p.data_category = service_provider_areas.data_category
    )
  );

drop policy if exists spp_staff on service_provider_insurer_panels;
create policy spp_staff on service_provider_insurer_panels for all to authenticated
  using (
    app.is_staff() and data_category = app.active_category()
    and exists (
      select 1 from service_providers p
      where p.id = provider_id and p.tenant_id = app.tenant_id() and p.data_category = service_provider_insurer_panels.data_category
    )
  )
  with check (
    app.is_staff() and data_category = app.active_category()
    and exists (
      select 1 from service_providers p
      where p.id = provider_id and p.tenant_id = app.tenant_id() and p.data_category = service_provider_insurer_panels.data_category
    )
  );

drop policy if exists sj_staff on service_jobs;
create policy sj_staff on service_jobs for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists sj_customer on service_jobs;
create policy sj_customer on service_jobs for select to authenticated
  using (customer_id = app.my_customer_id() and data_category = app.active_category());

drop policy if exists sja_staff on service_job_allocations;
create policy sja_staff on service_job_allocations for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists sja_customer on service_job_allocations;
create policy sja_customer on service_job_allocations for select to authenticated
  using (
    data_category = app.active_category()
    and exists (
      select 1 from service_jobs j
      where j.id = job_id and j.customer_id = app.my_customer_id() and j.data_category = service_job_allocations.data_category
    )
  );

-- ------------------------------------------------------------------ seed default trades for BCovered sample
insert into service_trade_types (tenant_id, data_category, code, label)
select 'a0000000-0000-4000-8000-000000000001', 'sample', v.code, v.label
from (values
  ('plumber', 'Plumber'),
  ('electrician', 'Electrician'),
  ('locksmith', 'Locksmith'),
  ('glazier', 'Glazier'),
  ('appliance_repair', 'Appliance repair')
) as v(code, label)
on conflict (tenant_id, data_category, code) do update set label = excluded.label, active = true;
