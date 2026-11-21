-- My Business Page read RPC — mirrors BusinessPageDto for live/sample commercial books.
-- Customer: omit p_business_profile_id (resolves via linked customer).
-- Broker preview: pass p_business_profile_id.

create or replace function public.business_page_get(
  p_category text default null,
  p_business_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
  bp business_profiles%rowtype;
  industry_name text;
  broker_name text;
  locations jsonb := '[]'::jsonb;
  assets jsonb := '[]'::jsonb;
  open_requests jsonb := '[]'::jsonb;
  attention jsonb := '[]'::jsonb;
  exposure_count int := 0;
  is_preview boolean := false;
  greeting text;
  trading text;
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

  if p_business_profile_id is not null then
    select * into bp from business_profiles where id = p_business_profile_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002', message = 'Business profile not found';
    end if;
    is_preview := true;
  else
    select * into ctx from app.customer_page_resolve_person(null);
    select * into bp from business_profiles where customer_id = ctx.customer_id limit 1;
    if not found then
      raise exception 'not_found' using errcode = 'P0002', message = 'No business profile is linked to this customer.';
    end if;
  end if;

  select coalesce(t.name, bp.industry_key) into industry_name
    from industry_risk_templates t
   where t.key = bp.industry_key
   limit 1;
  industry_name := coalesce(industry_name, bp.industry_key);

  select coalesce(u.full_name, null) into broker_name
    from app_users u
   where u.id = bp.assigned_broker_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', bl.id, 'name', bl.name, 'city', bl.city)
      order by bl.name
    ),
    '[]'::jsonb
  )
    into locations
    from business_locations bl
   where bl.business_profile_id = bp.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'asset_class', a.asset_class,
        'display_label', a.description,
        'description', a.description,
        'quantity', a.quantity,
        'declared_value', a.declared_value,
        'value_basis', a.value_basis,
        'valuation_date', a.valuation_date,
        'location_id', a.location_id,
        'location_name', (
          select case
            when bl.city is not null then bl.name || ' · ' || bl.city
            else bl.name
          end
          from business_locations bl
          where bl.id = a.location_id
        ),
        'cover_status', case
          when a.declared_value is null then 'not_confirmed'
          when a.value_basis = 'unknown' or a.source = 'declared' then 'review_needed'
          when a.source = 'verified' then 'awaiting_cover'
          else 'not_confirmed'
        end,
        'photo_url', null,
        'source', a.source
      )
      order by a.description
    ),
    '[]'::jsonb
  )
    into assets
    from commercial_assets a
   where a.business_profile_id = bp.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'detail', t.detail,
        'kind', t.kind,
        'due_date', t.due_date
      )
      order by t.created_at
    ),
    '[]'::jsonb
  )
    into open_requests
    from tasks t
   where t.subject_id = bp.id
     and t.audience = 'customer'
     and t.status = 'open';

  select count(*)::int into exposure_count
    from risk_exposures re
    join business_risk_profiles rp on rp.id = re.risk_profile_id and rp.status = 'current'
   where rp.business_profile_id = bp.id;

  if jsonb_array_length(open_requests) > 0 then
    attention := attention || jsonb_build_array(
      jsonb_build_object(
        'priority', 1,
        'kind', 'open_request',
        'label', open_requests->0->>'title',
        'href', '/my/business?tab=requests',
        'target_id', open_requests->0->>'id'
      )
    );
  end if;

  trading := coalesce(bp.trading_name, bp.registered_name);
  greeting := coalesce(bp.primary_contact->>'name', trading);
  if position(' ' in greeting) > 0 then
    greeting := split_part(greeting, ' ', 1);
  end if;

  return jsonb_build_object(
    'profile_id', bp.id,
    'customer_id', bp.customer_id,
    'is_preview', is_preview,
    'is_sample', bp.is_synthetic,
    'trading_name', trading,
    'registered_name', bp.registered_name,
    'industry_name', industry_name,
    'greeting_name', greeting,
    'review_status', null,
    'assigned_broker', broker_name,
    'brokerage', jsonb_build_object(
      'trading_name', case when is_preview then 'Broker preview' else 'Your brokerage' end,
      'logo_url', null
    ),
    'locations', locations,
    'assets', assets,
    'attention', attention,
    'open_requests', open_requests,
    'open_request_count', coalesce(jsonb_array_length(open_requests), 0),
    'exposure_count', exposure_count
  );
end;
$$;

revoke all on function public.business_page_get(text, uuid) from public, anon;
grant execute on function public.business_page_get(text, uuid) to authenticated;
