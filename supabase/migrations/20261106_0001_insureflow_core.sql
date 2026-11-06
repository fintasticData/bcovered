-- InsureFlow AI core schema (vertical slice).
-- Not yet applied: the demo currently runs on in-browser tables in src/server/db that mirror this file.
-- Apply to the dedicated InsureFlow Supabase project only (never the aivoortrekker project).

create extension if not exists pgcrypto;

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique,
  fsp_number text, fsp_verified boolean not null default false,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table app_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  email text not null, full_name text not null,
  role text not null check (role in ('visitor','customer','broker','claims_admin','manager','admin')),
  customer_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_type text not null check (customer_type in ('personal','commercial')),
  full_name text not null, email text, phone text, region text,
  status text not null default 'prospect' check (status in ('prospect','active','lapsed','archived')),
  is_synthetic boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table app_users add constraint app_users_customer_fk foreign key (customer_id) references customers(id);

create table customer_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id) on delete cascade,
  purpose text not null check (purpose in ('processing','marketing','email','whatsapp')),
  granted boolean not null, source text not null, notice_version text not null,
  captured_at timestamptz not null default now(), revoked_at timestamptz
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid references customers(id),
  channel text not null check (channel in ('public','portal','broker')),
  assistant text not null default 'ava', context jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null, structured jsonb,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  conversation_id uuid references conversations(id),
  line text not null check (line in ('personal','commercial')),
  product_category text not null,
  status text not null default 'new' check (status in ('new','qualifying','qualified','quoting','proposal_pending','proposal_released','won','lost')),
  urgency text check (urgency in ('low','medium','high')),
  qualification jsonb not null default '{}', missing_info jsonb not null default '[]',
  source text not null default 'ava',
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table insurers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_fictional boolean not null default true check (is_fictional),
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  lead_id uuid references leads(id), customer_id uuid not null references customers(id),
  product_category text not null, risk_summary jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','comparing','awaiting_approval','approved','released','rejected','expired')),
  proposal jsonb, released_at timestamptz,
  is_simulated boolean not null default true check (is_simulated),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table quote_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  quote_id uuid not null references quotes(id) on delete cascade,
  insurer_id uuid not null references insurers(id),
  option_label text not null,
  monthly_premium numeric(12,2) not null, annual_premium numeric(12,2) not null,
  sum_insured numeric(14,2) not null, excess numeric(12,2) not null,
  inclusions jsonb not null default '[]', exclusions jsonb not null default '[]',
  conditions jsonb not null default '[]', assumptions jsonb not null default '[]',
  expires_at timestamptz not null, source text not null default 'demo_adapter',
  is_simulated boolean not null default true check (is_simulated),
  created_at timestamptz not null default now(),
  unique (quote_id, option_label)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  workflow_type text not null, agent text not null,
  status text not null default 'queued' check (status in ('draft','queued','running','awaiting_information','awaiting_approval','paused','completed','failed','cancelled')),
  initiated_by uuid references app_users(id),
  inputs jsonb not null default '{}', outputs jsonb, error jsonb,
  customer_id uuid references customers(id), lead_id uuid references leads(id), quote_id uuid references quotes(id),
  idempotency_key text, attempt int not null default 0, revision int not null default 0,
  cancel_requested boolean not null default false,
  locked_by text, locked_at timestamptz,
  started_at timestamptz, completed_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table job_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  job_id uuid not null references jobs(id) on delete cascade,
  seq int not null, key text not null, agent text not null, name text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','skipped','cancelled')),
  input jsonb, output jsonb, error jsonb,
  started_at timestamptz, completed_at timestamptz,
  unique (job_id, seq)
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  job_id uuid references jobs(id), job_step_id uuid references job_steps(id),
  agent text not null, adapter text not null check (adapter in ('deterministic','llm')),
  model text, prompt_version text, status text not null,
  tokens_in int, tokens_out int,
  started_at timestamptz not null default now(), completed_at timestamptz
);

create table agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  tool text not null, args jsonb not null, result jsonb,
  status text not null check (status in ('ok','error','blocked')),
  idempotency_key text, duration_ms int,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  job_id uuid references jobs(id),
  approval_type text not null check (approval_type in ('quote_proposal_release','policy_change','claim_submission','external_communication','sensitive_record_update','bulk_campaign','renewal_recommendation')),
  subject_table text not null, subject_id uuid not null,
  requested_by_agent text not null, summary text not null,
  proposed_changes jsonb not null, payload_hash text not null,
  risk_flags jsonb not null default '[]', evidence jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested','cancelled')),
  decided_by uuid references app_users(id), decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table communications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  channel text not null check (channel in ('email','whatsapp','in_app')),
  template text not null, subject text, body text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','sent','cancelled')),
  preview_only boolean not null default true,
  related_quote_id uuid references quotes(id), job_id uuid references jobs(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_id text not null, action text not null,
  entity_table text, entity_id uuid, before jsonb, after jsonb,
  job_id uuid references jobs(id),
  created_at timestamptz not null default now()
);

create index leads_tenant_status_idx on leads (tenant_id, status);
create index quotes_customer_idx on quotes (customer_id);
create index jobs_queue_idx on jobs (status, created_at) where status = 'queued';
create index jobs_tenant_status_idx on jobs (tenant_id, status);
create index job_steps_job_idx on job_steps (job_id, seq);
create index approvals_pending_idx on approval_requests (tenant_id, status) where status = 'pending';
create index communications_customer_idx on communications (customer_id);
create index audit_entity_idx on audit_events (entity_table, entity_id);
create index messages_conversation_idx on conversation_messages (conversation_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['app_users','customers','customer_consents','conversations','conversation_messages','leads','quotes','quote_options','jobs','job_steps','agent_runs','agent_tool_calls','approval_requests','communications','audit_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
alter table organisations enable row level security;
create policy tenant_self on organisations using (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
alter table insurers enable row level security;
create policy insurers_read on insurers for select using (true);
