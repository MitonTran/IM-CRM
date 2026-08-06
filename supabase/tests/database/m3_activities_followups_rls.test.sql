begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

select has_table('public', 'activities', 'activities table exists');
select has_table('public', 'follow_up_tasks', 'follow_up_tasks table exists');
select has_table('public', 'follow_up_task_events', 'follow-up history table exists');
select policies_are('public', 'activities', array['activities_select_by_customer'], 'activities use explicit customer-scope policy');
select policies_are('public', 'follow_up_tasks', array['follow_up_tasks_select_by_scope'], 'tasks use explicit assignee/team policy');
select has_function('public', 'record_activity_with_follow_up', array['uuid', 'activity_type', 'activity_outcome', 'text', 'timestamp with time zone', 'text', 'timestamp with time zone', 'customer_priority'], 'activity transaction RPC exists');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-admin@test.invalid', '{"full_name":"M3 Admin"}'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-leader-a@test.invalid', '{"full_name":"M3 Leader A"}'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-leader-b@test.invalid', '{"full_name":"M3 Leader B"}'),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-sale-a@test.invalid', '{"full_name":"M3 Sale A"}'),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm3-sale-b@test.invalid', '{"full_name":"M3 Sale B"}');

insert into public.teams(id, name) values
  ('60000000-0000-0000-0000-000000000001', 'M3 Team A'),
  ('60000000-0000-0000-0000-000000000002', 'M3 Team B');

update public.profiles set role = 'admin', is_active = true where id = '50000000-0000-0000-0000-000000000001';
update public.profiles set role = 'leader', team_id = '60000000-0000-0000-0000-000000000001', is_active = true where id = '50000000-0000-0000-0000-000000000002';
update public.profiles set role = 'leader', team_id = '60000000-0000-0000-0000-000000000002', is_active = true where id = '50000000-0000-0000-0000-000000000003';
update public.profiles set role = 'sale', team_id = '60000000-0000-0000-0000-000000000001', is_active = true where id = '50000000-0000-0000-0000-000000000004';
update public.profiles set role = 'sale', team_id = '60000000-0000-0000-0000-000000000002', is_active = true where id = '50000000-0000-0000-0000-000000000005';

insert into public.customers(id, full_name, phone, source_id, owner_user_id, team_id, created_by, updated_by)
values
  ('70000000-0000-0000-0000-000000000001', 'M3 Khách A', '0911000001', (select id from public.lead_sources where name = 'Website'), '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', 'M3 Khách B', '0911000002', (select id from public.lead_sources where name = 'Facebook'), '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');

insert into public.customer_assignments(customer_id, assignee_user_id, team_id, reason, assigned_by)
values
  ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', 'Dữ liệu kiểm thử M3', '50000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000002', 'Dữ liệu kiểm thử M3', '50000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$select public.record_activity_with_follow_up(
    '70000000-0000-0000-0000-000000000001', 'call', 'connected', 'Đã gọi và khách quan tâm', now(),
    'Gọi lại xác nhận lịch', now() + interval '1 day', 'high'
  )$$,
  'Sale A records activity and follow-up atomically'
);
select results_eq('select count(*)::bigint from public.activities', array[1::bigint], 'Sale A sees own customer timeline');
select results_eq('select count(*)::bigint from public.follow_up_tasks', array[1::bigint], 'Sale A sees own assigned follow-up');
select results_eq('select count(*)::bigint from public.follow_up_task_events', array[1::bigint], 'Task creation has immutable history');
select lives_ok(
  $$select public.record_activity_with_follow_up(
    '70000000-0000-0000-0000-000000000001', 'note', null, 'Ghi chú được nhập muộn', now() - interval '25 hours'
  )$$,
  'Sale A can record a late activity'
);
select results_eq('select count(*)::bigint from public.activities where is_late_entry', array[1::bigint], 'Late entry is marked after 24 hours');
select throws_ok(
  $$select public.record_activity_with_follow_up('70000000-0000-0000-0000-000000000001', 'assignment_change')$$,
  '42501', 'system_activity_type_denied', 'Sale cannot forge a system activity'
);
select throws_ok(
  $$select public.record_activity_with_follow_up('70000000-0000-0000-0000-000000000002', 'call')$$,
  '42501', 'activity_create_denied', 'Sale A cannot write activity for Sale B customer'
);
select lives_ok(
  $$select public.manage_follow_up_task(
    (select id from public.follow_up_tasks order by created_at limit 1), 'reschedule', 'Khách xin dời lịch', now() + interval '2 days'
  )$$,
  'Sale A can reschedule own pending task'
);
select results_eq('select count(*)::bigint from public.follow_up_task_events', array[2::bigint], 'Reschedule appends task history');
select lives_ok(
  $$select public.update_activity(
    (select id from public.activities where type = 'call' order by created_at limit 1),
    'replied', 'Khách đã phản hồi thêm', now()
  )$$,
  'Sale A can edit own recent activity'
);
select lives_ok(
  $$select public.record_activity_with_follow_up(
    '70000000-0000-0000-0000-000000000001', 'message', 'replied', 'Đã nhắn xác nhận', now(),
    'Nhắc khách trước lịch', now() + interval '3 days', 'normal'
  )$$,
  'Sale A can create a second pending follow-up'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.activities', array[0::bigint], 'Sale B cannot see Sale A timeline');
select results_eq('select count(*)::bigint from public.follow_up_tasks', array[0::bigint], 'Sale B cannot see Sale A tasks');
select throws_ok(
  $$select public.manage_follow_up_task(
    (select id from public.follow_up_tasks where customer_id = '70000000-0000-0000-0000-000000000001' limit 1),
    'complete', 'Thử đóng task ngoài quyền'
  )$$,
  '42501', 'follow_up_task_update_denied', 'Sale B cannot manage Sale A task even with its UUID'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.activities', array[3::bigint], 'Leader A sees Team A timeline');
select lives_ok(
  $$select public.record_activity_with_follow_up(
    '70000000-0000-0000-0000-000000000001', 'consultation', 'interested', 'Leader hỗ trợ tư vấn', now()
  )$$,
  'Leader A can record Team A activity'
);
select throws_ok(
  $$select public.record_activity_with_follow_up('70000000-0000-0000-0000-000000000002', 'note', null, 'Ngoài team')$$,
  '42501', 'activity_create_denied', 'Leader A cannot write Team B activity'
);
select lives_ok(
  $$select public.manage_follow_up_task(
    (select id from public.follow_up_tasks where customer_id = '70000000-0000-0000-0000-000000000001' order by created_at limit 1),
    'complete', 'Đã hoàn thành chăm sóc'
  )$$,
  'Leader A can complete Team A task'
);
select results_eq(
  $$select count(*)::bigint from public.follow_up_tasks where status = 'completed'$$,
  array[1::bigint], 'Completed task keeps its record'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.activities', array[0::bigint], 'Leader B cannot see Team A timeline');

select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_customer_with_assignment(
    'M3 Khách do Admin tạo', '0911000003', null, (select id from public.lead_sources where name = 'Website'),
    'normal', null, '50000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000002'
  )$$,
  'Customer creation writes a system activity'
);
select results_eq(
  $$select count(*)::bigint from public.activities where type = 'customer_created'$$,
  array[1::bigint], 'Customer-created system activity exists'
);
select lives_ok(
  $$select public.record_activity_with_follow_up(
    '70000000-0000-0000-0000-000000000002', 'appointment', 'booked', 'Admin đặt lịch', now()
  )$$,
  'Admin can record activity organization-wide'
);
select results_eq('select count(*)::bigint from public.activities', array[6::bigint], 'Admin sees all active activities');
select ok((select count(*) > 0 from public.audit_logs where entity_type = 'activities'), 'Activity mutations are audited');
select ok(
  not exists (
    select 1 from public.audit_logs where entity_type = 'activities'
      and (before_data ? 'content' or after_data ? 'content' or before_data ? 'next_action' or after_data ? 'next_action')
  ),
  'Activity audit payload redacts free-text content'
);
select lives_ok(
  $$select public.transfer_customer(
    '70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005',
    'Admin chuyển khách và lịch chăm sóc', 'reassign'
  )$$,
  'Admin transfer applies an explicit follow-up policy'
);
select results_eq(
  $$select count(*)::bigint from public.follow_up_tasks
    where customer_id = '70000000-0000-0000-0000-000000000001'
      and status = 'pending' and assignee_user_id = '50000000-0000-0000-0000-000000000005'$$,
  array[1::bigint], 'Open follow-up is reassigned with customer'
);
select ok(
  exists (
    select 1 from public.follow_up_task_events e join public.follow_up_tasks t on t.id = e.task_id
    where t.customer_id = '70000000-0000-0000-0000-000000000001' and e.event_type = 'reassigned'
  ),
  'Task reassignment is preserved in event history'
);

select * from finish();
rollback;
