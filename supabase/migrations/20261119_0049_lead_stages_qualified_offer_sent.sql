-- Align opportunity stages with MVP: add qualified; rename proposal_released → offer_sent.

alter table leads drop constraint if exists leads_status_check;
alter table leads drop constraint if exists leads_closed_at_stage_check;

update leads set status = 'offer_sent' where status = 'proposal_released';
update leads set closed_at_stage = 'offer_sent' where closed_at_stage = 'proposal_released';

alter table leads alter column status set default 'lead';

alter table leads
  add constraint leads_status_check
  check (status = any (array[
    'lead'::text,
    'contacted'::text,
    'qualified'::text,
    'quoting'::text,
    'offer_sent'::text,
    'accepted'::text,
    'live'::text,
    'closed'::text
  ]));

alter table leads
  add constraint leads_closed_at_stage_check
  check (
    closed_at_stage is null
    or closed_at_stage = any (array[
      'lead'::text,
      'contacted'::text,
      'qualified'::text,
      'quoting'::text,
      'offer_sent'::text,
      'accepted'::text,
      'live'::text
    ])
  );

-- Keep confirm-cover sync aware of new stage names
create or replace function public.pc_sync_cover_confirmation(
  p_person_id uuid,
  p_policy_id uuid,
  p_offer_id text default null,
  p_insurer_reference text default null,
  p_cover_start_date date default null,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(p_category, app.active_category());
  cust uuid;
  offer sales_offers%rowtype;
  pol policies%rowtype;
  sale_result jsonb;
  sync_sale_id uuid;
  lead_id uuid;
  lead_updated int := 0;
  tasks_done int := 0;
  ref_text text;
  start_date date;
  sale_key text;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into pol from policies where id = p_policy_id and tenant_id = app.tenant_id();
  if pol.id is null then raise exception 'policy not found'; end if;

  select customer_id into cust from customer_persons where person_id = p_person_id limit 1;
  if cust is null then cust := pol.customer_id; end if;

  if p_offer_id is not null and trim(p_offer_id) <> '' then
    select * into offer from sales_offers
     where tenant_id = app.tenant_id() and data_category = cat
       and person_id = p_person_id
       and (id::text = trim(p_offer_id) or reference = trim(p_offer_id))
     limit 1;
  end if;

  if offer.id is null then
    select * into offer from sales_offers o
     where o.tenant_id = app.tenant_id() and o.data_category = cat and o.person_id = p_person_id
       and exists (
         select 1 from policy_versions v
          where v.policy_id = pol.id
            and (
              (v.terms->>'quote_id') = o.id::text
              or (v.terms->>'quote_id') = o.reference
              or (v.terms->>'offer_reference') = o.reference
            )
       )
     order by coalesce(o.accepted_at, o.updated_at) desc
     limit 1;
  end if;

  ref_text := nullif(trim(coalesce(p_insurer_reference, pol.policy_number, '')), '');
  start_date := coalesce(p_cover_start_date, pol.inception_date, current_date);
  sale_key := coalesce(nullif(trim(p_idempotency_key), ''), 'cover-confirm:' || pol.id::text);

  if offer.id is not null and ref_text is not null then
    sale_result := public.sales_record_sale(cat, offer.id, sale_key || ':sale', ref_text, start_date, 'workspace');
    sync_sale_id := nullif(sale_result->>'id', '')::uuid;
    if sync_sale_id is null then
      select id into sync_sale_id from sales_records where offer_id = offer.id limit 1;
    end if;
  end if;

  if sync_sale_id is not null then
    update policy_cover
       set sale_id = sync_sale_id
     where policy_id = pol.id and data_category = pol.data_category and policy_cover.sale_id is null;
  end if;

  if cust is not null then
    select l.id into lead_id
      from leads l
     where l.tenant_id = app.tenant_id()
       and l.customer_id = cust
       and l.status in ('accepted', 'offer_sent', 'quoting', 'qualified', 'contacted', 'lead')
       and (l.policy_id is null or l.policy_id = pol.id)
     order by
       case l.status
         when 'accepted' then 0
         when 'offer_sent' then 1
         when 'quoting' then 2
         when 'qualified' then 3
         else 4
       end,
       l.updated_at desc
     limit 1;

    if lead_id is not null then
      update leads
         set status = 'live', policy_id = pol.id, updated_at = now()
       where id = lead_id;
      get diagnostics lead_updated = row_count;
    end if;
  end if;

  if offer.id is not null then
    update tasks
       set status = 'done', updated_at = now()
     where offer_id = offer.id and status = 'open' and title ilike 'Confirm cover%';
    get diagnostics tasks_done = row_count;
  end if;

  return jsonb_build_object(
    'outcome', 'saved',
    'policy_id', pol.id,
    'policy_reference', pol.reference,
    'offer_id', offer.id,
    'sale_id', sync_sale_id,
    'sale', sale_result,
    'lead_id', lead_id,
    'lead_updated', lead_updated > 0,
    'tasks_completed', tasks_done,
    'open_path', '/broker/policies/' || pol.id,
    'summary', format(
      'Cover confirmed for policy %s%s',
      coalesce(pol.policy_number, pol.reference),
      case when offer.reference is not null then ' (offer ' || offer.reference || ')' else '' end
    )
  );
end $$;
