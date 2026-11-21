-- Concierge in-app chat → FAIS client_interactions (append-only live).
-- Opens/reuses a standing chat thread per customer; mirrors customer-visible messages.

-- ------------------------------------------------------------------ 1. Kind: in_app_chat
alter table client_interactions drop constraint if exists client_interactions_kind_check;
alter table client_interactions add constraint client_interactions_kind_check
  check (kind in (
    'note', 'call', 'meeting', 'email', 'callback_request', 'whatsapp', 'in_app_chat'
  ));

-- ------------------------------------------------------------------ 2. Mirror helper
create or replace function app.concierge_mirror_fais(
  p_request concierge_requests,
  p_body text,
  p_direction text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  body text := nullif(trim(p_body), '');
  fais_key text;
  existing uuid;
  i_id uuid;
  dir text := case
    when p_direction in ('inbound', 'outbound', 'internal') then p_direction
    else 'inbound'
  end;
  evt text;
begin
  if body is null then return null; end if;
  if p_request.person_id is null then return null; end if;

  fais_key := case
    when p_idempotency_key is null then null
    else 'fais:cg:' || p_idempotency_key
  end;

  if fais_key is not null then
    select id into existing
      from client_interactions
     where tenant_id = p_request.tenant_id
       and idempotency_key = fais_key
     limit 1;
    if existing is not null then return existing; end if;
  end if;

  evt := case
    when dir = 'inbound' then 'reply'
    when dir = 'outbound' then 'message_sent'
    else 'logged'
  end;

  insert into client_interactions (
    tenant_id, data_category, kind, body,
    person_id, customer_id,
    subject_table, subject_id,
    direction, event, occurred_at, created_by, idempotency_key
  ) values (
    p_request.tenant_id, p_request.data_category, 'in_app_chat', body,
    p_request.person_id, p_request.customer_id,
    'concierge_requests', p_request.id,
    dir, evt, now(), auth.uid(), fais_key
  )
  returning id into i_id;

  return i_id;
end $$;

revoke all on function app.concierge_mirror_fais(concierge_requests, text, text, text) from public, anon;

-- ------------------------------------------------------------------ 3. Message RPC: mirror customer-visible bodies
create or replace function public.concierge_request_message(
  p_category text default null,
  p_request_id uuid default null,
  p_body text default null,
  p_visibility text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r concierge_requests%rowtype;
  cat text;
  vis text := coalesce(nullif(p_visibility, ''), 'customer');
  dir text;
begin
  select * into r from concierge_requests where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  cat := coalesce(nullif(p_category, ''), r.data_category);

  if app.is_staff() then
    if r.tenant_id is distinct from app.tenant_id() then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif r.customer_id = app.my_customer_id() then
    vis := 'customer';
  elsif app.is_concierge_partner() and r.partner_team_id = app.my_partner_team_id() then
    vis := 'insurer';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then
    return public.concierge_request_get(cat, r.id) || jsonb_build_object('outcome', 'replayed');
  end if;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, idempotency_key
  ) values (
    r.tenant_id, cat, r.id, 'message', auth.uid(), nullif(trim(p_body), ''), vis, p_idempotency_key
  );

  if vis = 'customer' and nullif(trim(p_body), '') is not null then
    dir := case
      when app.my_customer_id() = r.customer_id then 'inbound'
      else 'outbound'
    end;
    perform app.concierge_mirror_fais(r, p_body, dir, p_idempotency_key);
  end if;

  if app.my_customer_id() = r.customer_id then
    update concierge_requests set
      status = 'with_concierge',
      responsible_party = 'concierge',
      next_action = coalesce(
        (select 'With ' || full_name from sales_team_members where id = r.owner_member_id),
        'With your concierge'
      ),
      updated_at = now()
    where id = r.id;
  elsif app.is_staff() then
    update concierge_requests set updated_at = now() where id = r.id;
  end if;

  return public.concierge_request_get(cat, r.id) || jsonb_build_object('outcome', 'ok');
end $$;

revoke all on function public.concierge_request_message(text, uuid, text, text, text) from public, anon;
grant execute on function public.concierge_request_message(text, uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------------ 4. Create: mirror opening customer message
create or replace function public.concierge_request_create(
  p_category text default null,
  p_request_kind text default null,
  p_title text default null,
  p_insured_item_id uuid default null,
  p_message text default null,
  p_details jsonb default null,
  p_idempotency_key text default null,
  p_new_item_label text default null,
  p_new_item_type text default null,
  p_declared_value numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  pid uuid;
  prof customer_concierge_profiles%rowtype;
  item_id uuid := p_insured_item_id;
  rid uuid;
  ref text;
  existing uuid;
  kind text := coalesce(nullif(p_request_kind, ''), 'assist');
  title text := nullif(trim(p_title), '');
  r concierge_requests%rowtype;
  msg text := nullif(trim(p_message), '');
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into pid from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc, cp.created_at limit 1;

  if p_idempotency_key is not null then
    select request_id into existing from concierge_request_events
     where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      return public.concierge_request_get(cat, existing) || jsonb_build_object('outcome', 'replayed');
    end if;
  end if;

  if kind = 'add_item' and item_id is null then
    if nullif(trim(p_new_item_label), '') is null then
      raise exception 'display_label required' using errcode = '22023';
    end if;
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (
      t, cat, pid, coalesce(nullif(p_new_item_type, ''), 'equipment'), 'awaiting_cover',
      trim(p_new_item_label),
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
        'source', 'customer_request', 'declared_value', p_declared_value, 'awaiting_quote', true
      )
    ) returning id into item_id;
    title := coalesce(title, 'Add ' || trim(p_new_item_label) || ' to cover');
  end if;

  if title is null then
    title := case kind
      when 'callback' then 'Request a call'
      when 'add_item' then 'Add an item to insure'
      else 'Ask my concierge' end;
  end if;

  ref := app.next_number(t, 'concierge_request', cat);
  insert into concierge_requests (
    tenant_id, data_category, reference, person_id, customer_id, insured_item_id,
    request_kind, title, status, next_action, responsible_party, owner_member_id,
    details, created_by
  ) values (
    t, cat, ref, pid, cust, item_id, kind, title,
    'received', 'Lerato will review your request', 'concierge',
    prof.assigned_member_id, coalesce(p_details, '{}'::jsonb), auth.uid()
  ) returning id into rid;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, to_status, actor_user_id,
    body, visibility, payload, idempotency_key
  ) values (
    t, cat, rid, 'created', 'received', auth.uid(),
    coalesce(msg, 'Request opened'),
    'customer', jsonb_build_object('item_id', item_id), p_idempotency_key
  );

  select * into r from concierge_requests where id = rid;
  if msg is not null then
    perform app.concierge_mirror_fais(r, msg, 'inbound', p_idempotency_key);
  end if;

  update concierge_requests set
    status = 'with_concierge',
    next_action = coalesce(
      (select 'With ' || full_name from sales_team_members where id = prof.assigned_member_id),
      'With your concierge'
    ),
    responsible_party = 'concierge',
    updated_at = now()
  where id = rid;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility
  ) values (
    t, cat, rid, 'status', 'received', 'with_concierge', auth.uid(),
    'With your concierge', 'customer'
  );

  return public.concierge_request_get(cat, rid) || jsonb_build_object('outcome', 'created');
end $$;

revoke all on function public.concierge_request_create(text, text, text, uuid, text, jsonb, text, text, text, numeric)
  from public, anon;
grant execute on function public.concierge_request_create(text, text, text, uuid, text, jsonb, text, text, text, numeric)
  to authenticated;

-- ------------------------------------------------------------------ 5. Info request: mirror outbound ask
create or replace function public.concierge_request_info(
  p_category text default null,
  p_request_id uuid default null,
  p_next_action text default null,
  p_customer_message text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r concierge_requests%rowtype;
  cat text;
  msg text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from concierge_requests where id = p_request_id and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  cat := coalesce(nullif(p_category, ''), r.data_category);

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then
    return public.concierge_request_get(cat, r.id) || jsonb_build_object('outcome', 'replayed');
  end if;

  update concierge_requests set
    status = 'action_needed',
    responsible_party = 'customer',
    next_action = coalesce(nullif(p_next_action, ''), 'Your action needed'),
    updated_at = now()
  where id = r.id;

  msg := coalesce(nullif(p_customer_message, ''), p_next_action, 'Please provide the requested information.');

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility, idempotency_key
  ) values (
    r.tenant_id, r.data_category, r.id, 'info_request', r.status, 'action_needed', auth.uid(),
    msg, 'customer', p_idempotency_key
  );

  select * into r from concierge_requests where id = r.id;
  perform app.concierge_mirror_fais(r, msg, 'outbound', p_idempotency_key);

  return public.concierge_request_get(cat, r.id) || jsonb_build_object('outcome', 'ok');
end $$;

revoke all on function public.concierge_request_info(text, uuid, text, text, text) from public, anon;
grant execute on function public.concierge_request_info(text, uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------------ 6. Open / reuse standing chat thread
create or replace function public.concierge_open_chat(
  p_category text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  pid uuid;
  prof customer_concierge_profiles%rowtype;
  existing uuid;
  concierge_name text;
  title text;
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into pid from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc, cp.created_at limit 1;

  select r.id into existing
    from concierge_requests r
   where r.customer_id = cust
     and r.data_category = cat
     and r.tenant_id = t
     and coalesce(r.details ->> 'chat_thread', '') = 'true'
     and r.status not in ('completed', 'withdrawn')
   order by r.updated_at desc
   limit 1;

  if existing is not null then
    return public.concierge_request_get(cat, existing)
      || jsonb_build_object('outcome', 'opened');
  end if;

  if p_idempotency_key is not null then
    select request_id into existing from concierge_request_events
     where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      return public.concierge_request_get(cat, existing)
        || jsonb_build_object('outcome', 'replayed');
    end if;
  end if;

  select full_name into concierge_name from sales_team_members where id = prof.assigned_member_id;
  title := 'Chat with ' || coalesce(split_part(concierge_name, ' ', 1), 'your concierge');

  return public.concierge_request_create(
    cat,
    'assist',
    title,
    null,
    null,
    jsonb_build_object('chat_thread', true),
    coalesce(p_idempotency_key, 'cg-chat-open:' || cust::text || ':' || cat || ':' || floor(extract(epoch from now()))::text),
    null,
    null,
    null
  ) || jsonb_build_object('chat_opened', true);
end $$;

revoke all on function public.concierge_open_chat(text, text) from public, anon;
grant execute on function public.concierge_open_chat(text, text) to authenticated;

-- ------------------------------------------------------------------ 7. FAIS keep on concierge event bodies (live)
drop trigger if exists comm_keep_concierge_events on concierge_request_events;
create trigger comm_keep_concierge_events
  before update or delete on concierge_request_events
  for each row execute function app.comm_keep(
    'body', 'event_type', 'request_id', 'created_at', 'data_category', 'visibility', 'actor_user_id'
  );

notify pgrst, 'reload schema';
