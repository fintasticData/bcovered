-- Customer-facing brand: include organisations.logo_url on referral resolve and offer share messages.

create or replace function public.referral_resolve(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m sales_team_members; org organisations; v text := upper(trim(coalesce(p_code, ''))); rc record; o franchise_outlets; s franchise_outlet_staff;
begin
  select * into rc from app.resolve_code(v) x where x.code_kind <> 'member' limit 1;
  if rc.code_outlet is not null then
    if not rc.code_active then
      return jsonb_build_object('valid', false, 'code', v, 'reason', 'We could not find that referral code. Check it and try again.');
    end if;
    select * into o from franchise_outlets where id = rc.code_outlet;
    select * into s from franchise_outlet_staff where id = rc.code_staff;
    select * into org from organisations where id = o.tenant_id;
    return jsonb_build_object('valid', true, 'code', v, 'kind', 'outlet',
      'outlet_name', o.name, 'partner_name', (select coalesce(trading_name, name) from franchise_partners where id = o.partner_id),
      'outlet_label', app.outlet_label(o.id), 'service_area', o.service_area,
      'referrer_name', case when s.id is not null then split_part(s.full_name, ' ', 1)
                             || coalesce(' ' || nullif(left(split_part(s.full_name, ' ', 2), 1), '') || '.', '') end,
      'role_label', 'Franchise outlet', 'brokerage', coalesce(org.trading_name, org.name),
      'logo_url', org.logo_url,
      'category', o.data_category,
      'live_accepting', org.lifecycle_status = 'active');
  end if;

  select * into m from sales_team_members where referral_code = v;
  if m.id is null or m.status = 'suspended' then
    return jsonb_build_object('valid', false, 'code', v, 'reason', 'We could not find that referral code. Check it and try again.');
  end if;
  select * into org from organisations where id = m.tenant_id;
  return jsonb_build_object('valid', true, 'code', m.referral_code, 'kind', 'member',
    'referrer_name', split_part(m.full_name, ' ', 1) || coalesce(' ' || nullif(left(split_part(m.full_name, ' ', 2), 1), '') || '.', ''),
    'role_label', case m.sales_role when 'broker' then 'Broker' when 'sub_broker' then 'Sub-broker' else 'Agent' end,
    'brokerage', coalesce(org.trading_name, org.name),
    'logo_url', org.logo_url,
    'live_accepting', org.lifecycle_status = 'active');
end $$;

create or replace function public.sales_offer_message(p_category text, p_offer_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); o sales_offers; pr persons; c customers; m sales_team_members; org organisations; txt text; phone text;
begin
  select * into o from sales_offers where id = p_offer_id;
  if o.id is null then raise exception using message = 'not_found', detail = 'That offer is not available in this category.'; end if;
  select * into pr from persons where id = o.person_id;
  select * into c from customers where id = coalesce(o.customer_id, sales_primary_account(pr.id));
  select * into m from sales_team_members where id = coalesce(o.responsible_member_id, app.my_member_id());
  select * into org from organisations where id = t;
  txt := case when o.data_category = 'sample' or o.from_sample_quote then '[SAMPLE: demonstration only, not a real offer]' || E'\n' else '' end
    || format('Hi %s, here is the %s cover we discussed from %s:',
              coalesce(pr.preferred_name, split_part(pr.first_names, ' ', 1)),
              replace(o.product, '_', ' '),
              coalesce(org.trading_name, org.name, 'your broker')) || E'\n'
    || format('Insurer: %s', o.insurer_name) || E'\n'
    || format('Premium: R%s %s', to_char(o.premium_amount, 'FM999G999G990D00'),
              case o.premium_frequency when 'monthly' then 'per month' when 'quarterly' then 'per quarter' when 'annually' then 'per year' else 'once-off' end) || E'\n'
    || format('Reference: %s', o.reference) || E'\n'
    || case when org.logo_url is not null then format('Brokerage: %s', org.logo_url) || E'\n' else '' end
    || 'Reply to this message to go ahead or ask any questions. Cover only starts once the insurer confirms it.' || E'\n'
    || coalesce(m.full_name, 'Your broker') || coalesce(', ' || coalesce(org.trading_name, org.name), '') || coalesce(' · ' || m.phone, '');
  phone := app.norm_phone(c.phone);
  return jsonb_build_object(
    'offer_id', o.id,
    'reference', o.reference,
    'text', txt,
    'phone', phone,
    'email', c.email,
    'email_subject', format('Your %s cover offer (%s)', replace(o.product, '_', ' '), o.reference),
    'category', o.data_category,
    'brokerage', coalesce(org.trading_name, org.name),
    'logo_url', org.logo_url
  );
end $$;
