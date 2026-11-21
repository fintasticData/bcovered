-- Bridge leads into Customer Area: ensure every lead customer has a person
-- (Customers tab) or business_profile (Businesses tab). Russ leadgen creates
-- the same records going forward; existing orphans are backfilled.

create or replace function app.map_lead_industry(p_industry text, p_function text default null)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_industry, '') || ' ' || coalesce(p_function, '')));
begin
  if v ~ 'restaurant|hospitality|café|cafe|bistro|takeaway|diner|catering|pizzeria|shisanyama' then
    return 'restaurants_hospitality';
  end if;
  if v ~ 'manufactur|factory|fabricat' then return 'manufacturing'; end if;
  if v ~ 'retail|shop|store|spares|parts' then return 'retail'; end if;
  if v ~ 'transport|logistics|fleet|courier|haulage' then return 'transport_logistics'; end if;
  if v ~ 'construct|builder|building|panelbeat|body.?repair' then return 'construction'; end if;
  if v ~ 'propert|landlord|real.?estate' then return 'property_owners'; end if;
  if v ~ 'technolog|software|it\y|saas' then return 'technology'; end if;
  if v ~ 'wholesale|distribut' then return 'wholesale_distribution'; end if;
  if v ~ 'school|education|training|college' then return 'education'; end if;
  if v ~ 'clinic|hospital|medical|dental|healthcare' then return 'healthcare_practices'; end if;
  if v ~ 'security|guard' then return 'security_services'; end if;
  if v ~ 'hotel|tourism|guest.?house|lodge' then return 'tourism'; end if;
  if v ~ 'farm|agricultur|vineyard' then return 'agriculture'; end if;
  if v ~ 'vehicle|auto|motor|garage|workshop|repair|service.?centre|service.?center|panel' then
    return 'retail';
  end if;
  return 'professional_services';
end;
$$;

revoke all on function app.map_lead_industry(text, text) from public, anon, authenticated;

-- Ensure Customer Area records exist for a CRM customer that already has leads.
create or replace function app.ensure_customer_area_for_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c customers;
  bp business_profiles;
  pr persons;
  v_first text;
  v_surname text;
  v_name text;
  v_industry text;
  v_regions jsonb;
  v_prospect lead_prospects;
  parts text[];
  n int;
begin
  select * into c from customers where id = p_customer_id;
  if c.id is null then
    raise exception using message = 'not_found', detail = 'That customer account was not found.';
  end if;

  if c.customer_type = 'commercial' then
    select * into bp from business_profiles
     where customer_id = c.id and data_category = c.data_category
     order by created_at
     limit 1;

    if bp.id is null then
      select * into v_prospect from lead_prospects
       where customer_id = c.id
       order by updated_at desc nulls last, created_at desc
       limit 1;

      v_name := coalesce(nullif(trim(c.full_name), ''), nullif(trim(v_prospect.business_name), ''), 'Business');
      v_industry := app.map_lead_industry(coalesce(v_prospect.industry, ''), coalesce(v_prospect.business_function, ''));
      if not exists (select 1 from industry_risk_templates where key = v_industry and is_active) then
        v_industry := 'professional_services';
      end if;
      v_regions := case
        when coalesce(nullif(trim(c.region), ''), nullif(trim(v_prospect.area), '')) is not null
          then jsonb_build_array(coalesce(nullif(trim(c.region), ''), trim(v_prospect.area)))
        else '[]'::jsonb
      end;

      insert into business_profiles (
        tenant_id, customer_id, registered_name, trading_name, industry_key, activities_summary,
        operating_regions, primary_contact, field_sources, missing_info, status,
        assigned_broker_id, is_synthetic, created_by, data_category
      ) values (
        c.tenant_id, c.id, v_name, coalesce(nullif(trim(v_prospect.business_name), ''), v_name), v_industry,
        coalesce(
          nullif(trim(v_prospect.business_function), ''),
          'Commercial prospect captured as a lead.'
        ),
        v_regions,
        case
          when c.email is not null or c.phone is not null then
            jsonb_build_object(
              'full_name', null,
              'email', c.email,
              'phone', c.phone,
              'role', 'Contact'
            )
          else null
        end,
        jsonb_build_object(
          'registered_name', 'declared',
          'trading_name', 'declared',
          'industry_key', 'inferred',
          'operating_regions', case when v_regions = '[]'::jsonb then 'missing' else 'declared' end
        ),
        jsonb_build_array('Contact person', 'Company registration number', 'Assets and sums insured', 'Current insurance'),
        'discovery',
        c.created_by,
        coalesce(c.is_synthetic, c.data_category = 'sample'),
        c.created_by,
        c.data_category
      )
      returning * into bp;
    end if;

    insert into business_roles (tenant_id, data_category, customer_id, role)
    values (c.tenant_id, c.data_category, c.id, 'commercial_client')
    on conflict (tenant_id, data_category, customer_id, role) do nothing;

    return jsonb_build_object(
      'customer_id', c.id,
      'kind', 'business',
      'person_id', null,
      'business_profile_id', bp.id,
      'open_path', '/broker/customers/businesses/' || bp.id
    );
  end if;

  -- Personal: person + customer_persons (Customer Area → Customers)
  select p.* into pr
    from persons p
    join customer_persons cp on cp.person_id = p.id and cp.effective_to is null
   where cp.customer_id = c.id and cp.data_category = c.data_category
   order by cp.is_primary desc, cp.created_at
   limit 1;

  if pr.id is null then
    v_name := trim(coalesce(c.full_name, ''));
    if v_name = '' then v_name := 'Prospect'; end if;
    parts := regexp_split_to_array(v_name, '\s+');
    n := coalesce(array_length(parts, 1), 1);
    if n <= 1 then
      v_first := v_name;
      v_surname := '—';
    else
      v_surname := parts[n];
      v_first := array_to_string(parts[1:n - 1], ' ');
    end if;

    insert into persons (
      tenant_id, first_names, surname, is_synthetic, data_category,
      assigned_member_id, contact_stage
    ) values (
      c.tenant_id, v_first, v_surname, coalesce(c.is_synthetic, c.data_category = 'sample'), c.data_category,
      c.assigned_member_id, 'prospect'
    )
    returning * into pr;

    insert into customer_persons (
      tenant_id, customer_id, person_id, role, is_primary, data_category
    ) values (
      c.tenant_id, c.id, pr.id, 'self', true, c.data_category
    );
  end if;

  return jsonb_build_object(
    'customer_id', c.id,
    'kind', 'person',
    'person_id', pr.id,
    'business_profile_id', null,
    'open_path', '/broker/customers/people/' || pr.id
  );
end;
$$;

revoke all on function app.ensure_customer_area_for_customer(uuid) from public, anon;
grant execute on function app.ensure_customer_area_for_customer(uuid) to authenticated, service_role;

-- Public helper: resolve Customer Area path for a lead (UI deep-link).
create or replace function public.lead_customer_area_link(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l leads;
  link jsonb;
begin
  if auth.uid() is null then
    raise exception using message = 'forbidden', detail = 'Sign in required.';
  end if;
  select * into l from leads where id = p_lead_id;
  if l.id is null then
    raise exception using message = 'not_found', detail = 'That lead was not found.';
  end if;
  if l.tenant_id is distinct from app.tenant_id() then
    raise exception using message = 'forbidden', detail = 'That lead is not in this brokerage.';
  end if;
  link := app.ensure_customer_area_for_customer(l.customer_id);
  return link || jsonb_build_object('lead_id', l.id);
end;
$$;

revoke all on function public.lead_customer_area_link(uuid) from public, anon;
grant execute on function public.lead_customer_area_link(uuid) to authenticated;

-- Russ / Copilot lead inserts also open Customer Area business records.
create or replace function public.leadgen_save_lead(p_category text, p_job_id uuid, p_lead jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  t uuid := sales_guard(p_category, true);
  j jobs; p lead_prospects; c customers; l leads; m lead_prospect_matches;
  v_email text := lower(trim(coalesce(p_lead ->> 'email', '')));
  v_cover text;
  v_sample boolean := coalesce((p_lead ->> 'is_sample')::boolean, false);
  v_evidence jsonb := jsonb_build_object(
    'email_source_url', p_lead ->> 'email_source_url', 'location_source_url', p_lead ->> 'location_source_url',
    'activity_source_url', p_lead ->> 'activity_source_url', 'retrieved_at', p_lead ->> 'retrieved_at',
    'activity_quote', p_lead ->> 'activity_quote', 'location_basis', p_lead ->> 'location_basis', 'job_id', p_job_id);
  was_new boolean := false;
  area_link jsonb;
begin
  select * into j from jobs where id = p_job_id and workflow_type = 'lead_generation';
  if j.id is null then raise exception using message = 'not_found', detail = 'That lead search is not available in this category.'; end if;
  v_cover := coalesce(nullif(trim(j.inputs -> 'filters' ->> 'cover_type'), ''), 'Commercial property');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception using message = 'validation', detail = 'A published email is required.'; end if;
  if coalesce(trim(p_lead ->> 'business_name'), '') = '' or coalesce(trim(p_lead ->> 'area'), '') = '' then
    raise exception using message = 'validation', detail = 'Business name and area are required.';
  end if;
  if coalesce(p_lead ->> 'email_source_url', '') !~ '^https?://' then
    raise exception using message = 'validation', detail = 'The page showing the email is required.';
  end if;

  insert into lead_prospects (tenant_id, data_category, business_name, email, website, phone, address, area, industry,
    business_function, category, research, evidence, is_sample, first_job_id, last_job_id)
  values (t, p_category, trim(p_lead ->> 'business_name'), v_email, p_lead ->> 'website', p_lead ->> 'phone', p_lead ->> 'address',
    trim(p_lead ->> 'area'), p_lead ->> 'industry', p_lead ->> 'business_function', p_lead ->> 'category',
    coalesce(p_lead -> 'research', '{}'::jsonb), jsonb_build_array(v_evidence), v_sample, p_job_id, p_job_id)
  on conflict (tenant_id, data_category, email_normalised) do nothing
  returning * into p;
  if p.id is not null then
    was_new := true;
  else
    update lead_prospects x set
      last_job_id = p_job_id,
      research = x.research || coalesce(p_lead -> 'research', '{}'::jsonb),
      evidence = case when x.evidence @> jsonb_build_array(jsonb_build_object('job_id', p_job_id)) then x.evidence else x.evidence || jsonb_build_array(v_evidence) end,
      address = coalesce(x.address, p_lead ->> 'address'), website = coalesce(x.website, p_lead ->> 'website'),
      phone = coalesce(x.phone, p_lead ->> 'phone'), industry = coalesce(x.industry, p_lead ->> 'industry'),
      business_function = coalesce(x.business_function, p_lead ->> 'business_function'), category = coalesce(x.category, p_lead ->> 'category'),
      updated_at = now()
    where x.tenant_id = t and x.data_category = p_category and x.email_normalised = v_email
    returning * into p;
  end if;

  if p.customer_id is null then
    insert into customers (tenant_id, customer_type, full_name, email, phone, region, status, is_synthetic, created_by, data_origin,
      data_category, source_system, source_ref)
    values (t, 'commercial', p.business_name, p.email, p.phone, p.area, 'prospect', v_sample, auth.uid(),
      case p_category when 'sample' then 'demo' else 'live' end, p_category, 'russ_research', p.id::text)
    returning * into c;
    update lead_prospects set customer_id = c.id where id = p.id;
    p.customer_id := c.id;
  end if;

  insert into leads (tenant_id, customer_id, line, product_category, status, urgency, qualification, missing_info, source,
    created_by, data_category, prospect_id, source_job_id)
  values (t, p.customer_id, 'commercial', v_cover, 'lead', null,
    jsonb_build_object('summary', p_lead ->> 'cover_fit', 'prospect_id', p.id, 'job_id', p_job_id, 'area', p.area,
      'industry', p.industry, 'business_function', p.business_function, 'email', p.email),
    '["Contact person","Assets and sums insured","Current insurance"]'::jsonb, 'russ_research', auth.uid(), p_category, p.id, p_job_id)
  on conflict (prospect_id, product_category) where prospect_id is not null do nothing
  returning * into l;
  if l.id is null then select * into l from leads where prospect_id = p.id and product_category = v_cover; end if;

  insert into lead_prospect_matches (tenant_id, data_category, job_id, prospect_id, lead_id, cover_type, cover_fit, evidence, retrieved_at)
  values (t, p_category, p_job_id, p.id, l.id, v_cover, coalesce(nullif(trim(p_lead ->> 'cover_fit'), ''), 'Matched the search filters'),
    v_evidence || jsonb_build_object('research', coalesce(p_lead -> 'research', '{}'::jsonb)),
    coalesce((p_lead ->> 'retrieved_at')::timestamptz, now()))
  on conflict (job_id, prospect_id) do nothing
  returning * into m;

  area_link := app.ensure_customer_area_for_customer(p.customer_id);

  return jsonb_build_object('prospect_id', p.id, 'lead_id', l.id, 'customer_id', p.customer_id,
    'was_new', was_new, 'match_saved', m.id is not null,
    'business_profile_id', area_link ->> 'business_profile_id',
    'open_path', area_link ->> 'open_path');
end $function$;

-- Backfill every customer that already has a lead but no Customer Area row.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct c.id
      from customers c
      join leads l on l.customer_id = c.id
     where (
       c.customer_type = 'commercial'
       and not exists (
         select 1 from business_profiles bp
          where bp.customer_id = c.id and bp.data_category = c.data_category
       )
     ) or (
       c.customer_type = 'personal'
       and not exists (
         select 1 from customer_persons cp
          where cp.customer_id = c.id and cp.effective_to is null and cp.data_category = c.data_category
       )
     )
  loop
    perform app.ensure_customer_area_for_customer(r.id);
    n := n + 1;
  end loop;
  raise notice 'lead_customer_area_bridge backfilled % customers', n;
end $$;
