-- InsureFlow AI / B-Covered: performance advisor follow-ups for 0019. auth.uid() is evaluated once per statement, and the
-- two read policies on sales_team_members become one.

drop policy book_scope on tasks;
create policy book_scope on tasks as restrictive for all to authenticated
  using (not (select app.book_restricted()) or assigned_to = (select auth.uid()) or app.can_see_person(person_id) or (person_id is null and app.can_see_customer(customer_id)))
  with check (not (select app.book_restricted()) or assigned_to = (select auth.uid()) or app.can_see_person(person_id) or (person_id is null and app.can_see_customer(customer_id)));

drop policy staff_read on sales_team_members;
drop policy self_read on sales_team_members;
create policy member_read on sales_team_members for select to authenticated
  using (user_id = (select auth.uid()) or (tenant_id = (select app.tenant_id()) and (select app.is_staff())));
