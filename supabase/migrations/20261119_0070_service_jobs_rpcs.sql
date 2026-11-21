-- Service job create / allocate / lifecycle + concierge_request_get.service_jobs
-- Applied via MCP as service_jobs_rpcs on bcovered.

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
  p_idempotency_key text default null
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
  if parent_request is null and p_claim_id is null then
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

  if cust is null then raise exception 'customer_required' using errcode = 'P0001'; end if;
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

  return app.service_job_json(jid, 'broker');
end $$;
revoke all on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text) from public, anon;
grant execute on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text) to authenticated;

create or replace function public.service_job_allocate(
  p_category text default null,
  p_job_id uuid default null,
  p_provider_id uuid default null,
  p_quoted_callout_fee_zar numeric default null,
  p_share_phone boolean default true,
  p_share_email boolean default true,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  j service_jobs%rowtype;
  p service_providers%rowtype;
  attempt int;
  aid uuid;
  existing uuid;
  shared jsonb;
  trade_label text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from service_jobs where id = p_job_id and tenant_id = tid and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from service_providers where id = p_provider_id and tenant_id = tid and data_category = cat and active;
  if not found then raise exception 'provider_not_found' using errcode = 'P0002'; end if;

  if p_idempotency_key is not null and j.concierge_request_id is not null then
    select (e.payload->>'allocation_id')::uuid into existing
    from concierge_request_events e
    where e.request_id = j.concierge_request_id and e.idempotency_key = p_idempotency_key
    limit 1;
    if existing is not null then
      return app.service_job_json(j.id, 'broker');
    end if;
  end if;

  -- prevent duplicate active allocation of same provider while current is open
  if exists (
    select 1 from service_job_allocations a
    where a.job_id = j.id and a.is_current and a.provider_id = p.id
      and a.status in ('proposed','notified','accepted')
  ) then
    return app.service_job_json(j.id, 'broker');
  end if;

  update service_job_allocations set is_current = false, status = case
    when status in ('proposed','notified') then 'superseded' else status end
  where job_id = j.id and is_current;

  select coalesce(max(attempt_no), 0) + 1 into attempt from service_job_allocations where job_id = j.id;
  shared := jsonb_build_object();
  if p_share_phone then shared := shared || jsonb_build_object('phone', true); end if;
  if p_share_email then shared := shared || jsonb_build_object('email', true); end if;

  insert into service_job_allocations (
    tenant_id, data_category, job_id, provider_id, attempt_no, is_current, status,
    shared_customer_fields, quoted_callout_fee_zar, created_by
  ) values (
    tid, cat, j.id, p.id, attempt, true, 'proposed',
    shared, coalesce(p_quoted_callout_fee_zar, p.standard_callout_fee_zar), auth.uid()
  ) returning id into aid;

  select label into trade_label from service_trade_types where id = j.trade_type_id;

  update service_jobs set
    status = 'awaiting_acceptance',
    quoted_callout_fee_zar = coalesce(p_quoted_callout_fee_zar, p.standard_callout_fee_zar),
    next_action = 'Record provider response',
    responsible_party = 'concierge',
    updated_at = now()
  where id = j.id;

  if j.concierge_request_id is not null then
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload, idempotency_key
    ) values (
      tid, cat, j.concierge_request_id, 'provider_allocated', auth.uid(),
      'Provider allocated: ' || p.trading_name || ' (' || coalesce(trade_label, 'trade') || ')',
      'broker',
      jsonb_build_object('job_id', j.id, 'allocation_id', aid, 'provider_id', p.id),
      p_idempotency_key
    );
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload
    ) values (
      tid, cat, j.concierge_request_id, 'provider_arranging', auth.uid(),
      split_part((select full_name from sales_team_members where id = (
        select owner_member_id from concierge_requests where id = j.concierge_request_id
      )), ' ', 1) || ' is arranging a ' || lower(coalesce(trade_label, 'specialist')),
      'customer',
      jsonb_build_object('job_id', j.id, 'trade_label', trade_label)
    );
    update concierge_requests set next_action = 'Await provider acceptance', updated_at = now()
    where id = j.concierge_request_id;
  end if;

  return app.service_job_json(j.id, 'broker');
end $$;
revoke all on function public.service_job_allocate(text, uuid, uuid, numeric, boolean, boolean, text) from public, anon;
grant execute on function public.service_job_allocate(text, uuid, uuid, numeric, boolean, boolean, text) to authenticated;

create or replace function public.service_job_record_response(
  p_category text default null,
  p_job_id uuid default null,
  p_response text default null,
  p_channel text default 'phone',
  p_decline_reason text default null,
  p_mark_notified boolean default false,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  j service_jobs%rowtype;
  a service_job_allocations%rowtype;
  resp text := lower(trim(coalesce(p_response, '')));
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from service_jobs where id = p_job_id and tenant_id = tid and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into a from service_job_allocations where job_id = j.id and is_current;
  if not found then raise exception 'no_current_allocation' using errcode = 'P0001'; end if;

  if p_mark_notified or resp = 'notified' then
    update service_job_allocations set
      status = case when status = 'proposed' then 'notified' else status end,
      provider_notified_at = coalesce(provider_notified_at, now())
    where id = a.id;
  end if;

  if resp = 'accepted' then
    update service_job_allocations set
      status = 'accepted',
      acceptance_channel = coalesce(nullif(p_channel,''), 'phone'),
      accepted_at = now(),
      provider_notified_at = coalesce(provider_notified_at, case when p_mark_notified then now() else provider_notified_at end)
    where id = a.id;
    update service_jobs set
      status = 'awaiting_acceptance',
      next_action = 'Schedule visit',
      responsible_party = 'concierge',
      updated_at = now()
    where id = j.id;
    if j.concierge_request_id is not null then
      insert into concierge_request_events (
        tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload, idempotency_key
      ) values (
        tid, cat, j.concierge_request_id, 'provider_accepted', auth.uid(),
        'Provider accepted the job', 'broker',
        jsonb_build_object('job_id', j.id, 'allocation_id', a.id, 'channel', p_channel),
        p_idempotency_key
      );
    end if;
  elsif resp = 'declined' then
    update service_job_allocations set
      status = 'declined', is_current = false,
      declined_at = now(), decline_reason = p_decline_reason
    where id = a.id;
    update service_jobs set
      status = 'seeking_provider',
      next_action = 'Reassign provider',
      responsible_party = 'concierge',
      updated_at = now()
    where id = j.id;
    if j.concierge_request_id is not null then
      insert into concierge_request_events (
        tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload, idempotency_key
      ) values (
        tid, cat, j.concierge_request_id, 'provider_declined', auth.uid(),
        'Provider declined' || case when p_decline_reason is not null then ': ' || p_decline_reason else '' end,
        'broker',
        jsonb_build_object('job_id', j.id, 'allocation_id', a.id),
        p_idempotency_key
      );
      insert into concierge_request_events (
        tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload
      ) values (
        tid, cat, j.concierge_request_id, 'provider_rearranging', auth.uid(),
        'Your concierge is arranging another specialist',
        'customer', jsonb_build_object('job_id', j.id)
      );
    end if;
  elsif resp not in ('notified', 'accepted', 'declined') then
    raise exception 'invalid_response' using errcode = 'P0001';
  end if;

  return app.service_job_json(j.id, 'broker');
end $$;
revoke all on function public.service_job_record_response(text, uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.service_job_record_response(text, uuid, text, text, text, boolean, text) to authenticated;

create or replace function public.service_job_schedule(
  p_category text default null,
  p_job_id uuid default null,
  p_appointment_at timestamptz default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  j service_jobs%rowtype;
  a service_job_allocations%rowtype;
  p service_providers%rowtype;
  trade_label text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_appointment_at is null then raise exception 'appointment_required' using errcode = 'P0001'; end if;
  select * into j from service_jobs where id = p_job_id and tenant_id = tid and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into a from service_job_allocations where job_id = j.id and is_current;
  if not found or a.status not in ('accepted','notified','proposed') then
    raise exception 'accept_before_schedule' using errcode = 'P0001';
  end if;
  select * into p from service_providers where id = a.provider_id;
  select label into trade_label from service_trade_types where id = j.trade_type_id;

  if a.status <> 'accepted' then
    update service_job_allocations set status = 'accepted', accepted_at = coalesce(accepted_at, now()),
      acceptance_channel = coalesce(acceptance_channel, 'phone')
    where id = a.id;
  end if;

  update service_jobs set
    appointment_at = p_appointment_at,
    status = 'scheduled',
    next_action = 'Visit in progress',
    responsible_party = 'provider',
    updated_at = now()
  where id = j.id;

  if j.concierge_request_id is not null then
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload, idempotency_key
    ) values (
      tid, cat, j.concierge_request_id, 'visit_scheduled', auth.uid(),
      'Visit scheduled with ' || p.trading_name || ' for ' || to_char(p_appointment_at at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI'),
      'broker',
      jsonb_build_object('job_id', j.id, 'appointment_at', p_appointment_at),
      p_idempotency_key
    );
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload
    ) values (
      tid, cat, j.concierge_request_id, 'visit_scheduled_customer', auth.uid(),
      coalesce(trade_label, 'Specialist') || ' visit booked with ' || p.trading_name ||
        ' on ' || to_char(p_appointment_at at time zone 'Africa/Johannesburg', 'Dy DD Mon at HH24:MI'),
      'customer',
      jsonb_build_object('job_id', j.id, 'appointment_at', p_appointment_at, 'provider_name', p.trading_name)
    );
  end if;

  return app.service_job_json(j.id, 'broker');
end $$;
revoke all on function public.service_job_schedule(text, uuid, timestamptz, text) from public, anon;
grant execute on function public.service_job_schedule(text, uuid, timestamptz, text) to authenticated;

create or replace function public.service_job_set_status(
  p_category text default null,
  p_job_id uuid default null,
  p_status text default null,
  p_outcome_summary text default null,
  p_agreed_amount_zar numeric default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  j service_jobs%rowtype;
  st text := lower(trim(coalesce(p_status, '')));
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if st not in ('in_progress','completed','cancelled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select * into j from service_jobs where id = p_job_id and tenant_id = tid and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  update service_jobs set
    status = st,
    completed_at = case when st = 'completed' then now() else completed_at end,
    agreed_amount_zar = coalesce(p_agreed_amount_zar, agreed_amount_zar),
    outcome = case when p_outcome_summary is not null
      then outcome || jsonb_build_object('summary', p_outcome_summary) else outcome end,
    next_action = case
      when st = 'in_progress' then 'Complete the visit'
      when st = 'completed' then 'Job completed'
      when st = 'cancelled' then 'Job cancelled'
      else next_action end,
    responsible_party = case when st in ('completed','cancelled') then 'concierge' else 'provider' end,
    updated_at = now()
  where id = j.id;

  if st = 'cancelled' then
    update service_job_allocations set status = 'cancelled', is_current = false
    where job_id = j.id and is_current;
  end if;

  if j.concierge_request_id is not null then
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload, idempotency_key
    ) values (
      tid, cat, j.concierge_request_id, 'service_job_' || st, auth.uid(),
      coalesce(p_outcome_summary, 'Service job marked ' || st),
      case when st = 'completed' then 'customer' else 'broker' end,
      jsonb_build_object('job_id', j.id, 'status', st),
      p_idempotency_key
    );
  end if;

  return app.service_job_json(j.id, 'broker');
end $$;
revoke all on function public.service_job_set_status(text, uuid, text, text, numeric, text) from public, anon;
grant execute on function public.service_job_set_status(text, uuid, text, text, numeric, text) to authenticated;

create or replace function public.service_job_reassign(
  p_category text default null,
  p_job_id uuid default null,
  p_provider_id uuid default null,
  p_quoted_callout_fee_zar numeric default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  j service_jobs%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from service_jobs where id = p_job_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  update service_job_allocations set
    is_current = false,
    status = case when status in ('proposed','notified','accepted') then 'superseded' else status end
  where job_id = j.id and is_current;

  update service_jobs set status = 'seeking_provider', appointment_at = null, updated_at = now()
  where id = j.id;

  return public.service_job_allocate(
    p_category, p_job_id, p_provider_id, p_quoted_callout_fee_zar, true, true, p_idempotency_key
  );
end $$;
revoke all on function public.service_job_reassign(text, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.service_job_reassign(text, uuid, uuid, numeric, text) to authenticated;

-- Extend concierge_request_get with service_jobs
create or replace function public.concierge_request_get(p_category text default null, p_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  r concierge_requests%rowtype;
  vis text;
  is_partner boolean := app.is_concierge_partner();
  is_staff boolean := app.is_staff();
  is_cust boolean := app.my_customer_id() is not null;
  viewer_key text;
begin
  select * into r from concierge_requests where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if is_staff then
    if r.tenant_id is distinct from app.tenant_id() or r.data_category is distinct from cat then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    vis := 'broker';
  elsif is_partner then
    if r.partner_team_id is distinct from app.my_partner_team_id() then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    vis := 'insurer';
  elsif is_cust and r.customer_id = app.my_customer_id() then
    vis := 'customer';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  viewer_key := case when vis = 'broker' then 'broker' else 'customer' end;

  return jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'title', r.title, 'request_kind', r.request_kind,
    'status', r.status, 'next_action', r.next_action, 'responsible_party', r.responsible_party,
    'person_id', r.person_id, 'customer_id', r.customer_id,
    'customer_name', (select full_name from customers where id = r.customer_id),
    'insured_item_id', r.insured_item_id,
    'item_label', (select display_label from insured_items where id = r.insured_item_id),
    'item_address', (select i.details->>'risk_address' from insured_items i where i.id = r.insured_item_id),
    'policy_id', r.policy_id, 'quote_id', r.quote_id,
    'owner_member_id', r.owner_member_id,
    'owner_name', (select full_name from sales_team_members where id = r.owner_member_id),
    'servicing_insurer_id', r.servicing_insurer_id,
    'servicing_insurer_name', (select name from insurers where id = r.servicing_insurer_id),
    'partner_team_id', r.partner_team_id,
    'partner_team_name', (select name from concierge_partner_teams where id = r.partner_team_id),
    'follow_up_at', r.follow_up_at, 'outcome', r.outcome, 'details', r.details,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'viewer', vis,
    'concierge_name', (select m.full_name from sales_team_members m where m.id = r.owner_member_id),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status, 'to_status', e.to_status,
        'body', e.body, 'visibility', e.visibility, 'payload', e.payload, 'created_at', e.created_at,
        'author', (select full_name from app_users where id = e.actor_user_id)
      ) order by e.created_at)
      from concierge_request_events e
      where e.request_id = r.id
        and ((vis = 'broker') or (vis = 'customer' and e.visibility = 'customer')
          or (vis = 'insurer' and e.visibility in ('customer','insurer')))
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'label', m.file_name, 'url', m.public_url, 'kind', m.kind, 'created_at', m.created_at
      ) order by m.created_at)
      from media_assets m where m.owner_table = 'concierge_requests' and m.owner_id = r.id
    ), '[]'::jsonb),
    'pilot_partners', case when is_staff then coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', t.id, 'name', t.name, 'insurer_id', t.insurer_id, 'insurer_name', i.name
      ) order by t.name)
      from concierge_partner_teams t join insurers i on i.id = t.insurer_id
      where t.tenant_id = r.tenant_id and t.is_pilot
    ), '[]'::jsonb) else '[]'::jsonb end,
    'service_jobs', coalesce((
      select jsonb_agg(app.service_job_json(sj.id, viewer_key) order by sj.created_at)
      from service_jobs sj where sj.concierge_request_id = r.id
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.concierge_request_get(text, uuid) from public, anon;
grant execute on function public.concierge_request_get(text, uuid) to authenticated;

notify pgrst, 'reload schema';
