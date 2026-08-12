begin;

create extension if not exists pgtap with schema extensions;
select plan(57);

select has_table('public', 'deals', 'deals table exists');
select policies_are('public', 'deals', array['deals_select_by_customer'], 'deals use explicit customer-scope policy');
select has_function('public', 'register_deal', array['uuid', 'numeric', 'timestamp with time zone', 'uuid', 'text', 'boolean'], 'register deal RPC exists');
select has_function('public', 'void_deal', array['uuid', 'text'], 'void deal RPC exists');
select has_column('public', 'deals', 'replaces_deal_id', 'Deals record the prior version they replace');
select has_column('public', 'deals', 'amendment_reason', 'Deal replacements require an amendment reason');
select has_function('public', 'amend_deal', array['uuid', 'numeric', 'timestamp with time zone', 'text', 'text', 'uuid'], 'Amend deal RPC exists');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-admin@test.invalid', '{"full_name":"Deal Admin"}'),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-leader-a@test.invalid', '{"full_name":"Deal Leader A"}'),
  ('80000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-leader-b@test.invalid', '{"full_name":"Deal Leader B"}'),
  ('80000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-sale-a@test.invalid', '{"full_name":"Deal Sale A"}'),
  ('80000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deal-sale-b@test.invalid', '{"full_name":"Deal Sale B"}');

insert into public.teams(id, name) values
  ('81000000-0000-0000-0000-000000000001', 'Deal Team A'),
  ('81000000-0000-0000-0000-000000000002', 'Deal Team B');
update public.profiles set role = 'admin', is_active = true where id = '80000000-0000-0000-0000-000000000001';
update public.profiles set role = 'leader', team_id = '81000000-0000-0000-0000-000000000001', is_active = true where id = '80000000-0000-0000-0000-000000000002';
update public.profiles set role = 'leader', team_id = '81000000-0000-0000-0000-000000000002', is_active = true where id = '80000000-0000-0000-0000-000000000003';
update public.profiles set role = 'sale', team_id = '81000000-0000-0000-0000-000000000001', is_active = true where id = '80000000-0000-0000-0000-000000000004';
update public.profiles set role = 'sale', team_id = '81000000-0000-0000-0000-000000000002', is_active = true where id = '80000000-0000-0000-0000-000000000005';

insert into public.customers(id, full_name, phone, source_id, owner_user_id, team_id, created_by, updated_by)
values
  ('82000000-0000-0000-0000-000000000001', 'Deal Khách A', '0922000001', (select id from public.lead_sources where name = 'Website'), '80000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000002', 'Deal Khách B', '0922000002', (select id from public.lead_sources where name = 'Facebook'), '80000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001');

insert into public.activities(id, customer_id, type, content, occurred_at, performed_by, next_action, follow_up_at, created_by, updated_by)
values ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'call', 'Chuẩn bị chốt', now(), '80000000-0000-0000-0000-000000000004', 'Xác nhận đăng ký', now() + interval '1 day', '80000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000004');
insert into public.follow_up_tasks(id, customer_id, activity_id, assignee_user_id, due_at, created_by, updated_by)
values ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004', now() + interval '1 day', '80000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$update public.customers set status = 'won' where id = '82000000-0000-0000-0000-000000000001'$$,
  '23514', 'active_deal_required_for_won', 'Customer cannot become won without active deal'
);
select lives_ok(
  $$select public.register_deal(
    '82000000-0000-0000-0000-000000000001', 100000000, now(),
    '85000000-0000-0000-0000-000000000001', 'Gói dịch vụ A', true
  )$$,
  'Sale A can register a deal for own customer'
);
select results_eq('select count(*)::bigint from public.deals', array[1::bigint], 'Sale A sees own deal');
select results_eq(
  $$select status::text from public.customers where id = '82000000-0000-0000-0000-000000000001'$$,
  array['won'::text], 'Registration moves customer to won'
);
select results_eq(
  $$select count(*)::bigint from public.activities where customer_id = '82000000-0000-0000-0000-000000000001' and type = 'registration'$$,
  array[1::bigint], 'Registration creates system activity'
);
select results_eq(
  $$select status::text from public.follow_up_tasks where id = '84000000-0000-0000-0000-000000000001'$$,
  array['completed'::text], 'Registration can close pending follow-ups'
);
select results_eq(
  $$select public.register_deal(
    '82000000-0000-0000-0000-000000000001', 100000000, now(),
    '85000000-0000-0000-0000-000000000001', 'Retry', true
  )$$,
  $$select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000001'$$,
  'Retry with same idempotency key returns original deal'
);
select results_eq('select count(*)::bigint from public.deals', array[1::bigint], 'Idempotent retry does not create duplicate deal');
select results_eq(
  $$select owner_user_id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000001'$$,
  array['80000000-0000-0000-0000-000000000004'::uuid], 'Deal captures owner at registration time'
);
select throws_ok(
  $$select public.register_deal('82000000-0000-0000-0000-000000000002', 1, now(), '85000000-0000-0000-0000-000000000009')$$,
  '42501', 'deal_create_denied', 'Sale A cannot register Deal B customer'
);
select throws_ok(
  $$select public.register_deal('82000000-0000-0000-0000-000000000001', 1, now() + interval '1 day', '85000000-0000-0000-0000-000000000008')$$,
  '22023', 'invalid_registered_at', 'Future registration time is rejected'
);
select throws_ok(
  $$select public.register_deal('82000000-0000-0000-0000-000000000001', -1, now(), '85000000-0000-0000-0000-000000000007')$$,
  '22023', 'invalid_deal_amount', 'Negative amount is rejected'
);
select throws_ok(
  $$select public.void_deal((select id from public.deals limit 1), 'Sale thử vô hiệu hóa')$$,
  '42501', 'deal_void_denied', 'Sale cannot void a deal'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.deals', array[0::bigint], 'Sale B cannot see Sale A deal');
select lives_ok(
  $$select public.register_deal(
    '82000000-0000-0000-0000-000000000002', 300000000, now(),
    '85000000-0000-0000-0000-000000000002', 'Gói dịch vụ B', false
  )$$,
  'Sale B can register own customer deal'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.deals', array[1::bigint], 'Leader A sees Team A deal');
select lives_ok(
  $$select public.register_deal(
    '82000000-0000-0000-0000-000000000001', 200000000, now(),
    '85000000-0000-0000-0000-000000000003', 'Giao dịch bổ sung', false
  )$$,
  'Leader A can register Team A deal'
);
select throws_ok(
  $$select public.register_deal('82000000-0000-0000-0000-000000000002', 1, now(), '85000000-0000-0000-0000-000000000006')$$,
  '42501', 'deal_create_denied', 'Leader A cannot register Team B deal'
);
select lives_ok(
  $$select public.void_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000001'),
    'Sai số tiền giao dịch'
  )$$,
  'Leader A can void Team A deal'
);
select results_eq(
  $$select status::text from public.customers where id = '82000000-0000-0000-0000-000000000001'$$,
  array['won'::text], 'Customer stays won while another active deal exists'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.deals', array[1::bigint], 'Leader B sees Team B deal only');
select throws_ok(
  $$select public.void_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000003'),
    'Thử ngoài team'
  )$$,
  '42501', 'deal_void_denied', 'Leader B cannot void Team A deal'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.deals', array[3::bigint], 'Admin sees all deals');
select lives_ok(
  $$select public.void_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000003'),
    'Hủy giao dịch bổ sung'
  )$$,
  'Admin can void remaining Team A deal'
);
select results_eq(
  $$select status::text from public.customers where id = '82000000-0000-0000-0000-000000000001'$$,
  array['follow_up'::text], 'Voiding last active deal moves customer back to follow-up'
);
select lives_ok(
  $$select public.void_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000002'),
    'Admin hủy giao dịch Team B'
  )$$,
  'Admin can void Team B deal'
);
select results_eq('select count(*)::bigint from public.deals where status = ''void''', array[3::bigint], 'Voided deals remain in history');
select ok((select count(*) > 0 from public.audit_logs where entity_type = 'deals'), 'Deal changes are audited');
select ok(
  not exists (
    select 1 from public.audit_logs where entity_type = 'deals'
      and (before_data ? 'note' or after_data ? 'note' or before_data ? 'idempotency_key' or after_data ? 'idempotency_key')
  ),
  'Deal audit redacts note and idempotency key'
);
select results_eq('select sum(amount_vnd)::numeric from public.deals', array[600000000::numeric], 'VND amounts remain exact numeric values');

reset role;
insert into public.customers(id, full_name, phone, source_id, owner_user_id, team_id, created_by, updated_by)
values
  ('82000000-0000-0000-0000-000000000003', 'Deal Khách Điều Chỉnh', '0922000003', (select id from public.lead_sources where name = 'Website'), '80000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000004', 'Deal Khách Quá Hạn A', '0922000004', (select id from public.lead_sources where name = 'Website'), '80000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000005', 'Deal Khách Quá Hạn B', '0922000005', (select id from public.lead_sources where name = 'Facebook'), '80000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001');
insert into public.deals(id, customer_id, owner_user_id, team_id, amount_vnd, registered_at, idempotency_key, note, created_at, created_by, updated_by)
values
  ('86000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', 200000000, now() - interval '1 hour', '85000000-0000-0000-0000-000000000020', 'Sai số cũ A', now() - interval '25 hours', '80000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000004'),
  ('86000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000002', 300000000, now() - interval '1 hour', '85000000-0000-0000-0000-000000000030', 'Sai số cũ B', now() - interval '25 hours', '80000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000005');
update public.customers set status = 'won' where id in (
  '82000000-0000-0000-0000-000000000004',
  '82000000-0000-0000-0000-000000000005'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$select public.register_deal(
    '82000000-0000-0000-0000-000000000003', 100000000, now(),
    '85000000-0000-0000-0000-000000000010', 'Bản gốc cần sửa', false
  )$$,
  'Sale A creates an own deal for amendment testing'
);
select lives_ok(
  $$select public.amend_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010'),
    125000000, now(), 'Bản đã sửa', 'Nhập sai doanh thu',
    '85000000-0000-0000-0000-000000000011'
  )$$,
  'Sale A can amend a deal they created within 24 hours'
);
select results_eq(
  $$select status::text from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010'$$,
  array['void'::text], 'Amendment voids the original deal'
);
select results_eq(
  $$select amount_vnd::numeric from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000011' and status = 'active'$$,
  array[125000000::numeric], 'Amendment creates one active replacement with the corrected amount'
);
select results_eq(
  $$select replaces_deal_id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000011'$$,
  $$select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010'$$,
  'Replacement keeps a foreign-key link to the original deal'
);
select results_eq(
  $$select public.amend_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010'),
    999000000, now(), 'Retry khác payload', 'Retry cùng request',
    '85000000-0000-0000-0000-000000000011'
  )$$,
  $$select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000011'$$,
  'Idempotent amendment retry returns the existing replacement'
);
select results_eq(
  $$select count(*)::bigint from public.deals where replaces_deal_id = (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010')$$,
  array[1::bigint], 'Retry cannot create overlapping direct replacements'
);
select throws_ok(
  $$select public.amend_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000011'),
    125000000,
    (select registered_at from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000011'),
    'Bản đã sửa', 'Không có thay đổi', '85000000-0000-0000-0000-000000000012'
  )$$,
  '22023', 'deal_amend_no_changes', 'No-op amendment cannot create a redundant version'
);
select throws_ok(
  $$select public.amend_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010'),
    130000000, now(), null, 'Sửa lại bản cũ', '85000000-0000-0000-0000-000000000013'
  )$$,
  '22023', 'deal_amend_inactive', 'An inactive original cannot be amended again'
);
select throws_ok(
  $$select public.amend_deal(
    '86000000-0000-0000-0000-000000000002', 210000000, now(), null,
    'Sale sửa quá hạn', '85000000-0000-0000-0000-000000000021'
  )$$,
  '42501', 'deal_amend_window_expired', 'Sale cannot amend after the 24-hour window'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.amend_deal(
    (select id from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000011'),
    1, now(), null, 'Thử sửa ngoài quyền', '85000000-0000-0000-0000-000000000014'
  )$$,
  '42501', 'deal_amend_denied', 'Sale B cannot amend Sale A replacement'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.amend_deal(
    '86000000-0000-0000-0000-000000000002', 210000000, now(), null,
    'Leader B thử Team A', '85000000-0000-0000-0000-000000000022'
  )$$,
  '42501', 'deal_amend_denied', 'Leader B cannot amend a Team A deal'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.amend_deal(
    '86000000-0000-0000-0000-000000000002', 210000000, now(), 'Leader sửa đúng',
    'Leader sửa giao dịch cũ', '85000000-0000-0000-0000-000000000023'
  )$$,
  'Leader A can amend an own-team deal after the Sale window'
);
select results_eq(
  $$select amount_vnd::numeric from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000023' and status = 'active'$$,
  array[210000000::numeric], 'Leader amendment leaves exactly the corrected active amount'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.amend_deal(
    '86000000-0000-0000-0000-000000000003', 310000000, now(), 'Admin sửa đúng',
    'Admin sửa giao dịch Team B', '85000000-0000-0000-0000-000000000031'
  )$$,
  'Admin can amend an active deal in any team'
);
select results_eq(
  $$select amount_vnd::numeric from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000031' and status = 'active'$$,
  array[310000000::numeric], 'Admin amendment preserves one corrected active replacement'
);
select results_eq(
  $$select sum(amount_vnd)::numeric from public.deals where status = 'active' and customer_id in (
    '82000000-0000-0000-0000-000000000003',
    '82000000-0000-0000-0000-000000000004',
    '82000000-0000-0000-0000-000000000005'
  )$$,
  array[645000000::numeric], 'Only replacement amounts remain active for KPI calculations'
);
select results_eq(
  $$select (public.get_kpi_summary(now() - interval '2 days', now() + interval '1 day')->>'revenue_vnd')::numeric$$,
  array[645000000::numeric], 'KPI revenue counts corrected replacements and excludes superseded originals'
);
select ok(
  not exists (
    select 1 from public.deals replacement
    left join public.deals original on original.id = replacement.replaces_deal_id
    where replacement.replaces_deal_id is not null and original.id is null
  ),
  'Replacement chains contain no orphan deal records'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where entity_type = 'deals'
      and after_data ->> 'replaces_deal_id' = (
        select id::text from public.deals where idempotency_key = '85000000-0000-0000-0000-000000000010'
      )
  ),
  'Amendment replacement and chain link are audited'
);

select * from finish();
rollback;
