-- Point Russ and Copilot lead inserts at the person-first pipeline status.

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

  return jsonb_build_object('prospect_id', p.id, 'lead_id', l.id, 'customer_id', p.customer_id,
    'was_new', was_new, 'match_saved', m.id is not null);
end $function$;

create or replace function public.copilot_create_quote_request(p_category text, p_customer_id uuid, p_product_category text, p_idempotency_key text,
  p_copilot text default 'ava', p_summary text default null, p_person_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key); c customers; l leads;
begin
  if replay is not null then return replay; end if;
  select * into c from customers where id = p_customer_id;
  if c.id is null then raise exception using message = 'not_found', detail = 'That account is not available in this category.'; end if;
  if coalesce(p_product_category, '') = '' then raise exception using message = 'needs_input', detail = 'What cover is the quote for (motor, home, contents)?'; end if;
  insert into leads (tenant_id, customer_id, line, product_category, status, urgency, qualification, missing_info, source, created_by, data_category)
  values (t, c.id, case c.customer_type when 'commercial' then 'commercial' else 'personal' end, p_product_category, 'lead', 'medium',
    jsonb_build_object('summary', coalesce(p_summary, 'Quote request captured by the copilot')), '[]', coalesce(p_copilot, 'ava'), auth.uid(), p_category)
  returning * into l;
  return copilot_log_saved(p_category, p_copilot, 'quote_request.create',
    jsonb_build_object('customer_id', p_customer_id, 'product_category', p_product_category, 'summary', p_summary), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'leads', 'id', l.id)),
    copilot_numbers(p_person_id, c.id, null) || jsonb_build_object('record_type', 'quote_request', 'id', l.id, 'reference', 'Lead ' || left(l.id::text, 8),
      'summary', format('Created a %s quote request for %s', replace(p_product_category, '_', ' '), c.full_name), 'open_path', '/broker/leads/' || l.id),
    'leads', l.id);
end $$;
