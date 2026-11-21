-- Cover Comms inbox: list concierge/staff chat threads + open subject-linked chats (claim/quote).

-- ------------------------------------------------------------------ 1. Inbox list for signed-in customer
create or replace function public.concierge_comms_inbox(p_category text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  concierge_enabled boolean := false;
  concierge_name text;
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select enabled, (select full_name from sales_team_members where id = p.assigned_member_id)
    into concierge_enabled, concierge_name
    from customer_concierge_profiles p
   where p.customer_id = cust and p.data_category = cat;

  return jsonb_build_object(
    'data_category', cat,
    'customer_id', cust,
    'concierge_enabled', coalesce(concierge_enabled, false),
    'concierge_name', concierge_name,
    'threads', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.sort_at desc nulls last)
      from (
        select
          r.id,
          r.reference,
          r.title,
          r.request_kind,
          r.status,
          r.next_action,
          r.updated_at,
          r.created_at,
          greatest(r.updated_at, coalesce((
            select max(e.created_at) from concierge_request_events e
             where e.request_id = r.id and e.visibility = 'customer'
          ), r.updated_at)) as sort_at,
          coalesce(r.details ->> 'chat_thread', '') = 'true' as is_chat_thread,
          nullif(r.details ->> 'linked_claim_id', '')::uuid as linked_claim_id,
          nullif(r.details ->> 'linked_quote_request_id', '')::uuid as linked_quote_request_id,
          case
            when nullif(r.details ->> 'linked_claim_id', '') is not null then 'claim'
            when nullif(r.details ->> 'linked_quote_request_id', '') is not null then 'quote'
            when coalesce(r.details ->> 'chat_thread', '') = 'true' then 'concierge'
            else 'request'
          end as thread_kind,
          (select full_name from sales_team_members where id = r.owner_member_id) as owner_name,
          (
            select e.body from concierge_request_events e
             where e.request_id = r.id
               and e.visibility = 'customer'
               and nullif(trim(e.body), '') is not null
               and e.body is distinct from 'Request opened'
               and e.event_type in ('message', 'created', 'info_request')
             order by e.created_at desc
             limit 1
          ) as last_body,
          (
            select e.created_at from concierge_request_events e
             where e.request_id = r.id
               and e.visibility = 'customer'
               and nullif(trim(e.body), '') is not null
               and e.body is distinct from 'Request opened'
               and e.event_type in ('message', 'created', 'info_request')
             order by e.created_at desc
             limit 1
          ) as last_at,
          (
            select c.reference from claims c
             where c.id = nullif(r.details ->> 'linked_claim_id', '')::uuid
          ) as linked_claim_reference,
          (
            select q.reference from customer_quote_requests q
             where q.id = nullif(r.details ->> 'linked_quote_request_id', '')::uuid
          ) as linked_quote_reference
        from concierge_requests r
        where r.customer_id = cust
          and r.data_category = cat
          and r.tenant_id = t
          and r.status not in ('withdrawn')
      ) x
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.concierge_comms_inbox(text) from public, anon;
grant execute on function public.concierge_comms_inbox(text) to authenticated;

-- ------------------------------------------------------------------ 2. Open / reuse subject-linked chat (claim or quote)
create or replace function public.concierge_open_subject_chat(
  p_category text default null,
  p_claim_id uuid default null,
  p_quote_request_id uuid default null,
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
  details jsonb := jsonb_build_object('chat_thread', true);
  claim_ref text;
  quote_ref text;
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_claim_id is null and p_quote_request_id is null then
    return public.concierge_open_chat(cat, p_idempotency_key);
  end if;
  if p_claim_id is not null and p_quote_request_id is not null then
    raise exception 'validation' using errcode = '22023', message = 'Link either a claim or a quote, not both.';
  end if;

  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into pid from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc, cp.created_at limit 1;

  if p_claim_id is not null then
    select reference into claim_ref from claims
     where id = p_claim_id and customer_id = cust and data_category = cat;
    if claim_ref is null then
      -- some schemas link claims via person; allow person match
      select c.reference into claim_ref from claims c
       where c.id = p_claim_id and c.data_category = cat
         and c.person_id = pid;
    end if;
    if claim_ref is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    details := details || jsonb_build_object('linked_claim_id', p_claim_id);
    title := 'Claim ' || claim_ref;
  else
    select reference into quote_ref from customer_quote_requests
     where id = p_quote_request_id and customer_id = cust and data_category = cat;
    if quote_ref is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    details := details || jsonb_build_object('linked_quote_request_id', p_quote_request_id);
    title := 'Quote ' || quote_ref;
  end if;

  select r.id into existing
    from concierge_requests r
   where r.customer_id = cust
     and r.data_category = cat
     and r.tenant_id = t
     and coalesce(r.details ->> 'chat_thread', '') = 'true'
     and r.status not in ('completed', 'withdrawn')
     and (
       (p_claim_id is not null and r.details ->> 'linked_claim_id' = p_claim_id::text)
       or (p_quote_request_id is not null and r.details ->> 'linked_quote_request_id' = p_quote_request_id::text)
     )
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

  return public.concierge_request_create(
    cat,
    'assist',
    title,
    null,
    null,
    details,
    coalesce(
      p_idempotency_key,
      'cg-subject:' || coalesce(p_claim_id::text, p_quote_request_id::text) || ':' || cat
    ),
    null,
    null,
    null
  ) || jsonb_build_object('chat_opened', true, 'subject', case when p_claim_id is not null then 'claim' else 'quote' end);
end $$;

revoke all on function public.concierge_open_subject_chat(text, uuid, uuid, text) from public, anon;
grant execute on function public.concierge_open_subject_chat(text, uuid, uuid, text) to authenticated;

-- Standing general chat: ignore subject-linked threads when reusing
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

  -- General concierge chat only (no claim/quote link)
  select r.id into existing
    from concierge_requests r
   where r.customer_id = cust
     and r.data_category = cat
     and r.tenant_id = t
     and coalesce(r.details ->> 'chat_thread', '') = 'true'
     and nullif(r.details ->> 'linked_claim_id', '') is null
     and nullif(r.details ->> 'linked_quote_request_id', '') is null
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

notify pgrst, 'reload schema';
