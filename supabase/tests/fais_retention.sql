-- B-Covered FAIS record-keeping test. Safe to run on the shared project: one DO block that always ends with an exception,
-- so every row it creates is rolled back. Read the result from the final error message:
--   "FAIS RETENTION PASSED: {...}" or the first failed check.
-- Live communications must be permanent and append-only for every role, including admin connections; corrections are new
-- linked entries; each entry keeps its author, role and the assigned team member; Sample stays editable.

do $$
declare
  broker uuid := gen_random_uuid(); b_email text := 'fais.broker+' || left(broker::text, 8) || '@example.test';
  setup jsonb; tenant uuid; enquiry jsonb; person uuid; logged jsonb; entry uuid; fix jsonb; again jsonb; rec jsonb; c jsonb;
  blocked text; sample_person uuid; sample_entry uuid; n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (broker, b_email, jsonb_build_object('full_name', 'Thandi Fais', 'brokerage_name', 'FAIS Test Brokers'), 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', broker, 'email', b_email, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);
  set local role authenticated;
  setup := public.sales_setup_workspace(null, null, '082 000 0009', 'Pretoria');
  select tenant_id into tenant from sales_team_members where user_id = broker;
  reset role;
  update organisations set lifecycle_status = 'active' where id = tenant;

  -- 1. A Live communication is logged and snapshots who wrote it.
  perform set_config('request.headers', '{"x-data-category":"live"}', true);
  set local role authenticated;
  enquiry := public.sales_capture_enquiry('live', 'Ayanda', 'Live', 'fais-enq-0001', '082 555 0101');
  person := (enquiry ->> 'person_id')::uuid;
  logged := public.sales_log_communication('live', person, 'call', 'Discussed motor cover; client will send the licence disc.', 'fais-log-0001');
  entry := (logged ->> 'id')::uuid;
  select count(*) into n from client_interactions where id = entry and author_role = 'broker' and author_member_id is not null and assigned_member_id is not null;
  if n <> 1 then raise exception 'author, role and assigned member were not kept: %', (select to_jsonb(i) from client_interactions i where id = entry); end if;

  -- 2. The broker cannot edit or delete it (row-level security would allow it; retention blocks it).
  begin
    update client_interactions set body = 'changed' where id = entry;
    blocked := 'NOT BLOCKED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked <> 'forbidden' then raise exception 'Live edit should be blocked, got %', blocked; end if;
  begin
    delete from client_interactions where id = entry;
    blocked := 'NOT BLOCKED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked <> 'forbidden' then raise exception 'Live delete should be blocked, got %', blocked; end if;

  -- 3. Neither can an admin connection.
  reset role;
  begin
    delete from client_interactions where id = entry;
    blocked := 'NOT BLOCKED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked <> 'forbidden' then raise exception 'admin delete should be blocked, got %', blocked; end if;
  begin
    update sales_enquiries set message = 'rewritten' where id = (enquiry ->> 'id')::uuid;
    blocked := 'NOT BLOCKED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked <> 'forbidden' then raise exception 'enquiry wording edit should be blocked, got %', blocked; end if;
  begin
    delete from sales_enquiries where id = (enquiry ->> 'id')::uuid;
    blocked := 'NOT BLOCKED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked <> 'forbidden' then raise exception 'enquiry delete should be blocked, got %', blocked; end if;

  -- 4. A correction is a new entry; the original stays word for word; a retry does not duplicate it.
  set local role authenticated;
  begin
    perform public.sales_correct_communication('live', entry, 'Discussed motor cover; client will email the licence disc.', '', 'fais-fix-0000');
    blocked := 'NOT BLOCKED';
  exception when others then blocked := sqlerrm;
  end;
  if blocked <> 'needs_input' then raise exception 'a correction needs a reason, got %', blocked; end if;
  fix := public.sales_correct_communication('live', entry, 'Discussed motor cover; client will email the licence disc.', 'Wrong channel noted', 'fais-fix-0001');
  again := public.sales_correct_communication('live', entry, 'Discussed motor cover; client will email the licence disc.', 'Wrong channel noted', 'fais-fix-0001');
  if (fix ->> 'id') is distinct from (again ->> 'id') then raise exception 'correction retry duplicated: % vs %', fix, again; end if;
  select count(*) into n from client_interactions where corrects_id = entry;
  if n <> 1 then raise exception 'expected one correction, found %', n; end if;
  if (select body from client_interactions where id = entry) <> 'Discussed motor cover; client will send the licence disc.' then
    raise exception 'original wording changed';
  end if;

  rec := public.sales_client_record('live', person);
  select x into c from jsonb_array_elements(rec -> 'communications') x where x ->> 'id' = entry::text;
  if c ->> 'retention' <> 'permanent' or (c -> 'corrected_by' ->> 'id') <> (fix ->> 'id') or c ->> 'author_role' <> 'broker' then
    raise exception 'client record does not show retention and correction: %', c;
  end if;

  -- 5. Sample communications stay editable so demos can be reset.
  perform set_config('request.headers', '{"x-data-category":"sample"}', true);
  enquiry := public.sales_capture_enquiry('sample', 'Sam', 'Sample', 'fais-enq-0002');
  sample_person := (enquiry ->> 'person_id')::uuid;
  sample_entry := (public.sales_log_communication('sample', sample_person, 'note', 'Demo note', 'fais-log-0002') ->> 'id')::uuid;
  reset role;
  delete from client_interactions where id = sample_entry;
  if exists (select 1 from client_interactions where id = sample_entry) then raise exception 'Sample delete should work'; end if;

  raise exception 'FAIS RETENTION PASSED: %', jsonb_build_object('entry', (select reference from client_interactions where id = entry),
    'correction', fix ->> 'reference', 'author_role', c ->> 'author_role', 'assigned_at_time', c ->> 'assigned_at_time');
end $$;
