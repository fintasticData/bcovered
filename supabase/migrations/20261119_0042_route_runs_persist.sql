-- Route runs persistence + endorsement/renewal/cancellation creates for the action hub.

-- ------------------------------------------------------------------ route_runs
create table if not exists public.route_runs (
  id uuid primary key,
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  definition_id text not null,
  definition_version text,
  subject_type text not null default 'client',
  subject_id uuid,
  subject_label text,
  policy_id uuid,
  claim_id uuid,
  business_key text,
  category text not null check (category in ('sample','live')),
  status text not null check (status in ('active','completed','abandoned')),
  current_action_id text,
  waiting_on text,
  owner_user_id uuid references app_users(id),
  due_at timestamptz,
  state jsonb not null default '{}'::jsonb,
  started_by uuid,
  started_by_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (subject_id, data_category) references persons (id, data_category)
);

create unique index if not exists route_runs_active_business_key
  on public.route_runs (tenant_id, data_category, definition_id, business_key)
  where status = 'active' and business_key is not null;

create index if not exists route_runs_owner_idx on public.route_runs (tenant_id, data_category, owner_user_id, status);
create index if not exists route_runs_subject_idx on public.route_runs (tenant_id, data_category, subject_id, status);
create index if not exists route_runs_policy_idx on public.route_runs (tenant_id, data_category, policy_id) where policy_id is not null;
create index if not exists route_runs_claim_idx on public.route_runs (tenant_id, data_category, claim_id) where claim_id is not null;

create table if not exists public.route_action_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  run_id uuid not null,
  action_id text not null,
  status text not null check (status in ('done','needs_input','blocked','failed','stale')),
  reason text,
  summary text,
  result jsonb,
  actor_type text not null check (actor_type in ('user','agent')),
  actor_name text not null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (run_id, data_category) references route_runs (id, data_category)
);

create unique index if not exists route_action_results_idem
  on public.route_action_results (run_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists route_action_results_run_idx on public.route_action_results (run_id, created_at);

alter table public.route_runs enable row level security;
alter table public.route_action_results enable row level security;

drop policy if exists route_runs_staff on public.route_runs;
create policy route_runs_staff on public.route_runs for all
  using (
    tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category()
    and (subject_id is null or not app.book_restricted() or app.can_see_person(subject_id))
  )
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists route_action_results_staff on public.route_action_results;
create policy route_action_results_staff on public.route_action_results for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

-- ------------------------------------------------------------------ upsert / list RPCs
create or replace function public.route_upsert_run(p_run jsonb, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare rid uuid := (p_run->>'id')::uuid;
begin
  perform app.pc_require_staff();
  insert into route_runs (
    id, tenant_id, data_category, definition_id, definition_version, subject_type, subject_id, subject_label,
    policy_id, claim_id, business_key, category, status, current_action_id, waiting_on, owner_user_id, due_at,
    state, started_by, started_by_name, completed_at, created_at, updated_at
  ) values (
    rid, app.tenant_id(), cat,
    p_run->>'definition_id', p_run->>'definition_version', coalesce(p_run->>'subject_type','client'),
    nullif(p_run->>'subject_id','')::uuid, p_run->>'subject_label',
    nullif(p_run->>'policy_id','')::uuid, nullif(p_run->>'claim_id','')::uuid, p_run->>'business_key',
    coalesce(p_run->>'category', cat), p_run->>'status', p_run->>'current_action_id', p_run->>'waiting_on',
    coalesce(nullif(p_run->>'owner_user_id','')::uuid, auth.uid()),
    nullif(p_run->>'due_at','')::timestamptz,
    coalesce(p_run->'state', '{}'::jsonb),
    coalesce(nullif(p_run->>'started_by','')::uuid, auth.uid()),
    p_run->>'started_by_name',
    nullif(p_run->>'completed_at','')::timestamptz,
    coalesce(nullif(p_run->>'created_at','')::timestamptz, now()),
    now()
  )
  on conflict (id) do update set
    subject_id = excluded.subject_id,
    subject_label = excluded.subject_label,
    policy_id = excluded.policy_id,
    claim_id = excluded.claim_id,
    business_key = excluded.business_key,
    status = excluded.status,
    current_action_id = excluded.current_action_id,
    waiting_on = excluded.waiting_on,
    owner_user_id = excluded.owner_user_id,
    due_at = excluded.due_at,
    state = excluded.state,
    completed_at = excluded.completed_at,
    updated_at = now();
  return jsonb_build_object('outcome','saved','run_id', rid);
end $$;

create or replace function public.route_append_result(p_result jsonb, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare existing uuid;
begin
  perform app.pc_require_staff();
  if p_result->>'idempotency_key' is not null then
    select id into existing from route_action_results
     where run_id = (p_result->>'run_id')::uuid and idempotency_key = p_result->>'idempotency_key' limit 1;
    if existing is not null then
      return jsonb_build_object('outcome','saved','result_id', existing, 'replayed', true);
    end if;
  end if;
  insert into route_action_results (
    id, tenant_id, data_category, run_id, action_id, status, reason, summary, result,
    actor_type, actor_name, idempotency_key, created_at
  ) values (
    coalesce(nullif(p_result->>'id','')::uuid, gen_random_uuid()),
    app.tenant_id(), cat,
    (p_result->>'run_id')::uuid, p_result->>'action_id', p_result->>'status',
    p_result->>'reason', p_result->>'summary', p_result->'result',
    p_result->>'actor_type', p_result->>'actor_name', p_result->>'idempotency_key',
    coalesce(nullif(p_result->>'created_at','')::timestamptz, now())
  )
  on conflict (id) do nothing
  returning id into existing;
  return jsonb_build_object('outcome','saved','result_id', existing, 'replayed', false);
end $$;

create or replace function public.route_list_runs(p_scope text default 'team', p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform app.pc_require_staff();
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.updated_at desc)
    from route_runs r
    where r.tenant_id = app.tenant_id() and r.data_category = cat
      and (p_scope <> 'mine' or r.owner_user_id = auth.uid() or r.started_by = auth.uid())
      and (r.subject_id is null or not app.book_restricted() or app.can_see_person(r.subject_id))
  ), '[]'::jsonb);
end $$;

create or replace function public.route_get_run(p_run_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare run jsonb;
declare results jsonb;
begin
  perform app.pc_require_staff();
  select to_jsonb(r) into run from route_runs r
   where r.id = p_run_id and r.tenant_id = app.tenant_id() and r.data_category = cat;
  if run is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (run->>'subject_id') is not null and app.book_restricted() and not app.can_see_person((run->>'subject_id')::uuid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) into results
  from route_action_results x where x.run_id = p_run_id and x.data_category = cat;
  return jsonb_build_object('run', run, 'results', results);
end $$;

grant execute on function public.route_upsert_run(jsonb, text) to authenticated;
grant execute on function public.route_append_result(jsonb, text) to authenticated;
grant execute on function public.route_list_runs(text, text) to authenticated;
grant execute on function public.route_get_run(uuid, text) to authenticated;

-- ------------------------------------------------------------------ service request creates (endorsement / renewal / cancellation)
create or replace function public.pc_create_endorsement(
  p_person_id uuid, p_policy_id uuid, p_requested_effective_at timestamptz,
  p_change jsonb, p_item_id uuid default null, p_notes text default null,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare existing uuid;
declare snap jsonb;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select request_id into existing from policy_service_request_events where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      select * into r from policy_service_requests where id = existing;
      return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Replayed endorsement request', 'replayed', true);
    end if;
  end if;
  if p_item_id is not null then
    select jsonb_build_object('item_id', ii.id, 'label', ii.display_label, 'details', ii.details)
      into snap from insured_items ii where ii.id = p_item_id;
  end if;
  insert into policy_service_requests (
    tenant_id, data_category, person_id, policy_id, insured_item_id, request_type, status,
    owner_member_id, next_action, due_at, requested_effective_at, requested_change, current_snapshot, created_by
  ) values (
    app.tenant_id(), cat, p_person_id, p_policy_id, p_item_id, 'endorsement', 'requested',
    app.my_member_id(), 'Broker review', now() + interval '2 days', p_requested_effective_at,
    jsonb_build_object('change', p_change, 'notes', p_notes), snap, auth.uid()
  ) returning * into r;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, to_status, actor_user_id, note, idempotency_key)
  values (app.tenant_id(), cat, r.id, 'created', 'requested', auth.uid(), coalesce(p_notes, 'Endorsement requested'), p_idempotency_key);
  return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Endorsement '||r.reference||' created');
end $$;

create or replace function public.pc_create_renewal(
  p_person_id uuid, p_policy_id uuid, p_requested_effective_at timestamptz,
  p_change jsonb default '{}'::jsonb, p_notes text default null,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare existing uuid;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select request_id into existing from policy_service_request_events where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      select * into r from policy_service_requests where id = existing;
      return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Replayed renewal request', 'replayed', true);
    end if;
  end if;
  insert into policy_service_requests (
    tenant_id, data_category, person_id, policy_id, request_type, status,
    owner_member_id, next_action, due_at, requested_effective_at, requested_change, created_by
  ) values (
    app.tenant_id(), cat, p_person_id, p_policy_id, 'renewal', 'requested',
    app.my_member_id(), 'Review expiring cover', now() + interval '7 days', p_requested_effective_at,
    jsonb_build_object('renewal', p_change, 'notes', p_notes), auth.uid()
  ) returning * into r;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, to_status, actor_user_id, note, idempotency_key)
  values (app.tenant_id(), cat, r.id, 'created', 'requested', auth.uid(), coalesce(p_notes, 'Renewal started'), p_idempotency_key);
  return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Renewal '||r.reference||' created');
end $$;

create or replace function public.pc_create_cancellation(
  p_person_id uuid, p_policy_id uuid, p_requested_effective_at timestamptz,
  p_reason text, p_source text default 'client', p_notes text default null,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare existing uuid;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select request_id into existing from policy_service_request_events where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      select * into r from policy_service_requests where id = existing;
      return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Replayed cancellation request', 'replayed', true);
    end if;
  end if;
  insert into policy_service_requests (
    tenant_id, data_category, person_id, policy_id, request_type, status,
    owner_member_id, next_action, due_at, requested_effective_at, requested_change, created_by
  ) values (
    app.tenant_id(), cat, p_person_id, p_policy_id, 'cancellation', 'requested',
    app.my_member_id(), 'Review cancellation', now() + interval '2 days', p_requested_effective_at,
    jsonb_build_object('reason', p_reason, 'source', p_source, 'notes', p_notes), auth.uid()
  ) returning * into r;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, to_status, actor_user_id, note, idempotency_key)
  values (app.tenant_id(), cat, r.id, 'created', 'requested', auth.uid(), coalesce(p_notes, 'Cancellation requested'), p_idempotency_key);
  return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Cancellation '||r.reference||' created');
end $$;

create or replace function public.pc_confirm_endorsement(
  p_request_id uuid, p_confirmed_effective_at timestamptz, p_confirmation_source text,
  p_insurer_reference text default null, p_revised_terms jsonb default null,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare old_v policy_versions%rowtype;
declare new_v policy_versions%rowtype;
begin
  perform app.pc_require_staff();
  select * into r from policy_service_requests where id = p_request_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(r.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.request_type <> 'endorsement' then raise exception 'validation' using errcode = '22023'; end if;
  if p_idempotency_key is not null and exists (
    select 1 from policy_service_request_events where request_id = r.id and idempotency_key = p_idempotency_key and event_type = 'confirmed'
  ) then
    return jsonb_build_object('outcome','saved','summary','Confirmation already recorded','replayed', true);
  end if;
  if r.status = 'confirmed' then
    return jsonb_build_object('outcome','saved','summary','Already confirmed','replayed', true);
  end if;
  select * into old_v from policy_versions where policy_id = r.policy_id and superseded_at is null order by version_no desc limit 1;
  update policy_versions set superseded_at = p_confirmed_effective_at where id = old_v.id;
  insert into policy_versions (tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms, created_by)
  values (
    app.tenant_id(), cat, r.policy_id, coalesce(old_v.version_no,0)+1, now(), p_confirmed_effective_at,
    coalesce(p_revised_terms, old_v.terms) || jsonb_build_object('schedule', 'Endorsement '||r.reference), auth.uid()
  ) returning * into new_v;
  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
  select app.tenant_id(), cat, new_v.id, pvi.insured_item_id, pvi.item_terms
  from policy_version_items pvi where pvi.policy_version_id = old_v.id;
  insert into policy_endorsements (tenant_id, data_category, policy_id, service_request_id, from_version_id, to_version_id, confirmation_source, confirmed_effective_at, insurer_reference)
  values (app.tenant_id(), cat, r.policy_id, r.id, old_v.id, new_v.id, p_confirmation_source, p_confirmed_effective_at, p_insurer_reference);
  update policy_service_requests set status = 'confirmed', confirmed_effective_at = p_confirmed_effective_at,
    confirmation_source = p_confirmation_source, insurer_reference = p_insurer_reference, next_action = null, updated_at = now()
  where id = r.id;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id, note, idempotency_key, payload)
  values (app.tenant_id(), cat, r.id, 'confirmed', r.status, 'confirmed', auth.uid(), 'Endorsement confirmed from '||p_confirmation_source, p_idempotency_key,
    jsonb_build_object('version_id', new_v.id, 'source', p_confirmation_source));
  return jsonb_build_object('outcome','saved','summary','Confirmed endorsement; version '||new_v.version_no||' created', 'version_id', new_v.id);
end $$;

grant execute on function public.pc_create_endorsement(uuid,uuid,timestamptz,jsonb,uuid,text,text,text) to authenticated;
grant execute on function public.pc_create_renewal(uuid,uuid,timestamptz,jsonb,text,text,text) to authenticated;
grant execute on function public.pc_create_cancellation(uuid,uuid,timestamptz,text,text,text,text,text) to authenticated;
grant execute on function public.pc_confirm_endorsement(uuid,timestamptz,text,text,jsonb,text,text) to authenticated;
