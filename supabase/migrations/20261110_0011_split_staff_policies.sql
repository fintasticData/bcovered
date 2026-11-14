-- InsureFlow AI / B-Covered: read-only and compliance-reviewer roles may read but never write.
-- 0001 and 0009 grant staff "for all" policies; restrictive write policies here narrow them without rewriting each one.
-- Not yet applied. Apply after 20261110_0010_brokerage_onboarding.sql, to the dedicated insureflow-dev project only.
-- The demo enforces the same rule in src/server/db/store.ts (read-only repositories refuse writes).

begin;

create or replace function app.can_write() returns boolean language sql stable security definer set search_path = public as $$
  select app.is_platform_staff() or coalesce(app.member_role(), app.role()) not in ('read_only','compliance_reviewer')
$$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'tenant_id'
  loop
    execute format($p$create policy writer_insert on %I as restrictive for insert to authenticated with check (app.can_write())$p$, t);
    execute format($p$create policy writer_update on %I as restrictive for update to authenticated using (app.can_write())$p$, t);
    execute format($p$create policy writer_delete on %I as restrictive for delete to authenticated using (app.can_write())$p$, t);
  end loop;
end $$;

commit;
