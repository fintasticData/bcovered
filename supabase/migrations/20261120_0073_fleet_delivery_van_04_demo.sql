-- Fintastic fleet hub demo: Delivery van 04 for sample business customer (Ubuntu / Nomsa).
-- Idempotent on display_label. photo_url + driver + invoice live in insured_items.details.

do $$
declare
  v_tenant uuid;
  v_cat text := 'sample';
  v_cust uuid := 'a0000000-0000-4000-8000-000000000305';
  v_biz_person uuid;
  v_loc2 uuid;
begin
  select tenant_id into v_tenant from business_profiles where id = 'a0000000-0000-4000-8000-000000000601';

  select person_id into v_biz_person
    from customer_persons where customer_id = v_cust and data_category = v_cat limit 1;

  if v_biz_person is null then
    raise notice 'Skip Delivery van 04: business sample person not found';
    return;
  end if;

  select id into v_loc2
    from business_locations
   where business_profile_id = 'a0000000-0000-4000-8000-000000000601'
     and name = 'Cape Town depot'
   limit 1;

  if not exists (
    select 1 from insured_items
     where person_id = v_biz_person and data_category = v_cat
       and display_label = 'Delivery van 04'
  ) then
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (
      v_tenant, v_cat, v_biz_person, 'vehicle', 'awaiting_cover',
      'Delivery van 04',
      jsonb_build_object(
        'source', 'customer_request',
        'reference', 'EN-S-VAN04',
        'declared_value', 385000,
        'photo_url', 'https://images.unsplash.com/photo-1527786356703-4b100091cd2c?w=800&h=600&fit=crop',
        'location_id', v_loc2,
        'location_name', 'Cape Town depot',
        'driver', jsonb_build_object(
          'name', 'Sipho Dlamini',
          'id_number', '850412 5089 083',
          'licence', 'Code 10 (C1)',
          'licence_expiry', '2027-08-31'
        ),
        'invoice', jsonb_build_object(
          'label', 'Invoice - Delivery van 04.pdf',
          'supplier', 'Mzanzi Auto Commercial Vehicles',
          'amount', 385000,
          'vehicle', 'Mercedes-Benz Sprinter 315 CDI Panel Van (New)',
          'status', 'ready_to_attach',
          'url', null
        )
      )
    );
  else
    update insured_items
       set details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
         'photo_url', coalesce(details->>'photo_url',
           'https://images.unsplash.com/photo-1527786356703-4b100091cd2c?w=800&h=600&fit=crop'),
         'declared_value', coalesce((details->>'declared_value')::numeric, 385000),
         'driver', coalesce(details->'driver', jsonb_build_object(
           'name', 'Sipho Dlamini',
           'id_number', '850412 5089 083',
           'licence', 'Code 10 (C1)',
           'licence_expiry', '2027-08-31'
         )),
         'invoice', coalesce(details->'invoice', jsonb_build_object(
           'label', 'Invoice - Delivery van 04.pdf',
           'supplier', 'Mzanzi Auto Commercial Vehicles',
           'amount', 385000,
           'vehicle', 'Mercedes-Benz Sprinter 315 CDI Panel Van (New)',
           'status', 'ready_to_attach',
           'url', null
         ))
       )
     where person_id = v_biz_person and data_category = v_cat
       and display_label = 'Delivery van 04';
  end if;
end $$;
