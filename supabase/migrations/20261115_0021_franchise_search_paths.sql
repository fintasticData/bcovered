-- Pin search_path on the franchise helper functions (Supabase advisor 0011).
-- Apply after 20261115_0020_franchise_channel.sql.

alter function app.enquiry_stage(sales_enquiries) set search_path = public;
alter function app.stage_label(text) set search_path = public;
alter function app.period_start(date) set search_path = public;
alter function app.period_end(date) set search_path = public;

-- Evaluate auth.uid() once per query (Supabase advisor 0003).
drop policy self_read on franchise_outlet_staff;
create policy self_read on franchise_outlet_staff for select to authenticated using (user_id = (select auth.uid()));
