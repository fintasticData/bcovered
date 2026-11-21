-- Sample Your page demos: personal covered + awaiting items; commercial two premises.
-- Applied via MCP to bcovered (cgwgmzpcrvimoqaxgoop). Idempotent labels.

do $$
declare
  v_person uuid := 'c0000000-0000-4000-8000-000000000001';
  v_tenant uuid;
  v_cat text := 'sample';
  v_bp uuid := 'a0000000-0000-4000-8000-000000000601';
  v_cust uuid := 'a0000000-0000-4000-8000-000000000305';
  v_loc2 uuid;
  v_biz_person uuid;
begin
  select tenant_id into v_tenant from persons where id = v_person;

  if not exists (
    select 1 from insured_items
     where person_id = v_person and data_category = v_cat
       and display_label = 'Toyota Corolla — awaiting quote'
  ) then
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (v_tenant, v_cat, v_person, 'vehicle', 'awaiting_cover',
      'Toyota Corolla — awaiting quote',
      jsonb_build_object('source', 'customer_request', 'reference', 'EN-S-YP1', 'declared_value', 185000));
  end if;

  if not exists (
    select 1 from insured_items
     where person_id = v_person and data_category = v_cat
       and display_label = 'Ford Ranger bakkie — quote ready'
  ) then
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (v_tenant, v_cat, v_person, 'vehicle', 'awaiting_cover',
      'Ford Ranger bakkie — quote ready',
      jsonb_build_object('source', 'broker', 'reference', 'EN-S-YP2', 'declared_value', 420000, 'quote_ready', true));
  end if;

  select tenant_id into v_tenant from business_profiles where id = v_bp;

  if not exists (select 1 from business_locations where business_profile_id = v_bp and name = 'Cape Town depot') then
    insert into business_locations (
      tenant_id, business_profile_id, name, suburb, city, province, occupancy, ownership, source
    ) values (
      v_tenant, v_bp, 'Cape Town depot', 'Epping', 'Cape Town', 'Western Cape',
      'Warehouse and cold store', 'leased', 'declared'
    ) returning id into v_loc2;
  else
    select id into v_loc2 from business_locations where business_profile_id = v_bp and name = 'Cape Town depot' limit 1;
  end if;

  select person_id into v_biz_person
    from customer_persons where customer_id = v_cust and data_category = v_cat limit 1;

  if v_biz_person is null then
    insert into persons (tenant_id, data_category, first_names, surname, preferred_name, client_number, is_synthetic)
    select c.tenant_id, c.data_category, 'Nomsa', 'Mokoena', 'Nomsa',
           coalesce(c.account_number, 'CL-S-UBUNTU'), true
      from customers c where c.id = v_cust
    returning id into v_biz_person;

    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category)
    values (v_tenant, v_cust, v_biz_person, 'self', true, v_cat);
  else
    update persons set preferred_name = coalesce(nullif(preferred_name,''), 'Nomsa')
     where id = v_biz_person;
  end if;

  if v_biz_person is not null and not exists (
    select 1 from insured_items where person_id = v_biz_person and display_label = 'Standby generator — Cape Town depot'
  ) then
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (v_tenant, v_cat, v_biz_person, 'equipment', 'awaiting_cover',
      'Standby generator — Cape Town depot',
      jsonb_build_object(
        'source', 'customer_request', 'reference', 'EN-S-GEN1', 'declared_value', 95000,
        'location_id', v_loc2, 'location_name', 'Cape Town depot'
      ));
  end if;

  if v_biz_person is not null and not exists (
    select 1 from insured_items where person_id = v_biz_person and display_label = 'Cold room plant — Germiston factory'
  ) then
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (v_tenant, v_cat, v_biz_person, 'equipment', 'covered',
      'Cold room plant — Germiston factory',
      jsonb_build_object('declared_value', 480000, 'location_name', 'Germiston factory'));
  end if;
end $$;
