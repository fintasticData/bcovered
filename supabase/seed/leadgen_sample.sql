-- Sample data for Russ "Generate leads" (BCovered brokerage, Sample category). Every business, email, address and source
-- page below is fictional: emails use the reserved .example domain and sources point at example.com. Prospects carry
-- is_sample = true and the UI labels them "Sample data". Safe to re-run: fixed ids, on conflict do nothing.
-- Apply after 20261115_0025_russ_lead_generation.sql.

begin;

insert into jobs (id, tenant_id, workflow_type, agent, status, inputs, outputs, idempotency_key, attempt, started_at, completed_at, data_category, created_at, updated_at)
values ('d2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'lead_generation', 'russ', 'completed',
  jsonb_build_object(
    'prompt', 'Sample data: find 5 motor repair workshops within 10 km of Carnival City, Brakpan, with public business emails, for commercial property cover.',
    'filters', jsonb_build_object('area', 'Carnival City, Brakpan', 'radius_km', 10, 'business_function', 'Vehicle repair', 'category', 'Workshop',
      'industry', 'Automotive', 'cover_type', 'Commercial property', 'requested_count', 5),
    'budget', jsonb_build_object('max_seconds', 300, 'max_searches', 10, 'max_page_fetches', 80, 'max_cost_usd', 0.75)),
  jsonb_build_object(
    'phase', 'done',
    'stop_reason', 'budget_exhausted',
    'summary', '3 of 5 found with published emails. Stopped because the search budget (time, searches, page reads or cost) ran out. Sample data.',
    'area_summary', 'Sample data: a fictional summary showing how Russ separates area-wide findings from facts about individual businesses.',
    'localities', jsonb_build_array('Carnival City', 'Brakpan', 'Dalpark', 'Van Eck Park', 'Brakpan Central'),
    'area_findings', jsonb_build_array(
      jsonb_build_object('finding', 'Sample data: light-industrial parks near Carnival City list several multi-bay workshop units to let.',
        'relevance_to_cover', 'Workshops in leased industrial units need cover for their buildings or tenant improvements, equipment and stock.',
        'source_url', 'https://example.com/sample/brakpan-industrial-listings', 'published_on', '2026-09-01'),
      jsonb_build_object('finding', 'Sample data: a local news report describes storm damage to roofs in the East Rand during spring.',
        'relevance_to_cover', 'Storm and hail damage to premises is a core commercial property peril for this area.',
        'source_url', 'https://example.com/sample/east-rand-storm-report', 'published_on', '2026-10-12'),
      jsonb_build_object('finding', 'Sample data: a municipal notice lists planned electricity maintenance in Dalpark.',
        'relevance_to_cover', 'Power interruptions raise the importance of power surge and business interruption extensions.',
        'source_url', 'https://example.com/sample/dalpark-maintenance-notice', 'published_on', null)),
    'rejected', jsonb_build_array(
      jsonb_build_object('business_name', 'Sample Mobile Mechanics', 'reason', 'No email is published on its pages', 'url', 'https://example.com/sample/mobile-mechanics'),
      jsonb_build_object('business_name', 'Sample Tyre Depot', 'reason', 'Does not match the requested business function or area', 'url', 'https://example.com/sample/tyre-depot')),
    'progress', jsonb_build_object('found', 3, 'requested', 5, 'searches_used', 10, 'pages_fetched', 41, 'candidates_checked', 9,
      'cost_usd', 0, 'elapsed_ms', 0, 'step', 'Finished')),
  'sample-leadgen-carnival-city', 1, now() - interval '2 days', now() - interval '2 days', 'sample', now() - interval '2 days', now() - interval '2 days')
on conflict (id) do nothing;

insert into job_steps (id, tenant_id, job_id, seq, key, agent, name, status, started_at, completed_at) values
  ('d2000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 1, 'area_research', 'russ', 'Research the area and cover opportunity', 'completed', now() - interval '2 days', now() - interval '2 days'),
  ('d2000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 2, 'find_businesses', 'russ', 'Find businesses with published emails', 'completed', now() - interval '2 days', now() - interval '2 days'),
  ('d2000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 3, 'finalise', 'russ', 'Summarise the run', 'completed', now() - interval '2 days', now() - interval '2 days')
on conflict (id) do nothing;

with biz(n, name, email, website, area, address, fn, quote) as (values
  (1, 'Dalpark Panel & Mechanical (Sample)', 'info@dalpark-panel.example', 'https://dalpark-panel.example/', 'Dalpark',
   '14 Sample Street, Dalpark, Brakpan', 'Panel beating and mechanical repairs',
   'Sample data: full panel beating, spray painting and mechanical repairs from our Dalpark workshop'),
  (2, 'Brakpan Auto Body Works (Sample)', 'workshop@brakpan-autobody.example', 'https://brakpan-autobody.example/', 'Brakpan Central',
   '7 Example Avenue, Brakpan Central', 'Vehicle body repairs',
   'Sample data: accident repairs and on-site vehicle body work at our Brakpan Central premises'),
  (3, 'Van Eck Park Diesel & Gearbox (Sample)', 'service@vaneck-diesel.example', 'https://vaneck-diesel.example/', 'Van Eck Park',
   'Unit 3, Sample Industrial Park, Van Eck Park, Brakpan', 'Diesel and gearbox repairs',
   'Sample data: diesel engine and gearbox overhauls for light commercial vehicles in our Van Eck Park workshop')
),
c as (
  insert into customers (id, tenant_id, customer_type, full_name, email, region, status, is_synthetic, data_origin, data_category, source_system, source_ref)
  select ('d2000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001', 'commercial', name, email, area,
         'prospect', true, 'demo', 'sample', 'russ_research', ('d2000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))
  from biz
  on conflict (id) do nothing
  returning id
),
p as (
  insert into lead_prospects (id, tenant_id, data_category, customer_id, business_name, email, website, address, area, industry, business_function,
    category, research, evidence, is_sample, first_job_id, last_job_id)
  select ('d2000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001', 'sample',
         ('d2000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, name, email, website, address, area, 'Automotive', fn, 'Workshop',
         jsonb_build_object('observed_activity', quote, 'location_quote', address, 'assets', 'unknown', 'current_insurance', 'unknown',
           'purchasing_intent', 'unknown', 'candidate_source_url', 'https://example.com/sample/directory'),
         jsonb_build_array(jsonb_build_object('email_source_url', website || 'contact', 'location_source_url', website || 'contact',
           'activity_source_url', website, 'retrieved_at', (now() - interval '2 days')::text, 'activity_quote', quote,
           'location_basis', 'locality_match', 'job_id', 'd2000000-0000-4000-8000-000000000001')),
         true, 'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'
  from biz
  on conflict do nothing
  returning id
)
select (select count(*) from c) customers, (select count(*) from p) prospects;

with biz(n, fit) as (values
  (1, 'The workshop advertises panel beating and spray painting from its own premises, so the building, spray booth and customer vehicles on site are exposed to fire and storm damage.'),
  (2, 'It advertises on-site body work at a fixed premises, so equipment, stock of parts and the building itself are the main property exposures.'),
  (3, 'The workshop overhauls engines and gearboxes in a leased industrial unit, so tenant improvements, machinery and customer vehicles need property cover.')
),
l as (
  insert into leads (id, tenant_id, customer_id, line, product_category, status, qualification, missing_info, source, data_category, prospect_id, source_job_id, created_at, updated_at)
  select ('d2000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001',
         ('d2000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'commercial', 'Commercial property', 'new',
         jsonb_build_object('summary', fit, 'prospect_id', ('d2000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0')), 'job_id', 'd2000000-0000-4000-8000-000000000001'),
         '["Contact person","Assets and sums insured","Current insurance"]'::jsonb, 'russ_research', 'sample',
         ('d2000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'd2000000-0000-4000-8000-000000000001',
         now() - interval '2 days', now() - interval '2 days'
  from biz
  on conflict do nothing
  returning id
),
m as (
  insert into lead_prospect_matches (id, tenant_id, data_category, job_id, prospect_id, lead_id, cover_type, cover_fit, evidence, retrieved_at, created_at)
  select ('d2000000-0000-4000-8000-0000000005' || lpad(biz.n::text, 2, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001', 'sample',
         'd2000000-0000-4000-8000-000000000001', p.id, ('d2000000-0000-4000-8000-0000000004' || lpad(biz.n::text, 2, '0'))::uuid,
         'Commercial property', biz.fit, (p.evidence -> 0) || jsonb_build_object('research', p.research), now() - interval '2 days', now() - interval '2 days'
  from biz join lead_prospects p on p.id = ('d2000000-0000-4000-8000-0000000003' || lpad(biz.n::text, 2, '0'))::uuid
  on conflict do nothing
  returning id
)
select (select count(*) from l) leads, (select count(*) from m) matches;

commit;
