-- InsureFlow AI / B-Covered: the copilot agent logs reads, refusals, failures and questions it asks (writes log themselves in
-- copilot_log_saved), and reports who is signed in and which categories they can use.

create or replace function public.copilot_log_action(p_category text, p_copilot text, p_tool text, p_args jsonb, p_outcome text,
  p_affected jsonb default '[]', p_error text default null, p_conversation_id uuid default null)
returns uuid language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); new_id uuid;
begin
  if p_outcome not in ('retrieved','needs_input','failed','refused') then
    raise exception using message = 'validation', detail = 'Saved actions are logged by the write itself.';
  end if;
  insert into copilot_actions (tenant_id, data_category, conversation_id, requested_by, copilot, tool, args, outcome, affected, error)
  values (t, p_category, p_conversation_id, auth.uid(), coalesce(p_copilot, 'ar'), p_tool, coalesce(p_args, '{}'), p_outcome,
          coalesce(p_affected, '[]'), p_error)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.copilot_whoami() returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'name', (select full_name from app_users where id = auth.uid()),
    'tenant_id', app.tenant_id(),
    'brokerage', (select name from organisations where id = app.tenant_id()),
    'role', app.role(),
    'is_staff', app.is_staff(),
    'can_write', app.can_write(),
    'active_category', app.active_category(),
    'hook_claims', (auth.jwt() ? 'tenant_id') and (auth.jwt() ? 'app_role'))
$$;

revoke all on function public.copilot_log_action(text,text,text,jsonb,text,jsonb,text,uuid) from public, anon;
grant execute on function public.copilot_log_action(text,text,text,jsonb,text,jsonb,text,uuid) to authenticated;
revoke all on function public.copilot_whoami() from public, anon;
grant execute on function public.copilot_whoami() to authenticated;
