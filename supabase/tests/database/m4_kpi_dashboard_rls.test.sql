begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_table('public', 'kpi_targets', 'kpi_targets table exists');
select policies_are('public', 'kpi_targets', array['kpi_targets_select_by_scope'], 'KPI targets use explicit scope policy');
select has_function('public', 'get_kpi_summary', array['timestamp with time zone', 'timestamp with time zone', 'uuid', 'uuid', 'uuid'], 'KPI summary function exists');
select has_function('public', 'get_kpi_leaderboard', array['timestamp with time zone', 'timestamp with time zone', 'uuid', 'uuid'], 'KPI leaderboard function exists');
select has_function('public', 'upsert_kpi_target', array['kpi_metric_code', 'kpi_scope_type', 'uuid', 'uuid', 'kpi_period_type', 'date', 'date', 'numeric'], 'KPI target function exists');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kpi-admin@test.invalid', '{"full_name":"KPI Admin"}'),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kpi-leader-a@test.invalid', '{"full_name":"KPI Leader A"}'),
  ('90000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kpi-leader-b@test.invalid', '{"full_name":"KPI Leader B"}'),
  ('90000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kpi-sale-a@test.invalid', '{"full_name":"KPI Sale A"}'),
  ('90000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kpi-sale-b@test.invalid', '{"full_name":"KPI Sale B"}');
insert into public.teams(id, name) values
  ('91000000-0000-0000-0000-000000000001', 'KPI Team A'),
  ('91000000-0000-0000-0000-000000000002', 'KPI Team B');
update public.profiles set role = 'admin', is_active = true where id = '90000000-0000-0000-0000-000000000001';
update public.profiles set role = 'leader', team_id = '91000000-0000-0000-0000-000000000001', is_active = true where id = '90000000-0000-0000-0000-000000000002';
update public.profiles set role = 'leader', team_id = '91000000-0000-0000-0000-000000000002', is_active = true where id = '90000000-0000-0000-0000-000000000003';
update public.profiles set role = 'sale', team_id = '91000000-0000-0000-0000-000000000001', is_active = true where id = '90000000-0000-0000-0000-000000000004';
update public.profiles set role = 'sale', team_id = '91000000-0000-0000-0000-000000000002', is_active = true where id = '90000000-0000-0000-0000-000000000005';

insert into public.customers(id, full_name, phone, source_id, owner_user_id, team_id, created_at, created_by, updated_by, deleted_at, deleted_reason)
values
  ('92000000-0000-0000-0000-000000000001', 'KPI Khách A1', '0933000001', (select id from public.lead_sources where name = 'Website'), '90000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', '2026-08-02 01:00+00', '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', null, null),
  ('92000000-0000-0000-0000-000000000002', 'KPI Khách A2', '0933000002', (select id from public.lead_sources where name = 'Website'), '90000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', '2026-08-03 01:00+00', '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', null, null),
  ('92000000-0000-0000-0000-000000000003', 'KPI Khách B1', '0933000003', (select id from public.lead_sources where name = 'Facebook'), '90000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-000000000002', '2026-08-02 02:00+00', '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', null, null),
  ('92000000-0000-0000-0000-000000000004', 'KPI Khách đã xóa', '0933000004', (select id from public.lead_sources where name = 'Website'), '90000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', '2026-08-02 03:00+00', '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '2026-08-04 01:00+00', 'Dữ liệu kiểm thử');

insert into public.activities(id, customer_id, type, outcome, content, occurred_at, performed_by, is_late_entry, created_by, updated_by)
values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'call', 'connected', 'Kết nối', '2026-08-03 01:00+00', '90000000-0000-0000-0000-000000000004', false, '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004'),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'message', 'no_answer', 'Không phản hồi', '2026-08-04 01:00+00', '90000000-0000-0000-0000-000000000004', true, '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004'),
  ('93000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', 'appointment', 'booked', 'Đặt hẹn', '2026-08-04 02:00+00', '90000000-0000-0000-0000-000000000004', false, '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004'),
  ('93000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000001', 'consultation', 'completed', 'Tư vấn xong', '2026-08-05 01:00+00', '90000000-0000-0000-0000-000000000004', false, '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004'),
  ('93000000-0000-0000-0000-000000000005', '92000000-0000-0000-0000-000000000003', 'call', 'replied', 'Team B kết nối', '2026-08-03 02:00+00', '90000000-0000-0000-0000-000000000005', false, '90000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000005');

insert into public.follow_up_tasks(id, customer_id, activity_id, assignee_user_id, due_at, status, priority, completed_at, completion_reason, created_by, updated_by)
values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', '2026-08-05 10:00+00', 'completed', 'normal', '2026-08-05 09:00+00', 'Hoàn thành đúng hạn', '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004'),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000004', '2026-08-04 10:00+00', 'completed', 'high', '2026-08-05 10:00+00', 'Hoàn thành trễ', '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004'),
  ('94000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000004', '2026-08-01 01:00+00', 'pending', 'urgent', null, null, '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004');

insert into public.deals(customer_id, owner_user_id, team_id, amount_vnd, registered_at, status, idempotency_key, created_by, updated_by, void_reason, voided_at)
values
  ('92000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', 100000000, '2026-08-05 02:00+00', 'active', '95000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', null, null),
  ('92000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', 50000000, '2026-08-05 03:00+00', 'void', '95000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Giao dịch hủy', '2026-08-05 04:00+00'),
  ('92000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-000000000002', 200000000, '2026-08-05 02:00+00', 'active', '95000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000005', null, null),
  ('92000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', 999000000, '2026-08-05 02:00+00', 'active', '95000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', null, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'new_customers')::int$$, array[2], 'Sale A new customers excludes deleted');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'contact_attempts')::int$$, array[2], 'Sale A contact attempts match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'successful_contacts')::int$$, array[1], 'Sale A successful contacts match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'appointments')::int$$, array[1], 'Sale A appointments match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'consultations')::int$$, array[1], 'Sale A consultations match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'late_entries')::int$$, array[1], 'Late entry counts in occurred period');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'tasks_completed')::int$$, array[2], 'Completed tasks match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'tasks_on_time')::int$$, array[1], 'On-time tasks match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'overdue_now')::int$$, array[1], 'Current overdue tasks match');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'won_customers')::int$$, array[1], 'Won customers exclude void deals');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'revenue_vnd')::numeric$$, array[100000000::numeric], 'Sale A revenue excludes void and deleted');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'contact_rate')::numeric$$, array[50::numeric], 'Contact conversion is 50 percent');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'appointment_to_consultation_rate')::numeric$$, array[100::numeric], 'Appointment to consultation rate matches');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'consultation_to_win_rate')::numeric$$, array[100::numeric], 'Consultation to win rate matches');
select throws_ok($$select public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00','90000000-0000-0000-0000-000000000005')$$, '42501', 'kpi_filter_scope_denied', 'Sale cannot expand KPI filter to another Sale');
select throws_ok($$select public.upsert_kpi_target('revenue_vnd','user','90000000-0000-0000-0000-000000000004',null,'month','2026-08-01','2026-08-31',500000000)$$, '42501', 'kpi_target_write_denied', 'Sale cannot set KPI targets');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'revenue_vnd')::numeric$$, array[200000000::numeric], 'Sale B sees own revenue only');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'revenue_vnd')::numeric$$, array[100000000::numeric], 'Leader A sees Team A revenue');
select lives_ok($$select public.upsert_kpi_target('revenue_vnd','team',null,'91000000-0000-0000-0000-000000000001','month','2026-08-01','2026-08-31',500000000)$$, 'Leader A sets own team target');
select lives_ok($$select public.upsert_kpi_target('contact_attempts','user','90000000-0000-0000-0000-000000000004',null,'month','2026-08-01','2026-08-31',50)$$, 'Leader A sets Sale A target');
select throws_ok($$select public.upsert_kpi_target('revenue_vnd','team',null,'91000000-0000-0000-0000-000000000002','month','2026-08-01','2026-08-31',500000000)$$, '42501', 'kpi_target_scope_denied', 'Leader A cannot set Team B target');
select results_eq($$select jsonb_array_length(public.get_kpi_leaderboard('2026-07-31 17:00+00','2026-08-31 17:00+00'))$$, array[1], 'Leader A leaderboard contains Team A Sale only');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00',null,'91000000-0000-0000-0000-000000000001')$$, '42501', 'kpi_filter_scope_denied', 'Leader B cannot query Team A');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'revenue_vnd')::numeric$$, array[300000000::numeric], 'Admin revenue excludes void and deleted deals');
select results_eq($$select (public.get_kpi_summary('2026-07-31 17:00+00','2026-08-31 17:00+00')->>'won_customers')::int$$, array[2], 'Admin won customers match active deals');
select results_eq($$select jsonb_array_length(public.get_kpi_leaderboard('2026-07-31 17:00+00','2026-08-31 17:00+00'))$$, array[2], 'Admin leaderboard contains both Sales');
select lives_ok($$select public.upsert_kpi_target('revenue_vnd','team',null,'91000000-0000-0000-0000-000000000002','month','2026-08-01','2026-08-31',600000000)$$, 'Admin sets Team B target');
select results_eq('select count(*)::bigint from public.kpi_targets', array[3::bigint], 'Admin sees all KPI targets');
select ok((select count(*) > 0 from public.audit_logs where entity_type = 'kpi_targets'), 'KPI target changes are audited');
select ok((public.get_kpi_summary('2025-08-01 00:00+00','2025-09-01 00:00+00')->>'contact_rate') is null, 'Zero denominator returns null rate');

select * from finish();
rollback;
