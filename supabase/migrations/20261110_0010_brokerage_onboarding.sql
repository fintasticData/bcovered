-- InsureFlow AI / B-Covered: external brokerage onboarding, multi-brokerage tenancy, review and activation, client-book
-- provenance and insurer access.
-- Not yet applied: the demo runs on in-browser tables in src/server/db/onboardingSchema.ts that mirror this file.
-- Apply after 20261108_0009_access_grant_rls.sql, to the dedicated insureflow-dev project only.
-- After applying: register public.custom_access_token_hook under Authentication > Hooks, then apply 0011.

begin;

-- ------------------------------------------------------------------ 1. Brokerage lifecycle on the tenant table
alter table organisations
  add column kind text not null default 'brokerage' check (kind in ('platform','brokerage')),
  add column legal_name text,
  add column trading_name text,
  add column registration_number text,
  add column brokerage_type text,
  add column lifecycle_status text not null default 'onboarding' check (lifecycle_status in ('onboarding','active','suspended','closed')),
  add column status_reason text,
  add column activated_at timestamptz,
  add column suspended_at timestamptz,
  add column retention_until date;

-- ------------------------------------------------------------------ 2. People in many brokerages
alter table app_users
  alter column tenant_id drop not null,
  alter column role drop not null,
  add column active_organisation_id uuid references organisations(id);

insert into roles (key, label, is_staff) values
  ('brokerage_owner', 'Brokerage owner', true),
  ('brokerage_admin', 'Brokerage administrator', true),
  ('representative', 'Broker / representative', true),
  ('operations_admin', 'Operations administrator', true),
  ('compliance_reviewer', 'Compliance reviewer', true),
  ('read_only', 'Read-only user', true)
on conflict (key) do nothing;

create table organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  user_id uuid not null references app_users(id),
  role text not null references roles(key)
    check (role in ('brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only')),
  status text not null default 'active' check (status in ('active','suspended','removed')),
  invited_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on organisation_memberships (user_id) where status = 'active';

create table platform_staff (
  user_id uuid primary key references app_users(id),
  role text not null check (role in ('platform_admin','onboarding_reviewer','platform_read_only')),
  granted_by uuid references app_users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ 3. Invitations and applications
create table brokerage_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  email text not null,
  role text not null check (role in ('brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only')),
  kind text not null check (kind in ('owner','team')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz, accepted_by uuid references app_users(id),
  revoked_at timestamptz,
  invited_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);
create index invitations_tenant_idx on brokerage_invitations (tenant_id, created_at desc);

create table brokerage_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  route text not null check (route in ('invitation','application')),
  invitation_id uuid references brokerage_invitations(id),
  status text not null default 'draft'
    check (status in ('draft','submitted','under_review','information_required','approved','active','declined','withdrawn','suspended')),
  status_reason text,
  brokerage_type text,
  sections jsonb not null default '{}',
  current_section text,
  declared_modules text[] not null default '{}',
  migration_choice text check (migration_choice in ('import','empty')),
  assigned_reviewer uuid references app_users(id),
  revision int not null default 0,
  submitted_at timestamptz,
  approved_at timestamptz, approved_by uuid references app_users(id),
  activated_at timestamptz, activated_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (activated_at is null or approved_at is not null)
);
create unique index applications_open_idx on brokerage_applications (tenant_id) where status not in ('declined','withdrawn');
create index applications_queue_idx on brokerage_applications (status, submitted_at);

create table onboarding_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  application_id uuid not null references brokerage_applications(id),
  from_status text, to_status text not null, reason text,
  actor_id uuid references app_users(id),
  actor_type text not null check (actor_type in ('user','platform','agent','system')),
  created_at timestamptz not null default now()
);
create index status_events_application_idx on onboarding_status_events (application_id, created_at);

-- ------------------------------------------------------------------ 4. Configurable requirements, documents and review
-- Empty brokerage_types or modules means the requirement applies to all of them.
create table onboarding_requirements (
  key text primary key,
  section text not null check (section in ('organisation','profile','team','products','insurer_access','documents','commercial','migration','readiness')),
  kind text not null check (kind in ('document','field','task','attestation')),
  label text not null,
  guidance text,
  brokerage_types text[] not null default '{}',
  modules text[] not null default '{}',
  is_required boolean not null default true,
  version int not null default 1,
  is_active boolean not null default true
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  owner_table text not null,
  owner_id uuid not null,
  doc_type text not null,
  file_name text not null, mime_type text, file_size bigint, sha256 text not null,
  storage_path text not null unique,
  review_status text not null default 'uploaded' check (review_status in ('uploaded','in_review','accepted','rejected','superseded')),
  data_origin text not null default 'live' check (data_origin in ('demo','imported','live')),
  uploaded_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (storage_path like tenant_id::text || '/%')
);
create index documents_owner_idx on documents (owner_table, owner_id);

create table onboarding_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  application_id uuid not null references brokerage_applications(id) on delete cascade,
  requirement_key text not null references onboarding_requirements(key),
  status text not null default 'outstanding' check (status in ('outstanding','submitted','accepted','correction_requested','rejected','waived')),
  document_id uuid references documents(id),
  reviewed_by uuid references app_users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (application_id, requirement_key)
);

-- Visible to the brokerage.
create table onboarding_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  application_id uuid not null references brokerage_applications(id) on delete cascade,
  item_id uuid references onboarding_items(id),
  body text not null,
  author_id uuid not null references app_users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Platform staff only: a separate table, never a visibility flag on a shared one.
create table onboarding_internal_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  application_id uuid not null references brokerage_applications(id) on delete cascade,
  item_id uuid references onboarding_items(id),
  body text not null,
  author_id uuid not null references app_users(id),
  created_at timestamptz not null default now()
);

create table extracted_field_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  document_id uuid not null references documents(id) on delete cascade,
  target_table text not null,
  target_field text not null,
  current_value jsonb,
  suggested_value jsonb not null,
  source_page text, source_excerpt text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  method text not null default 'simulated' check (method in ('simulated','parsed','model')),
  status text not null default 'suggested' check (status in ('suggested','applied','dismissed')),
  decided_by uuid references app_users(id), decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ 5. Products, commercial terms, insurer access
create table organisation_product_modules (
  tenant_id uuid not null references organisations(id),
  module text not null check (module in ('personal_lines','commercial','individual_life','group_risk','retirement')),
  status text not null default 'declared' check (status in ('declared','approved','enabled','disabled')),
  decided_by uuid references app_users(id), decided_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, module)
);

create table organisation_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  package_key text not null,
  terms jsonb not null default '{}',
  status text not null default 'proposed' check (status in ('proposed','agreed','superseded')),
  agreed_by uuid references app_users(id), agreed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table insurers drop constraint if exists insurers_is_fictional_check;

create table insurer_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  insurer_id uuid not null references insurers(id),
  product_module text not null check (product_module in ('personal_lines','commercial','individual_life','group_risk','retirement')),
  intermediary_code text,
  mandate jsonb not null default '{}',
  integration_key text,
  status text not null default 'not_configured' check (status in ('not_configured','awaiting_credentials','testing','enabled','disabled')),
  status_reason text,
  last_test_at timestamptz, last_test_result text check (last_test_result in ('passed','failed','unsupported')),
  enabled_by uuid references app_users(id), enabled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, insurer_id, product_module)
);

-- Server-only: no client policies. Edge Functions read it with the service role; the secret itself lives in Vault.
create table insurer_access_credentials (
  insurer_access_id uuid primary key references insurer_access(id) on delete cascade,
  tenant_id uuid not null references organisations(id),
  vault_secret_id uuid not null,
  masked_hint text not null,
  rotated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ 6. Client-book provenance and safe retries
alter table customers
  add column source_system text,
  add column source_ref text,
  add column import_batch_id uuid references import_batches(id),
  add column data_origin text not null default 'live' check (data_origin in ('demo','imported','live'));
create unique index customers_source_ref_idx on customers (tenant_id, source_system, source_ref) where source_ref is not null;

alter table policies
  add column source_ref text,
  add column import_batch_id uuid references import_batches(id),
  add column data_origin text not null default 'live' check (data_origin in ('demo','imported','live'));
create unique index policies_source_ref_idx on policies (tenant_id, source_ref) where source_ref is not null;

alter table data_sources drop constraint data_sources_dataset_check;
alter table data_sources add constraint data_sources_dataset_check check (dataset in
  ('payroll_schedule','contribution_schedule','investment_holdings','transfer_schedule','cell_financials','client_book_clients','client_book_policies'));

alter table import_batches
  add column transfer_attestation jsonb,
  add column attested_by uuid references app_users(id),
  add column attested_at timestamptz;

alter table import_rows
  add column source_ref text,
  add column commit_status text not null default 'pending' check (commit_status in ('pending','committed','failed','skipped')),
  add column commit_error text,
  add column committed_entity_id uuid;

alter table audit_events add column actor_scope text not null default 'tenant' check (actor_scope in ('tenant','platform'));

-- ------------------------------------------------------------------ 7. Access helpers and login claims
create or replace function app.member_role() returns text language sql stable security definer set search_path = public as $$
  select m.role from organisation_memberships m
  where m.user_id = auth.uid() and m.tenant_id = app.tenant_id() and m.status = 'active'
$$;

create or replace function app.is_platform_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_staff s where s.user_id = auth.uid() and s.revoked_at is null)
$$;

create or replace function app.tenant_operational() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organisations o where o.id = app.tenant_id() and o.lifecycle_status = 'active')
$$;

create or replace function app.is_staff() returns boolean language sql stable as $$
  select app.role() in ('broker','claims_admin','manager','admin','brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only')
$$;

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare claims jsonb := event -> 'claims'; org uuid; r text;
begin
  select m.tenant_id, m.role into org, r
  from app_users u join organisation_memberships m
    on m.user_id = u.id and m.tenant_id = u.active_organisation_id and m.status = 'active'
  where u.id = (event ->> 'user_id')::uuid;
  claims := claims || jsonb_build_object('tenant_id', org, 'app_role', coalesce(r, 'none'));
  return jsonb_set(event, '{claims}', claims);
end $$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- ------------------------------------------------------------------ 8. Consequential actions (security definer, audited)
create or replace function app.switch_workspace(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from organisation_memberships where user_id = auth.uid() and tenant_id = target and status = 'active') then
    raise exception 'You are not a member of this brokerage' using errcode = '42501';
  end if;
  update app_users set active_organisation_id = target where id = auth.uid();
  insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id)
  values (target, 'user', auth.uid()::text, 'workspace.switched', 'organisations', target);
end $$;

create or replace function app.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare inv brokerage_invitations;
begin
  select * into inv from brokerage_invitations where token_hash = encode(digest(token, 'sha256'), 'hex') for update;
  if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    raise exception 'This invitation is invalid, already used or expired' using errcode = '42501';
  end if;
  if lower(inv.email) <> lower(auth.jwt() ->> 'email') then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;
  update brokerage_invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  insert into organisation_memberships (tenant_id, user_id, role, invited_by)
  values (inv.tenant_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  update app_users set active_organisation_id = inv.tenant_id where id = auth.uid();
  insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id)
  values (inv.tenant_id, 'user', auth.uid()::text, 'invitation.accepted', 'brokerage_invitations', inv.id);
  return inv.tenant_id;
end $$;

create or replace function app.activate_brokerage(application uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a brokerage_applications;
begin
  if not exists (select 1 from platform_staff where user_id = auth.uid() and role in ('platform_admin','onboarding_reviewer') and revoked_at is null) then
    raise exception 'Only a platform administrator or onboarding reviewer can activate a brokerage' using errcode = '42501';
  end if;
  select * into a from brokerage_applications where id = application for update;
  if a.status <> 'approved' then raise exception 'The application must be approved before activation'; end if;
  if exists (select 1 from onboarding_items i join onboarding_requirements r on r.key = i.requirement_key
             where i.application_id = a.id and r.is_required and i.status not in ('accepted','waived')) then
    raise exception 'Required onboarding items are still outstanding';
  end if;
  if not exists (select 1 from organisation_commercial_terms where tenant_id = a.tenant_id and status = 'agreed') then
    raise exception 'Commercial terms have not been agreed';
  end if;
  update brokerage_applications set status = 'active', activated_at = now(), activated_by = auth.uid() where id = a.id;
  update organisations set lifecycle_status = 'active', activated_at = now() where id = a.tenant_id;
  insert into onboarding_status_events (tenant_id, application_id, from_status, to_status, actor_id, actor_type)
  values (a.tenant_id, a.id, 'approved', 'active', auth.uid(), 'platform');
  insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id, actor_scope)
  values (a.tenant_id, 'user', auth.uid()::text, 'brokerage.activated', 'organisations', a.tenant_id, 'platform');
end $$;

-- ------------------------------------------------------------------ 9. Row-level security on the new tables
-- Members read their brokerage; platform staff are explicit; consequential writes go through functions above.
do $$
declare t text;
begin
  foreach t in array array['organisation_memberships','brokerage_invitations','brokerage_applications','onboarding_status_events',
    'onboarding_items','onboarding_feedback','extracted_field_proposals','organisation_product_modules','organisation_commercial_terms','insurer_access'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy member_read on %I for select to authenticated
      using (tenant_id = app.tenant_id() and app.member_role() is not null)$p$, t);
    execute format($p$create policy platform_all on %I for all to authenticated
      using (app.is_platform_staff()) with check (app.is_platform_staff())$p$, t);
  end loop;
end $$;

alter table documents enable row level security;
create policy member_read on documents for select to authenticated using (tenant_id = app.tenant_id() and app.member_role() is not null);
create policy platform_onboarding_docs on documents for select to authenticated
  using (app.is_platform_staff() and owner_table = 'brokerage_applications');

alter table onboarding_internal_notes enable row level security;
create policy platform_only on onboarding_internal_notes for all to authenticated
  using (app.is_platform_staff()) with check (app.is_platform_staff());

alter table platform_staff enable row level security;
create policy platform_self on platform_staff for select to authenticated using (user_id = auth.uid());

alter table onboarding_requirements enable row level security;
create policy requirements_read on onboarding_requirements for select to authenticated using (true);

alter table insurer_access_credentials enable row level security;

create policy member_edit_draft on brokerage_applications for update to authenticated
  using (tenant_id = app.tenant_id() and app.member_role() in ('brokerage_owner','brokerage_admin') and status in ('draft','information_required'))
  with check (tenant_id = app.tenant_id() and status in ('draft','information_required'));
revoke update on brokerage_applications from authenticated;
grant update (sections, current_section, declared_modules, brokerage_type, migration_choice) on brokerage_applications to authenticated;

-- ------------------------------------------------------------------ 10. Suspension blocks operational access
-- Restrictive policies are ANDed with the existing ones, so they only ever narrow access.
do $$
declare t text;
begin
  foreach t in array array['customers','leads','quotes','quote_options','conversations','conversation_messages','communications','jobs','policies'] loop
    execute format($p$create policy operational_tenant on %I as restrictive for all to authenticated
      using (app.tenant_operational() or app.is_platform_staff())$p$, t);
  end loop;
end $$;

-- ------------------------------------------------------------------ 11. Private, tenant-prefixed document storage
insert into storage.buckets (id, name, public) values ('tenant-documents', 'tenant-documents', false) on conflict (id) do nothing;
create policy tenant_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'tenant-documents' and (storage.foldername(name))[1] = app.tenant_id()::text and app.member_role() is not null);
create policy tenant_documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-documents' and (storage.foldername(name))[1] = app.tenant_id()::text
              and app.member_role() in ('brokerage_owner','brokerage_admin','representative','operations_admin'));

-- ------------------------------------------------------------------ 12. Starting requirement checklist (configuration, not code)
insert into onboarding_requirements (key, section, kind, label, guidance, brokerage_types, modules, is_required) values
  ('org_registration', 'organisation', 'field', 'Legal name, trading name and company registration number', null, '{}', '{}', true),
  ('org_addresses', 'organisation', 'field', 'Registered and operating addresses', null, '{}', '{}', true),
  ('org_contacts', 'organisation', 'field', 'Primary and finance contacts', null, '{}', '{}', true),
  ('profile_fsp', 'profile', 'field', 'FSP number and declared licence categories', 'Declared details are checked by B-Covered staff; approval is not regulatory authorisation.', '{}', '{}', true),
  ('profile_key_individual', 'profile', 'field', 'Key individual and compliance officer', null, '{}', '{}', true),
  ('team_owner', 'team', 'task', 'Owner and at least one representative on the team', null, '{}', '{}', true),
  ('products_scope', 'products', 'field', 'Product modules you intend to use', null, '{}', '{}', true),
  ('insurer_relationships', 'insurer_access', 'field', 'Insurer relationships and intermediary codes', 'Each insurer is configured and enabled separately after activation.', '{}', '{}', false),
  ('doc_cipc', 'documents', 'document', 'Company registration certificate (CIPC)', null, '{}', '{}', true),
  ('doc_fsp_licence', 'documents', 'document', 'FSP licence and licence conditions', null, '{}', '{}', true),
  ('doc_pi_cover', 'documents', 'document', 'Professional indemnity and fidelity cover schedule', null, '{}', '{}', true),
  ('doc_fica', 'documents', 'document', 'Proof of address and director identity (FICA)', null, '{}', '{}', true),
  ('doc_compliance_report', 'documents', 'document', 'Latest compliance officer report', null, '{independent,juristic_representative_network}', '{}', true),
  ('doc_life_mandate', 'documents', 'document', 'Long-term insurer intermediary agreement', null, '{}', '{individual_life,group_risk}', true),
  ('doc_retirement_mandate', 'documents', 'document', 'Retirement fund administrator or fund mandate', null, '{}', '{retirement}', true),
  ('doc_commercial_binder', 'documents', 'document', 'Commercial binder or UMA agreements (if any)', null, '{}', '{commercial}', false),
  ('commercial_terms', 'commercial', 'attestation', 'Platform package selected and terms agreed', null, '{}', '{}', true),
  ('migration_plan', 'migration', 'field', 'Client-book import plan or start empty', null, '{}', '{}', true),
  ('popia_transfer', 'migration', 'attestation', 'Confirmation that you may transfer your client information to the platform', null, '{}', '{}', true)
on conflict (key) do nothing;

commit;
