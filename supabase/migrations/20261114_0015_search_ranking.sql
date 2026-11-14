-- InsureFlow AI / B-Covered: copilot search ranks direct clients (people on an account) and accounts above people who only
-- appear as scheme members, so a partial surname surfaces the brokerage's own clients first.

create or replace function public.copilot_search_records(p_category text, p_query text, p_kinds text[] default null, p_limit int default 8)
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare q text := trim(coalesce(p_query, '')); ql text := lower(trim(coalesce(p_query, ''))); res jsonb;
begin
  perform copilot_guard(p_category);
  if length(q) < 2 then return '[]'::jsonb; end if;
  with clients as (
    select 'client'::text as record_type, p.id, p.client_number as number,
      trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname) as name,
      case when lower(p.client_number) = ql then 3
           when (p.first_names || ' ' || p.surname) ilike '%' || q || '%' or coalesce(p.preferred_name, '') ilike q || '%' then 2
           else 1 end as rank,
      greatest(similarity(p.first_names || ' ' || p.surname, q), word_similarity(q, p.first_names || ' ' || p.surname)) as score,
      (select jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name)
         from customer_persons cp join customers c on c.id = cp.customer_id
        where cp.person_id = p.id and cp.effective_to is null
        order by cp.is_primary desc, (cp.role = 'self') desc limit 1) as account,
      'Client'::text as detail,
      '/broker/people/' || p.id as open_path
    from persons p
    where (p_kinds is null or 'client' = any (p_kinds))
      and (lower(p.client_number) = ql
           or (p.first_names || ' ' || p.surname) ilike '%' || q || '%'
           or coalesce(p.preferred_name, '') ilike q || '%'
           or word_similarity(q, p.first_names || ' ' || p.surname) > 0.45)
  ), accounts as (
    select 'account'::text, c.id, c.account_number,
      c.full_name,
      case when lower(c.account_number) = ql or lower(coalesce(c.source_ref, '')) = ql then 3
           when c.full_name ilike '%' || q || '%' then 2 else 1 end,
      greatest(similarity(c.full_name, q), word_similarity(q, c.full_name)),
      null::jsonb,
      (case c.customer_type when 'commercial' then 'Business account' else 'Personal account' end)
        || case when c.source_ref is not null then ' · previous ref ' || c.source_ref else '' end,
      '/broker/accounts/' || c.id
    from customers c
    where (p_kinds is null or 'account' = any (p_kinds))
      and (lower(c.account_number) = ql or lower(coalesce(c.source_ref, '')) = ql
           or c.full_name ilike '%' || q || '%' or word_similarity(q, c.full_name) > 0.45)
  ), pols as (
    select 'policy'::text, p.id, coalesce(p.policy_number, p.reference),
      c.full_name,
      case when lower(coalesce(p.policy_number, '')) = ql or lower(p.reference) = ql then 3 else 2 end,
      1::real,
      jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name),
      initcap(replace(coalesce(p.cover_type, p.line), '_', ' ')) || ' · ' || replace(p.status, '_', ' '),
      copilot_policy_path(p.line, p.id, p.customer_id)
    from policies p join customers c on c.id = p.customer_id
    where (p_kinds is null or 'policy' = any (p_kinds))
      and (lower(coalesce(p.policy_number, '')) = ql or lower(p.reference) = ql
           or (length(q) >= 4 and (p.policy_number ilike q || '%' or p.reference ilike q || '%')))
  ), ranked as (
    select u.*, (u.record_type <> 'client' or u.account is not null) as direct
    from (select * from clients union all select * from accounts union all select * from pols) u
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'record_type', x.record_type, 'id', x.id, 'number', x.number, 'name', x.name, 'detail', x.detail,
      'account', x.account, 'open_path', x.open_path, 'category', p_category,
      'match', case x.rank when 3 then 'exact' when 2 then 'name' else 'similar' end)
      order by x.rank desc, x.direct desc, x.score desc, x.name), '[]'::jsonb)
    into res
  from (select * from ranked order by rank desc, direct desc, score desc, name
        limit greatest(1, least(coalesce(p_limit, 8), 25))) x;
  return res;
end $$;
