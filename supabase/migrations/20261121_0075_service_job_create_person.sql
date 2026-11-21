-- Allow creating a service job from a customer (person) without an existing concierge request or claim.
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

  return app.service_job_json(jid, 'broker');
end $$;

revoke all on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text) from public, anon;
revoke all on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text, uuid) from public, anon;
grant execute on function public.service_job_create(text, uuid, uuid, uuid, text, text, jsonb, text, text, text, text, uuid) to authenticated;
notify pgrst, 'reload schema';
