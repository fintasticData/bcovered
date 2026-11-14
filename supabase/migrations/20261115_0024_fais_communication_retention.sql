-- InsureFlow AI / B-Covered: FAIS record keeping. Live communications are kept permanently and are append-only: no edits,
-- no deletes, for any role (the triggers also apply to service and admin connections). A wrong entry is corrected by a new
-- entry that points at it. Each entry keeps who wrote it, their role and who held the client at the time, so the history
-- survives reassignment and team changes. Sample (demo) records are exempt so demos can be reset.
-- Apply after 20261115_0023_franchise_setup_wording.sql.

begin;

-- ------------------------------------------------------------------ 1. Who communicated, and corrections
alter table client_interactions
  add column corrects_id uuid references client_interactions(id),
  add column correction_reason text,
  add column author_member_id uuid references sales_team_members(id),
  add column author_role text,
  add column assigned_member_id uuid references sales_team_members(id),
  add constraint client_interactions_correction_reason check (corrects_id is null or coalesce(trim(correction_reason), '') <> '');
create index client_interactions_corrects_idx on client_interactions (corrects_id) where corrects_id is not null;

update client_interactions i set author_member_id = m.id, author_role = m.sales_role
  from sales_team_members m where m.user_id = i.created_by and m.tenant_id = i.tenant_id;
update client_interactions i set author_role = om.role
  from organisation_memberships om where i.author_role is null and om.user_id = i.created_by and om.tenant_id = i.tenant_id;
update client_interactions i set assigned_member_id = p.assigned_member_id from persons p where p.id = i.person_id;

create or replace function app.comm_snapshot() returns trigger language plpgsql security definer set search_path = public as $$
declare c client_interactions;
begin
  if new.author_member_id is null then
    select m.id, m.sales_role into new.author_member_id, new.author_role
      from sales_team_members m where m.user_id = new.created_by and m.tenant_id = new.tenant_id limit 1;
  end if;
  if new.author_role is null then
    select om.role into new.author_role from organisation_memberships om where om.user_id = new.created_by and om.tenant_id = new.tenant_id;
  end if;
  if new.assigned_member_id is null and new.person_id is not null then
    select p.assigned_member_id into new.assigned_member_id from persons p where p.id = new.person_id;
  end if;
  if new.corrects_id is not null then
    select * into c from client_interactions where id = new.corrects_id;
    if c.id is null or c.tenant_id <> new.tenant_id or c.data_category <> new.data_category
       or c.person_id is distinct from new.person_id or c.customer_id is distinct from new.customer_id then
      raise exception using message = 'not_linked', detail = 'A correction must belong to the same client, brokerage and category as the entry it corrects.';
    end if;
  end if;
  return new;
end $$;
create trigger comm_snapshot before insert on client_interactions for each row execute function app.comm_snapshot();

-- ------------------------------------------------------------------ 2. Live communications are permanent and append-only
-- Arguments name the protected columns; '*' protects the whole row. Draft communications may still be edited.
create or replace function app.comm_keep() returns trigger language plpgsql set search_path = public as $$
declare o jsonb := to_jsonb(old); n jsonb; c text;
begin
  if o ->> 'data_category' is distinct from 'live' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using message = 'forbidden',
      detail = 'Live communications are kept permanently (FAIS record keeping). Add a correction instead of deleting.';
  end if;
  if tg_table_name = 'communications' and o ->> 'status' = 'draft' then return new; end if;
  n := to_jsonb(new);
  if tg_argv[0] = '*' then
    if (n - 'updated_at') is distinct from (o - 'updated_at') then
      raise exception using message = 'forbidden',
        detail = 'Live communications are kept permanently and cannot be edited. Add a correction instead.';
    end if;
    return new;
  end if;
  foreach c in array tg_argv loop
    if n -> c is distinct from o -> c then
      raise exception using message = 'forbidden',
        detail = format('Live communications are kept permanently: %s cannot be changed. Add a correction instead.', c);
    end if;
  end loop;
  return new;
end $$;

create trigger comm_keep before update or delete on client_interactions
  for each row execute function app.comm_keep('*');
create trigger comm_keep before update or delete on communications
  for each row execute function app.comm_keep('customer_id', 'channel', 'template', 'subject', 'body', 'created_at', 'data_category');
create trigger comm_keep before update or delete on conversation_messages
  for each row execute function app.comm_keep('conversation_id', 'role', 'content', 'structured', 'created_at', 'data_category');
create trigger comm_keep before update or delete on sales_enquiries
  for each row execute function app.comm_keep('first_names', 'surname', 'phone', 'email', 'interest', 'message', 'consent_at', 'referral_code',
    'source', 'created_by', 'created_at', 'data_category', 'idempotency_key');

-- ------------------------------------------------------------------ 3. Corrections
create or replace function public.sales_correct_communication(p_category text, p_interaction_id uuid, p_body text, p_reason text,
  p_idempotency_key text, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o client_interactions; i client_interactions;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_body), '') = '' then raise exception using message = 'needs_input', detail = 'Give the corrected wording.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception using message = 'needs_input', detail = 'Say why the entry is being corrected.'; end if;
  select * into o from client_interactions where id = p_interaction_id;
  if o.id is null then raise exception using message = 'not_found', detail = 'That communication is not available to you in this category.'; end if;
  insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, policy_id, subject_table, subject_id, business_line,
    direction, event, offer_id, occurred_at, copilot, created_by, idempotency_key, corrects_id, correction_reason)
  values (t, p_category, o.kind, trim(p_body), o.person_id, o.customer_id, o.policy_id, o.subject_table, o.subject_id, o.business_line,
    o.direction, o.event, o.offer_id, o.occurred_at, nullif(p_copilot, 'workspace'), auth.uid(), p_idempotency_key, o.id, trim(p_reason))
  returning * into i;
  return copilot_log_saved(p_category, p_copilot, 'sales.comms.correct',
    jsonb_build_object('interaction_id', o.id, 'reason', p_reason), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'client_interactions', 'id', i.id, 'reference', i.reference)),
    copilot_numbers(o.person_id, o.customer_id, o.policy_id) || jsonb_build_object('record_type', 'interaction', 'id', i.id, 'reference', i.reference,
      'summary', format('Correction %s added for %s; the original is kept', i.reference, o.reference),
      'open_path', case when o.person_id is not null then '/broker/book/clients/' || o.person_id else '/broker/accounts/' || o.customer_id end),
    'client_interactions', i.id);
end $$;
revoke all on function public.sales_correct_communication(text,uuid,text,text,text,text) from public, anon;
grant execute on function public.sales_correct_communication(text,uuid,text,text,text,text) to authenticated;

-- ------------------------------------------------------------------ 4. The client record shows retention, authors and corrections
create or replace function public.sales_client_record(p_category text, p_person_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); pr persons; accts uuid[];
begin
  select * into pr from persons where id = p_person_id;
  if pr.id is null then
    raise exception using message = 'not_found', detail = 'That client is not available to you in this category.';
  end if;
  select coalesce(array_agg(customer_id), '{}') into accts from customer_persons where person_id = pr.id and effective_to is null;
  return sales_person_json(pr.id) || jsonb_build_object(
    'stage', sales_stage(pr.id, pr.contact_stage),
    'date_of_birth', pr.date_of_birth,
    'brokerage', (select name from organisations where id = t),
    'enquiries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'reference', e.reference, 'source', e.source, 'referral_code', e.referral_code,
                   'referrer', app.member_json(e.referrer_member_id, p_category), 'interest', e.interest, 'message', e.message,
                   'match_status', e.match_status, 'created_at', e.created_at) order by e.created_at desc)
                   from sales_enquiries e where e.person_id = pr.id), '[]'),
    'offers', coalesce((select jsonb_agg(sales_offer_json(o) order by o.created_at desc) from sales_offers o where o.person_id = pr.id), '[]'),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'reference', s.reference, 'offer_id', s.offer_id,
                   'offer_reference', (select reference from sales_offers where id = s.offer_id),
                   'insurer_reference', s.insurer_reference, 'cover_start_date', s.cover_start_date, 'premium_amount', s.premium_amount,
                   'premium_frequency', s.premium_frequency, 'sold_by', app.member_json(s.sold_by_member_id, p_category),
                   'referrer', app.member_json(s.referrer_member_id, p_category), 'created_at', s.created_at) order by s.created_at desc)
                   from sales_records s where s.person_id = pr.id), '[]'),
    'communications', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'kind', i.kind, 'direction', i.direction,
                   'event', i.event, 'body', i.body, 'occurred_at', i.occurred_at, 'created_at', i.created_at, 'copilot', i.copilot,
                   'author', (select full_name from app_users where id = i.created_by),
                   'author_role', i.author_role,
                   'assigned_at_time', (select full_name from sales_team_members where id = i.assigned_member_id),
                   'retention', case when i.data_category = 'live' then 'permanent' else 'sample' end,
                   'corrects', (select jsonb_build_object('id', c.id, 'reference', c.reference) from client_interactions c where c.id = i.corrects_id),
                   'correction_reason', i.correction_reason,
                   'corrected_by', (select jsonb_build_object('id', c.id, 'reference', c.reference) from client_interactions c
                                     where c.corrects_id = i.id order by c.created_at desc limit 1),
                   'offer', (select jsonb_build_object('id', o.id, 'reference', o.reference) from sales_offers o where o.id = i.offer_id))
                   order by i.occurred_at desc, i.created_at desc)
                   from client_interactions i where i.person_id = pr.id or (i.person_id is null and i.customer_id = any (accts))), '[]'),
    'follow_ups', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'reference', k.reference, 'title', k.title, 'detail', k.detail,
                   'due_date', k.due_date, 'status', k.status, 'offer_id', k.offer_id,
                   'assigned_to', (select full_name from app_users where id = k.assigned_to)) order by k.status, k.due_date nulls last)
                   from tasks k where (k.person_id = pr.id or (k.person_id is null and k.customer_id = any (accts))) and k.status = 'open'), '[]'),
    'assignment_history', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'from', app.member_json(a.from_member_id, p_category),
                   'to', app.member_json(a.to_member_id, p_category), 'reason', a.reason,
                   'by', (select full_name from app_users where id = a.changed_by)) order by a.created_at desc)
                   from contact_assignment_events a where a.person_id = pr.id), '[]'),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('quote_id', q.id, 'option_id', qo.id, 'product', q.product_category,
                   'insurer', (select name from insurers where id = qo.insurer_id), 'label', qo.option_label,
                   'monthly_premium', qo.monthly_premium, 'is_sample', q.is_simulated, 'status', q.status) order by qo.monthly_premium)
                   from quotes q join quote_options qo on qo.quote_id = q.id
                   where q.customer_id = any (accts) and q.status not in ('rejected','expired')), '[]'),
    'can_reassign', app.can_manage_team(),
    'team', case when app.can_manage_team() then
              (select jsonb_agg(app.member_json(m.id, p_category) order by m.full_name) from sales_team_members m where m.tenant_id = t and m.status <> 'suspended')
            else '[]'::jsonb end);
end $$;

commit;
