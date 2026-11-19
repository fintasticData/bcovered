-- Create a commercial account + discovery business profile from a name (Records / MCP path for Russ).
-- Mirrors the in-browser business.create_client tool so “create a new business client” works everywhere.

create or replace function public.copilot_create_business_client(
  p_category text,
  p_name text,
  p_idempotency_key text,
  p_copilot text default 'russ',
  p_trading_name text default null,
  p_industry_key text default null,
  p_force boolean default false
) returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := copilot_guard(p_category);
  replay jsonb := copilot_replay(p_idempotency_key);
  v_name text := trim(coalesce(p_name, ''));
  v_trading text := nullif(trim(coalesce(p_trading_name, '')), '');
  v_industry text;
  c customers;
  bp business_profiles;
  entity_id uuid;
  loc_id uuid;
  dupes jsonb;
  kitchen boolean;
begin
  if replay is not null then return replay; end if;
  if length(v_name) < 2 then
    raise exception using message = 'needs_input', detail = 'Give the business name.';
  end if;

  if not p_force then
    select jsonb_agg(jsonb_build_object(
             'record_type', 'business_client',
             'id', p.id,
             'number', c.account_number,
             'name', coalesce(p.trading_name, p.registered_name),
             'detail', p.registered_name,
             'open_path', '/broker/commercial/clients/' || p.id,
             'category', p.data_category
           ))
      into dupes
      from business_profiles p
      join customers c on c.id = p.customer_id
     where p.status <> 'archived'
       and (
         similarity(coalesce(p.trading_name, p.registered_name), v_name) > 0.55
         or similarity(p.registered_name, v_name) > 0.55
         or lower(coalesce(p.trading_name, '')) = lower(v_name)
         or lower(p.registered_name) = lower(v_name)
       );
    if dupes is not null then
      return jsonb_build_object(
        'outcome', 'needs_input',
        'reason', 'possible_duplicate',
        'category', p_category,
        'summary', format('%s may already be on the system. Open the existing client or confirm this is a new business.', v_name),
        'choices', dupes
      );
    end if;
  end if;

  v_industry := coalesce(
    nullif(trim(coalesce(p_industry_key, '')), ''),
    case
      when v_name ~* '\y(burger|burgers|restaurant|restaurants|café|cafe|bistro|eatery|takeaway|diner|catering|pizzeria|shisanyama)\y'
        then 'restaurants_hospitality'
      else 'professional_services'
    end
  );
  if not exists (select 1 from industry_risk_templates where key = v_industry and is_active) then
    v_industry := 'professional_services';
  end if;
  kitchen := v_industry = 'restaurants_hospitality';
  v_trading := coalesce(v_trading, v_name);

  insert into customers (tenant_id, customer_type, full_name, status, is_synthetic, created_by, data_origin, data_category)
  values (
    t, 'commercial', v_name, 'prospect', p_category = 'sample', auth.uid(),
    case p_category when 'sample' then 'demo' else 'live' end, p_category
  )
  returning * into c;

  insert into customer_consents (tenant_id, customer_id, purpose, granted, source, notice_version, captured_at, revoked_at)
  values (t, c.id, 'processing', true, 'broker_copilot', 'privacy-2026-01', now(), null);

  insert into business_profiles (
    tenant_id, customer_id, registered_name, trading_name, industry_key, activities_summary,
    operating_regions, field_sources, missing_info, status, assigned_broker_id, is_synthetic, created_by, data_category
  ) values (
    t, c.id, v_name, v_trading, v_industry,
    case when kitchen then 'One restaurant site with a commercial kitchen.' else 'One business site.' end,
    '[]'::jsonb,
    jsonb_build_object(
      'registered_name', 'declared',
      'trading_name', 'declared',
      'registration_number', 'missing',
      'vat_number', 'missing',
      'industry_key', case when p_industry_key is null then 'inferred' else 'declared' end,
      'years_trading', 'missing',
      'annual_turnover', 'missing',
      'employee_count', 'missing',
      'operating_regions', 'missing',
      'existing_cover', 'missing',
      'loss_history', 'missing'
    ),
    jsonb_build_array(
      'Company registration number', 'VAT number', 'Years trading', 'Annual turnover', 'Employees', 'Operating regions', 'Existing cover', 'Claims history'
    ),
    'discovery', auth.uid(), p_category = 'sample', auth.uid(), p_category
  )
  returning * into bp;

  insert into business_legal_entities (tenant_id, business_profile_id, legal_name, registration_number, role, source)
  values (t, bp.id, v_name, null, 'primary', 'declared')
  returning id into entity_id;

  insert into business_locations (
    tenant_id, business_profile_id, legal_entity_id, name, suburb, city, province, occupancy, ownership,
    construction, fire_protection, security, backup_power, public_access, seating_capacity, source
  ) values (
    t, bp.id, entity_id,
    case when kitchen then 'Site 1 restaurant' else 'Site 1 site' end,
    null, null, null,
    case when kitchen then 'Restaurant with commercial kitchen' else 'Business premises' end,
    'unknown', null, '[]'::jsonb, '[]'::jsonb, null, kitchen, null, 'inferred'
  )
  returning id into loc_id;

  insert into business_activities (tenant_id, business_profile_id, location_id, kind, name, description, share_of_revenue, source)
  values
    (t, bp.id, null, 'operation',
      case when kitchen then 'Commercial kitchen food preparation' else 'Professional services operations' end,
      null, null, 'inferred'),
    (t, bp.id, loc_id, 'revenue_stream',
      case when kitchen then 'Site 1 dine-in revenue' else 'Site 1 site revenue' end,
      null, 1, 'declared');

  return copilot_log_saved(
    p_category, coalesce(p_copilot, 'russ'), 'business.create_client',
    jsonb_build_object('name', p_name, 'trading_name', p_trading_name, 'industry_key', v_industry),
    p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('table', 'customers', 'id', c.id, 'reference', c.account_number),
      jsonb_build_object('table', 'business_profiles', 'id', bp.id, 'reference', bp.registered_name)
    ),
    copilot_numbers(null, c.id, null) || jsonb_build_object(
      'record_type', 'business_client',
      'id', bp.id,
      'reference', c.account_number,
      'summary', format('Created business client %s (%s)', coalesce(bp.trading_name, bp.registered_name), c.account_number),
      'open_path', '/broker/commercial/clients/' || bp.id
    ),
    'business_profiles', bp.id
  );
end $$;

revoke all on function public.copilot_create_business_client(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.copilot_create_business_client(text, text, text, text, text, text, boolean) to authenticated;
