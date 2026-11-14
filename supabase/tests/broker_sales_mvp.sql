-- B-Covered broker sales MVP acceptance test. Safe to run on the shared project: everything happens in one DO block that
-- always ends with an exception, so every row it creates is rolled back. Read the result from the final error message:
--   "ACCEPTANCE PASSED: {...}" or the first failed check.
-- Each step runs as a real Postgres role (authenticated / anon) with simulated JWT claims, so row-level security applies.

do $$
declare
  broker uuid := gen_random_uuid(); agent1 uuid := gen_random_uuid(); agent2 uuid := gen_random_uuid();
  b_email text := 'mvp.broker+' || left(broker::text, 8) || '@example.test';
  a1_email text := 'mvp.lerato+' || left(agent1::text, 8) || '@example.test';
  a2_email text := 'mvp.sipho+' || left(agent2::text, 8) || '@example.test';
  r jsonb; setup jsonb; inv1 jsonb; inv2 jsonb; a1_code text; enquiry jsonb; person uuid; grid jsonb; offer uuid; sale1 jsonb; sale2 jsonb;
  rec jsonb; n int; blocked text; live_blocked text; agent2_rows int;
begin
  -- Test identities (auth trigger creates app_users).
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (broker, b_email, jsonb_build_object('full_name', 'Bongani Mvp', 'brokerage_name', 'MVP Test Brokers'), 'authenticated', 'authenticated'),
    (agent1, a1_email, jsonb_build_object('full_name', 'Lerato Agent'), 'authenticated', 'authenticated'),
    (agent2, a2_email, jsonb_build_object('full_name', 'Sipho Agent'), 'authenticated', 'authenticated');

  -- 1. The broker signs up and opens their workspace (Sample works before activation).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', broker, 'email', b_email, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);
  set local role authenticated;
  setup := public.sales_setup_workspace(null, null, '082 000 0001', 'Johannesburg');
  if setup ->> 'outcome' <> 'saved' or (setup -> 'member' ->> 'role') <> 'broker' then raise exception 'setup failed: %', setup; end if;
  r := public.sales_setup_workspace();
  if not (r ->> 'reopened')::boolean or (r -> 'member' ->> 'referral_code') <> (setup -> 'member' ->> 'referral_code') then
    raise exception 'repeat setup should reopen the same workspace: %', r;
  end if;

  -- Live is blocked until B-Covered activates the brokerage.
  perform set_config('request.headers', '{"x-data-category":"live"}', true);
  begin
    perform public.sales_capture_enquiry('live', 'Live', 'Blocked', 'live-key-0001');
    live_blocked := 'NOT BLOCKED';
  exception when others then get stacked diagnostics live_blocked = pg_exception_detail; live_blocked := sqlerrm || ': ' || live_blocked;
  end;
  if live_blocked = 'NOT BLOCKED' then raise exception 'Live write should be blocked before activation'; end if;
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);

  -- 2. The broker invites two agents; a repeat invite returns the same member.
  inv1 := public.sales_invite_member('sample', 'Lerato Agent', 'agent', 'mvp-invite-0001', a1_email, null, 'Benoni');
  inv2 := public.sales_invite_member('sample', 'Sipho Agent', 'agent', 'mvp-invite-0002', a2_email);
  r := public.sales_invite_member('sample', 'Lerato Agent', 'agent', 'mvp-invite-0003', a1_email);
  if (r -> 'member' ->> 'member_id') <> (inv1 -> 'member' ->> 'member_id') or not (r ->> 'existing')::boolean then
    raise exception 'repeat invite should return the existing member: %', r;
  end if;
  a1_code := inv1 -> 'member' ->> 'referral_code';
  if inv1 ->> 'invite_path' is null then raise exception 'invite link missing: %', inv1; end if;

  -- The agents accept their private team invitations.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', agent1, 'email', a1_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.sales_accept_invitation(substr(inv1 ->> 'invite_path', length('/team/join/') + 1));
  if (r -> 'member' ->> 'status') <> 'active' then raise exception 'agent 1 did not join: %', r; end if;
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', agent2, 'email', a2_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.sales_accept_invitation(substr(inv2 ->> 'invite_path', length('/team/join/') + 1));

  -- 3. A customer opens the agent's referral link and submits an enquiry (anonymous).
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := public.referral_resolve(a1_code);
  if not (r ->> 'valid')::boolean or r ->> 'referrer_name' <> 'Lerato A.' then raise exception 'referral code did not resolve: %', r; end if;
  r := public.referral_resolve('NOPE-0000');
  if (r ->> 'valid')::boolean then raise exception 'invalid code resolved'; end if;
  enquiry := public.referral_submit_enquiry(a1_code, 'Thandi', 'Customer', '083 555 0101', 'thandi@example.test', 'Motor cover', null, true,
    'link:mvp-enquiry-0001', 'sample');
  if not (enquiry ->> 'ok')::boolean then raise exception 'enquiry failed: %', enquiry; end if;

  -- 4. The enquiry is in the agent's grid and in the broker's team view.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', agent1, 'email', a1_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  grid := public.sales_book_grid('sample', 'mine');
  if jsonb_array_length(grid -> 'rows') <> 1 or (grid -> 'rows' -> 0 ->> 'stage') <> 'new_enquiry' then raise exception 'agent grid wrong: %', grid; end if;
  person := (grid -> 'rows' -> 0 ->> 'id')::uuid;

  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', broker, 'email', b_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  grid := public.sales_book_grid('sample', 'team');
  select count(*) into n from jsonb_array_elements(grid -> 'rows') x where (x ->> 'id')::uuid = person
    and x -> 'referred_by' ->> 'referral_code' = a1_code and x -> 'assigned' ->> 'name' = 'Lerato Agent';
  if n <> 1 then raise exception 'broker team view missing the enquiry: %', grid; end if;

  -- 5. The agent logs a call, shares an offer, records acceptance and then the sale (twice).
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', agent1, 'email', a1_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.sales_log_communication('sample', person, 'call', 'Discussed motor cover for a 2021 Polo', 'mvp-call-0001', 'outbound');
  r := public.sales_create_offer('sample', person, 'mvp-offer-0001', null, 'Santam', 'motor', 865.50, 'monthly');
  if r ->> 'outcome' <> 'saved' then raise exception 'offer not created: %', r; end if;
  offer := (r ->> 'id')::uuid;
  perform public.sales_log_share_opened('sample', offer, 'mvp-open-0001', 'whatsapp');
  perform public.sales_mark_offer_sent('sample', offer, 'mvp-sent-0001', 'whatsapp');
  perform public.sales_record_acceptance('sample', offer, 'mvp-accept-0001');
  sale1 := public.sales_record_sale('sample', offer, 'mvp-sale-0001', 'SAN-MV-778812', current_date + 1);
  sale2 := public.sales_record_sale('sample', offer, 'mvp-sale-0002', 'SAN-MV-778812', current_date + 1);
  if not (sale2 ->> 'already_recorded')::boolean or (sale1 ->> 'reference') <> (sale2 ->> 'reference') then
    raise exception 'second sale click must not create another sale: % / %', sale1, sale2;
  end if;
  reset role;
  select count(*) into n from sales_records where offer_id = offer;
  if n <> 1 then raise exception 'expected exactly one sale, found %', n; end if;

  -- 6. The broker opens one client record and sees the whole story.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', broker, 'email', b_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rec := public.sales_client_record('sample', person);
  if rec ->> 'client_number' is null or rec ->> 'contact_stage' <> 'client'
     or rec -> 'referred_by' ->> 'referral_code' <> a1_code or rec -> 'assigned' ->> 'name' <> 'Lerato Agent'
     or jsonb_array_length(rec -> 'communications') < 4
     or rec -> 'offers' -> 0 ->> 'status' <> 'sold' or rec -> 'offers' -> 0 ->> 'accepted_at' is null
     or rec -> 'sales' -> 0 ->> 'insurer_reference' <> 'SAN-MV-778812' then
    raise exception 'broker record incomplete: %', rec;
  end if;

  -- 7. Another agent in the same brokerage cannot open the client by guessing the record id.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', agent2, 'email', a2_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.sales_client_record('sample', person);
    blocked := 'OPENED';
  exception when others then blocked := sqlerrm;
  end;
  select count(*) into agent2_rows from persons where id = person;
  if blocked <> 'not_found' or agent2_rows <> 0 then raise exception 'agent 2 could see the client (% / % rows)', blocked, agent2_rows; end if;
  reset role;

  raise exception 'ACCEPTANCE PASSED: %', jsonb_build_object(
    'brokerage', setup -> 'brokerage' ->> 'name', 'broker_code', setup -> 'member' ->> 'referral_code', 'agent_code', a1_code,
    'enquiry', enquiry ->> 'reference', 'client_number', rec ->> 'client_number', 'offer', rec -> 'offers' -> 0 ->> 'reference',
    'sale', rec -> 'sales' -> 0 ->> 'reference', 'communications', jsonb_array_length(rec -> 'communications'),
    'live_before_activation', live_blocked, 'agent2', blocked);
end $$;
