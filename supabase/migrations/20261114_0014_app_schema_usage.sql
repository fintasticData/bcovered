-- InsureFlow AI / B-Covered: signed-in users need USAGE on the app schema, because row-level security policies and the
-- copilot functions call app.tenant_id(), app.role(), app.is_staff() and app.active_category().
-- app.next_number stays revoked: only the security-definer numbering trigger calls it.

grant usage on schema app to authenticated;
revoke all on function app.next_number(uuid, text, text) from public, anon, authenticated;
