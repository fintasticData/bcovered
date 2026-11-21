-- Extend pc_file_policy to file an optional insured item + excess on version 1.
-- Also adds pc_add_policy_item for MVP polish on existing covers.

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
  p_category text default null,
  p_item_label text default null,
  p_item_type text default null,
  p_excess numeric default null
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
  item_id uuid;
  src_ref text;
  offer_insurer text;
  cover text;
  freq text;
  origin_val text := 'placed';
  eff date;
  item_type text;
  item_label text;
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
    provider := 'a0000000-0000-4000-8000-000000000101';
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
      'excess', p_excess,
      'insurer_name', coalesce(nullif(trim(coalesce(p_insurer_name, '')), ''), offer.insurer_name)
    )),
    auth.uid()
  ) returning id into ver_id;

  item_type := coalesce(nullif(trim(p_item_type), ''),
    case cover when 'motor' then 'vehicle' when 'motorbike' then 'vehicle' when 'home' then 'building' when 'contents' then 'contents' else 'vehicle' end);
  if item_type not in ('vehicle','building','contents') then
    item_type := 'vehicle';
  end if;
  item_label := nullif(trim(coalesce(p_item_label, '')), '');
  if item_label is null and cover in ('motor','motorbike') then
    item_label := 'Motor vehicle (details TBD)';
  elsif item_label is null and cover = 'contents' then
    item_label := 'Contents (details TBD)';
  elsif item_label is null and cover = 'home' then
    item_label := 'Building (details TBD)';
  end if;

  if item_label is not null then
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (
      app.tenant_id(), cat, p_person_id, item_type, 'covered', item_label,
      jsonb_strip_nulls(jsonb_build_object('source', 'policy_setup', 'cover_type', cover))
    ) returning id into item_id;

    insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
    values (app.tenant_id(), cat, ver_id, item_id, jsonb_build_object('role', item_type));
  end if;

  return jsonb_build_object(
    'outcome', 'saved',
    'policy_id', pol.id,
    'cover_id', cover_id,
    'version_id', ver_id,
    'item_id', item_id,
    'reference', pol.reference,
    'policy_number', pol.policy_number,
    'summary', 'Policy ' || pol.policy_number || ' filed (' || pol.reference || ')'
  );
end $$;

-- Drop prior signature (without item args) so grants stay clean
drop function if exists public.pc_file_policy(
  uuid, text, timestamptz, text, uuid, text, text, text, text, text, text, numeric, text, text, text
);

grant execute on function public.pc_file_policy(
  uuid, text, timestamptz, text, uuid, text, text, text, text, text, text, numeric, text, text, text, text, text, numeric
) to authenticated;

create or replace function public.pc_add_policy_item(
  p_policy_id uuid,
  p_item_label text,
  p_item_type text default 'vehicle',
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(p_category, app.active_category());
  pc policy_cover%rowtype;
  ver policy_versions%rowtype;
  item_id uuid;
  item_type text := coalesce(nullif(trim(p_item_type), ''), 'vehicle');
begin
  perform app.pc_require_staff();
  select * into pc from policy_cover where policy_id = p_policy_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'policy cover not found'; end if;
  if app.book_restricted() and not app.can_see_person(pc.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if item_type not in ('vehicle','building','contents') then item_type := 'vehicle'; end if;
  if p_item_label is null or trim(p_item_label) = '' then raise exception 'item_label is required'; end if;

  if p_idempotency_key is not null then
    select ii.id into item_id
      from insured_items ii
      join policy_version_items pvi on pvi.insured_item_id = ii.id
      join policy_versions pv on pv.id = pvi.policy_version_id
     where pv.policy_id = p_policy_id and ii.details->>'idempotency_key' = p_idempotency_key
     limit 1;
    if item_id is not null then
      return jsonb_build_object('outcome','saved','item_id', item_id, 'summary', 'Replayed item', 'replayed', true);
    end if;
  end if;

  select * into ver from policy_versions
   where policy_id = p_policy_id and data_category = cat and superseded_at is null
   order by version_no desc limit 1;
  if not found then raise exception 'no current policy version'; end if;

  insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
  values (
    app.tenant_id(), cat, pc.person_id, item_type, 'covered', trim(p_item_label),
    jsonb_strip_nulls(jsonb_build_object('source', 'pc_add_policy_item', 'idempotency_key', p_idempotency_key))
  ) returning id into item_id;

  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
  values (app.tenant_id(), cat, ver.id, item_id, jsonb_build_object('role', item_type));

  return jsonb_build_object('outcome','saved','item_id', item_id, 'summary', 'Item added to current cover');
end $$;

grant execute on function public.pc_add_policy_item(uuid, text, text, text, text) to authenticated;
