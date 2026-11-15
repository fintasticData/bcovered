-- Russ "Generate leads" acceptance test (migration 0025). Safe to run on the shared project: one DO block that always ends
-- with an exception, so every row it creates is rolled back. Read the result from the final error message:
--   "ACCEPTANCE PASSED: {...}" or the first failed check.
-- Each step runs as the authenticated role with simulated JWT claims, so row-level security applies.
--
-- Story: a new brokerage (still onboarding, so Sample only) runs a lead search, saves a business twice (replay), runs a
-- second search for a different cover type that finds the same business, and checks dedupe, per-run matches, the lease,
-- cancellation, the Live block and that another brokerage sees none of it.

do $$
declare
  owner uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  o_email text := 'lg.owner+' || left(owner::text, 8) || '@example.test';
  x_email text := 'lg.other+' || left(other::text, 8) || '@example.test';
  filters jsonb := '{"area":"Carnival City, Brakpan","radius_km":10,"business_function":"Vehicle repair","category":"Workshop","industry":"Automotive","cover_type":"Commercial property","requested_count":5}';
  lead jsonb := jsonb_build_object('business_name', 'Test Panel Works', 'email', 'Info@TestPanel.example', 'area', 'Dalpark',
    'address', '1 Test Road, Dalpark', 'website', 'https://testpanel.example/', 'business_function', 'Panel beating', 'industry', 'Automotive',
    'cover_fit', 'Advertises spray painting from its own premises.', 'email_source_url', 'https://testpanel.example/contact',
    'location_source_url', 'https://testpanel.example/contact', 'activity_source_url', 'https://testpanel.example/',
    'activity_quote', 'spray painting from our Dalpark workshop', 'location_basis', 'locality_match', 'retrieved_at', now()::text,
    'research', jsonb_build_object('assets', 'unknown', 'current_insurance', 'unknown', 'purchasing_intent', 'unknown'));
  run1 jsonb; run2 jsonb; again jsonb; s1 jsonb; s2 jsonb; s3 jsonb; c jsonb; got jsonb; blocked text; n int; m int; l int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (owner, o_email, jsonb_build_object('full_name', 'Lead Owner', 'brokerage_name', 'Lead Test Brokers'), 'authenticated', 'authenticated'),
    (other, x_email, jsonb_build_object('full_name', 'Other Owner', 'brokerage_name', 'Other Test Brokers'), 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'email', o_email, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);
  set local role authenticated;
  perform public.sales_setup_workspace();

  -- 1. Create a run; the same idempotency key returns the same run.
  run1 := public.leadgen_create_run('sample', 'Find workshops', filters, '{"max_seconds":300}', 'lg-test-run-1');
  again := public.leadgen_create_run('sample', 'Find workshops', filters, '{"max_seconds":300}', 'lg-test-run-1');
  if run1 ->> 'id' is null or again ->> 'id' <> run1 ->> 'id' then raise exception 'idempotent create failed: % / %', run1, again; end if;
  if run1 -> 'inputs' -> 'filters' ->> 'business_function' <> 'Vehicle repair' then raise exception 'filters not stored once on the run: %', run1; end if;

  -- 2. The lease: one worker at a time.
  c := public.leadgen_claim('sample', (run1 ->> 'id')::uuid, 'worker-a', 90);
  if not (c ->> 'claimed')::boolean then raise exception 'first claim should succeed: %', c; end if;
  c := public.leadgen_claim('sample', (run1 ->> 'id')::uuid, 'worker-b', 90);
  if (c ->> 'claimed')::boolean then raise exception 'a second worker must not claim a leased run'; end if;
  begin
    perform public.leadgen_update_run('sample', (run1 ->> 'id')::uuid, 'worker-b', '{"x":1}');
    raise exception 'update by a worker without the lease should fail';
  exception when others then
    if sqlerrm <> 'conflict' then raise; end if;
  end;

  -- 3. Save a business; a replay writes nothing twice.
  s1 := public.leadgen_save_lead('sample', (run1 ->> 'id')::uuid, lead);
  s2 := public.leadgen_save_lead('sample', (run1 ->> 'id')::uuid, lead);
  if not (s1 ->> 'was_new')::boolean or not (s1 ->> 'match_saved')::boolean then raise exception 'first save should be new: %', s1; end if;
  if (s2 ->> 'match_saved')::boolean or s2 ->> 'lead_id' <> s1 ->> 'lead_id' or s2 ->> 'prospect_id' <> s1 ->> 'prospect_id' then
    raise exception 'replayed save should return the same ids without a new match: %', s2;
  end if;
  begin
    perform public.leadgen_save_lead('sample', (run1 ->> 'id')::uuid, lead - 'email_source_url');
    raise exception 'a lead without the page showing its email must be refused';
  exception when others then
    if sqlerrm <> 'validation' then raise; end if;
  end;

  -- 4. A second search for a different cover type finds the same business: one prospect, a new lead and a new match.
  run2 := public.leadgen_create_run('sample', 'Find workshops for liability', jsonb_set(filters, '{cover_type}', '"Public liability"'), '{}', 'lg-test-run-2');
  s3 := public.leadgen_save_lead('sample', (run2 ->> 'id')::uuid, lead || jsonb_build_object('email', 'info@testpanel.example', 'cover_fit', 'Works on customer vehicles.'));
  if (s3 ->> 'was_new')::boolean or s3 ->> 'prospect_id' <> s1 ->> 'prospect_id' then raise exception 'same email must reuse the prospect: %', s3; end if;
  if s3 ->> 'lead_id' = s1 ->> 'lead_id' then raise exception 'a different cover type needs its own lead'; end if;
  select count(*) into n from lead_prospects where id = (s1 ->> 'prospect_id')::uuid;
  select count(*) into m from lead_prospect_matches where prospect_id = (s1 ->> 'prospect_id')::uuid;
  select count(*) into l from leads where prospect_id = (s1 ->> 'prospect_id')::uuid;
  if n <> 1 or m <> 2 or l <> 2 then raise exception 'expected 1 prospect, 2 matches, 2 leads; got %, %, %', n, m, l; end if;
  got := public.leadgen_get_run('sample', (run2 ->> 'id')::uuid);
  if jsonb_array_length(got -> 'leads') <> 1 or got -> 'leads' -> 0 ->> 'cover_fit' <> 'Works on customer vehicles.' then
    raise exception 'run 2 should keep its own rationale: %', got -> 'leads';
  end if;

  -- 5. Cancel an idle run: it stops at once.
  got := public.leadgen_cancel_run('sample', (run2 ->> 'id')::uuid);
  if got ->> 'status' <> 'cancelled' or got -> 'outputs' ->> 'stop_reason' <> 'cancelled' then raise exception 'idle run should cancel at once: %', got; end if;

  -- 6. Live waits for activation.
  perform set_config('request.headers', '{"x-data-category":"live"}', true);
  begin
    perform public.leadgen_create_run('live', 'Live search', filters, '{}', 'lg-test-live');
    blocked := 'no';
  exception when others then
    blocked := sqlerrm;
  end;
  if blocked <> 'forbidden' then raise exception 'Live runs must wait for activation, got %', blocked; end if;

  -- 7. Another brokerage sees none of it.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', other, 'email', x_email, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);
  set local role authenticated;
  perform public.sales_setup_workspace();
  select count(*) into n from lead_prospects where email_normalised = 'info@testpanel.example';
  select count(*) into m from jobs where id = (run1 ->> 'id')::uuid;
  if n <> 0 or m <> 0 then raise exception 'another brokerage can see the search (% prospects, % jobs)', n, m; end if;
  begin
    perform public.leadgen_get_run('sample', (run1 ->> 'id')::uuid);
    raise exception 'another brokerage opened the run';
  exception when others then
    if sqlerrm <> 'not_found' then raise; end if;
  end;

  reset role;
  raise exception 'ACCEPTANCE PASSED: %', jsonb_build_object('run1', run1 ->> 'id', 'run2', run2 ->> 'id', 'prospect', s1 ->> 'prospect_id',
    'leads', jsonb_build_array(s1 ->> 'lead_id', s3 ->> 'lead_id'));
end $$;
