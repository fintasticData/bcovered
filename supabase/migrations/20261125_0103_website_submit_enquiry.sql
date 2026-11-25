-- Public website channel for the /migration clone of www.bcovered.co.za.
-- Reuses app.create_enquiry (Customer prospect + sales_enquiries + person + follow-up task).
-- Default inbox: active member on the BCovered brokerage (a000…001), preferring NALEDI-MZRL.

alter table public.sales_enquiries drop constraint if exists sales_enquiries_source_check;
alter table public.sales_enquiries
  add constraint sales_enquiries_source_check
  check (source = any (array[
    'referral_link'::text,
    'referral_code'::text,
    'phone'::text,
    'copilot'::text,
    'manual'::text,
    'website'::text
  ]));

create or replace function public.website_submit_enquiry(
  p_first_names text,
  p_surname text,
  p_phone text,
  p_email text,
  p_interest text,
  p_message text,
  p_consent boolean,
  p_client_key text,
  p_category text default 'sample',
  p_channel text default 'quick_quote'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m sales_team_members;
  org organisations;
  r jsonb;
  cat text := coalesce(nullif(trim(p_category), ''), 'sample');
  channel text := coalesce(nullif(trim(p_channel), ''), 'quick_quote');
  recent int;
  website_tenant constant uuid := 'a0000000-0000-4000-8000-000000000001';
begin
  if cat not in ('sample', 'live') then
    raise exception using message = 'validation', detail = 'Unknown category.';
  end if;
  if channel not in ('quick_quote', 'call_back', 'concierge', 'contact') then
    raise exception using message = 'validation', detail = 'Unknown website channel.';
  end if;

  perform app.check_public_enquiry(p_first_names, p_surname, p_phone, p_email, p_consent, p_client_key);

  -- Prefer the seeded Naledi inbox on BCovered; otherwise any active member on that tenant.
  select * into m
    from sales_team_members
   where tenant_id = website_tenant
     and coalesce(status, 'active') <> 'suspended'
     and referral_code = 'NALEDI-MZRL'
   limit 1;

  if m.id is null then
    select * into m
      from sales_team_members
     where tenant_id = website_tenant
       and coalesce(status, 'active') <> 'suspended'
     order by created_at nulls last
     limit 1;
  end if;

  if m.id is null then
    raise exception using message = 'validation',
      detail = 'The website enquiry desk is not configured yet. Please email support@bcovered.co.za.';
  end if;

  select * into org from organisations where id = m.tenant_id;
  if cat = 'live' and coalesce(org.lifecycle_status, '') <> 'active' then
    raise exception using message = 'validation',
      detail = format('%s is not accepting live website enquiries yet.', coalesce(org.trading_name, org.name));
  end if;

  select count(*) into recent
    from sales_enquiries
   where tenant_id = m.tenant_id
     and source = 'website'
     and created_at > now() - interval '1 hour';
  if recent >= 60 then
    raise exception using message = 'validation',
      detail = 'We are receiving a lot of website enquiries. Please try again later.';
  end if;

  r := app.create_enquiry(
    m.tenant_id,
    cat,
    'website',
    'WEB-' || upper(channel),
    m.id,
    m.id,
    p_first_names,
    p_surname,
    p_phone,
    p_email,
    coalesce(nullif(trim(p_interest), ''), 'Website enquiry') || ' · ' || channel,
    p_message,
    now(),
    null,
    false,
    false,
    true,
    null,
    'website:' || p_client_key
  );

  return jsonb_build_object(
    'ok', true,
    'reference', r ->> 'reference',
    'referrer_name', split_part(m.full_name, ' ', 1),
    'brokerage', coalesce(org.trading_name, org.name),
    'category', cat,
    'channel', channel,
    'person_id', r ->> 'person_id',
    'customer_id', r ->> 'customer_id'
  );
end $$;

revoke all on function public.website_submit_enquiry(text, text, text, text, text, text, boolean, text, text, text)
  from public;
grant execute on function public.website_submit_enquiry(text, text, text, text, text, text, boolean, text, text, text)
  to anon, authenticated;
