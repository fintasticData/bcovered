-- B-Covered franchise channel acceptance test. Safe to run on the shared project: everything happens in one DO block that
-- always ends with an exception, so every row it creates is rolled back. Read the result from the final error message:
--   "ACCEPTANCE PASSED: {...}" or the first failed check.
-- Each step runs as a real Postgres role (authenticated / anon) with simulated JWT claims, so row-level security applies.
--
-- Story: one Sample franchisee (Benoni Motors) with two outlets. Outlet A refers to a central broker (Lerato); Outlet B sells
-- through an authorised seller (Sipho, an agent). A customer submits through Outlet A's QR link and Lerato closes it; Sipho
-- captures and closes a second enquiry at Outlet B. Then the first client is reassigned (Outlet A keeps the credit), comes
-- back through Outlet B (the new offer credits Outlet B), and the outlet manager sees customer-facing progress only.

do $$
declare
  owner uuid := gen_random_uuid(); lerato uuid := gen_random_uuid(); sipho uuid := gen_random_uuid(); thabo uuid := gen_random_uuid();
  o_email text := 'fr.owner+' || left(owner::text, 8) || '@example.test';
  l_email text := 'fr.lerato+' || left(lerato::text, 8) || '@example.test';
  s_email text := 'fr.sipho+' || left(sipho::text, 8) || '@example.test';
  t_email text := 'fr.thabo+' || left(thabo::text, 8) || '@example.test';
  r jsonb; setup jsonb; inv jsonb; owner_member uuid; lerato_member uuid; sipho_member uuid;
  a jsonb; b jsonb; seller jsonb; outlet_a uuid; outlet_b uuid; code_a text; code_b text; sipho_code text; mgr_invite text;
  enq1 jsonb; enq2 jsonb; person1 uuid; person2 uuid; e1 uuid; e2 uuid; e3 uuid; offer1 uuid; offer2 uuid; offer3 uuid;
  grid jsonb; perf jsonb; sales jsonb; attr1 jsonb; attr2 jsonb; refs jsonb; n int; blocked text; live_perf jsonb; live_sales jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (owner, o_email, jsonb_build_object('full_name', 'Bongani Owner', 'brokerage_name', 'Franchise Test Brokers'), 'authenticated', 'authenticated'),
    (lerato, l_email, jsonb_build_object('full_name', 'Lerato Central'), 'authenticated', 'authenticated'),
    (sipho, s_email, jsonb_build_object('full_name', 'Sipho Seller'), 'authenticated', 'authenticated'),
    (thabo, t_email, jsonb_build_object('full_name', 'Thabo Manager'), 'authenticated', 'authenticated');

  -- 1. The broker opens a workspace and invites a central broker (sub-broker) and an agent.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'email', o_email, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);
  set local role authenticated;
  setup := public.sales_setup_workspace();
  owner_member := (setup -> 'member' ->> 'member_id')::uuid;
  inv := public.sales_invite_member('sample', 'Lerato Central', 'sub_broker', 'fr-inv-l', l_email);
  lerato_member := (inv -> 'member' ->> 'member_id')::uuid;
  r := public.sales_invite_member('sample', 'Sipho Seller', 'agent', 'fr-inv-s', s_email);
  sipho_member := (r -> 'member' ->> 'member_id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', lerato, 'email', l_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.sales_accept_invitation(substr(inv ->> 'invite_path', length('/team/join/') + 1));
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sipho, 'email', s_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.sales_accept_invitation(substr(r ->> 'invite_path', length('/team/join/') + 1));

  -- 2. Russ-style one-step setup: franchisee + Outlet A routed to Lerato, with an outlet manager; then Outlet B in sell mode.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'email', o_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  a := public.franchise_setup('sample', 'Benoni Motors', 'fr-setup-a', 'Benoni outlet', 'Benoni', null, 'Lerato', 'refer',
    'Thabo Manager', t_email, '082 000 1111', null, 'russ');
  if a ->> 'outcome' <> 'saved' or not (a ->> 'created_partner')::boolean or a -> 'outlet' -> 'receiving' ->> 'name' <> 'Lerato Central' then
    raise exception 'franchise setup failed: %', a;
  end if;
  r := public.franchise_setup('sample', 'Benoni Motors', 'fr-setup-a-again', 'Benoni outlet', null, null, 'Lerato');
  if (r ->> 'created_partner')::boolean or (r ->> 'created_outlet')::boolean or r ->> 'id' <> a ->> 'id' then
    raise exception 'repeat setup should reopen the same franchisee and outlet: %', r;
  end if;
  outlet_a := (a ->> 'id')::uuid; code_a := a -> 'outlet' ->> 'referral_code'; mgr_invite := a ->> 'invite_path';
  if mgr_invite is null or a -> 'outlet' ->> 'referral_path' not like '/r/%?mode=sample' then raise exception 'outlet link or manager invite missing: %', a; end if;
  b := public.franchise_add_outlet('sample', (a -> 'partner' ->> 'id')::uuid, 'Boksburg outlet', 'fr-setup-b', 'Boksburg', lerato_member, 'sell');
  outlet_b := (b ->> 'id')::uuid; code_b := b -> 'outlet' ->> 'referral_code';
  seller := public.franchise_link_seller('sample', outlet_b, 'fr-seller-b', null, 'Sipho');
  sipho_code := seller -> 'staff' ->> 'referral_code';
  if not (seller -> 'staff' ->> 'can_sell')::boolean then raise exception 'Sipho should be an authorised seller at Outlet B: %', seller; end if;

  -- The outlet manager accepts their invitation (referral access only).
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', thabo, 'email', t_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.franchise_accept_invitation(substr(mgr_invite, length('/outlet/join/') + 1));
  if r -> 'staff' ->> 'outlet_role' <> 'manager' then raise exception 'manager did not join: %', r; end if;

  -- 3. A customer scans Outlet A's QR code: the form shows the outlet, and the enquiry lands with Lerato.
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := public.referral_resolve(code_a);
  if not (r ->> 'valid')::boolean or r ->> 'outlet_label' <> 'Benoni Motors - Benoni outlet' then raise exception 'outlet code did not resolve: %', r; end if;
  enq1 := public.referral_submit_enquiry(code_a, 'Thandi', 'Customer', '083 555 0101', null, 'Motor cover', 'Bought a car today', true,
    'link:fr-enquiry-0001', 'sample');
  if not (enq1 ->> 'ok')::boolean or enq1 ->> 'outlet_label' is null then raise exception 'outlet enquiry failed: %', enq1; end if;

  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', lerato, 'email', l_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  grid := public.franchise_enquiry_grid('sample', 'uncontacted');
  if (grid -> 'totals' ->> 'uncontacted')::int <> 1 or grid -> 'rows' -> 0 -> 'outlet' ->> 'label' <> 'Benoni Motors - Benoni outlet'
     or grid -> 'rows' -> 0 -> 'handler' ->> 'name' <> 'Lerato Central' then
    raise exception 'Lerato should see one uncontacted franchise enquiry: %', grid;
  end if;
  person1 := (grid -> 'rows' -> 0 -> 'client' ->> 'id')::uuid; e1 := (grid -> 'rows' -> 0 ->> 'id')::uuid;
  select count(*) into n from tasks where dedupe_key = 'enquiry:' || e1 and detail like 'Franchise: Benoni Motors - Benoni outlet%';
  if n <> 1 then raise exception 'follow-up should carry the outlet'; end if;

  -- Lerato calls, offers (two insurer quotes), sends one and records the sale.
  perform public.sales_log_communication('sample', person1, 'call', 'Called about cover for the new car', 'fr-call-1', 'outbound');
  grid := public.franchise_enquiry_grid('sample', 'uncontacted');
  if (grid -> 'totals' ->> 'uncontacted')::int <> 0 or (grid -> 'totals' ->> 'contacted')::int <> 1 then raise exception 'call should mark contacted: %', grid; end if;
  r := public.sales_create_offer('sample', person1, 'fr-offer-1', null, 'Santam', 'motor', 865.50, 'monthly');
  offer1 := (r ->> 'id')::uuid;
  perform public.sales_create_offer('sample', person1, 'fr-offer-1b', null, 'OUTsurance', 'motor', 910.00, 'monthly');
  perform public.sales_mark_offer_sent('sample', offer1, 'fr-sent-1', 'whatsapp');
  perform public.sales_record_sale('sample', offer1, 'fr-sale-1', 'SAN-FR-0001', current_date + 1);

  -- 4. At Outlet B the authorised seller captures a phone enquiry under his outlet code and closes it himself.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', sipho, 'email', s_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  enq2 := public.sales_capture_enquiry('sample', 'Naledi', 'Buyer', 'fr-capture-2', '082 555 0202', null, 'Vehicle cover', null, sipho_code);
  if enq2 ->> 'outcome' <> 'saved' or enq2 ->> 'outlet' <> 'Benoni Motors - Boksburg outlet' then raise exception 'outlet B capture failed: %', enq2; end if;
  person2 := (enq2 ->> 'person_id')::uuid; e2 := (enq2 ->> 'id')::uuid;
  r := public.sales_create_offer('sample', person2, 'fr-offer-2', null, 'Hollard', 'motor', 799.00, 'monthly');
  offer2 := (r ->> 'id')::uuid;
  perform public.sales_mark_offer_sent('sample', offer2, 'fr-sent-2', 'in_person');
  perform public.sales_record_sale('sample', offer2, 'fr-sale-2', 'HOL-FR-0002', current_date + 1);

  -- 5. The brokerage grid: two attributed sales for the franchisee, one per outlet; each enquiry counts once per stage.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'email', o_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perf := public.franchise_performance('sample');
  if (perf -> 'partners' -> 0 ->> 'sold')::int <> 2 or (perf -> 'partners' -> 0 ->> 'enquiries')::int <> 2 then
    raise exception 'franchisee should have 2 enquiries and 2 sales: %', perf;
  end if;
  select count(*) into n from jsonb_array_elements(perf -> 'rows') x
   where (x ->> 'sold')::int = 1 and (x ->> 'enquiries')::int = 1 and (x ->> 'offered')::int = 1 and (x ->> 'conversion')::numeric = 1;
  if n <> 2 then raise exception 'each outlet should have 1 enquiry, 1 offered, 1 sold: %', perf -> 'rows'; end if;
  sales := public.franchise_sales('sample', date_trunc('month', current_date)::date, current_date);
  select count(*) into n from jsonb_array_elements(sales -> 'rows') x
   where (x -> 'seller' ->> 'name' = 'Lerato Central' and x -> 'outlet' ->> 'label' like '%Benoni outlet')
      or (x -> 'seller' ->> 'name' = 'Sipho Seller' and x -> 'outlet' ->> 'label' like '%Boksburg outlet');
  if n <> 2 then raise exception 'sales by outlet should show each seller: %', sales; end if;

  attr1 := public.franchise_client_attribution('sample', person1);
  attr2 := public.franchise_client_attribution('sample', person2);
  if attr1 -> 'enquiries' -> 0 -> 'outlet' ->> 'label' <> 'Benoni Motors - Benoni outlet'
     or attr1 -> 'enquiries' -> 0 -> 'handled_by' ->> 'name' <> 'Lerato Central'
     or attr1 -> 'enquiries' -> 0 -> 'sold_by' ->> 'name' <> 'Lerato Central' then
    raise exception 'client 1 should show outlet A, handled and sold by Lerato: %', attr1;
  end if;
  if attr2 -> 'enquiries' -> 0 -> 'referred_by' ->> 'name' <> 'Sipho Seller'
     or attr2 -> 'enquiries' -> 0 -> 'sold_by' ->> 'name' <> 'Sipho Seller' then
    raise exception 'client 2 should show referred and sold by Sipho at outlet B: %', attr2;
  end if;

  -- 6. Reassigning the first client keeps Outlet A's credit.
  perform public.sales_reassign_client('sample', person1, owner_member, 'fr-reassign-1', 'Lerato on leave');
  reset role;
  select count(*) into n from sales_enquiries where id = e1 and franchise_outlet_id = outlet_a;
  if n <> 1 then raise exception 'enquiry lost its outlet after reassignment'; end if;
  select count(*) into n from sales_records where offer_id = offer1 and franchise_outlet_id = outlet_a and sold_by_member_id = lerato_member;
  if n <> 1 then raise exception 'sale lost its outlet or seller after reassignment'; end if;
  begin
    update sales_enquiries set franchise_outlet_id = outlet_b, franchise_partner_id = (a -> 'partner' ->> 'id')::uuid where id = e1;
  end;
  select count(*) into n from sales_enquiries where id = e1 and franchise_outlet_id = outlet_a;
  if n <> 1 then raise exception 'outlet attribution must be write-once'; end if;

  -- 7. The same client comes back through Outlet B: their earlier history stays, and the new offer credits Outlet B.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'email', o_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.sales_capture_enquiry('sample', 'Thandi', 'Customer', 'fr-capture-3', '083 555 0101', null, 'Home contents', null, code_b,
    'phone', null, person1);
  e3 := (r ->> 'id')::uuid;
  r := public.sales_create_offer('sample', person1, 'fr-offer-3', null, 'Santam', 'home_contents', 220.00, 'monthly');
  offer3 := (r ->> 'id')::uuid;
  reset role;
  select count(*) into n from sales_offers where id = offer3 and enquiry_id = e3;
  if n <> 1 then raise exception 'new offer should belong to the Outlet B enquiry'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'email', o_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  attr1 := public.franchise_client_attribution('sample', person1);
  -- Both enquiries share one transaction timestamp here, so check membership rather than order.
  if jsonb_array_length(attr1 -> 'enquiries') <> 2
     or not exists (select 1 from jsonb_array_elements(attr1 -> 'enquiries') x
                     where x -> 'outlet' ->> 'label' = 'Benoni Motors - Benoni outlet' and x ->> 'stage' = 'sold' and x -> 'sold_by' ->> 'name' = 'Lerato Central')
     or not exists (select 1 from jsonb_array_elements(attr1 -> 'enquiries') x
                     where x -> 'outlet' ->> 'label' = 'Benoni Motors - Boksburg outlet' and x ->> 'stage' = 'received') then
    raise exception 'returning client should keep both enquiries: %', attr1;
  end if;

  -- 8. Sample sales stay outside Live totals.
  perform set_config('request.headers', '{"x-data-category":"live"}', true);
  live_perf := public.franchise_performance('live');
  live_sales := public.franchise_sales('live');
  if (live_perf -> 'totals' ->> 'sold')::int <> 0 or (live_sales -> 'totals' ->> 'sales')::int <> 0 then
    raise exception 'Sample sales leaked into Live: % / %', live_perf -> 'totals', live_sales -> 'totals';
  end if;
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);

  -- 9. The outlet manager sees customer-facing progress only, and can capture a request for contact.
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', thabo, 'email', t_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refs := public.outlet_referrals();
  if jsonb_array_length(refs -> 'rows') <> 1 or refs -> 'rows' -> 0 ->> 'progress' <> 'Sold' or refs -> 'rows' -> 0 ->> 'customer' <> 'Thandi C.' then
    raise exception 'outlet manager should see one sold referral with initials only: %', refs;
  end if;
  r := public.outlet_capture_request(outlet_a, 'Pieter', 'Walkin', '084 555 0303', null, 'Car insurance', null, true, 'fr-outlet-capture-1');
  if not (r ->> 'ok')::boolean or r ->> 'handler' <> 'Lerato' then raise exception 'outlet capture failed: %', r; end if;
  refs := public.outlet_referrals();
  if jsonb_array_length(refs -> 'rows') <> 2 then raise exception 'outlet manager should now see two referrals: %', refs; end if;
  select count(*) into n from persons;
  if n <> 0 then raise exception 'outlet manager must not read client records directly (% rows)', n; end if;
  begin
    perform public.sales_client_record('sample', person1);
    blocked := 'OPENED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked = 'OPENED' then raise exception 'outlet manager opened a client record'; end if;
  reset role;

  raise exception 'ACCEPTANCE PASSED: %', jsonb_build_object(
    'franchisee', a -> 'partner' ->> 'name', 'outlet_a', code_a, 'outlet_b', code_b, 'seller_code', sipho_code,
    'enquiry_a', enq1 ->> 'reference', 'enquiry_b', enq2 ->> 'reference',
    'franchise_sales', perf -> 'partners' -> 0 ->> 'sold', 'per_outlet', (select jsonb_agg(jsonb_build_object(x ->> 'name', x ->> 'sold')) from jsonb_array_elements(perf -> 'rows') x),
    'live_sales', live_sales -> 'totals' ->> 'sales', 'manager_blocked', blocked);
end $$;
