-- Sample-book customers (Thandi / Naledi) only have customer_persons in `sample`.
-- Calling customer_page_get with workspace `live` raised P0002 not_found → PostgREST 500.
-- Fall back to the customer's existing book category, and map missing page to PT404.

create or replace function app.customer_page_resolve_person(p_person_id uuid)
returns table (
  person_id uuid,
  customer_id uuid,
  tenant_id uuid,
  data_category text,
  preferred_name text,
  full_name text,
  is_preview boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  cust uuid := app.my_customer_id();
  cat text := coalesce(nullif(app.active_category(), 'denied'), 'sample');
  t uuid := app.tenant_id();
  pid uuid;
  cid uuid;
  pref text;
  fname text;
  preview boolean := false;
begin
  if cat = 'denied' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_person_id is not null then
    if not app.is_staff() then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select p.id, cp.customer_id, p.tenant_id, p.data_category,
           coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
           trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
      into pid, cid, t, cat, pref, fname
      from persons p
      join customer_persons cp on cp.person_id = p.id and cp.data_category = p.data_category
       and cp.effective_to is null
     where p.id = p_person_id
       and p.tenant_id = app.tenant_id()
       and p.data_category = cat
     order by case when cp.role = 'self' then 0 else 1 end, cp.is_primary desc, cp.created_at
     limit 1;
    -- Staff preview: if Demo/Live mismatch, use the person's actual book category.
    if pid is null then
      select p.id, cp.customer_id, p.tenant_id, p.data_category,
             coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
             trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
        into pid, cid, t, cat, pref, fname
        from persons p
        join customer_persons cp on cp.person_id = p.id and cp.data_category = p.data_category
         and cp.effective_to is null
       where p.id = p_person_id
         and p.tenant_id = app.tenant_id()
       order by case when cp.role = 'self' then 0 else 1 end, cp.is_primary desc, cp.created_at
       limit 1;
    end if;
    if pid is null then
      raise exception 'not_found' using errcode = 'PT404', message = 'not_found';
    end if;
    if app.book_restricted() and not app.can_see_person(pid) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    preview := true;
  else
    if cust is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select p.id, cp.customer_id, p.tenant_id, p.data_category,
           coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
           trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
      into pid, cid, t, cat, pref, fname
      from customer_persons cp
      join persons p on p.id = cp.person_id and p.data_category = cp.data_category
     where cp.customer_id = cust
       and cp.data_category = cat
       and cp.role = 'self' and cp.effective_to is null
     order by cp.is_primary desc, cp.created_at
     limit 1;
    if pid is null then
      select p.id, cp.customer_id, p.tenant_id, p.data_category,
             coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
             trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
        into pid, cid, t, cat, pref, fname
        from customer_persons cp
        join persons p on p.id = cp.person_id and p.data_category = cp.data_category
       where cp.customer_id = cust
         and cp.data_category = cat
       order by cp.is_primary desc, cp.created_at
       limit 1;
    end if;
    -- Customer book is sample-only (or live-only): use whatever link exists for this customer_id.
    if pid is null then
      select p.id, cp.customer_id, p.tenant_id, p.data_category,
             coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
             trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
        into pid, cid, t, cat, pref, fname
        from customer_persons cp
        join persons p on p.id = cp.person_id and p.data_category = cp.data_category
       where cp.customer_id = cust
         and cp.effective_to is null
       order by
         case when cp.role = 'self' then 0 else 1 end,
         case when cp.data_category = 'sample' then 0 else 1 end,
         cp.is_primary desc,
         cp.created_at
       limit 1;
    end if;
    if pid is null then
      raise exception 'not_found' using errcode = 'PT404', message = 'not_found';
    end if;
  end if;

  person_id := pid;
  customer_id := cid;
  tenant_id := t;
  data_category := cat;
  preferred_name := pref;
  full_name := fname;
  is_preview := preview;
  return next;
end $$;
