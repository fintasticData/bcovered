-- InsureFlow AI / B-Covered: Russ "Generate leads". Apply after 20261115_0024_fais_communication_retention.sql.
-- A run is a jobs row (workflow_type 'lead_generation') holding the search filters and area findings once, as jsonb.
-- Each business is one lead_prospects row per brokerage and category (deduplicated on the published email); each time a
-- run finds it, lead_prospect_matches keeps that run's cover type, rationale and evidence. Every prospect also gets a
-- commercial prospect account and a lead per cover type, so it appears in the Leads grid.

begin;

-- ------------------------------------------------------------------ 1. Runs on jobs
alter table jobs add column if not exists data_category text check (data_category in ('sample','live'));
create index if not exists jobs_tenant_workflow_idx on jobs (tenant_id, workflow_type, created_at desc);

-- Brokerages still onboarding may run Sample jobs; jobs without a category keep the previous rule.
drop policy if exists operational_tenant on jobs;
create policy operational_tenant on jobs as restrictive for all to authenticated
  using ((select app.tenant_operational()) or (select app.is_platform_staff()) or data_category = 'sample');
drop policy if exists category_scope on jobs;
create policy category_scope on jobs as restrictive for all to authenticated
  using (data_category is null or data_category = (select app.active_category()))
  with check (data_category is null or data_category = (select app.active_category()));

-- ------------------------------------------------------------------ 2. Prospects and per-run matches
create table if not exists lead_prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  customer_id uuid references customers(id) on delete set null,
  business_name text not null check (length(trim(business_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalised text generated always as (lower(trim(email))) stored,
  website text,
  website_host text generated always as (lower(regexp_replace(coalesce(website, ''), '^(https?://)?(www\.)?([^/:?#]*).*$', '\3'))) stored,
  phone text, address text,
  area text not null,
  industry text, business_function text, category text,
  research jsonb not null default '{}',
  evidence jsonb not null default '[]',
  status text not null default 'active' check (status in ('active','archived','do_not_contact')),
  is_sample boolean not null default false,
  first_job_id uuid references jobs(id) on delete set null,
  last_job_id uuid references jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, data_category, email_normalised)
);
create index if not exists lead_prospects_area_idx on lead_prospects (tenant_id, data_category, area);
create index if not exists lead_prospects_industry_idx on lead_prospects (tenant_id, data_category, industry, business_function);
create index if not exists lead_prospects_host_idx on lead_prospects (tenant_id, data_category, website_host);
create index if not exists lead_prospects_customer_idx on lead_prospects (customer_id);
create index if not exists lead_prospects_first_job_idx on lead_prospects (first_job_id);
create index if not exists lead_prospects_last_job_idx on lead_prospects (last_job_id);

create table if not exists lead_prospect_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  job_id uuid not null references jobs(id) on delete cascade,
  prospect_id uuid not null references lead_prospects(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  cover_type text not null,
  cover_fit text not null,
  evidence jsonb not null default '{}',
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (job_id, prospect_id)
);
create index if not exists lead_prospect_matches_prospect_idx on lead_prospect_matches (prospect_id);
create index if not exists lead_prospect_matches_lead_idx on lead_prospect_matches (lead_id);
create index if not exists lead_prospect_matches_tenant_idx on lead_prospect_matches (tenant_id, data_category, cover_type);

alter table leads add column if not exists prospect_id uuid references lead_prospects(id) on delete set null;
alter table leads add column if not exists source_job_id uuid references jobs(id) on delete set null;
create unique index if not exists leads_prospect_cover_key on leads (prospect_id, product_category) where prospect_id is not null;
create index if not exists leads_source_job_idx on leads (source_job_id) where source_job_id is not null;

-- ------------------------------------------------------------------ 3. Row-level security (same shape as 0012 / 0019)
do $$ declare t text; begin
  foreach t in array array['lead_prospects','lead_prospect_matches'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy staff_tenant on %I for all to authenticated
      using (tenant_id = (select app.tenant_id()) and (select app.is_staff()))
      with check (tenant_id = (select app.tenant_id()) and (select app.is_staff()))$p$, t);
    execute format($p$create policy category_scope on %I as restrictive for all to authenticated
      using (data_category = (select app.active_category())) with check (data_category = (select app.active_category()))$p$, t);
    execute format($p$create policy operational_tenant on %I as restrictive for all to authenticated
      using ((select app.tenant_operational()) or (select app.is_platform_staff()) or data_category = 'sample')$p$, t);
    execute format($p$create policy writer_insert on %I as restrictive for insert to authenticated with check ((select app.can_write()))$p$, t);
    execute format($p$create policy writer_update on %I as restrictive for update to authenticated using ((select app.can_write()))$p$, t);
    execute format($p$create policy writer_delete on %I as restrictive for delete to authenticated using ((select app.can_write()))$p$, t);
  end loop;
end $$;

-- ------------------------------------------------------------------ 4. Functions used by the lead-research Edge Function
create or replace function public.leadgen_run_json(p_job_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', j.id, 'status', j.status, 'cancel_requested', j.cancel_requested, 'category', j.data_category,
    'inputs', j.inputs, 'outputs', coalesce(j.outputs, '{}'::jsonb),
    'locked_by', j.locked_by, 'locked_at', j.locked_at, 'attempt', j.attempt,
    'created_at', j.created_at, 'started_at', j.started_at, 'completed_at', j.completed_at,
    'open_path', '/broker/leads?run=' || j.id,
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', m.id, 'prospect_id', p.id, 'lead_id', m.lead_id, 'customer_id', p.customer_id,
        'business_name', p.business_name, 'email', p.email, 'website', p.website, 'phone', p.phone,
        'area', p.area, 'address', p.address, 'industry', p.industry, 'business_function', p.business_function,
        'category', p.category, 'cover_type', m.cover_type, 'cover_fit', m.cover_fit, 'evidence', m.evidence,
        'retrieved_at', m.retrieved_at, 'is_sample', p.is_sample, 'prospect_status', p.status,
        'open_path', case when m.lead_id is null then null else '/broker/leads/' || m.lead_id end) order by m.created_at)
      from lead_prospect_matches m join lead_prospects p on p.id = m.prospect_id
      where m.job_id = j.id), '[]'::jsonb))
  from jobs j where j.id = p_job_id and j.workflow_type = 'lead_generation'
$$;

create or replace function public.leadgen_get_run(p_category text, p_job_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare r jsonb;
begin
  perform sales_guard(p_category, false);
  r := leadgen_run_json(p_job_id);
  if r is null then raise exception using message = 'not_found', detail = 'That lead search is not available in this category.'; end if;
  return r;
end $$;

create or replace function public.leadgen_list_runs(p_category text, p_limit int default 25) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  perform sales_guard(p_category, false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', j.id, 'status', j.status, 'created_at', j.created_at, 'completed_at', j.completed_at,
      'filters', j.inputs -> 'filters', 'progress', j.outputs -> 'progress', 'stop_reason', j.outputs ->> 'stop_reason',
      'summary', j.outputs ->> 'summary', 'area_findings', coalesce(j.outputs -> 'area_findings', '[]'::jsonb)) order by j.created_at desc)
    from (select * from jobs where workflow_type = 'lead_generation' and data_category = p_category
          order by created_at desc limit greatest(1, least(coalesce(p_limit, 25), 100))) j), '[]'::jsonb);
end $$;

create or replace function public.leadgen_create_run(p_category text, p_prompt text, p_filters jsonb, p_budget jsonb, p_idempotency_key text)
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); j jobs; v_user uuid := (select id from app_users where id = auth.uid());
begin
  if coalesce(trim(p_filters ->> 'area'), '') = '' then
    raise exception using message = 'needs_input', detail = 'Which area should Russ search?';
  end if;
  if coalesce(length(p_idempotency_key), 0) < 8 then
    raise exception using message = 'validation', detail = 'An idempotency key of at least 8 characters is required.';
  end if;
  insert into jobs (tenant_id, workflow_type, agent, status, initiated_by, inputs, outputs, idempotency_key, data_category)
  values (t, 'lead_generation', 'russ', 'queued', v_user,
    jsonb_build_object('prompt', p_prompt, 'filters', p_filters, 'budget', coalesce(p_budget, '{}'::jsonb)),
    jsonb_build_object('phase', 'area', 'area_findings', '[]'::jsonb, 'localities', '[]'::jsonb, 'candidates', '[]'::jsonb,
      'seen_hosts', '[]'::jsonb, 'rejected', '[]'::jsonb, 'stop_reason', null, 'summary', null,
      'progress', jsonb_build_object('found', 0, 'requested', coalesce((p_filters ->> 'requested_count')::int, 20),
        'searches_used', 0, 'pages_fetched', 0, 'candidates_checked', 0, 'cost_usd', 0, 'elapsed_ms', 0, 'step', 'Queued')),
    p_idempotency_key, p_category)
  on conflict (tenant_id, idempotency_key) do nothing
  returning * into j;
  if j.id is null then
    select * into j from jobs where tenant_id = t and idempotency_key = p_idempotency_key;
    return leadgen_run_json(j.id);
  end if;
  insert into job_steps (tenant_id, job_id, seq, key, agent, name, status) values
    (t, j.id, 1, 'area_research', 'russ', 'Research the area and cover opportunity', 'pending'),
    (t, j.id, 2, 'find_businesses', 'russ', 'Find businesses with published emails', 'pending'),
    (t, j.id, 3, 'finalise', 'russ', 'Summarise the run', 'pending');
  insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id, after, job_id, data_category, copilot)
  values (t, 'agent', 'russ', 'lead_generation.started', 'jobs', j.id, p_filters, j.id, p_category, 'russ');
  return leadgen_run_json(j.id);
end $$;

-- Takes a short lease so two tabs or retries never work the same run at once.
create or replace function public.leadgen_claim(p_category text, p_job_id uuid, p_worker text, p_lease_seconds int default 90)
returns jsonb language plpgsql set search_path = public as $$
declare j jobs;
begin
  perform sales_guard(p_category, true);
  update jobs set locked_by = p_worker, locked_at = now(), attempt = attempt + 1, updated_at = now(),
    status = case when status in ('queued','paused') then 'running' else status end,
    started_at = coalesce(started_at, now())
  where id = p_job_id and workflow_type = 'lead_generation' and status in ('queued','running','paused')
    and (locked_at is null or locked_by = p_worker or locked_at < now() - make_interval(secs => greatest(p_lease_seconds, 30)))
  returning * into j;
  return jsonb_build_object('claimed', j.id is not null, 'run', leadgen_run_json(p_job_id));
end $$;

create or replace function public.leadgen_update_run(p_category text, p_job_id uuid, p_worker text, p_outputs jsonb,
  p_status text default null, p_step_key text default null, p_step_status text default null)
returns jsonb language plpgsql set search_path = public as $$
declare j jobs; v_done boolean := p_status in ('completed','failed','cancelled','paused');
begin
  perform sales_guard(p_category, true);
  if p_status is not null and p_status not in ('running','paused','completed','failed','cancelled') then
    raise exception using message = 'validation', detail = 'Unknown run status.';
  end if;
  update jobs set
    outputs = coalesce(outputs, '{}'::jsonb) || coalesce(p_outputs, '{}'::jsonb),
    status = coalesce(p_status, status),
    completed_at = case when p_status in ('completed','failed','cancelled') then now() else completed_at end,
    locked_by = case when v_done then null else locked_by end,
    locked_at = case when v_done then null else now() end,
    updated_at = now()
  where id = p_job_id and workflow_type = 'lead_generation' and (locked_by is null or locked_by = p_worker)
  returning * into j;
  if j.id is null then
    raise exception using message = 'conflict', detail = 'Another session is working on this lead search.';
  end if;
  if p_step_key is not null and p_step_status is not null then
    update job_steps set status = p_step_status,
      started_at = coalesce(started_at, now()),
      completed_at = case when p_step_status in ('completed','failed','skipped','cancelled') then now() else null end
    where job_id = p_job_id and key = p_step_key;
  end if;
  if p_status in ('completed','failed','cancelled') then
    update job_steps set status = case when p_status = 'completed' then 'completed' else 'cancelled' end, completed_at = now()
    where job_id = p_job_id and status in ('pending','running');
    insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id, after, job_id, data_category, copilot)
    values (j.tenant_id, 'agent', 'russ', 'lead_generation.' || p_status, 'jobs', j.id, j.outputs -> 'progress', j.id, p_category, 'russ');
  end if;
  return leadgen_run_json(j.id);
end $$;

create or replace function public.leadgen_cancel_run(p_category text, p_job_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare j jobs;
begin
  perform sales_guard(p_category, true);
  update jobs set cancel_requested = true, updated_at = now() where id = p_job_id and workflow_type = 'lead_generation' returning * into j;
  if j.id is null then raise exception using message = 'not_found', detail = 'That lead search is not available in this category.'; end if;
  -- Nobody is working on it (no lease, or a stale one): finish it now; otherwise the worker stops at its next check.
  if j.status in ('queued','paused') or (j.status = 'running' and (j.locked_at is null or j.locked_at < now() - interval '90 seconds')) then
    update jobs set status = 'cancelled', completed_at = now(), locked_by = null, locked_at = null,
      outputs = coalesce(outputs, '{}'::jsonb) || jsonb_build_object('stop_reason', 'cancelled')
    where id = j.id;
    update job_steps set status = 'cancelled', completed_at = now() where job_id = j.id and status in ('pending','running');
  end if;
  return leadgen_run_json(j.id);
end $$;

-- Saves one verified business: prospect (deduplicated on email), prospect account, lead per cover type, and this run's
-- match. Safe to repeat: a replay returns the same ids.
create or replace function public.leadgen_save_lead(p_category text, p_job_id uuid, p_lead jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  t uuid := sales_guard(p_category, true);
  j jobs; p lead_prospects; c customers; l leads; m lead_prospect_matches;
  v_email text := lower(trim(coalesce(p_lead ->> 'email', '')));
  v_cover text;
  v_sample boolean := coalesce((p_lead ->> 'is_sample')::boolean, false);
  v_evidence jsonb := jsonb_build_object(
    'email_source_url', p_lead ->> 'email_source_url', 'location_source_url', p_lead ->> 'location_source_url',
    'activity_source_url', p_lead ->> 'activity_source_url', 'retrieved_at', p_lead ->> 'retrieved_at',
    'activity_quote', p_lead ->> 'activity_quote', 'location_basis', p_lead ->> 'location_basis', 'job_id', p_job_id);
  was_new boolean := false;
begin
  select * into j from jobs where id = p_job_id and workflow_type = 'lead_generation';
  if j.id is null then raise exception using message = 'not_found', detail = 'That lead search is not available in this category.'; end if;
  v_cover := coalesce(nullif(trim(j.inputs -> 'filters' ->> 'cover_type'), ''), 'Commercial property');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception using message = 'validation', detail = 'A published email is required.'; end if;
  if coalesce(trim(p_lead ->> 'business_name'), '') = '' or coalesce(trim(p_lead ->> 'area'), '') = '' then
    raise exception using message = 'validation', detail = 'Business name and area are required.';
  end if;
  if coalesce(p_lead ->> 'email_source_url', '') !~ '^https?://' then
    raise exception using message = 'validation', detail = 'The page showing the email is required.';
  end if;

  insert into lead_prospects (tenant_id, data_category, business_name, email, website, phone, address, area, industry,
    business_function, category, research, evidence, is_sample, first_job_id, last_job_id)
  values (t, p_category, trim(p_lead ->> 'business_name'), v_email, p_lead ->> 'website', p_lead ->> 'phone', p_lead ->> 'address',
    trim(p_lead ->> 'area'), p_lead ->> 'industry', p_lead ->> 'business_function', p_lead ->> 'category',
    coalesce(p_lead -> 'research', '{}'::jsonb), jsonb_build_array(v_evidence), v_sample, p_job_id, p_job_id)
  on conflict (tenant_id, data_category, email_normalised) do nothing
  returning * into p;
  if p.id is not null then
    was_new := true;
  else
    update lead_prospects x set
      last_job_id = p_job_id,
      research = x.research || coalesce(p_lead -> 'research', '{}'::jsonb),
      evidence = case when x.evidence @> jsonb_build_array(jsonb_build_object('job_id', p_job_id)) then x.evidence else x.evidence || jsonb_build_array(v_evidence) end,
      address = coalesce(x.address, p_lead ->> 'address'), website = coalesce(x.website, p_lead ->> 'website'),
      phone = coalesce(x.phone, p_lead ->> 'phone'), industry = coalesce(x.industry, p_lead ->> 'industry'),
      business_function = coalesce(x.business_function, p_lead ->> 'business_function'), category = coalesce(x.category, p_lead ->> 'category'),
      updated_at = now()
    where x.tenant_id = t and x.data_category = p_category and x.email_normalised = v_email
    returning * into p;
  end if;

  if p.customer_id is null then
    insert into customers (tenant_id, customer_type, full_name, email, phone, region, status, is_synthetic, created_by, data_origin,
      data_category, source_system, source_ref)
    values (t, 'commercial', p.business_name, p.email, p.phone, p.area, 'prospect', v_sample, auth.uid(),
      case p_category when 'sample' then 'demo' else 'live' end, p_category, 'russ_research', p.id::text)
    returning * into c;
    update lead_prospects set customer_id = c.id where id = p.id;
    p.customer_id := c.id;
  end if;

  insert into leads (tenant_id, customer_id, line, product_category, status, urgency, qualification, missing_info, source,
    created_by, data_category, prospect_id, source_job_id)
  values (t, p.customer_id, 'commercial', v_cover, 'new', null,
    jsonb_build_object('summary', p_lead ->> 'cover_fit', 'prospect_id', p.id, 'job_id', p_job_id, 'area', p.area,
      'industry', p.industry, 'business_function', p.business_function, 'email', p.email),
    '["Contact person","Assets and sums insured","Current insurance"]'::jsonb, 'russ_research', auth.uid(), p_category, p.id, p_job_id)
  on conflict (prospect_id, product_category) where prospect_id is not null do nothing
  returning * into l;
  if l.id is null then select * into l from leads where prospect_id = p.id and product_category = v_cover; end if;

  insert into lead_prospect_matches (tenant_id, data_category, job_id, prospect_id, lead_id, cover_type, cover_fit, evidence, retrieved_at)
  values (t, p_category, p_job_id, p.id, l.id, v_cover, coalesce(nullif(trim(p_lead ->> 'cover_fit'), ''), 'Matched the search filters'),
    v_evidence || jsonb_build_object('research', coalesce(p_lead -> 'research', '{}'::jsonb)),
    coalesce((p_lead ->> 'retrieved_at')::timestamptz, now()))
  on conflict (job_id, prospect_id) do nothing
  returning * into m;

  return jsonb_build_object('prospect_id', p.id, 'lead_id', l.id, 'customer_id', p.customer_id,
    'was_new', was_new, 'match_saved', m.id is not null);
end $$;

commit;
