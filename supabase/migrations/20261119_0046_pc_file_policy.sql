-- File a confirmed policy from policy_setup (policies + policy_cover + version 1).
-- Idempotent via policies.source_ref = 'policy_setup:' || p_idempotency_key.

insert into insurers (id, name, is_fictional, provider_type)
select 'a0000000-0000-4000-8000-000000000201', 'Santam', false, 'insurer'
 where not exists (select 1 from insurers where lower(name) = 'santam');

create or replace function public.pc_file_policy(
  p_person_id uuid,
  p_policy_number text,
  p_confirmed_effective_at timestamptz,
  p_confirmation_source text,
  p_provider_id uuid default null,
  p_insurer_name text default null,
  p_quote_id text default null,
  p_source_type text default null,
  p_schedule_note text default null,
  p_insurer_reference text default null,
  p_cover_type text default null,
  p_premium_amount numeric default null,
  p_premium_frequency text default null,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(p_category, app.active_category());
  cust uuid;
  provider uuid;
  offer sales_offers%rowtype;
  pol policies%rowtype;
  cover_id uuid;
  ver_id uuid;
  src_ref text;
  offer_insurer text;
  cover text;
  freq text;
  origin_val text := 'placed';
  eff date;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_policy_number is null or trim(p_policy_number) = '' then
    raise exception 'policy_number is required';
  end if;
  if p_confirmed_effective_at is null then
    raise exception 'confirmed_effective_at is required';
  end if;

  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    src_ref := 'policy_setup:' || trim(p_idempotency_key);
    select * into pol from policies where tenant_id = app.tenant_id() and source_ref = src_ref limit 1;
    if found then
      select id into cover_id from policy_cover where policy_id = pol.id and data_category = pol.data_category limit 1;
      return jsonb_build_object(
        'outcome', 'saved',
        'policy_id', pol.id,
        'cover_id', cover_id,
        'reference', pol.reference,
        'policy_number', pol.policy_number,
        'summary', 'Replayed policy ' || coalesce(pol.policy_number, pol.reference),
        'replayed', true
      );
    end if;
  end if;

  select customer_id into cust from customer_persons where person_id = p_person_id limit 1;
  if cust is null then
    raise exception 'Client has no customer account';
  end if;

  -- Resolve insurer: explicit id → name match → offer → person's latest accepted offer → Protea sample id
  provider := p_provider_id;
  if provider is null and p_insurer_name is not null and trim(p_insurer_name) <> '' then
    select id into provider from insurers where lower(name) = lower(trim(p_insurer_name)) limit 1;
  end if;

  if p_quote_id is not null and trim(p_quote_id) <> '' then
    select * into offer from sales_offers
     where tenant_id = app.tenant_id() and data_category = cat
       and (id::text = trim(p_quote_id) or reference = trim(p_quote_id))
       and person_id = p_person_id
     limit 1;
  end if;

  if provider is null and offer.id is not null then
    provider := offer.insurer_id;
    if provider is null and offer.insurer_name is not null then
      select id into provider from insurers where lower(name) = lower(trim(offer.insurer_name)) limit 1;
    end if;
  end if;

  if provider is null then
    select o.insurer_id into provider
      from sales_offers o
     where o.person_id = p_person_id and o.data_category = cat and o.tenant_id = app.tenant_id()
       and o.status in ('accepted', 'sold') and o.insurer_id is not null
     order by coalesce(o.accepted_at, o.updated_at) desc
     limit 1;
  end if;

  if provider is null then
    select o.insurer_name into offer_insurer
      from sales_offers o
     where o.person_id = p_person_id and o.data_category = cat and o.tenant_id = app.tenant_id()
       and o.status in ('accepted', 'sold') and nullif(trim(o.insurer_name), '') is not null
     order by coalesce(o.accepted_at, o.updated_at) desc
     limit 1;
    if offer_insurer is not null then
      select id into provider from insurers where lower(name) = lower(trim(offer_insurer)) limit 1;
    end if;
  end if;

  if provider is null then
    provider := 'a0000000-0000-4000-8000-000000000101'; -- Protea Insure fallback
  end if;

  cover := coalesce(nullif(trim(p_cover_type), ''), nullif(trim(offer.product), ''), 'motor');
  if cover not in ('motor','home','contents','motorbike','valuables','commercial_package','commercial_property','liability','fleet','life','disability','funeral','group_life','group_disability','other') then
    cover := 'other';
  end if;

  freq := coalesce(nullif(trim(p_premium_frequency), ''), offer.premium_frequency, 'monthly');
  if freq not in ('monthly','quarterly','annually','single') then
    freq := 'monthly';
  end if;

  if coalesce(p_source_type, '') = 'insurer_schedule' then
    origin_val := 'existing_declared';
  end if;

  eff := p_confirmed_effective_at::date;
  src_ref := case when p_idempotency_key is not null and trim(p_idempotency_key) <> ''
    then 'policy_setup:' || trim(p_idempotency_key) else null end;

  insert into policies (
    tenant_id, customer_id, line, provider_id, policy_number, origin, status,
    premium_amount, premium_frequency, inception_date, source, data_category, data_origin,
    cover_type, source_ref, adviser_id
  ) values (
    app.tenant_id(), cust, 'short_term_personal', provider, trim(p_policy_number), origin_val, 'in_force',
    coalesce(p_premium_amount, offer.premium_amount), freq, eff, 'verified', cat,
    case when cat = 'sample' then 'demo' else 'live' end,
    cover, src_ref, auth.uid()
  ) returning * into pol;

  insert into policy_cover (tenant_id, data_category, policy_id, person_id, customer_id, sale_id)
  values (app.tenant_id(), cat, pol.id, p_person_id, cust, null)
  returning id into cover_id;

  insert into policy_versions (
    tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms, created_by
  ) values (
    app.tenant_id(), cat, pol.id, 1, now(), p_confirmed_effective_at,
    jsonb_strip_nulls(jsonb_build_object(
      'confirmation_source', p_confirmation_source,
      'insurer_reference', nullif(trim(coalesce(p_insurer_reference, '')), ''),
      'source_type', p_source_type,
      'schedule_note', nullif(trim(coalesce(p_schedule_note, '')), ''),
      'quote_id', nullif(trim(coalesce(p_quote_id, '')), ''),
      'offer_reference', offer.reference,
      'premium', coalesce(p_premium_amount, offer.premium_amount),
      'insurer_name', coalesce(nullif(trim(coalesce(p_insurer_name, '')), ''), offer.insurer_name)
    )),
    auth.uid()
  ) returning id into ver_id;

  return jsonb_build_object(
    'outcome', 'saved',
    'policy_id', pol.id,
    'cover_id', cover_id,
    'version_id', ver_id,
    'reference', pol.reference,
    'policy_number', pol.policy_number,
    'summary', 'Policy ' || pol.policy_number || ' filed (' || pol.reference || ')'
  );
end $$;

grant execute on function public.pc_file_policy(
  uuid, text, timestamptz, text, uuid, text, text, text, text, text, text, numeric, text, text, text
) to authenticated;
