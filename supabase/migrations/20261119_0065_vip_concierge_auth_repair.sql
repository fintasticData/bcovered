-- Repair VIP Concierge Auth users: GoTrue rejects NULL token columns with
-- "Database error querying schema" on password sign-in.
-- Applied via MCP on cgwgmzpcrvimoqaxgoop (2026-11-19).

begin;

update auth.users u
set
  confirmation_token = coalesce(u.confirmation_token, ''),
  recovery_token = coalesce(u.recovery_token, ''),
  email_change_token_new = coalesce(u.email_change_token_new, ''),
  email_change_token_current = coalesce(u.email_change_token_current, ''),
  reauthentication_token = coalesce(u.reauthentication_token, ''),
  email_change = coalesce(u.email_change, ''),
  phone_change = coalesce(u.phone_change, ''),
  phone_change_token = coalesce(u.phone_change_token, ''),
  raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email_verified', true),
  updated_at = now()
where u.email in (
  'naledi.vip@example.demo',
  'lerato.mokoena@bcovered.demo',
  'protea.desk@bcovered.demo',
  'karoo.desk@bcovered.demo'
);

-- Keep Lerato Dube on the shared demo staff password (seed drift).
update auth.users u
set encrypted_password = t.encrypted_password,
    updated_at = now()
from auth.users t
where t.id = 'a0000000-0000-4000-8000-000000000201'
  and u.email = 'lerato.dube@bcovered.demo';

update auth.identities i
set identity_data = coalesce(i.identity_data, '{}'::jsonb) || jsonb_build_object(
      'email_verified', true,
      'phone_verified', false
    ),
    updated_at = now()
from auth.users u
where u.id = i.user_id
  and u.email in (
    'naledi.vip@example.demo',
    'lerato.mokoena@bcovered.demo',
    'protea.desk@bcovered.demo',
    'karoo.desk@bcovered.demo'
  );

commit;
