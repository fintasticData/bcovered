-- InsureFlow AI / B-Covered: PL/pgSQL prepares a whole IF condition, so "tg_table_name = 'persons' and new.client_number"
-- fails on tables without that column. Check the table first, then the column, in nested blocks.

create or replace function app.assign_reference() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'persons' then
    if new.client_number is null then new.client_number := app.next_number(new.tenant_id, 'client', new.data_category); end if;
  elsif tg_table_name = 'customers' then
    if new.account_number is null then new.account_number := app.next_number(new.tenant_id, 'account', new.data_category); end if;
  elsif tg_table_name = 'client_interactions' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'note', new.data_category); end if;
  elsif tg_table_name = 'tasks' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'task', new.data_category); end if;
  elsif tg_table_name = 'policies' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'policy', new.data_category); end if;
  end if;
  return new;
end $$;
