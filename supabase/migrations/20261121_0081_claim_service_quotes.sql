-- Claim-linked repair quotes: FK/index, trades, gate, jobs-for-claim, claim detail jobs, demo seed.

-- ------------------------------------------------------------------ FK + index
alter table public.service_jobs
  drop constraint if exists service_jobs_claim_fk;
alter table public.service_jobs
  add constraint service_jobs_claim_fk
  foreign key (claim_id, data_category) references public.claims (id, data_category);

create index if not exists service_jobs_claim_idx
  on public.service_jobs (tenant_id, data_category, claim_id)
  where claim_id is not null;

-- ------------------------------------------------------------------ trades
create or replace function app.ensure_service_trade_types(p_tenant uuid, p_cat text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into service_trade_types (tenant_id, data_category, code, label)
  select p_tenant, p_cat, v.code, v.label
  from (values
    ('plumber', 'Plumber'),
    ('electrician', 'Electrician'),
    ('locksmith', 'Locksmith'),
    ('glazier', 'Glazier'),
    ('appliance_repair', 'Appliance repair'),
    ('motor_body', 'Motor body repair'),
    ('towing', 'Towing'),
    ('contents_restore', 'Contents restore / replace')
  ) as v(code, label)
  on conflict (tenant_id, data_category, code) do update set label = excluded.label, active = true;
end $$;

-- Seed for existing tenants/categories
do $$
declare r record;
begin
  for r in select distinct tenant_id, data_category from service_trade_types
  loop
    perform app.ensure_service_trade_types(r.tenant_id, r.data_category);
  end loop;
  for r in select distinct tenant_id, data_category from claims
  loop
    perform app.ensure_service_trade_types(r.tenant_id, r.data_category);
  end loop;
end $$;

-- ------------------------------------------------------------------ incident → trade codes
create or replace function app.claim_suggested_trade_codes(p_incident_type text)
returns text[]
language sql immutable as $$
  select case lower(coalesce(p_incident_type, ''))
    when 'motor_accident' then array['motor_body', 'towing']
    when 'vehicle_theft' then array['towing', 'motor_body', 'locksmith']
    when 'burglary' then array['locksmith', 'glazier', 'appliance_repair', 'contents_restore']
    when 'water_damage' then array['plumber', 'appliance_repair', 'contents_restore']
    when 'storm_hail' then array['glazier', 'plumber', 'contents_restore']
    else array[]::text[]
  end;
$$;
revoke all on function app.claim_suggested_trade_codes(text) from public, anon;

create or replace function public.claim_suggested_trades(
  p_incident_type text,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  codes text[] := app.claim_suggested_trade_codes(p_incident_type);
begin
  if not app.is_staff() and app.my_customer_id() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.ensure_service_trade_types(tid, cat);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'code', t.code, 'label', t.label, 'active', t.active
    ) order by array_position(codes, t.code))
    from service_trade_types t
    where t.tenant_id = tid and t.data_category = cat and t.active
      and t.code = any (codes)
  ), '[]'::jsonb);
end $$;
revoke all on function public.claim_suggested_trades(text, text) from public, anon;
grant execute on function public.claim_suggested_trades(text, text) to authenticated;

create or replace function app.claim_allows_service_quotes(p_claim claims)
returns boolean
language sql immutable as $$
  select p_claim.status = 'decision_received'
    and coalesce(p_claim.decision, '') in ('approved', 'partially_approved');
$$;

-- ------------------------------------------------------------------ service_job_create (gate on claim)
create or replace function public.service_job_create(
  p_category text default null,
  p_concierge_request_id uuid default null,
  p_claim_id uuid default null,
  p_trade_type_id uuid default null,
  p_work_description text default null,
  p_urgency text default 'standard',
  p_preferred_window jsonb default '{}'::jsonb,
  p_service_address text default null,
  p_authority_status text default 'pending',
  p_payment_responsibility text default 'unconfirmed',
  p_idempotency_key text default null,
  p_person_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  req concierge_requests%rowtype;
  clm claims%rowtype;
  jid uuid;
  existing uuid;
  addr text;
  person uuid;
  cust uuid;
  pol uuid;
  item uuid;
  parent_request uuid := p_concierge_request_id;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if parent_request is null and p_claim_id is null and p_person_id is null then
    raise exception 'parent_required' using errcode = 'P0001';
  end if;
  if p_trade_type_id is null or nullif(trim(coalesce(p_work_description,'')), '') is null then
    raise exception 'trade_and_description_required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null and parent_request is not null then
    select (e.payload->>'job_id')::uuid into existing
    from concierge_request_events e
    where e.request_id = parent_request and e.idempotency_key = p_idempotency_key
    limit 1;
    if existing is not null then
      return app.service_job_json(existing, 'broker');
    end if;
  end if;

  if parent_request is not null then
    select * into req from concierge_requests
    where id = parent_request and tenant_id = tid and data_category = cat;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    person := req.person_id;
    cust := req.customer_id;
    pol := req.policy_id;
    item := req.insured_item_id;
    addr := coalesce(nullif(trim(p_service_address), ''),
      (select coalesce(i.details->>'risk_address', i.display_label) from insured_items i where i.id = req.insured_item_id),
      'Address to confirm');
  end if;

  if p_claim_id is not null then
    select * into clm from claims where id = p_claim_id and tenant_id = tid and data_category = cat;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not app.claim_allows_service_quotes(clm) then
      raise exception 'claim_not_authorised_for_quotes'
        using errcode = 'P0001',
              hint = 'Insurer must accept the claim (decision_received + approved) before creating repair jobs.';
    end if;
    person := coalesce(person, clm.person_id);
    pol := coalesce(pol, clm.policy_id);
    select cp.customer_id into cust from customer_persons cp
    where cp.person_id = clm.person_id and cp.effective_to is null
    order by (cp.role = 'self') desc, cp.is_primary desc nulls last
    limit 1;
    if parent_request is null then
      select r.id into parent_request from concierge_requests r
      where r.person_id = clm.person_id and r.data_category = cat and r.tenant_id = tid
        and r.status not in ('completed','withdrawn')
      order by r.updated_at desc limit 1;
    end if;
    addr := coalesce(nullif(trim(p_service_address), ''), addr, 'Address to confirm');
  end if;

  if p_person_id is not null and person is null then
    person := p_person_id;
    if not exists (
      select 1 from persons pe where pe.id = person and pe.tenant_id = tid and pe.data_category = cat
    ) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    select cp.customer_id into cust from customer_persons cp
    where cp.person_id = person and cp.effective_to is null
    order by (cp.role = 'self') desc, cp.is_primary desc nulls last
    limit 1;
    addr := coalesce(nullif(trim(p_service_address), ''), 'Address to confirm');
  end if;

  if cust is null then raise exception 'customer_required' using errcode = 'P0001'; end if;
  if person is null then raise exception 'person_required' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(addr,'')), '') is null then
    raise exception 'service_address_required' using errcode = 'P0001';
  end if;

  insert into service_jobs (
    tenant_id, data_category, concierge_request_id, claim_id, policy_id, insured_item_id,
    person_id, customer_id, trade_type_id, work_description, urgency, preferred_window,
    service_address, status, authority_status, payment_responsibility,
    next_action, responsible_party, created_by
  ) values (
    tid, cat, parent_request, p_claim_id, pol, item,
    person, cust, p_trade_type_id, trim(p_work_description),
    coalesce(nullif(p_urgency,''), 'standard'), coalesce(p_preferred_window, '{}'::jsonb),
    trim(addr), 'seeking_provider',
    coalesce(nullif(p_authority_status,''), 'pending'),
    coalesce(nullif(p_payment_responsibility,''), 'unconfirmed'),
    'Allocate a provider', 'concierge', auth.uid()
  ) returning id into jid;

  if parent_request is not null then
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload, idempotency_key
    ) values (
      tid, cat, parent_request, 'service_job_created', auth.uid(),
      'Service job created: ' || trim(p_work_description),
      'broker', jsonb_build_object('job_id', jid, 'trade_type_id', p_trade_type_id),
      p_idempotency_key
    );
    update concierge_requests set
      status = case when status in ('completed','withdrawn') then status else 'with_concierge' end,
      next_action = 'Allocate provider',
      responsible_party = 'concierge',
      updated_at = now()
    where id = parent_request;
  end if;

  if p_claim_id is not null then
    insert into claim_events (
      tenant_id, data_category, claim_id, event_type, to_status, actor_user_id, note, visibility, idempotency_key
    ) values (
      tid, cat, p_claim_id, 'service_job_created', clm.status, auth.uid(),
      'Service job created for claim: ' || trim(p_work_description),
      'internal', p_idempotency_key
    );
  end if;

  return app.service_job_json(jid, 'broker');
end $$;

revoke all on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text) from public, anon;
revoke all on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text, uuid) from public, anon;
grant execute on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text, uuid) to authenticated;

-- ------------------------------------------------------------------ jobs for claim
create or replace function public.service_jobs_for_claim(
  p_claim_id uuid,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  clm claims%rowtype;
  viewer text := 'broker';
begin
  select * into clm from claims where id = p_claim_id and tenant_id = tid and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if app.is_staff() then
    if app.book_restricted() and not app.can_see_person(clm.person_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    viewer := 'broker';
  else
    if not exists (
      select 1 from customer_persons cp
      where cp.person_id = clm.person_id and cp.customer_id = app.my_customer_id()
        and cp.effective_to is null
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not app.claim_allows_service_quotes(clm) then
      return '[]'::jsonb;
    end if;
    viewer := 'customer';
  end if;

  return coalesce((
    select jsonb_agg(app.service_job_json(j.id, viewer) order by j.created_at)
    from service_jobs j
    where j.claim_id = clm.id and j.data_category = cat and j.tenant_id = tid
  ), '[]'::jsonb);
end $$;
revoke all on function public.service_jobs_for_claim(uuid, text) from public, anon;
grant execute on function public.service_jobs_for_claim(uuid, text) to authenticated;

-- ------------------------------------------------------------------ pc_claim_detail + service_jobs
create or replace function public.pc_claim_detail(p_claim_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare paid numeric;
declare recoveries numeric;
declare as_of_excess numeric;
declare sched_from timestamptz;
declare sched_to timestamptz;
declare jobs jsonb := '[]'::jsonb;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(sum(case when txn_type = 'payment' and status = 'confirmed' then amount
                           when txn_type = 'reversal' and status = 'confirmed' then -amount else 0 end), 0),
         coalesce(sum(case when txn_type = 'recovery' and status = 'confirmed' then amount else 0 end), 0)
    into paid, recoveries
  from claim_transactions where claim_id = c.id and data_category = cat;

  if c.policy_version_id is not null then
    select (terms->>'excess')::numeric, effective_at, superseded_at
      into as_of_excess, sched_from, sched_to
    from policy_versions where id = c.policy_version_id;
  end if;

  select coalesce((
    select jsonb_agg(app.service_job_json(j.id, 'broker') order by j.created_at)
    from service_jobs j
    where j.claim_id = c.id and j.data_category = cat and j.tenant_id = c.tenant_id
  ), '[]'::jsonb) into jobs;

  return jsonb_build_object(
    'id', c.id, 'reference', c.reference, 'client_number', (select client_number from persons where id = c.person_id),
    'customer_name', app.pc_person_name(c.person_id), 'person_id', c.person_id,
    'incident_type', c.incident_type, 'incident_at', c.incident_at, 'incident_time_unknown', c.incident_time_unknown,
    'description', c.description, 'status', c.status,
    'owner_name', (select full_name from sales_team_members where id = c.owner_member_id),
    'next_action', c.next_action, 'due_at', c.due_at, 'version_review_needed', c.version_review_needed,
    'version_review_reason', c.version_review_reason, 'policy_id', c.policy_id, 'policy_version_id', c.policy_version_id,
    'as_of_excess', as_of_excess,
    'schedule_effective_at', sched_from,
    'schedule_superseded_at', sched_to,
    'insurer_name', (select i.name from policies pol join insurers i on i.id = pol.provider_id where pol.id = c.policy_id),
    'insurer_reference', c.insurer_reference, 'submitted_at', c.submitted_at,
    'decision', c.decision, 'decision_source', c.decision_source, 'settlement_amount', c.settlement_amount,
    'approved_settlement', coalesce(c.settlement_amount, 0),
    'confirmed_payments', paid,
    'outstanding', greatest(coalesce(c.settlement_amount, 0) - paid, 0),
    'recoveries', recoveries,
    'quotes_unlocked', app.claim_allows_service_quotes(c),
    'suggested_trade_codes', to_jsonb(app.claim_suggested_trade_codes(c.incident_type)),
    'service_jobs', jobs,
    'affected_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'display_label', a.display_label, 'item_type', a.item_type, 'status', 'covered',
        'details', a.snapshot, 'section_code', a.section_code, 'policy_version_id', a.policy_version_id
      ))
      from claim_affected_items a where a.claim_id = c.id
    ), '[]'::jsonb),
    'settlement_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'txn_type', t.txn_type, 'payee', t.payee, 'amount', t.amount,
        'status', t.status, 'txn_date', t.txn_date, 'reference', t.reference
      ) order by t.txn_date, t.created_at)
      from claim_transactions t where t.claim_id = c.id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'label', e.label,
        'status', e.status,
        'media_asset_id', e.media_asset_id,
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', att.id,
            'media_asset_id', m.id,
            'file_name', m.file_name,
            'kind', m.kind,
            'bucket', m.bucket,
            'mime_type', m.mime_type,
            'storage_path', m.storage_path,
            'public_url', m.public_url,
            'url', coalesce(m.public_url, m.storage_path),
            'created_at', att.created_at
          ) order by att.created_at)
          from claim_evidence_attachments att
          join media_assets m on m.id = att.media_asset_id
          where att.requirement_id = e.id
        ), '[]'::jsonb)
      ) order by e.created_at)
      from claim_evidence_requirements e where e.claim_id = c.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'created_at', e.created_at, 'visibility', e.visibility
      ) order by e.created_at)
      from claim_events e where e.claim_id = c.id
    ), '[]'::jsonb)
  );
end $$;
grant execute on function public.pc_claim_detail(uuid, text) to authenticated;

notify pgrst, 'reload schema';
