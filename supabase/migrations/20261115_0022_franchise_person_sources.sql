-- Source column for the My workspace client grid: each client's latest enquiry channel and originating outlet.
-- Apply after 20261115_0021_franchise_search_paths.sql.

create or replace function public.franchise_person_sources(p_category text, p_person_ids uuid[]) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category);
begin
  return coalesce((select jsonb_object_agg(x.person_id, jsonb_build_object('channel', x.channel, 'outlet', x.outlet, 'reference', x.reference))
    from (select distinct on (e.person_id) e.person_id, e.channel, e.reference,
                 case when e.franchise_outlet_id is not null then app.outlet_label(e.franchise_outlet_id) end as outlet
            from sales_enquiries e
           where e.tenant_id = t and e.person_id = any (coalesce(p_person_ids, '{}'))
           order by e.person_id, e.created_at desc) x), '{}'::jsonb);
end $$;
revoke all on function public.franchise_person_sources(text, uuid[]) from public, anon;
grant execute on function public.franchise_person_sources(text, uuid[]) to authenticated;
