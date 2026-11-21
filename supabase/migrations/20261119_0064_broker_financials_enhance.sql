-- Broker financials MVP upgrade: confirm→earn, scale versioning, exception resolve,
-- person-scoped lists, richer earning detail, scenario step persistence.

drop function if exists public.bf_list_transactions(date, uuid, uuid, text);

-- ------------------------------------------------------------------ list: person filter + payer/payee hints
create or replace function public.bf_list_transactions(
  p_period date default null,
  p_policy_id uuid default null,
  p_customer_id uuid default null,
  p_category text default null,
  p_person_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.period desc, x.created_at desc)
    from (
      select e.id, e.period, e.earning_type as txn_type, e.gross_amount as amount,
        e.statement_matched, e.cash_received_amount,
        e.policy_id, e.customer_id, e.person_id, e.section_code, e.event_ref,
        e.hold_reason, e.scenario_id, e.created_at, e.calc_method, e.rate,
        c.full_name as customer_name, p.policy_number,
        coalesce((select name from insurers where id = e.insurer_id), 'Insurer') as payer_name,
        (select string_agg(distinct coalesce(a.recipient_name, a.recipient_role), ', ')
           from commission_allocations a
          where a.earning_id = e.id and a.data_category = e.data_category) as payee_names,
        (select coalesce(sum(a.payable_amount),0) from commission_allocations a
          where a.earning_id = e.id and a.data_category = e.data_category and a.recipient_role <> 'brokerage') as adviser_payable,
        case
          when e.hold_reason is not null then 'held'
          when e.cash_received_amount >= e.gross_amount and exists (
            select 1 from commission_allocations a
            where a.earning_id = e.id and a.recipient_role <> 'brokerage' and a.payable_amount = 0 and a.paid_amount > 0
          ) then 'paid_out'
          when e.cash_received_amount > 0 then 'cash_received'
          when e.statement_matched then 'statement_matched'
          else 'earned'
        end as status
      from commission_earnings e
      left join customers c on c.id = e.customer_id
      left join policies p on p.id = e.policy_id and p.data_category = e.data_category
      where e.tenant_id = app.tenant_id() and e.data_category = cat
        and (p_period is null or e.period = p_period)
        and (p_policy_id is null or e.policy_id = p_policy_id)
        and (p_customer_id is null or e.customer_id = p_customer_id)
        and (p_person_id is null or e.person_id = p_person_id)
    ) x
  ), '[]'::jsonb);
end $$;

grant execute on function public.bf_list_transactions(date, uuid, uuid, text, uuid) to authenticated;

-- ------------------------------------------------------------------ richer earning detail
create or replace function public.bf_get_earning(
  p_earning_id uuid, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
declare e commission_earnings%rowtype;
declare lifecycle text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from commission_earnings
   where id = p_earning_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  lifecycle := case
    when e.hold_reason is not null then 'held'
    when e.cash_received_amount >= e.gross_amount and exists (
      select 1 from commission_allocations a
      where a.earning_id = e.id and a.recipient_role <> 'brokerage' and a.payable_amount = 0 and a.paid_amount > 0
    ) then 'paid_out'
    when e.cash_received_amount > 0 then 'cash_received'
    when e.statement_matched then 'statement_matched'
    else 'earned'
  end;

  return jsonb_build_object(
    'earning', row_to_json(e)::jsonb,
    'allocations', coalesce((
      select jsonb_agg(row_to_json(a)::jsonb) from commission_allocations a
      where a.earning_id = e.id and a.data_category = cat
    ), '[]'::jsonb),
    'scale_version', (
      select row_to_json(v)::jsonb from commission_scale_versions v where v.id = e.scale_version_id
    ),
    'scale_name', (
      select s.name from commission_scales s
      join commission_scale_versions v on v.scale_id = s.id and v.data_category = s.data_category
      where v.id = e.scale_version_id
    ),
    'choices', jsonb_build_object(
      'earning_type', e.earning_type,
      'calc_method', e.calc_method,
      'basis', e.basis,
      'rate', e.rate,
      'recipients', coalesce((
        select jsonb_agg(jsonb_build_object(
          'role', a.recipient_role,
          'name', a.recipient_name,
          'share_percent', a.share_percent,
          'amount', a.amount
        ))
        from commission_allocations a where a.earning_id = e.id and a.data_category = cat
      ), '[]'::jsonb)
    ),
    'lifecycle', lifecycle,
    'lifecycle_steps', jsonb_build_array(
      jsonb_build_object('id','earned','done', true, 'label','Earned'),
      jsonb_build_object('id','matched','done', e.statement_matched, 'label','Statement matched'),
      jsonb_build_object('id','cash','done', e.cash_received_amount > 0, 'label','Cash received'),
      jsonb_build_object('id','paid','done', lifecycle = 'paid_out', 'label','Adviser paid')
    ),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'amount', rl.amount, 'received_on', r.received_on, 'reference', r.reference, 'is_simulated', r.is_simulated
      ) order by r.received_on)
      from commission_receipt_lines rl
      join commission_receipts r on r.id = rl.receipt_id and r.data_category = rl.data_category
      where rl.earning_id = e.id and rl.data_category = cat
    ), '[]'::jsonb),
    'customer_name', (select full_name from customers where id = e.customer_id),
    'policy_number', (select policy_number from policies where id = e.policy_id and data_category = cat),
    'payer_name', (select name from insurers where id = e.insurer_id)
  );
end $$;

-- ------------------------------------------------------------------ confirm replacement → update premium → earn
create or replace function public.bf_confirm_replacement_and_earn(
  p_policy_id uuid,
  p_new_premium numeric,
  p_period date default '2025-11-01',
  p_section text default 'vehicle',
  p_event_ref text default null,
  p_scenario_id text default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cat text;
  pol policies%rowtype;
  old_prem numeric;
  rate_id uuid;
  posted jsonb;
  event text;
begin
  cat := app.bf_require_demo(p_category);
  select * into pol from policies
   where id = p_policy_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  old_prem := coalesce(pol.premium_amount, 0);
  event := coalesce(p_event_ref, format('bf:replace-earn:%s:%s:%s', pol.id, p_period, p_new_premium));

  update policies
     set premium_amount = p_new_premium,
         premium_frequency = coalesce(premium_frequency, 'monthly')
   where id = pol.id and data_category = cat;

  -- close prior confirmed vehicle rate
  update policy_premium_rates
     set status = 'superseded',
         effective_to = p_period - 1
   where policy_id = pol.id
     and data_category = cat
     and coalesce(section_code, 'vehicle') = coalesce(p_section, 'vehicle')
     and status = 'confirmed'
     and (effective_to is null or effective_to >= p_period);

  select id into rate_id from policy_premium_rates
   where policy_id = pol.id and data_category = cat
     and source_ref = case when pol.policy_number = 'HDB-MV-1001' then 'bf:hv:prem:1400' else event || ':prem' end
   limit 1;

  if rate_id is null then
    insert into policy_premium_rates (
      tenant_id, data_category, policy_id, section_code, amount, currency, frequency,
      effective_from, status, included_in_policy, source, reason, source_ref, created_by
    ) values (
      app.tenant_id(), cat, pol.id, p_section, p_new_premium, 'ZAR', 'monthly',
      p_period, 'confirmed', true, 'broker_financials',
      format('Demo replacement premium R%s → R%s', old_prem, p_new_premium),
      case when pol.policy_number = 'HDB-MV-1001' then 'bf:hv:prem:1400' else event || ':prem' end,
      auth.uid()
    ) returning id into rate_id;
  else
    update policy_premium_rates
       set amount = p_new_premium, status = 'confirmed', effective_from = p_period, effective_to = null
     where id = rate_id;
  end if;

  posted := public.bf_post_earning(
    pol.id, p_new_premium, p_period, p_section, 'ongoing', event, p_scenario_id, cat
  );

  return jsonb_build_object(
    'outcome', posted->>'outcome',
    'earning_id', posted->'earning_id',
    'gross_amount', posted->'gross_amount',
    'prior_premium', old_prem,
    'new_premium', p_new_premium,
    'premium_rate_id', rate_id,
    'summary', format(
      'Premium updated R%s → R%s. %s',
      old_prem, p_new_premium, coalesce(posted->>'summary', 'Earning posted')
    ),
    'posted', posted
  );
end $$;

grant execute on function public.bf_confirm_replacement_and_earn(uuid, numeric, date, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------ scale create / new version
create or replace function public.bf_upsert_scale_version(
  p_payload jsonb,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cat text;
  t uuid := app.tenant_id();
  scale_id uuid;
  version_id uuid;
  version_no int;
  split jsonb;
  share_sum numeric := 0;
  v_name text;
  specificity int := 0;
begin
  cat := app.bf_require_demo(p_category);
  v_name := nullif(trim(coalesce(p_payload->>'name', '')), '');
  if v_name is null and (p_payload->>'scale_id') is null then
    raise exception 'validation: scale name or scale_id required' using errcode = 'P0001';
  end if;

  for split in select * from jsonb_array_elements(coalesce(p_payload->'splits', '[]'::jsonb))
  loop
    share_sum := share_sum + coalesce((split->>'share_percent')::numeric, 0);
  end loop;
  if share_sum <> 100 then
    raise exception 'validation: split shares must total 100 (got %)', share_sum using errcode = 'P0001';
  end if;

  if (p_payload->>'scale_id') is not null then
    scale_id := (p_payload->>'scale_id')::uuid;
    update commission_scales
       set name = coalesce(v_name, commission_scales.name),
           insurer_id = coalesce(nullif(p_payload->>'insurer_id','')::uuid, insurer_id),
           product_line = coalesce(nullif(p_payload->>'product_line',''), product_line),
           cover_section = coalesce(nullif(p_payload->>'cover_section',''), cover_section),
           updated_at = now()
     where id = scale_id and tenant_id = t and data_category = cat;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  else
    insert into commission_scales (
      tenant_id, data_category, name, insurer_id, product_line, cover_section, scenario_id
    ) values (
      t, cat, v_name,
      nullif(p_payload->>'insurer_id','')::uuid,
      nullif(p_payload->>'product_line',''),
      nullif(p_payload->>'cover_section',''),
      nullif(p_payload->>'scenario_id','')
    ) returning id into scale_id;
  end if;

  select coalesce(max(v.version_no), 0) + 1 into version_no
    from commission_scale_versions v
   where v.scale_id = scale_id and v.data_category = cat;

  -- close previous open version if overlapping
  if coalesce((p_payload->>'close_previous')::boolean, true) then
    update commission_scale_versions
       set effective_to = ((p_payload->>'effective_from')::date - 1)
     where scale_id = scale_id and data_category = cat
       and effective_to is null
       and effective_from < (p_payload->>'effective_from')::date;
  end if;

  specificity :=
    (case when (p_payload->>'insurer_id') is not null or exists (
       select 1 from commission_scales s where s.id = scale_id and s.insurer_id is not null
     ) then 4 else 0 end)
    + (case when coalesce(p_payload->>'product_line', '') <> '' then 2 else 0 end)
    + (case when coalesce(p_payload->>'cover_section', '') <> '' then 1 else 0 end);

  insert into commission_scale_versions (
    tenant_id, data_category, scale_id, version_no, earning_type, calc_method, basis,
    rate, fixed_amount, effective_from, effective_to, match_specificity, scenario_id
  ) values (
    t, cat, scale_id, version_no,
    coalesce(nullif(p_payload->>'earning_type',''), 'ongoing'),
    coalesce(nullif(p_payload->>'calc_method',''), 'percent'),
    coalesce(nullif(p_payload->>'basis',''), 'eligible_monthly_premium'),
    nullif(p_payload->>'rate','')::numeric,
    nullif(p_payload->>'fixed_amount','')::numeric,
    coalesce((p_payload->>'effective_from')::date, current_date),
    nullif(p_payload->>'effective_to','')::date,
    specificity,
    nullif(p_payload->>'scenario_id','')
  ) returning id into version_id;

  for split in select * from jsonb_array_elements(coalesce(p_payload->'splits', '[]'::jsonb))
  loop
    insert into commission_split_lines (
      tenant_id, data_category, scale_version_id, recipient_role, recipient_name,
      share_percent, section_scope, scenario_id
    ) values (
      t, cat, version_id,
      split->>'recipient_role',
      nullif(split->>'recipient_name',''),
      (split->>'share_percent')::numeric,
      nullif(split->>'section_scope',''),
      nullif(p_payload->>'scenario_id','')
    );
  end loop;

  return jsonb_build_object(
    'outcome', 'saved',
    'scale_id', scale_id,
    'version_id', version_id,
    'version_no', version_no,
    'summary', format('Saved scale version v%s', version_no)
  );
end $$;

grant execute on function public.bf_upsert_scale_version(jsonb, text) to authenticated;

-- ------------------------------------------------------------------ resolve statement exception (Coastal R10)
create or replace function public.bf_resolve_statement_exception(
  p_line_id uuid,
  p_resolution text default 'accept_shortfall',
  p_note text default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cat text;
  line commission_statement_lines%rowtype;
  note text;
begin
  cat := app.bf_require_demo(p_category);
  if p_resolution not in ('accept_shortfall', 'write_off', 'reopen') then
    raise exception 'validation: unknown resolution' using errcode = 'P0001';
  end if;

  select * into line from commission_statement_lines
   where id = p_line_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_resolution = 'reopen' then
    update commission_statement_lines set
      match_status = 'exception',
      exception_note = coalesce(p_note, exception_note)
    where id = line.id;
    update commission_statement_batches set status = 'exception' where id = line.batch_id;
    return jsonb_build_object('outcome','reopened','summary','Exception reopened for investigation');
  end if;

  note := coalesce(
    p_note,
    case when p_resolution = 'write_off'
      then format('Write-off accepted for variance R%s (demo)', coalesce(line.variance, 0))
      else format('Shortfall accepted — reported R%s vs expected R%s (demo)', line.reported_amount, coalesce(line.expected_amount,0))
    end
  );

  update commission_statement_lines set
    match_status = 'resolved',
    exception_note = note
  where id = line.id;

  update commission_statement_batches b set status = 'matched'
   where id = line.batch_id
     and not exists (
       select 1 from commission_statement_lines l
       where l.batch_id = b.id and l.match_status in ('unmatched','exception')
     );

  return jsonb_build_object(
    'outcome', 'resolved',
    'resolution', p_resolution,
    'variance', line.variance,
    'summary', note
  );
end $$;

grant execute on function public.bf_resolve_statement_exception(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------------ scenario step persistence
create or replace function public.bf_set_scenario_step(
  p_scenario_id text,
  p_step_index int,
  p_status text default 'running',
  p_summary text default null,
  p_blocked_reason text default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text;
begin
  cat := app.bf_require_demo(p_category);
  insert into broker_financials_scenario_state (
    tenant_id, data_category, scenario_id, step_index, status, last_summary, blocked_reason, updated_at
  ) values (
    app.tenant_id(), cat, p_scenario_id, p_step_index, coalesce(p_status,'running'),
    p_summary, p_blocked_reason, now()
  )
  on conflict (tenant_id, data_category, scenario_id) do update set
    step_index = excluded.step_index,
    status = excluded.status,
    last_summary = excluded.last_summary,
    blocked_reason = excluded.blocked_reason,
    updated_at = now();
  return jsonb_build_object('outcome','saved','scenario_id', p_scenario_id, 'step_index', p_step_index);
end $$;

grant execute on function public.bf_set_scenario_step(text, int, text, text, text, text) to authenticated;

-- Allow resolved match_status on statement lines (if constrained)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'commission_statement_lines_match_status_check'
  ) then
    alter table commission_statement_lines drop constraint commission_statement_lines_match_status_check;
  end if;
  alter table commission_statement_lines
    add constraint commission_statement_lines_match_status_check
    check (match_status in ('unmatched','matched','exception','ignored','resolved'));
exception when others then
  -- keep going if constraint naming differs; soft-validate in RPC
  null;
end $$;
