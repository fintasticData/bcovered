-- Auto-accept sign-ups without waiting for email confirmation.
-- Sets email_confirmed_at on insert so password sign-in works immediately.

create or replace function public.auth_users_auto_confirm()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auth_users_auto_confirm on auth.users;
create trigger trg_auth_users_auto_confirm
  before insert on auth.users
  for each row
  execute function public.auth_users_auto_confirm();

-- Confirm anyone already waiting on an email link.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
