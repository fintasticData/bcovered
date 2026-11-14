-- Franchise follow-ups from the walk-through:
-- 1. franchise_setup receipts read "Set up Benoni Motors with Benoni outlet", "Added Boksburg outlet to Benoni Motors" or
--    "Reopened Benoni Motors - Benoni outlet" (no doubled "outlet outlet"; adding an outlet is not called reopening).
-- 2. The "Contact new enquiry" follow-up closes when the enquiry is first contacted (call, WhatsApp, email, meeting or offer).
-- Apply after 20261115_0022_franchise_person_sources.sql.

begin;

create or replace function public.franchise_setup(p_category text, p_partner_name text, p_idempotency_key text,
  p_outlet_name text default null, p_service_area text default null, p_receiving_member_id uuid default null,
  p_receiving_member_name text default null, p_sales_mode text default null, p_manager_name text default null,
  p_manager_email text default null, p_manager_phone text default null, p_partner_id uuid default null, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key);
  p franchise_partners; o franchise_outlets; s franchise_outlet_staff; recv uuid; pick jsonb; token text; n int; receipt jsonb;
  v_partner text := nullif(trim(coalesce(p_partner_name, '')), ''); v_outlet text := nullif(trim(coalesce(p_outlet_name, '')), '');
  v_area text := nullif(trim(coalesce(p_service_area, '')), ''); v_mgr text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_manager_email, ''))), ''); partner_new boolean := false; outlet_new boolean := false;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then
    raise exception using message = 'forbidden', detail = 'Only the broker (brokerage owner or administrator) can set up franchisees and outlets.';
  end if;
  if p_sales_mode is not null and p_sales_mode not in ('refer','sell') then
    raise exception using message = 'validation', detail = 'Sales mode must be "refer" (refer to broker) or "sell" (sell at outlet).';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using message = 'validation', detail = 'The outlet manager''s email address does not look right.';
  end if;

  if p_partner_id is not null then
    select * into p from franchise_partners where id = p_partner_id and tenant_id = t and data_category = p_category;
    if p.id is null then raise exception using message = 'not_found', detail = 'That franchisee is not in this brokerage and category.'; end if;
  else
    if v_partner is null then raise exception using message = 'needs_input', detail = 'Which franchisee should I set up? Give the business name.'; end if;
    select * into p from franchise_partners where tenant_id = t and data_category = p_category and lower(name) = lower(v_partner);
  end if;

  if p_receiving_member_id is not null or nullif(trim(coalesce(p_receiving_member_name, '')), '') is not null then
    pick := app.pick_member(t, p_receiving_member_id, p_receiving_member_name, p_category);
    if pick ->> 'outcome' = 'needs_input' then return pick; end if;
    recv := (pick ->> 'member_id')::uuid;
  end if;

  if p.id is null then
    insert into franchise_partners (tenant_id, data_category, name, trading_name, created_by)
    values (t, p_category, v_partner, v_partner, auth.uid()) returning * into p;
    partner_new := true;
  elsif p.status <> 'active' then
    update franchise_partners set status = 'active', updated_at = now() where id = p.id returning * into p;
  end if;

  -- A single-location franchisee: one outlet, named after its area (or the business) when no outlet name is given.
  if v_outlet is null then
    select count(*) into n from franchise_outlets where partner_id = p.id;
    if n = 1 then
      select * into o from franchise_outlets where partner_id = p.id;
    elsif n > 1 then
      return jsonb_build_object('outcome', 'needs_input', 'reason', 'choose_outlet', 'category', p_category,
        'summary', format('%s has %s outlets. Which outlet should I update?', p.name, n),
        'choices', (select jsonb_agg(app.outlet_json(x.id) || jsonb_build_object('record_type', 'outlet', 'number', x.referral_code,
                      'detail', coalesce(x.service_area, '')) order by x.name) from franchise_outlets x where x.partner_id = p.id));
    else
      v_outlet := coalesce(v_area, p.name);
    end if;
  end if;
  if o.id is null then
    select * into o from franchise_outlets where partner_id = p.id and lower(name) = lower(v_outlet);
  end if;

  if o.id is null then
    recv := coalesce(recv, app.my_member_id());
    if recv is null then
      raise exception using message = 'needs_input', detail = format('Who should receive enquiries from %s? Name a broker on your team.', v_outlet);
    end if;
    insert into franchise_outlets (tenant_id, data_category, partner_id, name, service_area, receiving_member_id, sales_mode, referral_code, created_by)
    values (t, p_category, p.id, v_outlet, v_area, recv, coalesce(p_sales_mode, 'refer'),
      app.new_referral_code(case when v_outlet ~* '^(the|outlet|branch|main)\M' then p.name else v_outlet end), auth.uid())
    returning * into o;
    outlet_new := true;
  else
    update franchise_outlets set service_area = coalesce(v_area, service_area), receiving_member_id = coalesce(recv, receiving_member_id),
      sales_mode = coalesce(p_sales_mode, sales_mode), status = 'active', updated_at = now()
     where id = o.id returning * into o;
    if o.receiving_member_id is null then
      raise exception using message = 'needs_input', detail = format('Who should receive enquiries from %s? Name a broker on your team.', o.name);
    end if;
  end if;

  if v_mgr is not null or v_email is not null then
    select * into s from franchise_outlet_staff where outlet_id = o.id
       and ((v_email is not null and lower(email) = v_email) or (v_mgr is not null and lower(full_name) = lower(v_mgr)))
     order by (lower(email) = v_email) desc nulls last limit 1;
    if s.id is null then
      insert into franchise_outlet_staff (tenant_id, data_category, outlet_id, full_name, email, phone, outlet_role, referral_code, status, invited_by)
      values (t, p_category, o.id, coalesce(v_mgr, split_part(v_email, '@', 1)), v_email, nullif(trim(coalesce(p_manager_phone, '')), ''), 'manager',
        app.new_referral_code(coalesce(v_mgr, split_part(v_email, '@', 1))), 'invited', auth.uid())
      returning * into s;
    else
      update franchise_outlet_staff set outlet_role = 'manager', email = coalesce(email, v_email),
        phone = coalesce(nullif(trim(coalesce(p_manager_phone, '')), ''), phone), updated_at = now()
       where id = s.id returning * into s;
    end if;
    if s.user_id is null and s.email is not null and app.outlet_invite_status(s.id) in ('not_sent','expired','revoked') then
      token := app.issue_outlet_invitation(s.id);
    end if;
  end if;

  receipt := copilot_log_saved(p_category, p_copilot, 'franchise.setup',
    jsonb_build_object('partner', coalesce(v_partner, p.name), 'outlet', o.name, 'service_area', v_area, 'receiving_member_id', recv,
      'receiving_member_name', p_receiving_member_name, 'sales_mode', p_sales_mode, 'manager_name', v_mgr, 'manager_email', v_email), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'franchise_partners', 'id', p.id, 'reference', p.name),
                      jsonb_build_object('table', 'franchise_outlets', 'id', o.id, 'reference', o.referral_code)),
    jsonb_build_object('record_type', 'franchise_outlet', 'id', o.id, 'reference', o.referral_code,
      'partner', jsonb_build_object('id', p.id, 'name', coalesce(p.trading_name, p.name), 'status', p.status),
      'outlet', app.outlet_json(o.id), 'manager', case when s.id is not null then app.outlet_staff_json(s.id) end,
      'created_partner', partner_new, 'created_outlet', outlet_new,
      'summary', case when partner_new then format('Set up %s with %s', coalesce(p.trading_name, p.name), o.name)
                      when outlet_new then format('Added %s to %s', o.name, coalesce(p.trading_name, p.name))
                      else format('Reopened %s', app.outlet_label(o.id)) end
        || format('. Enquiries go to %s (%s). Customer code %s', (select full_name from sales_team_members where id = o.receiving_member_id),
             case o.sales_mode when 'sell' then 'sell at outlet' else 'refer to broker' end, o.referral_code)
        || coalesce('. Invited ' || s.full_name || ' as outlet manager', ''),
      'open_path', '/broker/franchise?tab=franchisees&outlet=' || o.id),
    'franchise_outlets', o.id);
  -- The one-time invite link is returned to the caller but never stored in the log.
  return receipt || jsonb_build_object('invite_path', case when token is not null then '/outlet/join/' || token end);
end $$;

-- First contact closes the enquiry's "Contact new enquiry" follow-up.
create or replace function app.enquiry_close_contact_task() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.contacted_at is null and new.contacted_at is not null and new.match_status <> 'possible_match' then
    update tasks set status = 'done', updated_at = now() where dedupe_key = 'enquiry:' || new.id and status = 'open';
  end if;
  return null;
end $$;
create trigger enquiry_close_contact_task after update of contacted_at on sales_enquiries
  for each row execute function app.enquiry_close_contact_task();

update tasks k set status = 'done', updated_at = now()
  from sales_enquiries e
 where k.dedupe_key = 'enquiry:' || e.id and k.status = 'open' and e.contacted_at is not null and e.match_status <> 'possible_match';

commit;
