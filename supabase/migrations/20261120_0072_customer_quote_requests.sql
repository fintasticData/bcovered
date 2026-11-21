-- Customer quote requests: trackable Get a quote journeys linked to insured items.
-- Extends customer_page_get with quote_requests[]; adds request_quote + update_item RPCs.

alter table number_sequences drop constraint if exists number_sequences_kind_check;
alter table number_sequences add constraint number_sequences_kind_check
  check (kind = any (array[
    'client','account','note','task','policy','enquiry','offer','sale',
    'service_request','claim','install_request','concierge_request','quote_request'
  ]));

create table if not exists customer_quote_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  person_id uuid not null,
  customer_id uuid not null,
  reference text not null,
  status text not null default 'submitted'
    check (status in ('draft','submitted','with_broker','offers_ready','accepted','withdrawn','replaced')),
  cover_requested text,
  item_ids uuid[] not null default '{}',
  notes text,
  released_quote_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, data_category, idempotency_key),
  unique (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category)
);

create index if not exists customer_quote_requests_person_idx
  on customer_quote_requests (tenant_id, data_category, person_id, created_at desc);

alter table customer_quote_requests enable row level security;

drop policy if exists customer_quote_requests_staff on customer_quote_requests;
create policy customer_quote_requests_staff on customer_quote_requests for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists customer_quote_requests_owner on customer_quote_requests;
create policy customer_quote_requests_owner on customer_quote_requests for select to authenticated
  using (
    tenant_id = app.tenant_id()
    and data_category = app.active_category()
    and customer_id = app.my_customer_id()
  );

-- ------------------------------------------------------------------ update item details (customer)
create or replace function public.customer_page_update_item(
  p_category text default null,
  p_item_id uuid default null,
  p_display_label text default null,
  p_declared_value numeric default null,
  p_description text default null,
  p_photo_url text default null,
  p_details jsonb default null,
  p_idempotency_key text default null,
  p_person_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctx record;
  item insured_items%rowtype;
  merged jsonb;
begin
  perform set_config(
    'request.headers',
    jsonb_set(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb),
      '{x-data-category}',
      to_jsonb(coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample'))
    )::text,
    true
  );

  select * into ctx from app.customer_page_resolve_person(p_person_id);
  if ctx.is_preview then
    raise exception 'forbidden' using errcode = '42501', message = 'Preview is read-only.';
  end if;

  select * into item
    from insured_items
   where id = p_item_id
     and person_id = ctx.person_id
     and data_category = ctx.data_category;

  if item.id is null then
    raise exception 'not_found' using errcode = 'P0002', message = 'Item not found.';
  end if;

  merged := coalesce(item.details, '{}'::jsonb)
    || coalesce(p_details, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
         'description', nullif(trim(coalesce(p_description, item.details->>'description', '')), ''),
         'declared_value', coalesce(p_declared_value, (nullif(item.details->>'declared_value',''))::numeric),
         'photo_url', nullif(trim(coalesce(p_photo_url, item.details->>'photo_url', '')), ''),
         'updated_via', 'customer_page',
         'updated_at', now()
       ));

  update insured_items
     set display_label = coalesce(nullif(trim(p_display_label), ''), display_label),
         details = merged,
         updated_at = now()
   where id = item.id;

  return jsonb_build_object(
    'outcome', 'ok',
    'item_id', item.id,
    'summary', 'Item updated'
  );
end $$;

grant execute on function public.customer_page_update_item(text, uuid, text, numeric, text, text, jsonb, text, uuid) to authenticated;

-- ------------------------------------------------------------------ request quote
create or replace function public.customer_page_request_quote(
  p_category text default null,
  p_item_ids uuid[] default null,
  p_cover_requested text default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_person_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctx record;
  existing uuid;
  existing_ref text;
  req_id uuid;
  ref text;
  ids uuid[] := coalesce(p_item_ids, '{}');
  n int;
begin
  perform set_config(
    'request.headers',
    jsonb_set(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb),
      '{x-data-category}',
      to_jsonb(coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample'))
    )::text,
    true
  );

  select * into ctx from app.customer_page_resolve_person(p_person_id);
  if ctx.is_preview then
    raise exception 'forbidden' using errcode = '42501', message = 'Preview is read-only.';
  end if;

  if cardinality(ids) is null or cardinality(ids) = 0 then
    raise exception 'validation' using errcode = '22023', message = 'Choose at least one item to insure.';
  end if;

  select count(*)::int into n
    from insured_items ii
   where ii.id = any(ids)
     and ii.person_id = ctx.person_id
     and ii.data_category = ctx.data_category;

  if n <> cardinality(ids) then
    raise exception 'validation' using errcode = '22023', message = 'One or more items are not on your page.';
  end if;

  if p_idempotency_key is not null then
    select id, reference into existing, existing_ref
      from customer_quote_requests
     where tenant_id = ctx.tenant_id
       and data_category = ctx.data_category
       and idempotency_key = p_idempotency_key
     limit 1;
    if existing is not null then
      return jsonb_build_object(
        'outcome', 'ok', 'replayed', true,
        'request_id', existing, 'reference', existing_ref,
        'summary', 'Your quote request was already received · ' || existing_ref
      );
    end if;
  end if;

  ref := app.next_number(ctx.tenant_id, 'quote_request', ctx.data_category);

  insert into customer_quote_requests (
    tenant_id, data_category, person_id, customer_id,
    reference, status, cover_requested, item_ids, notes, idempotency_key
  ) values (
    ctx.tenant_id, ctx.data_category, ctx.person_id, ctx.customer_id,
    ref, 'submitted',
    nullif(trim(coalesce(p_cover_requested, '')), ''),
    ids,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_idempotency_key, 'qr:' || gen_random_uuid()::text)
  ) returning id into req_id;

  update insured_items
     set details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
           'quote_request_id', req_id,
           'quote_request_reference', ref,
           'source', coalesce(details->>'source', 'customer_request'),
           'quote_requested_at', now()
         ),
         updated_at = now()
   where id = any(ids)
     and person_id = ctx.person_id
     and data_category = ctx.data_category;

  return jsonb_build_object(
    'outcome', 'ok',
    'replayed', false,
    'request_id', req_id,
    'reference', ref,
    'summary', 'Quote request sent to your broker · ' || ref
  );
end $$;

grant execute on function public.customer_page_request_quote(text, uuid[], text, text, text, uuid) to authenticated;

-- ------------------------------------------------------------------ customer_page_get + quote_requests
create or replace function public.customer_page_get(
  p_category text default null,
  p_person_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctx record;
  org organisations%rowtype;
  cust customers%rowtype;
  bp business_profiles%rowtype;
  broker jsonb;
  attention jsonb := '[]'::jsonb;
  items jsonb := '[]'::jsonb;
  policies jsonb := '[]'::jsonb;
  claims jsonb := '[]'::jsonb;
  locations jsonb := '[]'::jsonb;
  quote_requests jsonb := '[]'::jsonb;
  released_count int := 0;
begin
  perform set_config(
    'request.headers',
    jsonb_set(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb),
      '{x-data-category}',
      to_jsonb(coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample'))
    )::text,
    true
  );

  select * into ctx from app.customer_page_resolve_person(p_person_id);
  select * into org from organisations where id = ctx.tenant_id;
  select * into cust from customers where id = ctx.customer_id and data_category = ctx.data_category;
  select * into bp from business_profiles where customer_id = ctx.customer_id limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('id', bl.id, 'name', bl.name, 'city', bl.city) order by bl.name), '[]'::jsonb)
    into locations
    from business_locations bl
   where bp.id is not null and bl.business_profile_id = bp.id;

  select jsonb_build_object(
           'id', m.id,
           'name', coalesce(m.full_name, u.full_name),
           'phone', m.phone,
           'email', m.email,
           'russ_enabled', true
         )
    into broker
    from customers c
    left join persons p on p.id = ctx.person_id
    left join sales_team_members m on m.id = coalesce(p.assigned_member_id, c.assigned_member_id)
    left join app_users u on u.id = m.user_id
   where c.id = ctx.customer_id and c.data_category = ctx.data_category;

  select count(*)::int into released_count
    from quotes q
   where q.customer_id = ctx.customer_id
     and q.status = 'released'
     and q.data_category = ctx.data_category;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_at desc), '[]'::jsonb)
    into items
    from (
      select
        ii.id, ii.item_type, ii.display_label, ii.status as cover_status,
        app.customer_page_status(
          ii.status, ii.details,
          exists (
            select 1 from quotes q
             where q.customer_id = ctx.customer_id and q.status = 'released' and q.data_category = ctx.data_category
               and (q.id::text = nullif(ii.details->>'quote_id','')
                 or lower(coalesce(q.risk_summary->>'summary','')) like '%' || lower(left(ii.display_label, 24)) || '%')
          )
          or exists (
            select 1 from customer_quote_requests cqr
             where cqr.person_id = ctx.person_id and cqr.data_category = ctx.data_category
               and ii.id = any(cqr.item_ids) and cqr.status = 'offers_ready'
          )
        ) as customer_status,
        case
          when ii.details ? 'declared_value' then (ii.details->>'declared_value')::numeric
          when ii.details ? 'contents_limit' then (ii.details->>'contents_limit')::numeric
          when ii.details ? 'building_sum_insured' then (ii.details->>'building_sum_insured')::numeric
          else null
        end as insured_value,
        ii.details->>'location_name' as location_name,
        ii.details->>'location_id' as location_id,
        ii.details->>'photo_url' as photo_url,
        ii.details->>'reference' as reference,
        coalesce(nullif(ii.details->>'quote_id',''), (
          select cqr.released_quote_id::text from customer_quote_requests cqr
           where cqr.person_id = ctx.person_id and ii.id = any(cqr.item_ids)
             and cqr.released_quote_id is not null
           order by cqr.created_at desc limit 1
        )) as quote_id,
        ii.details->>'quote_request_id' as quote_request_id,
        ii.details->>'quote_request_reference' as quote_request_reference,
        coalesce(ii.details, '{}'::jsonb) as details,
        pol.id as policy_id,
        pol.reference as policy_reference,
        pol.insurer_name,
        pol.premium_amount,
        pol.premium_frequency,
        case when pol.premium_amount is not null then 'policy' else 'item' end as premium_scope,
        ii.updated_at as sort_at
      from insured_items ii
      left join lateral (
        select pol.id, pol.reference, pol.premium_amount, pol.premium_frequency, i.name as insurer_name
          from policy_version_items pvi
          join policy_versions pv on pv.id = pvi.policy_version_id and pv.superseded_at is null
          join policies pol on pol.id = pv.policy_id and pol.data_category = pv.data_category
          left join insurers i on i.id = pol.provider_id
         where pvi.insured_item_id = ii.id and pvi.data_category = ii.data_category
         limit 1
      ) pol on true
      where ii.person_id = ctx.person_id
        and ii.data_category = ctx.data_category
        and ii.status in ('awaiting_cover','covered','replaced','removed')
    ) x;

  -- Prefer quote-request status over raw item awaiting when a request exists
  -- (customer_page_status already covers released quotes; mark request_sent when linked request submitted)
  select coalesce(jsonb_agg(
    case
      when (elem->>'customer_status') = 'awaiting_cover'
           and nullif(elem->>'quote_request_id','') is not null
        then elem || jsonb_build_object('customer_status', 'request_sent')
      else elem
    end
  ), '[]'::jsonb)
    into items
    from jsonb_array_elements(items) elem;

  select coalesce(jsonb_agg(a order by a.priority), '[]'::jsonb)
    into attention
    from (
      (select 1 as priority, 'review_quote' as kind, 'Review your quote request' as label,
              '/my/quotes' as href, cqr.id::text as target_id
         from customer_quote_requests cqr
        where cqr.person_id = ctx.person_id and cqr.data_category = ctx.data_category
          and cqr.status in ('offers_ready','submitted','with_broker')
        order by cqr.created_at desc limit 1)
      union all
      (select 1, 'review_quote', 'Review your motor quote', '/my/quotes', q.id::text
         from quotes q
        where q.customer_id = ctx.customer_id and q.status = 'released' and q.data_category = ctx.data_category
        order by q.released_at desc nulls last limit 1)
      union all
      (select 2, 'upload_photo', 'Upload a photo of your vehicle', '/my#add-item', ii.id::text
         from insured_items ii
        where ii.person_id = ctx.person_id and ii.data_category = ctx.data_category
          and ii.item_type = 'vehicle' and ii.status = 'awaiting_cover'
          and coalesce(ii.details->>'photo_url','') = ''
          and coalesce(ii.details->>'source','') = 'customer_request' limit 1)
      union all
      (select 3, 'claim_next', coalesce(c.next_action, 'Continue your claim'), '/my?tab=claims', c.id::text
         from claims c
        where c.person_id = ctx.person_id and c.data_category = ctx.data_category
          and c.next_action is not null and c.status not in ('closed','withdrawn','declined')
        order by c.updated_at desc limit 1)
    ) a;

  select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.inception_date desc nulls last), '[]'::jsonb)
    into policies
    from (
      select pol.id, pol.reference, pol.policy_number, pol.status,
             pol.inception_date, pol.premium_amount, pol.premium_frequency, pol.cover_type,
             i.name as insurer_name,
             (select coalesce(jsonb_agg(jsonb_build_object('id', ii.id, 'label', ii.display_label, 'status', ii.status)), '[]'::jsonb)
                from policy_versions pv
                join policy_version_items pvi on pvi.policy_version_id = pv.id
                join insured_items ii on ii.id = pvi.insured_item_id
               where pv.policy_id = pol.id and pv.superseded_at is null) as items,
             '[]'::jsonb as documents
        from policy_cover pc
        join policies pol on pol.id = pc.policy_id and pol.data_category = pc.data_category
        left join insurers i on i.id = pol.provider_id
       where pc.person_id = ctx.person_id and pc.data_category = ctx.data_category
    ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'reference', c.reference, 'status', c.status,
           'incident_type', c.incident_type, 'incident_at', c.incident_at,
           'next_action', c.next_action, 'customer_update', c.next_action
         ) order by c.updated_at desc), '[]'::jsonb)
    into claims from claims c
   where c.person_id = ctx.person_id and c.data_category = ctx.data_category;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc), '[]'::jsonb)
    into quote_requests
    from (
      select
        cqr.id,
        cqr.reference,
        cqr.status,
        cqr.cover_requested,
        cqr.item_ids,
        cqr.notes,
        cqr.released_quote_id,
        cqr.created_at,
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', ii.id,
            'label', ii.display_label,
            'item_type', ii.item_type
          )), '[]'::jsonb)
            from insured_items ii
           where ii.id = any(cqr.item_ids)
        ) as items,
        case
          when cqr.status = 'offers_ready' then 'Review offers'
          when cqr.status in ('submitted','with_broker') then 'Waiting on your broker'
          when cqr.status = 'accepted' then 'Accepted'
          when cqr.status = 'withdrawn' then 'Withdrawn'
          else 'In progress'
        end as next_step
      from customer_quote_requests cqr
     where cqr.person_id = ctx.person_id
       and cqr.data_category = ctx.data_category
    ) r;

  return jsonb_build_object(
    'person_id', ctx.person_id, 'customer_id', ctx.customer_id, 'is_preview', ctx.is_preview,
    'is_sample', ctx.data_category = 'sample', 'data_category', ctx.data_category,
    'greeting_name', ctx.preferred_name, 'full_name', ctx.full_name,
    'customer_type', cust.customer_type,
    'business', case when bp.id is null then null else jsonb_build_object(
      'id', bp.id, 'trading_name', coalesce(bp.trading_name, bp.registered_name),
      'registered_name', bp.registered_name, 'locations', locations) end,
    'brokerage', jsonb_build_object(
      'id', org.id, 'trading_name', coalesce(org.trading_name, org.name),
      'logo_url', org.logo_url, 'brand_image_url', org.brand_image_url),
    'broker', broker, 'attention', attention, 'items', items, 'policies', policies,
    'claims', claims, 'quote_requests', quote_requests, 'released_quote_count', released_count
  );
end $$;

grant execute on function public.customer_page_get(text, uuid) to authenticated;
