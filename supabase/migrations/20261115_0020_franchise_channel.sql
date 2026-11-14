-- InsureFlow AI / B-Covered: franchisees and their outlets as a sales channel.
-- A franchisee (partner business) has outlets. Each outlet has a customer referral code, a receiving broker and a sales mode
-- (refer to broker, or sell at the outlet through an authorised seller). Outlet staff get personal codes that resolve to the
-- outlet. Every enquiry keeps the originating franchisee, outlet and referring staff member for good (write-once), separately
-- from the current handler (assigned_member_id) and the eventual seller (sales_records.sold_by_member_id).
-- Stage timestamps on each enquiry (contacted, offered, sold) are set once, so an enquiry counts once per stage however many
-- offers it receives. Outlet managers and staff sign in to an outlet portal; they are not brokerage staff and only see
-- customer-facing progress through the outlet_* functions.
-- Apply after 20261114_0019_broker_sales_book.sql.

begin;

-- ------------------------------------------------------------------ 1. Outlet roles (not brokerage staff)
insert into roles (key, label, is_staff) values
  ('outlet_manager', 'Outlet manager', false),
  ('outlet_staff', 'Outlet staff', false)
on conflict (key) do nothing;

alter table organisation_memberships drop constraint organisation_memberships_role_check;
alter table organisation_memberships add constraint organisation_memberships_role_check check (role in
  ('brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only','sub_broker','agent',
   'outlet_manager','outlet_staff'));
alter table brokerage_invitations drop constraint brokerage_invitations_role_check;
alter table brokerage_invitations add constraint brokerage_invitations_role_check check (role in
  ('brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only','sub_broker','agent',
   'outlet_manager','outlet_staff'));
alter table brokerage_invitations drop constraint brokerage_invitations_kind_check;
alter table brokerage_invitations add constraint brokerage_invitations_kind_check check (kind in ('owner','team','outlet'));

-- ------------------------------------------------------------------ 2. Franchisees, outlets and outlet staff
create table franchise_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  name text not null,
  trading_name text,
  status text not null default 'active' check (status in ('active','paused')),
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, data_category)
);
create unique index franchise_partners_name_key on franchise_partners (tenant_id, data_category, lower(name));

create table franchise_outlets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  partner_id uuid not null,
  name text not null,
  service_area text,
  receiving_member_id uuid references sales_team_members(id),
  sales_mode text not null default 'refer' check (sales_mode in ('refer','sell')),
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{4}$'),
  status text not null default 'active' check (status in ('active','paused')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (partner_id, data_category) references franchise_partners (id, data_category),
  unique (id, data_category)
);
create unique index franchise_outlets_name_key on franchise_outlets (partner_id, lower(name));
create index franchise_outlets_tenant_idx on franchise_outlets (tenant_id, data_category, name);
create index franchise_outlets_receiving_idx on franchise_outlets (receiving_member_id);

create table franchise_outlet_staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  outlet_id uuid not null,
  user_id uuid references app_users(id),
  full_name text not null,
  email text,
  phone text,
  outlet_role text not null default 'staff' check (outlet_role in ('manager','staff')),
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{4}$'),
  sales_member_id uuid references sales_team_members(id),
  invitation_id uuid references brokerage_invitations(id),
  status text not null default 'invited' check (status in ('invited','active','suspended')),
  invited_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (outlet_id, data_category) references franchise_outlets (id, data_category),
  unique (id, data_category)
);
create unique index franchise_outlet_staff_email_key on franchise_outlet_staff (outlet_id, lower(email)) where email is not null;
create unique index franchise_outlet_staff_member_key on franchise_outlet_staff (outlet_id, sales_member_id) where sales_member_id is not null;
create index franchise_outlet_staff_user_idx on franchise_outlet_staff (user_id) where user_id is not null;
create index franchise_outlet_staff_outlet_idx on franchise_outlet_staff (outlet_id, full_name);

alter table brokerage_invitations add column outlet_staff_id uuid references franchise_outlet_staff(id);

-- ------------------------------------------------------------------ 3. Attribution and stage timestamps
alter table sales_enquiries
  add column channel text not null default 'direct' check (channel in ('direct','franchise')),
  add column franchise_partner_id uuid,
  add column franchise_outlet_id uuid,
  add column outlet_staff_id uuid,
  add column contacted_at timestamptz,
  add column offered_at timestamptz,
  add column sold_at timestamptz,
  add constraint sales_enquiries_partner_fk foreign key (franchise_partner_id, data_category) references franchise_partners (id, data_category),
  add constraint sales_enquiries_outlet_fk foreign key (franchise_outlet_id, data_category) references franchise_outlets (id, data_category),
  add constraint sales_enquiries_outlet_staff_fk foreign key (outlet_staff_id, data_category) references franchise_outlet_staff (id, data_category);
create index sales_enquiries_outlet_idx on sales_enquiries (franchise_outlet_id, created_at desc) where franchise_outlet_id is not null;
create index sales_enquiries_partner_idx on sales_enquiries (franchise_partner_id, created_at desc) where franchise_partner_id is not null;
create index sales_enquiries_outlet_staff_idx on sales_enquiries (outlet_staff_id) where outlet_staff_id is not null;
create index sales_enquiries_open_person_idx on sales_enquiries (person_id, created_at desc) where sold_at is null;

alter table sales_records
  add column franchise_partner_id uuid,
  add column franchise_outlet_id uuid,
  add column outlet_staff_id uuid,
  add constraint sales_records_partner_fk foreign key (franchise_partner_id, data_category) references franchise_partners (id, data_category),
  add constraint sales_records_outlet_fk foreign key (franchise_outlet_id, data_category) references franchise_outlets (id, data_category),
  add constraint sales_records_outlet_staff_fk foreign key (outlet_staff_id, data_category) references franchise_outlet_staff (id, data_category);
create index sales_records_outlet_idx on sales_records (franchise_outlet_id, created_at desc) where franchise_outlet_id is not null;
create index sales_records_enquiry_idx on sales_records (enquiry_id);

-- Existing enquiries: stage timestamps from what already happened.
update sales_enquiries e set
  sold_at = (select min(s.created_at) from sales_records s where s.enquiry_id = e.id),
  offered_at = (select min(coalesce(o.sent_at, o.updated_at)) from sales_offers o where o.enquiry_id = e.id and o.status in ('sent','accepted','sold')),
  contacted_at = (select min(i.occurred_at) from client_interactions i where i.person_id = e.person_id and i.direction = 'outbound'
                   and i.kind in ('call','whatsapp','email','meeting') and i.event <> 'whatsapp_opened' and i.occurred_at >= e.created_at);
update sales_enquiries set offered_at = coalesce(offered_at, sold_at), contacted_at = coalesce(contacted_at, offered_at, sold_at)
 where sold_at is not null or offered_at is not null;

-- ------------------------------------------------------------------ 4. One code space for members, outlets and outlet staff
create or replace function app.new_referral_code(p_name text) returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare stem text := left(upper(regexp_replace(split_part(trim(coalesce(p_name, '')), ' ', 1), '[^A-Za-z0-9]', '', 'g')), 10);
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
begin
  if length(stem) < 2 then stem := 'BC'; end if;
  loop
    code := stem || '-';
    for i in 1..4 loop code := code || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1); end loop;
    exit when not exists (select 1 from sales_team_members where referral_code = code)
          and not exists (select 1 from franchise_outlets where referral_code = code)
          and not exists (select 1 from franchise_outlet_staff where referral_code = code);
  end loop;
  return code;
end $$;
revoke all on function app.new_referral_code(text) from public, anon, authenticated;

-- What a code points at, and who an enquiry under it is routed to.
-- Outlet code: the outlet's receiving broker. Staff code: the staff member themself when the outlet sells and they are an
-- active seller, otherwise the receiving broker. A staff member with selling rights is also the referrer.
create or replace function app.resolve_code(p_code text)
returns table (code_kind text, code_tenant uuid, code_category text, code_member uuid, code_partner uuid, code_outlet uuid,
  code_staff uuid, code_assignee uuid, code_referrer uuid, code_active boolean)
language sql stable security definer set search_path = public as $$
  select 'member', m.tenant_id, null::text, m.id, null::uuid, null::uuid, null::uuid, m.id, m.id, m.status <> 'suspended'
    from sales_team_members m where m.referral_code = upper(trim(coalesce(p_code, '')))
  union all
  select 'outlet', o.tenant_id, o.data_category, null, o.partner_id, o.id, null, o.receiving_member_id, null,
         o.status = 'active' and p.status = 'active'
    from franchise_outlets o join franchise_partners p on p.id = o.partner_id
   where o.referral_code = upper(trim(coalesce(p_code, '')))
  union all
  select 'outlet_staff', s.tenant_id, s.data_category, null, o.partner_id, o.id, s.id,
         case when o.sales_mode = 'sell' and sm.status = 'active' then sm.id else o.receiving_member_id end,
         case when sm.status = 'active' then sm.id end,
         s.status <> 'suspended' and o.status = 'active' and p.status = 'active'
    from franchise_outlet_staff s
    join franchise_outlets o on o.id = s.outlet_id
    join franchise_partners p on p.id = o.partner_id
    left join sales_team_members sm on sm.id = s.sales_member_id
   where s.referral_code = upper(trim(coalesce(p_code, '')))
$$;
revoke all on function app.resolve_code(text) from public, anon, authenticated;

create or replace function app.outlet_label(p_outlet uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.trading_name, p.name) || ' - ' || o.name from franchise_outlets o join franchise_partners p on p.id = o.partner_id where o.id = p_outlet
$$;

create or replace function app.outlet_json(p_outlet uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('outlet_id', o.id, 'id', o.id, 'name', o.name, 'partner_id', p.id, 'partner_name', coalesce(p.trading_name, p.name),
    'label', coalesce(p.trading_name, p.name) || ' - ' || o.name, 'service_area', o.service_area, 'sales_mode', o.sales_mode,
    'sales_mode_label', case o.sales_mode when 'sell' then 'Sell at outlet' else 'Refer to broker' end,
    'status', o.status, 'partner_status', p.status, 'category', o.data_category,
    'referral_code', o.referral_code, 'referral_path', app.referral_path(o.referral_code, o.data_category),
    'receiving', app.member_json(o.receiving_member_id, o.data_category),
    'open_path', '/broker/franchise?tab=franchisees&outlet=' || o.id)
  from franchise_outlets o join franchise_partners p on p.id = o.partner_id where o.id = p_outlet
$$;

create or replace function app.outlet_invite_status(p_staff uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when s.user_id is not null and s.status = 'active' then 'joined'
    when s.status = 'suspended' then 'suspended'
    when s.email is null then 'needs_email'
    when i.id is null then 'not_sent'
    when i.accepted_at is not null then 'joined'
    when i.revoked_at is not null then 'revoked'
    when i.expires_at < now() then 'expired'
    else 'pending' end
  from franchise_outlet_staff s left join brokerage_invitations i on i.id = s.invitation_id where s.id = p_staff
$$;

create or replace function app.outlet_staff_json(p_staff uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('staff_id', s.id, 'id', s.id, 'name', s.full_name, 'email', s.email, 'phone', s.phone,
    'outlet_role', s.outlet_role, 'role_label', case s.outlet_role when 'manager' then 'Outlet manager' else 'Outlet staff' end,
    'referral_code', s.referral_code, 'referral_path', app.referral_path(s.referral_code, s.data_category),
    'can_sell', coalesce(sm.status = 'active', false), 'seller', app.member_json(s.sales_member_id, s.data_category),
    'status', s.status, 'invite_status', app.outlet_invite_status(s.id), 'user_id', s.user_id, 'outlet_id', s.outlet_id)
  from franchise_outlet_staff s left join sales_team_members sm on sm.id = s.sales_member_id where s.id = p_staff
$$;

create or replace function app.enquiry_stage(e sales_enquiries) returns text language sql immutable as $$
  select case when e.sold_at is not null then 'sold' when e.offered_at is not null then 'offered'
              when e.contacted_at is not null then 'contacted' else 'received' end
$$;

create or replace function app.stage_label(p_stage text) returns text language sql immutable as $$
  select case p_stage when 'sold' then 'Sold' when 'offered' then 'Offer sent' when 'contacted' then 'Contacted' else 'Received' end
$$;

-- Local dates (South Africa) to timestamps for period filters; p_to is inclusive.
create or replace function app.period_start(p_from date) returns timestamptz language sql immutable as $$
  select case when p_from is null then '-infinity'::timestamptz else (p_from::timestamp at time zone 'Africa/Johannesburg') end
$$;
create or replace function app.period_end(p_to date) returns timestamptz language sql immutable as $$
  select case when p_to is null then 'infinity'::timestamptz else ((p_to + 1)::timestamp at time zone 'Africa/Johannesburg') end
$$;

-- ------------------------------------------------------------------ 5. Triggers: attribution is written once; stages are set once
create or replace function app.enquiry_franchise_attribution() returns trigger language plpgsql security definer set search_path = public as $$
declare rc record;
begin
  if tg_op = 'INSERT' then
    if new.referral_code is not null and new.franchise_outlet_id is null then
      select * into rc from app.resolve_code(new.referral_code) x where x.code_kind in ('outlet','outlet_staff') and x.code_tenant = new.tenant_id limit 1;
      if rc.code_outlet is not null then
        if rc.code_category <> new.data_category then
          raise exception using message = 'validation',
            detail = format('Code %s belongs to a %s outlet. Switch to %s to load this enquiry.', new.referral_code, initcap(rc.code_category), initcap(rc.code_category));
        end if;
        new.franchise_partner_id := rc.code_partner;
        new.franchise_outlet_id := rc.code_outlet;
        new.outlet_staff_id := rc.code_staff;
      end if;
    end if;
    if new.franchise_outlet_id is not null then
      new.channel := 'franchise';
      if new.franchise_partner_id is null then select partner_id into new.franchise_partner_id from franchise_outlets where id = new.franchise_outlet_id; end if;
    end if;
  else
    if old.franchise_outlet_id is not null then
      new.channel := old.channel;
      new.franchise_partner_id := old.franchise_partner_id;
      new.franchise_outlet_id := old.franchise_outlet_id;
      new.outlet_staff_id := old.outlet_staff_id;
    end if;
    new.contacted_at := coalesce(old.contacted_at, new.contacted_at);
    new.offered_at := coalesce(old.offered_at, new.offered_at);
    new.sold_at := coalesce(old.sold_at, new.sold_at);
  end if;
  return new;
end $$;
create trigger franchise_attribution before insert or update on sales_enquiries
  for each row execute function app.enquiry_franchise_attribution();

-- The current handler of an open enquiry follows the client's assignment.
create or replace function app.enquiry_follow_assignee() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_member_id is distinct from old.assigned_member_id and new.assigned_member_id is not null then
    update sales_enquiries set assigned_member_id = new.assigned_member_id where person_id = new.id and sold_at is null;
  end if;
  return null;
end $$;
create trigger enquiry_follow_assignee after update of assigned_member_id on persons
  for each row execute function app.enquiry_follow_assignee();

create or replace function app.enquiry_stage_from_interaction() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.person_id is not null and new.direction = 'outbound' and new.kind in ('call','whatsapp','email','meeting')
     and new.event <> 'whatsapp_opened' then
    update sales_enquiries set contacted_at = greatest(new.occurred_at, created_at)
     where person_id = new.person_id and contacted_at is null and sold_at is null and created_at <= greatest(new.occurred_at, new.created_at);
  end if;
  return null;
end $$;
create trigger enquiry_stage after insert on client_interactions
  for each row execute function app.enquiry_stage_from_interaction();

-- An offer belongs to the client's latest open enquiry unless the caller chose one that is still open. A returning client
-- who comes in through another outlet therefore credits that outlet, and earlier enquiries keep their history.
create or replace function app.offer_enquiry_link() returns trigger language plpgsql security definer set search_path = public as $$
declare latest uuid; first_e uuid;
begin
  select first_enquiry_id into first_e from persons where id = new.person_id;
  if new.enquiry_id is null or new.enquiry_id = first_e
     or exists (select 1 from sales_enquiries where id = new.enquiry_id and sold_at is not null) then
    select id into latest from sales_enquiries
     where person_id = new.person_id and data_category = new.data_category and sold_at is null
     order by created_at desc limit 1;
    if latest is not null then new.enquiry_id := latest; end if;
  end if;
  return new;
end $$;
create trigger offer_enquiry_link before insert on sales_offers
  for each row execute function app.offer_enquiry_link();

create or replace function app.enquiry_stage_from_offer() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.enquiry_id is not null and new.status in ('sent','accepted','sold') then
    update sales_enquiries set offered_at = coalesce(new.sent_at, now()), contacted_at = coalesce(contacted_at, new.sent_at, now())
     where id = new.enquiry_id and offered_at is null;
  end if;
  return null;
end $$;
create trigger enquiry_stage after insert or update of status on sales_offers
  for each row execute function app.enquiry_stage_from_offer();

create or replace function app.sale_franchise_attribution() returns trigger language plpgsql security definer set search_path = public as $$
declare e sales_enquiries;
begin
  if new.enquiry_id is null then select enquiry_id into new.enquiry_id from sales_offers where id = new.offer_id; end if;
  select * into e from sales_enquiries where id = new.enquiry_id;
  if e.franchise_outlet_id is not null then
    new.franchise_partner_id := e.franchise_partner_id;
    new.franchise_outlet_id := e.franchise_outlet_id;
    new.outlet_staff_id := e.outlet_staff_id;
    new.referrer_member_id := e.referrer_member_id;
  end if;
  return new;
end $$;
create trigger franchise_attribution before insert on sales_records
  for each row execute function app.sale_franchise_attribution();

create or replace function app.enquiry_stage_from_sale() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.enquiry_id is not null then
    update sales_enquiries set sold_at = new.created_at, offered_at = coalesce(offered_at, new.created_at),
      contacted_at = coalesce(contacted_at, new.created_at)
     where id = new.enquiry_id and sold_at is null;
  end if;
  return null;
end $$;
create trigger enquiry_stage after insert on sales_records
  for each row execute function app.enquiry_stage_from_sale();

-- ------------------------------------------------------------------ 6. Row-level security
-- Staff read franchise set-up in the active category; every write goes through the franchise_* functions below.
do $$ declare t text; begin
  foreach t in array array['franchise_partners','franchise_outlets','franchise_outlet_staff'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy staff_read on %I for select to authenticated
      using (tenant_id = (select app.tenant_id()) and (select app.is_staff()))$p$, t);
    execute format($p$create policy category_scope on %I as restrictive for select to authenticated
      using (data_category = (select app.active_category()))$p$, t);
  end loop;
end $$;
create policy self_read on franchise_outlet_staff for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------ 7. Shared helpers for the franchise functions
-- Finds one team member by id or name; returns choices when the name matches more than one person.
create or replace function app.pick_member(p_tenant uuid, p_member uuid, p_name text, p_category text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v text := nullif(trim(coalesce(p_name, '')), ''); n int; mid uuid; cands jsonb;
begin
  if p_member is not null then
    select id into mid from sales_team_members where id = p_member and tenant_id = p_tenant and status <> 'suspended';
    if mid is null then raise exception using message = 'not_found', detail = 'That team member is not in your brokerage.'; end if;
    return jsonb_build_object('outcome', 'found', 'member_id', mid);
  end if;
  if v is null then return jsonb_build_object('outcome', 'none'); end if;
  with c as (
    select m.id, case when lower(m.full_name) = lower(v) or upper(v) = m.referral_code or lower(m.email) = lower(v) then 3
                      when lower(split_part(m.full_name, ' ', 1)) = lower(v) then 2 else 1 end as rank,
           greatest(similarity(m.full_name, v), word_similarity(v, m.full_name)) as score
      from sales_team_members m
     where m.tenant_id = p_tenant and m.status <> 'suspended'
       and (lower(m.full_name) = lower(v) or upper(v) = m.referral_code or lower(m.email) = lower(v)
            or lower(split_part(m.full_name, ' ', 1)) = lower(v) or m.full_name ilike '%' || v || '%' or word_similarity(v, m.full_name) > 0.45)
  ), best as (select * from c where rank = (select max(rank) from c))
  select count(*), (array_agg(id order by score desc))[1],
         jsonb_agg(app.member_json(id, p_category) || jsonb_build_object('record_type', 'team_member', 'id', id,
           'number', (select referral_code from sales_team_members where id = best.id),
           'detail', (select concat_ws(' · ', case sales_role when 'broker' then 'Broker' when 'sub_broker' then 'Sub-broker' else 'Agent' end, service_area)
                        from sales_team_members where id = best.id)) order by score desc)
    into n, mid, cands from best;
  if n = 1 then return jsonb_build_object('outcome', 'found', 'member_id', mid); end if;
  if n = 0 then
    raise exception using message = 'needs_input', detail = format('No one called %s is on your team. Check the name, or invite them first.', v);
  end if;
  return jsonb_build_object('outcome', 'needs_input', 'reason', 'ambiguous_member', 'category', p_category,
    'summary', format('More than one team member matches "%s". Which one should receive the enquiries?', v), 'choices', cands);
end $$;
revoke all on function app.pick_member(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function app.issue_outlet_invitation(p_staff uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s franchise_outlet_staff; token text := encode(gen_random_bytes(24), 'hex'); inv uuid;
begin
  select * into s from franchise_outlet_staff where id = p_staff;
  if s.email is null then return null; end if;
  update brokerage_invitations set revoked_at = now() where outlet_staff_id = s.id and accepted_at is null and revoked_at is null;
  insert into brokerage_invitations (tenant_id, email, role, kind, token_hash, expires_at, invited_by, outlet_staff_id)
  values (s.tenant_id, lower(s.email), case s.outlet_role when 'manager' then 'outlet_manager' else 'outlet_staff' end, 'outlet',
    encode(digest(token, 'sha256'), 'hex'), now() + interval '14 days', auth.uid(), s.id)
  returning id into inv;
  update franchise_outlet_staff set invitation_id = inv, updated_at = now() where id = s.id;
  return token;
end $$;
revoke all on function app.issue_outlet_invitation(uuid) from public, anon, authenticated;

-- Puts the outlet on the enquiry's follow-up so the handler sees the source in their work queue.
create or replace function app.tag_enquiry_task(p_enquiry uuid) returns void language plpgsql security definer set search_path = public as $$
declare e sales_enquiries; v text;
begin
  select * into e from sales_enquiries where id = p_enquiry;
  if e.franchise_outlet_id is null then return; end if;
  v := 'Franchise: ' || app.outlet_label(e.franchise_outlet_id)
    || coalesce(' · referred by ' || (select full_name from franchise_outlet_staff where id = e.outlet_staff_id), '');
  update tasks set detail = v || coalesce(' · ' || detail, ''), updated_at = now()
   where dedupe_key = 'enquiry:' || e.id and (detail is null or detail not like 'Franchise:%');
end $$;
revoke all on function app.tag_enquiry_task(uuid) from public, anon, authenticated;

create or replace function app.check_public_enquiry(p_first_names text, p_surname text, p_phone text, p_email text, p_consent boolean, p_client_key text)
returns void language plpgsql immutable set search_path = public as $$
begin
  if coalesce(trim(p_first_names), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception using message = 'needs_input', detail = 'Please give your first name and surname.';
  end if;
  if app.norm_phone(p_phone) is null and nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception using message = 'needs_input', detail = 'Please give a phone number or email address so we can contact you.';
  end if;
  if not coalesce(p_consent, false) then
    raise exception using message = 'needs_input', detail = 'Please agree that we may use your details to contact you about cover.';
  end if;
  if coalesce(length(p_client_key), 0) < 8 then raise exception using message = 'validation', detail = 'Missing submission key.'; end if;
end $$;

-- ------------------------------------------------------------------ 8. Referral codes now include outlets (extends 0019)
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
      'role_label', 'Franchise outlet', 'brokerage', coalesce(org.trading_name, org.name), 'category', o.data_category,
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
    'live_accepting', org.lifecycle_status = 'active');
end $$;

create or replace function public.referral_submit_enquiry(p_code text, p_first_names text, p_surname text, p_phone text, p_email text,
  p_interest text, p_message text, p_consent boolean, p_client_key text, p_category text default 'live')
returns jsonb language plpgsql security definer set search_path = public as $$
declare m sales_team_members; org organisations; v text := upper(trim(coalesce(p_code, ''))); r jsonb; cat text := coalesce(p_category, 'live');
  recent int; rc record; o franchise_outlets; s franchise_outlet_staff;
begin
  if cat not in ('sample','live') then raise exception using message = 'validation', detail = 'Unknown category.'; end if;
  select * into rc from app.resolve_code(v) x limit 1;
  if rc.code_kind is null or not rc.code_active then
    raise exception using message = 'validation', detail = 'We could not find that referral code. Check it and try again.';
  end if;
  select * into org from organisations where id = rc.code_tenant;
  if rc.code_kind <> 'member' then
    -- An outlet is either Sample or Live; its enquiries follow the outlet.
    cat := rc.code_category;
    select * into o from franchise_outlets where id = rc.code_outlet;
    select * into s from franchise_outlet_staff where id = rc.code_staff;
    if rc.code_assignee is null then
      raise exception using message = 'validation', detail = format('%s is not ready to take enquiries online yet. Please ask the outlet to contact us.', o.name);
    end if;
  else
    select * into m from sales_team_members where id = rc.code_member;
  end if;
  if cat = 'live' and org.lifecycle_status <> 'active' then
    raise exception using message = 'validation', detail = format('%s is not accepting enquiries online yet. Please contact them directly.', coalesce(org.trading_name, org.name));
  end if;
  perform app.check_public_enquiry(p_first_names, p_surname, p_phone, p_email, p_consent, p_client_key);
  select count(*) into recent from sales_enquiries where referral_code = v and created_at > now() - interval '1 hour';
  if recent >= 30 then
    raise exception using message = 'validation', detail = 'We are receiving a lot of enquiries for this code. Please try again later.';
  end if;

  r := app.create_enquiry(rc.code_tenant, cat, case when p_client_key like 'link:%' then 'referral_link' else 'referral_code' end, v,
    rc.code_referrer, rc.code_assignee, p_first_names, p_surname, p_phone, p_email, p_interest, p_message, now(), null, false, false, true, null,
    'public:' || p_client_key);
  perform app.tag_enquiry_task((r ->> 'enquiry_id')::uuid);
  -- The customer sees only the reference and who will contact them.
  return jsonb_build_object('ok', true, 'reference', r ->> 'reference',
    'referrer_name', case when rc.code_kind = 'member' then split_part(m.full_name, ' ', 1)
                          else coalesce(split_part(s.full_name, ' ', 1), o.name) end,
    'outlet_label', case when o.id is not null then app.outlet_label(o.id) end,
    'brokerage', coalesce(org.trading_name, org.name), 'category', cat);
end $$;

create or replace function public.sales_capture_enquiry(p_category text, p_first_names text, p_surname text, p_idempotency_key text,
  p_phone text default null, p_email text default null, p_interest text default null, p_note text default null,
  p_referral_code text default null, p_source text default 'phone', p_assign_member_id uuid default null,
  p_link_person_id uuid default null, p_force_new boolean default false, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); me uuid := app.my_member_id();
  rc record; assignee uuid; r jsonb; v_code text := nullif(upper(trim(coalesce(p_referral_code, ''))), ''); v_outlet text;
  v_referrer uuid; v_routed uuid;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_first_names), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception using message = 'needs_input', detail = 'Give the prospect''s first names and surname.';
  end if;
  if v_code is not null then
    select * into rc from app.resolve_code(v_code) x limit 1;
    if rc.code_kind is null or not rc.code_active then
      raise exception using message = 'validation', detail = format('Referral code %s is not recognised. Check the code and try again.', v_code);
    end if;
    if rc.code_tenant <> t then
      raise exception using message = 'validation', detail = format('Referral code %s belongs to a different brokerage.', v_code);
    end if;
    if rc.code_kind <> 'member' and rc.code_category <> p_category then
      raise exception using message = 'validation',
        detail = format('Code %s belongs to a %s outlet. Switch to %s to load this enquiry.', v_code, initcap(rc.code_category), initcap(rc.code_category));
    end if;
    if rc.code_outlet is not null then v_outlet := app.outlet_label(rc.code_outlet); end if;
    v_referrer := rc.code_referrer;
    v_routed := rc.code_assignee;
  end if;
  assignee := coalesce(p_assign_member_id, v_routed, me);
  if assignee is null then
    raise exception using message = 'needs_input', detail = 'You do not have a sales profile in this brokerage yet. Open My workspace to set it up.';
  end if;
  if not exists (select 1 from sales_team_members where id = assignee and tenant_id = t) then
    raise exception using message = 'not_found', detail = 'That team member is not in your brokerage.';
  end if;
  if app.book_restricted() and assignee is distinct from me then
    raise exception using message = 'forbidden', detail = 'You can only load enquiries against your own code. Ask your broker to load it for a colleague.';
  end if;
  -- Linking to an existing client keeps that client's assignment and original referrer; the enquiry records this referral.
  r := app.create_enquiry(t, p_category, case when v_code is not null then 'referral_code' when p_copilot in ('ar','ava','russ') then 'copilot'
      when p_source in ('phone','manual') then p_source else 'manual' end,
    v_code, v_referrer, assignee, p_first_names, p_surname, p_phone, p_email, p_interest, p_note, now(),
    p_link_person_id, p_force_new, true, false, auth.uid(), 'staff:' || p_idempotency_key);
  if r ->> 'outcome' = 'needs_input' then return r; end if;
  perform app.tag_enquiry_task((r ->> 'enquiry_id')::uuid);

  return copilot_log_saved(p_category, p_copilot, 'sales.enquiry.capture',
    jsonb_build_object('first_names', p_first_names, 'surname', p_surname, 'referral_code', v_code, 'link_person_id', p_link_person_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_enquiries', 'id', (r ->> 'enquiry_id')::uuid, 'reference', r ->> 'reference'),
                      jsonb_build_object('table', 'persons', 'id', (r ->> 'person_id')::uuid)),
    copilot_numbers((r ->> 'person_id')::uuid, sales_primary_account((r ->> 'person_id')::uuid), null) || jsonb_build_object(
      'record_type', 'enquiry', 'id', (r ->> 'enquiry_id')::uuid, 'reference', r ->> 'reference', 'person_id', (r ->> 'person_id')::uuid,
      'person', sales_person_json((r ->> 'person_id')::uuid), 'linked_existing', p_link_person_id is not null, 'outlet', v_outlet,
      'summary', format('%s enquiry %s for %s%s, assigned to %s%s%s',
        case when p_link_person_id is not null then 'Linked' else 'Loaded' end, r ->> 'reference',
        trim(p_first_names) || ' ' || trim(p_surname),
        coalesce(' (' || (select client_number from persons where id = (r ->> 'person_id')::uuid) || ')', ''),
        (select full_name from sales_team_members where id = coalesce((select assigned_member_id from persons where id = (r ->> 'person_id')::uuid), assignee)),
        coalesce(' · franchise ' || v_outlet, ''),
        coalesce(' · referred by ' || (select full_name || ' (' || referral_code || ')' from sales_team_members
                 where id = coalesce((select referrer_member_id from persons where id = (r ->> 'person_id')::uuid), v_referrer)), '')),
      'open_path', case when r ->> 'person_id' is not null then '/broker/book/clients/' || (r ->> 'person_id') else '/broker/book' end),
    'sales_enquiries', (r ->> 'enquiry_id')::uuid);
end $$;

-- ------------------------------------------------------------------ 9. Team lookup for Russ
create or replace function public.sales_find_member(p_category text, p_query text) returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare t uuid := sales_guard(p_category); v text := nullif(trim(coalesce(p_query, '')), '');
begin
  if v is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(app.member_json(x.id, p_category) || jsonb_build_object('record_type', 'team_member', 'id', x.id,
      'number', x.referral_code, 'detail', concat_ws(' · ', case x.sales_role when 'broker' then 'Broker' when 'sub_broker' then 'Sub-broker' else 'Agent' end, x.service_area),
      'score', round(x.score::numeric, 3)) order by x.rank desc, x.score desc)
    from (select m.*, case when lower(m.full_name) = lower(v) or upper(v) = m.referral_code then 3
                           when lower(split_part(m.full_name, ' ', 1)) = lower(v) then 2 else 1 end as rank,
                 greatest(similarity(m.full_name, v), word_similarity(v, m.full_name)) as score
            from sales_team_members m
           where m.tenant_id = t and m.status <> 'suspended'
             and (lower(m.full_name) = lower(v) or upper(v) = m.referral_code or lower(split_part(m.full_name, ' ', 1)) = lower(v)
                  or m.full_name ilike '%' || v || '%' or word_similarity(v, m.full_name) > 0.45)
           limit 8) x), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ 10. Set up franchisees, outlets and outlet staff
-- One step: create or reopen the franchisee and outlet, save routing, invite the outlet manager, return the code and link.
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
      'summary', format('%s %s with its %s outlet. Enquiries go to %s (%s). Customer code %s',
        case when partner_new then 'Set up' else 'Reopened' end, coalesce(p.trading_name, p.name), o.name,
        (select full_name from sales_team_members where id = o.receiving_member_id),
        case o.sales_mode when 'sell' then 'sell at outlet' else 'refer to broker' end, o.referral_code)
        || coalesce('. Invited ' || s.full_name || ' as outlet manager', ''),
      'open_path', '/broker/franchise?tab=franchisees&outlet=' || o.id),
    'franchise_outlets', o.id);
  -- The one-time invite link is returned to the caller but never stored in the log.
  return receipt || jsonb_build_object('invite_path', case when token is not null then '/outlet/join/' || token end);
end $$;

create or replace function public.franchise_add_outlet(p_category text, p_partner_id uuid, p_outlet_name text, p_idempotency_key text,
  p_service_area text default null, p_receiving_member_id uuid default null, p_sales_mode text default null,
  p_manager_name text default null, p_manager_email text default null, p_manager_phone text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(coalesce(p_outlet_name, '')), '') is null then
    raise exception using message = 'needs_input', detail = 'What is the new outlet called?';
  end if;
  return franchise_setup(p_category, null, p_idempotency_key, p_outlet_name, p_service_area, p_receiving_member_id, null, p_sales_mode,
    p_manager_name, p_manager_email, p_manager_phone, p_partner_id, p_copilot);
end $$;

create or replace function public.franchise_update_outlet(p_category text, p_outlet_id uuid, p_idempotency_key text,
  p_name text default null, p_service_area text default null, p_receiving_member_id uuid default null, p_receiving_member_name text default null,
  p_sales_mode text default null, p_status text default null, p_partner_status text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o franchise_outlets; recv uuid; pick jsonb;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then raise exception using message = 'forbidden', detail = 'Only the broker can change outlet routing.'; end if;
  select * into o from franchise_outlets where id = p_outlet_id and tenant_id = t and data_category = p_category for update;
  if o.id is null then raise exception using message = 'not_found', detail = 'That outlet is not in this brokerage and category.'; end if;
  if p_sales_mode is not null and p_sales_mode not in ('refer','sell') then
    raise exception using message = 'validation', detail = 'Sales mode must be "refer" or "sell".';
  end if;
  if p_status is not null and p_status not in ('active','paused') then raise exception using message = 'validation', detail = 'Status must be active or paused.'; end if;
  if p_partner_status is not null and p_partner_status not in ('active','paused') then
    raise exception using message = 'validation', detail = 'Franchisee status must be active or paused.';
  end if;
  if p_receiving_member_id is not null or nullif(trim(coalesce(p_receiving_member_name, '')), '') is not null then
    pick := app.pick_member(t, p_receiving_member_id, p_receiving_member_name, p_category);
    if pick ->> 'outcome' = 'needs_input' then return pick; end if;
    recv := (pick ->> 'member_id')::uuid;
  end if;
  update franchise_outlets set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name), service_area = coalesce(nullif(trim(coalesce(p_service_area, '')), ''), service_area),
    receiving_member_id = coalesce(recv, receiving_member_id), sales_mode = coalesce(p_sales_mode, sales_mode), status = coalesce(p_status, status), updated_at = now()
   where id = o.id returning * into o;
  if p_partner_status is not null then
    update franchise_partners set status = p_partner_status, updated_at = now() where id = o.partner_id;
  end if;
  return copilot_log_saved(p_category, p_copilot, 'franchise.outlet.update',
    jsonb_build_object('outlet_id', o.id, 'name', p_name, 'service_area', p_service_area, 'receiving_member_id', recv, 'sales_mode', p_sales_mode,
      'status', p_status, 'partner_status', p_partner_status), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'franchise_outlets', 'id', o.id, 'reference', o.referral_code)),
    jsonb_build_object('record_type', 'franchise_outlet', 'id', o.id, 'reference', o.referral_code, 'outlet', app.outlet_json(o.id),
      'summary', format('Updated %s: %s, enquiries go to %s%s', app.outlet_label(o.id),
        case o.sales_mode when 'sell' then 'sell at outlet' else 'refer to broker' end,
        (select full_name from sales_team_members where id = o.receiving_member_id), case when o.status = 'paused' then ' (paused)' else '' end),
      'open_path', '/broker/franchise?tab=franchisees&outlet=' || o.id),
    'franchise_outlets', o.id);
end $$;

-- Outlet staff get referral access only. Selling at the outlet needs an existing B-Covered seller (franchise_link_seller).
create or replace function public.franchise_invite_staff(p_category text, p_outlet_id uuid, p_full_name text, p_idempotency_key text,
  p_email text default null, p_phone text default null, p_outlet_role text default 'staff', p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o franchise_outlets; s franchise_outlet_staff;
  v_name text := nullif(trim(coalesce(p_full_name, '')), ''); v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); token text;
  found boolean := false; receipt jsonb;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then raise exception using message = 'forbidden', detail = 'Only the broker can invite outlet staff.'; end if;
  if coalesce(p_outlet_role, 'staff') not in ('manager','staff') then
    raise exception using message = 'validation', detail = 'Outlet role must be manager or staff.';
  end if;
  if v_name is null then raise exception using message = 'needs_input', detail = 'Give the staff member''s full name.'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using message = 'validation', detail = 'That email address does not look right.';
  end if;
  select * into o from franchise_outlets where id = p_outlet_id and tenant_id = t and data_category = p_category;
  if o.id is null then raise exception using message = 'not_found', detail = 'That outlet is not in this brokerage and category.'; end if;

  select * into s from franchise_outlet_staff where outlet_id = o.id
     and ((v_email is not null and lower(email) = v_email) or lower(full_name) = lower(v_name))
   order by (lower(email) = v_email) desc nulls last limit 1;
  if s.id is not null then
    found := true;
    update franchise_outlet_staff set email = coalesce(email, v_email), phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
      outlet_role = case when coalesce(p_outlet_role, 'staff') = 'manager' then 'manager' else outlet_role end, updated_at = now()
     where id = s.id returning * into s;
  else
    insert into franchise_outlet_staff (tenant_id, data_category, outlet_id, full_name, email, phone, outlet_role, referral_code, status, invited_by)
    values (t, p_category, o.id, v_name, v_email, nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_outlet_role, 'staff'),
      app.new_referral_code(v_name), 'invited', auth.uid())
    returning * into s;
  end if;
  if s.user_id is null and s.email is not null and app.outlet_invite_status(s.id) in ('not_sent','expired','revoked') then
    token := app.issue_outlet_invitation(s.id);
  end if;

  receipt := copilot_log_saved(p_category, p_copilot, 'franchise.staff.invite',
    jsonb_build_object('outlet_id', o.id, 'full_name', v_name, 'email', v_email, 'outlet_role', p_outlet_role), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'franchise_outlet_staff', 'id', s.id, 'reference', s.referral_code)),
    jsonb_build_object('record_type', 'outlet_staff', 'id', s.id, 'reference', s.referral_code, 'staff', app.outlet_staff_json(s.id),
      'outlet', app.outlet_json(o.id), 'existing', found,
      'summary', format('%s %s as %s at %s. Personal referral code %s%s', case when found then 'Updated' else 'Added' end, s.full_name,
        case s.outlet_role when 'manager' then 'outlet manager' else 'outlet staff' end, app.outlet_label(o.id), s.referral_code,
        case when s.email is null then '. Add an email address to send a sign-in invitation' else '' end),
      'open_path', '/broker/franchise?tab=franchisees&outlet=' || o.id),
    'franchise_outlet_staff', s.id);
  return receipt || jsonb_build_object('invite_path', case when token is not null then '/outlet/join/' || token end);
end $$;

create or replace function public.franchise_staff_invite_link(p_category text, p_staff_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); s franchise_outlet_staff; token text;
begin
  if not app.can_manage_team() then raise exception using message = 'forbidden', detail = 'Only the broker can issue invitation links.'; end if;
  select * into s from franchise_outlet_staff where id = p_staff_id and tenant_id = t and data_category = p_category;
  if s.id is null then raise exception using message = 'not_found', detail = 'That outlet staff member is not in your brokerage.'; end if;
  if s.user_id is not null then raise exception using message = 'validation', detail = format('%s has already joined.', s.full_name); end if;
  if s.email is null then raise exception using message = 'needs_input', detail = format('Add %s''s email address first.', s.full_name); end if;
  token := app.issue_outlet_invitation(s.id);
  return jsonb_build_object('staff', app.outlet_staff_json(s.id), 'invite_path', '/outlet/join/' || token);
end $$;

-- Lets an existing B-Covered seller (broker, sub-broker or agent) sell at an outlet. In "sell" mode, enquiries under their
-- outlet code go to them; the outlet keeps the credit.
create or replace function public.franchise_link_seller(p_category text, p_outlet_id uuid, p_idempotency_key text,
  p_member_id uuid default null, p_member_name text default null, p_outlet_role text default 'staff', p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o franchise_outlets; m sales_team_members;
  s franchise_outlet_staff; pick jsonb;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then raise exception using message = 'forbidden', detail = 'Only the broker can authorise sellers at an outlet.'; end if;
  select * into o from franchise_outlets where id = p_outlet_id and tenant_id = t and data_category = p_category;
  if o.id is null then raise exception using message = 'not_found', detail = 'That outlet is not in this brokerage and category.'; end if;
  pick := app.pick_member(t, p_member_id, p_member_name, p_category);
  if pick ->> 'outcome' = 'needs_input' then return pick; end if;
  if pick ->> 'outcome' = 'none' then raise exception using message = 'needs_input', detail = 'Which team member should sell at this outlet?'; end if;
  select * into m from sales_team_members where id = (pick ->> 'member_id')::uuid;
  if m.status <> 'active' or m.user_id is null then
    raise exception using message = 'validation',
      detail = format('%s has not joined B-Covered yet. They can sell at the outlet once they accept their team invitation.', m.full_name);
  end if;

  select * into s from franchise_outlet_staff where outlet_id = o.id
     and (sales_member_id = m.id or (m.email is not null and lower(email) = lower(m.email)) or user_id = m.user_id)
   order by (sales_member_id = m.id) desc nulls last limit 1;
  if s.id is null then
    insert into franchise_outlet_staff (tenant_id, data_category, outlet_id, user_id, full_name, email, phone, outlet_role, referral_code,
      sales_member_id, status, invited_by)
    values (t, p_category, o.id, m.user_id, m.full_name, lower(m.email), m.phone, coalesce(p_outlet_role, 'staff'), app.new_referral_code(m.full_name),
      m.id, 'active', auth.uid())
    returning * into s;
  else
    update franchise_outlet_staff set sales_member_id = m.id, user_id = coalesce(user_id, m.user_id), status = 'active',
      outlet_role = case when coalesce(p_outlet_role, 'staff') = 'manager' then 'manager' else outlet_role end, updated_at = now()
     where id = s.id returning * into s;
  end if;

  return copilot_log_saved(p_category, p_copilot, 'franchise.seller.link',
    jsonb_build_object('outlet_id', o.id, 'member_id', m.id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'franchise_outlet_staff', 'id', s.id, 'reference', s.referral_code)),
    jsonb_build_object('record_type', 'outlet_staff', 'id', s.id, 'reference', s.referral_code, 'staff', app.outlet_staff_json(s.id),
      'outlet', app.outlet_json(o.id),
      'summary', format('%s can now sell at %s. Their outlet code is %s%s', m.full_name, app.outlet_label(o.id), s.referral_code,
        case when o.sales_mode = 'refer' then ' (the outlet is set to "refer to broker"; switch it to "sell at outlet" to route their enquiries to them)' else '' end),
      'open_path', '/broker/franchise?tab=franchisees&outlet=' || o.id),
    'franchise_outlet_staff', s.id);
end $$;

-- ------------------------------------------------------------------ 11. Franchise views for the brokerage
create or replace function public.franchise_list(p_category text) returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category);
begin
  return jsonb_build_object('category', p_category, 'can_manage', app.can_manage_team(),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.trading_name, p.name), 'status', p.status,
        'created_at', p.created_at,
        'outlets', coalesce((select jsonb_agg(app.outlet_json(o.id) || jsonb_build_object(
            'staff', (select count(*) from franchise_outlet_staff s where s.outlet_id = o.id and s.status <> 'suspended'),
            'enquiries', (select count(*) from sales_enquiries e where e.franchise_outlet_id = o.id),
            'sold', (select count(*) from sales_enquiries e where e.franchise_outlet_id = o.id and e.sold_at is not null))
          order by o.name) from franchise_outlets o where o.partner_id = p.id), '[]'))
      order by p.name) from franchise_partners p where p.tenant_id = t and p.data_category = p_category), '[]'));
end $$;

create or replace function public.franchise_outlet_detail(p_category text, p_outlet_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); o franchise_outlets;
begin
  select * into o from franchise_outlets where id = p_outlet_id and tenant_id = t;
  if o.id is null then raise exception using message = 'not_found', detail = 'That outlet is not available in this category.'; end if;
  return app.outlet_json(o.id) || jsonb_build_object(
    'can_manage', app.can_manage_team(),
    'staff', coalesce((select jsonb_agg(app.outlet_staff_json(s.id) || jsonb_build_object(
        'referrals', (select count(*) from sales_enquiries e where e.outlet_staff_id = s.id))
      order by (s.outlet_role = 'manager') desc, s.full_name) from franchise_outlet_staff s where s.outlet_id = o.id), '[]'),
    'counts', (select jsonb_build_object('enquiries', count(*), 'contacted', count(*) filter (where contacted_at is not null),
        'offered', count(*) filter (where offered_at is not null), 'sold', count(*) filter (where sold_at is not null))
      from sales_enquiries e where e.franchise_outlet_id = o.id),
    'team', case when app.can_manage_team() then
      (select jsonb_agg(app.member_json(m.id, p_category) order by m.full_name) from sales_team_members m where m.tenant_id = t and m.status <> 'suspended')
      else '[]'::jsonb end);
end $$;

-- Franchise enquiries: one row per enquiry. Status: uncontacted | contacted | offered | sold (null for all).
create or replace function public.franchise_enquiry_grid(p_category text, p_status text default null, p_outlet_id uuid default null,
  p_partner_id uuid default null, p_from date default null, p_to date default null, p_query text default null,
  p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); q text := nullif(trim(coalesce(p_query, '')), ''); rows jsonb; totals jsonb;
  v_stage text := case p_status when 'uncontacted' then 'received' when 'received' then null when 'all' then null else p_status end;
begin
  if v_stage is not null and v_stage not in ('received','contacted','offered','sold') then
    raise exception using message = 'validation', detail = 'Status must be uncontacted, contacted, offered or sold.';
  end if;
  with base as (
    select e.*, app.enquiry_stage(e) as stage, pr.client_number, pr.assigned_member_id as person_assignee,
           trim(coalesce(pr.preferred_name, pr.first_names, e.first_names) || ' ' || coalesce(pr.surname, e.surname)) as display_name
      from sales_enquiries e left join persons pr on pr.id = e.person_id
     where e.tenant_id = t and e.franchise_outlet_id is not null
       and (p_outlet_id is null or e.franchise_outlet_id = p_outlet_id)
       and (p_partner_id is null or e.franchise_partner_id = p_partner_id)
       and e.created_at >= app.period_start(p_from) and e.created_at < app.period_end(p_to)
       and (q is null or e.reference ilike q or pr.client_number ilike q or (e.first_names || ' ' || e.surname) ilike '%' || q || '%'
            or coalesce(e.phone, '') ilike '%' || q || '%')
  )
  select
    coalesce((select jsonb_agg(r order by (r ->> 'received_at') desc) from (
      select jsonb_build_object('id', b.id, 'reference', b.reference, 'received_at', b.created_at, 'source', b.source,
        'stage', b.stage, 'stage_label', app.stage_label(b.stage), 'contacted_at', b.contacted_at, 'offered_at', b.offered_at, 'sold_at', b.sold_at,
        'outlet', jsonb_build_object('id', b.franchise_outlet_id, 'label', app.outlet_label(b.franchise_outlet_id),
                   'area', (select service_area from franchise_outlets where id = b.franchise_outlet_id)),
        'referred_by', (select jsonb_build_object('id', s.id, 'name', s.full_name, 'code', s.referral_code) from franchise_outlet_staff s where s.id = b.outlet_staff_id),
        'client', case when b.person_id is not null then jsonb_build_object('id', b.person_id, 'client_number', b.client_number, 'name', b.display_name) end,
        'name', b.display_name, 'phone', b.phone, 'email', b.email, 'interest', b.interest, 'match_status', b.match_status,
        'handler', app.member_json(coalesce(b.person_assignee, b.assigned_member_id), p_category),
        'next_follow_up', (select jsonb_build_object('id', k.id, 'title', k.title, 'due_date', k.due_date)
                             from tasks k where k.status = 'open' and (k.dedupe_key = 'enquiry:' || b.id or (b.person_id is not null and k.person_id = b.person_id))
                             order by k.due_date nulls last limit 1),
        'open_path', case when b.person_id is not null then '/broker/book/clients/' || b.person_id else '/broker/book' end) as r
      from base b
      where v_stage is null or b.stage = v_stage
      order by b.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'),
    (select jsonb_build_object('received', count(*), 'uncontacted', count(*) filter (where stage = 'received'),
        'contacted', count(*) filter (where stage = 'contacted'), 'offered', count(*) filter (where stage = 'offered'),
        'sold', count(*) filter (where stage = 'sold')) from base)
    into rows, totals;
  return jsonb_build_object('category', p_category, 'status', coalesce(p_status, 'all'), 'from', p_from, 'to', p_to,
    'outlet', case when p_outlet_id is not null then app.outlet_json(p_outlet_id) end, 'rows', rows, 'totals', totals);
end $$;

-- Outlet performance for an intake period: each enquiry counts once per stage; conversion = sold / received.
create or replace function public.franchise_performance(p_category text default 'live', p_from date default null, p_to date default null,
  p_partner_id uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); rows jsonb; partners jsonb; totals jsonb;
begin
  with outs as (
    select o.id, o.partner_id, o.name, o.service_area from franchise_outlets o
     where o.tenant_id = t and o.data_category = p_category and (p_partner_id is null or o.partner_id = p_partner_id)
  ), enq as (
    select e.franchise_outlet_id, e.franchise_partner_id, e.offered_at, e.sold_at from sales_enquiries e
     where e.tenant_id = t and e.data_category = p_category and e.franchise_outlet_id is not null
       and (p_partner_id is null or e.franchise_partner_id = p_partner_id)
       and e.created_at >= app.period_start(p_from) and e.created_at < app.period_end(p_to)
  ), per_outlet as (
    select o.id, o.partner_id, count(e.franchise_outlet_id) as enquiries, count(e.offered_at) as offered, count(e.sold_at) as sold
      from outs o left join enq e on e.franchise_outlet_id = o.id group by o.id, o.partner_id
  )
  select
    coalesce((select jsonb_agg(app.outlet_json(x.id) || jsonb_build_object('enquiries', x.enquiries, 'offered', x.offered, 'sold', x.sold,
        'conversion', case when x.enquiries > 0 then round(x.sold::numeric / x.enquiries, 4) end)
      order by x.sold desc, x.enquiries desc, app.outlet_label(x.id)) from per_outlet x), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('partner_id', y.partner_id,
        'name', (select coalesce(trading_name, name) from franchise_partners where id = y.partner_id), 'outlets', y.outlets,
        'enquiries', y.enquiries, 'offered', y.offered, 'sold', y.sold,
        'conversion', case when y.enquiries > 0 then round(y.sold::numeric / y.enquiries, 4) end) order by y.sold desc, y.enquiries desc)
      from (select partner_id, count(*) as outlets, sum(enquiries) as enquiries, sum(offered) as offered, sum(sold) as sold
              from per_outlet group by partner_id) y), '[]'),
    (select jsonb_build_object('outlets', count(*), 'enquiries', coalesce(sum(enquiries), 0), 'offered', coalesce(sum(offered), 0),
        'sold', coalesce(sum(sold), 0), 'conversion', case when sum(enquiries) > 0 then round(sum(sold)::numeric / sum(enquiries), 4) end) from per_outlet)
    into rows, partners, totals;
  return jsonb_build_object('category', p_category, 'basis', 'intake', 'from', p_from, 'to', p_to,
    'partner', case when p_partner_id is not null then (select jsonb_build_object('id', id, 'name', coalesce(trading_name, name)) from franchise_partners where id = p_partner_id) end,
    'rows', rows, 'partners', partners, 'totals', totals,
    'note', case when p_category = 'live' and not app.tenant_operational() and not app.is_platform_staff()
                 then 'Live opens once B-Covered activates your brokerage. Switch to Sample to see test results.' end);
end $$;

-- Confirmed sales by originating outlet, by sale date.
create or replace function public.franchise_sales(p_category text default 'live', p_from date default null, p_to date default null,
  p_outlet_id uuid default null, p_partner_id uuid default null, p_limit int default 200)
returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); rows jsonb; by_outlet jsonb; totals jsonb;
begin
  with s as (
    select x.* from sales_records x
     where x.tenant_id = t and x.data_category = p_category and x.franchise_outlet_id is not null
       and (p_outlet_id is null or x.franchise_outlet_id = p_outlet_id)
       and (p_partner_id is null or x.franchise_partner_id = p_partner_id)
       and x.created_at >= app.period_start(p_from) and x.created_at < app.period_end(p_to)
  )
  select
    coalesce((select jsonb_agg(r order by (r ->> 'sold_at') desc) from (
      select jsonb_build_object('id', s.id, 'reference', s.reference, 'sold_at', s.created_at, 'cover_start_date', s.cover_start_date,
        'insurer_reference', s.insurer_reference, 'premium_amount', s.premium_amount, 'premium_frequency', s.premium_frequency,
        'outlet', jsonb_build_object('id', s.franchise_outlet_id, 'label', app.outlet_label(s.franchise_outlet_id)),
        'offer', (select jsonb_build_object('id', o.id, 'reference', o.reference, 'insurer', o.insurer_name, 'product', o.product)
                    from sales_offers o where o.id = s.offer_id),
        'enquiry', (select jsonb_build_object('id', e.id, 'reference', e.reference, 'received_at', e.created_at) from sales_enquiries e where e.id = s.enquiry_id),
        'client', (select jsonb_build_object('id', p.id, 'client_number', p.client_number, 'name', trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname))
                     from persons p where p.id = s.person_id),
        'referred_by', (select jsonb_build_object('id', f.id, 'name', f.full_name) from franchise_outlet_staff f where f.id = s.outlet_staff_id),
        'seller', app.member_json(s.sold_by_member_id, p_category),
        'open_path', '/broker/book/clients/' || s.person_id) as r
      from s order by s.created_at desc limit greatest(1, least(coalesce(p_limit, 200), 1000))) z), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('outlet_id', g.franchise_outlet_id, 'label', app.outlet_label(g.franchise_outlet_id),
        'partner_id', g.franchise_partner_id, 'sales', g.sales, 'monthly_premium', g.monthly_premium) order by g.sales desc)
      from (select franchise_outlet_id, franchise_partner_id, count(*) as sales,
                   round(sum(case premium_frequency when 'annually' then premium_amount / 12 when 'quarterly' then premium_amount / 3 else premium_amount end), 2) as monthly_premium
              from s group by franchise_outlet_id, franchise_partner_id) g), '[]'),
    (select jsonb_build_object('sales', count(*), 'outlets', count(distinct franchise_outlet_id),
        'monthly_premium', coalesce(round(sum(case premium_frequency when 'annually' then premium_amount / 12 when 'quarterly' then premium_amount / 3 else premium_amount end), 2), 0)) from s)
    into rows, by_outlet, totals;
  return jsonb_build_object('category', p_category, 'basis', 'sale_date', 'from', p_from, 'to', p_to,
    'outlet', case when p_outlet_id is not null then app.outlet_json(p_outlet_id) end,
    'rows', rows, 'by_outlet', by_outlet, 'totals', totals,
    'note', case when p_category = 'live' and not app.tenant_operational() and not app.is_platform_staff()
                 then 'Live opens once B-Covered activates your brokerage. Switch to Sample to see test results.' end);
end $$;

-- Per-enquiry attribution on a client record: who referred, who is handling, who sold.
create or replace function public.franchise_client_attribution(p_category text, p_person_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); pr persons;
begin
  select * into pr from persons where id = p_person_id;
  if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not available to you in this category.'; end if;
  return jsonb_build_object('person_id', pr.id, 'client_number', pr.client_number,
    'enquiries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'reference', e.reference, 'received_at', e.created_at, 'source', e.source,
        'channel', e.channel, 'stage', app.enquiry_stage(e), 'stage_label', app.stage_label(app.enquiry_stage(e)),
        'outlet', case when e.franchise_outlet_id is not null then jsonb_build_object('id', e.franchise_outlet_id, 'label', app.outlet_label(e.franchise_outlet_id)) end,
        'referred_by', coalesce(
            (select jsonb_build_object('kind', 'outlet_staff', 'name', s.full_name, 'code', s.referral_code) from franchise_outlet_staff s where s.id = e.outlet_staff_id),
            (select jsonb_build_object('kind', 'member', 'name', m.full_name, 'code', m.referral_code) from sales_team_members m where m.id = e.referrer_member_id)),
        'handled_by', app.member_json(e.assigned_member_id, p_category),
        'sold_by', (select app.member_json(r.sold_by_member_id, p_category) from sales_records r where r.enquiry_id = e.id order by r.created_at limit 1),
        'sale', (select jsonb_build_object('id', r.id, 'reference', r.reference, 'sold_at', r.created_at) from sales_records r where r.enquiry_id = e.id order by r.created_at limit 1))
      order by e.created_at desc) from sales_enquiries e where e.person_id = pr.id), '[]'));
end $$;

-- ------------------------------------------------------------------ 12. Outlet portal (outlet managers and staff)
create or replace function public.outlet_my_profile() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('signed_in', false, 'outlets', '[]'::jsonb); end if;
  return jsonb_build_object('signed_in', true, 'user_id', uid,
    'name', (select full_name from app_users where id = uid), 'email', (select email from app_users where id = uid),
    'outlets', coalesce((select jsonb_agg(jsonb_build_object(
        'staff', app.outlet_staff_json(s.id),
        'outlet', jsonb_build_object('id', o.id, 'name', o.name, 'label', app.outlet_label(o.id), 'service_area', o.service_area,
          'sales_mode', o.sales_mode, 'status', o.status, 'category', o.data_category,
          'referral_code', o.referral_code, 'referral_path', app.referral_path(o.referral_code, o.data_category),
          'receiving_name', (select split_part(full_name, ' ', 1) from sales_team_members where id = o.receiving_member_id)),
        'brokerage', (select coalesce(trading_name, name) from organisations where id = o.tenant_id),
        'live_accepting', (select lifecycle_status = 'active' from organisations where id = o.tenant_id))
      order by o.name) from franchise_outlet_staff s join franchise_outlets o on o.id = s.outlet_id
      where s.user_id = uid and s.status = 'active'), '[]'));
end $$;

-- Customer-facing progress only: initials, dates and stage. Managers see the whole outlet; staff see their own referrals.
create or replace function public.outlet_referrals(p_outlet_id uuid default null, p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception using message = 'forbidden', detail = 'Sign in to see your outlet''s referrals.'; end if;
  if not exists (select 1 from franchise_outlet_staff s where s.user_id = uid and s.status = 'active' and (p_outlet_id is null or s.outlet_id = p_outlet_id)) then
    raise exception using message = 'forbidden', detail = 'You are not linked to this outlet.';
  end if;
  return (with mine as (
      select s.* from franchise_outlet_staff s where s.user_id = uid and s.status = 'active' and (p_outlet_id is null or s.outlet_id = p_outlet_id)
    ), visible as (
      select e.*, app.enquiry_stage(e) as stage from sales_enquiries e
       where exists (select 1 from mine m where m.outlet_id = e.franchise_outlet_id and (m.outlet_role = 'manager' or e.outlet_staff_id = m.id))
    )
    select jsonb_build_object(
      'scope', case when exists (select 1 from mine where outlet_role = 'manager') then 'outlet' else 'mine' end,
      'rows', coalesce((select jsonb_agg(r order by (r ->> 'received_at') desc) from (
          select jsonb_build_object('id', v.id, 'reference', v.reference, 'received_at', v.created_at,
            'customer', split_part(v.first_names, ' ', 1) || ' ' || left(v.surname, 1) || '.',
            'interest', v.interest, 'stage', v.stage, 'progress', app.stage_label(v.stage),
            'contacted_at', v.contacted_at, 'offered_at', v.offered_at, 'sold_at', v.sold_at,
            'referred_by', (select full_name from franchise_outlet_staff where id = v.outlet_staff_id),
            'outlet', app.outlet_label(v.franchise_outlet_id), 'category', v.data_category) as r
          from visible v order by v.created_at desc limit greatest(1, least(coalesce(p_limit, 200), 1000))) x), '[]'),
      'totals', (select jsonb_build_object('received', count(*), 'contacted', count(*) filter (where contacted_at is not null),
          'offered', count(*) filter (where offered_at is not null), 'sold', count(*) filter (where sold_at is not null)) from visible)));
end $$;

-- Outlet staff capture a customer's request to be contacted, under their own code.
create or replace function public.outlet_capture_request(p_outlet_id uuid, p_first_names text, p_surname text, p_phone text, p_email text,
  p_interest text, p_message text, p_consent boolean, p_client_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s franchise_outlet_staff; rc record; org organisations; r jsonb;
begin
  if uid is null then raise exception using message = 'forbidden', detail = 'Sign in to capture a request.'; end if;
  select * into s from franchise_outlet_staff where user_id = uid and outlet_id = p_outlet_id and status = 'active';
  if s.id is null then raise exception using message = 'forbidden', detail = 'You are not linked to this outlet.'; end if;
  select * into rc from app.resolve_code(s.referral_code) x limit 1;
  if not rc.code_active then raise exception using message = 'validation', detail = 'This outlet is paused. Ask your broker to reopen it.'; end if;
  if rc.code_assignee is null then raise exception using message = 'validation', detail = 'This outlet has no receiving broker yet.'; end if;
  select * into org from organisations where id = s.tenant_id;
  if s.data_category = 'live' and org.lifecycle_status <> 'active' then
    raise exception using message = 'validation', detail = format('%s is not taking live enquiries yet.', coalesce(org.trading_name, org.name));
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null and nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception using message = 'needs_input', detail = 'Give the customer''s phone number or email address so the broker can contact them.';
  end if;
  if coalesce(trim(p_first_names), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception using message = 'needs_input', detail = 'Give the customer''s first name and surname.';
  end if;
  if not coalesce(p_consent, false) then
    raise exception using message = 'needs_input', detail = 'Confirm the customer agreed to be contacted about cover.';
  end if;
  if coalesce(length(p_client_key), 0) < 8 then raise exception using message = 'validation', detail = 'Missing submission key.'; end if;

  r := app.create_enquiry(s.tenant_id, s.data_category, 'manual', s.referral_code, rc.code_referrer, rc.code_assignee,
    p_first_names, p_surname, p_phone, p_email, p_interest, p_message, now(), null, false, false, true, uid, 'outlet:' || p_client_key);
  perform app.tag_enquiry_task((r ->> 'enquiry_id')::uuid);
  return jsonb_build_object('ok', true, 'replayed', coalesce((r ->> 'replayed')::boolean, false), 'reference', r ->> 'reference', 'progress', 'Received',
    'handler', (select split_part(full_name, ' ', 1) from sales_team_members where id = rc.code_assignee),
    'outlet', app.outlet_label(s.outlet_id), 'category', s.data_category);
end $$;

create or replace function public.franchise_invitation_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare inv brokerage_invitations; s franchise_outlet_staff;
begin
  select * into inv from brokerage_invitations where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if inv.id is null or inv.outlet_staff_id is null then return jsonb_build_object('valid', false, 'reason', 'This invitation link is not recognised.'); end if;
  select * into s from franchise_outlet_staff where id = inv.outlet_staff_id;
  return jsonb_build_object(
    'valid', inv.accepted_at is null and inv.revoked_at is null and inv.expires_at > now(),
    'reason', case when inv.accepted_at is not null then 'This invitation has already been accepted. Sign in instead.'
                   when inv.revoked_at is not null then 'This invitation was replaced by a newer link. Ask your broker for the latest one.'
                   when inv.expires_at <= now() then 'This invitation has expired. Ask your broker to send a new one.' end,
    'email', inv.email, 'name', s.full_name, 'role_label', case s.outlet_role when 'manager' then 'Outlet manager' else 'Outlet staff' end,
    'outlet', app.outlet_label(s.outlet_id),
    'brokerage', (select coalesce(trading_name, name) from organisations where id = inv.tenant_id),
    'invited_by', (select full_name from app_users where id = inv.invited_by));
end $$;

create or replace function public.franchise_accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare inv brokerage_invitations; s franchise_outlet_staff; uid uuid := auth.uid(); active_ok boolean;
begin
  if uid is null then raise exception using message = 'forbidden', detail = 'Sign in first.'; end if;
  insert into app_users (id, email, full_name) select a.id, a.email, coalesce(a.raw_user_meta_data ->> 'full_name', a.email) from auth.users a
   where a.id = uid on conflict (id) do nothing;
  select * into inv from brokerage_invitations where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if inv.id is null or inv.outlet_staff_id is null then
    raise exception using message = 'validation', detail = 'This invitation link is not recognised.';
  end if;
  if inv.accepted_by is distinct from uid then
    if inv.accepted_at is not null then raise exception using message = 'validation', detail = 'This invitation has already been accepted.'; end if;
    if inv.revoked_at is not null then raise exception using message = 'validation', detail = 'This invitation was replaced by a newer link. Ask your broker for the latest one.'; end if;
    if inv.expires_at < now() then raise exception using message = 'validation', detail = 'This invitation has expired. Ask your broker to send a new one.'; end if;
    if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', (select email from auth.users where id = uid))) then
      raise exception using message = 'forbidden', detail = format('This invitation was sent to %s. Sign in with that email address.', inv.email);
    end if;
    update brokerage_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
    -- An existing membership keeps its role (an agent who also refers at an outlet stays an agent).
    insert into organisation_memberships (tenant_id, user_id, role, invited_by)
    values (inv.tenant_id, uid, inv.role, inv.invited_by) on conflict (tenant_id, user_id) do nothing;
    select exists (select 1 from app_users u join organisation_memberships m on m.user_id = u.id and m.tenant_id = u.active_organisation_id
                    where u.id = uid and m.status = 'active') into active_ok;
    if not active_ok then update app_users set active_organisation_id = inv.tenant_id where id = uid; end if;
    insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id)
    values (inv.tenant_id, 'user', uid::text, 'outlet.invitation.accepted', 'franchise_outlet_staff', inv.outlet_staff_id);
  end if;
  update franchise_outlet_staff set user_id = uid, status = 'active', updated_at = now()
   where id = inv.outlet_staff_id and (user_id is null or user_id = uid) returning * into s;
  if s.id is null then raise exception using message = 'validation', detail = 'This outlet place is already linked to another sign-in.'; end if;
  return jsonb_build_object('outcome', 'saved', 'staff', app.outlet_staff_json(s.id), 'outlet', app.outlet_label(s.outlet_id), 'open_path', '/outlet');
end $$;

-- ------------------------------------------------------------------ 13. Access to the functions
do $$ declare f text; begin
  foreach f in array array[
    'sales_find_member(text,text)',
    'franchise_setup(text,text,text,text,text,uuid,text,text,text,text,text,uuid,text)',
    'franchise_add_outlet(text,uuid,text,text,text,uuid,text,text,text,text,text)',
    'franchise_update_outlet(text,uuid,text,text,text,uuid,text,text,text,text,text)',
    'franchise_invite_staff(text,uuid,text,text,text,text,text,text)',
    'franchise_staff_invite_link(text,uuid)',
    'franchise_link_seller(text,uuid,text,uuid,text,text,text)',
    'franchise_list(text)', 'franchise_outlet_detail(text,uuid)',
    'franchise_enquiry_grid(text,text,uuid,uuid,date,date,text,integer,integer)',
    'franchise_performance(text,date,date,uuid)',
    'franchise_sales(text,date,date,uuid,uuid,integer)',
    'franchise_client_attribution(text,uuid)',
    'outlet_my_profile()', 'outlet_referrals(uuid,integer)',
    'outlet_capture_request(uuid,text,text,text,text,text,text,boolean,text)',
    'franchise_accept_invitation(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.franchise_invitation_preview(text) from public';
  execute 'grant execute on function public.franchise_invitation_preview(text) to anon, authenticated';
end $$;
revoke all on function app.check_public_enquiry(text,text,text,text,boolean,text) from public, anon, authenticated;

commit;
