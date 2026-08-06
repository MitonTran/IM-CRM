begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table('public', 'lead_sources', 'lead_sources table exists');
select has_table('public', 'customers', 'customers table exists');
select has_table('public', 'customer_tags', 'customer_tags table exists');
select has_table('public', 'customer_tag_links', 'customer_tag_links table exists');
select has_table('public', 'customer_assignments', 'customer_assignments table exists');
select policies_are(
  'public',
  'customers',
  array['customers_select_by_scope', 'customers_update_by_scope'],
  'customer policies are explicit'
);

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm2-admin@test.invalid', '{"full_name":"M2 Admin"}'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm2-leader-a@test.invalid', '{"full_name":"M2 Leader A"}'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm2-leader-b@test.invalid', '{"full_name":"M2 Leader B"}'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm2-sale-a@test.invalid', '{"full_name":"M2 Sale A"}'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm2-sale-b@test.invalid', '{"full_name":"M2 Sale B"}');

insert into public.teams(id, name) values
  ('30000000-0000-0000-0000-000000000001', 'M2 Team A'),
  ('30000000-0000-0000-0000-000000000002', 'M2 Team B');

update public.profiles set role = 'admin', is_active = true
where id = '20000000-0000-0000-0000-000000000001';
update public.profiles set role = 'leader', team_id = '30000000-0000-0000-0000-000000000001', is_active = true
where id = '20000000-0000-0000-0000-000000000002';
update public.profiles set role = 'leader', team_id = '30000000-0000-0000-0000-000000000002', is_active = true
where id = '20000000-0000-0000-0000-000000000003';
update public.profiles set role = 'sale', team_id = '30000000-0000-0000-0000-000000000001', is_active = true
where id = '20000000-0000-0000-0000-000000000004';
update public.profiles set role = 'sale', team_id = '30000000-0000-0000-0000-000000000002', is_active = true
where id = '20000000-0000-0000-0000-000000000005';

insert into public.customers(
  id, full_name, phone, email, source_id, owner_user_id, team_id, created_by, updated_by
) values
  (
    '40000000-0000-0000-0000-000000000001', 'Khách Sale A', '0901 111 111', null,
    (select id from public.lead_sources where name = 'Website'),
    '20000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000002', 'Khách chưa giao A', null, 'open-a@test.invalid',
    (select id from public.lead_sources where name = 'Facebook'),
    null, '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000003', 'Khách Sale B', '+84 902 222 222', null,
    (select id from public.lead_sources where name = 'Giới thiệu'),
    '20000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'
  );

insert into public.customer_assignments(customer_id, assignee_user_id, team_id, reason, assigned_by)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Dữ liệu kiểm thử', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', 'Dữ liệu kiểm thử', '20000000-0000-0000-0000-000000000001');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.customers', array[1::bigint], 'Sale A sees own customer only');
select results_eq(
  $$select count(*)::bigint from public.customers where id = '40000000-0000-0000-0000-000000000002'$$,
  array[0::bigint],
  'Sale A cannot see unassigned team lead'
);
select lives_ok(
  $$update public.customers set status = 'contacting' where id = '40000000-0000-0000-0000-000000000001'$$,
  'Sale A can update safe customer fields'
);
select lives_ok(
  $$insert into public.customer_tag_links(customer_id, tag_id, created_by)
    values (
      '40000000-0000-0000-0000-000000000001',
      (select id from public.customer_tags where name = 'Tiềm năng'),
      '20000000-0000-0000-0000-000000000004'
    )$$,
  'Sale A can tag own customer'
);
select throws_ok(
  $$update public.customers set owner_user_id = '20000000-0000-0000-0000-000000000005' where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Sale A cannot update owner directly'
);
select lives_ok(
  $$select public.create_customer_with_assignment(
    'Khách mới của Sale A', '0903 333 333', null,
    (select id from public.lead_sources where name = 'Website')
  )$$,
  'Sale A can create a customer assigned to self'
);
select results_eq(
  $$select count(*)::bigint from public.customers where owner_user_id = '20000000-0000-0000-0000-000000000004'$$,
  array[2::bigint],
  'New Sale A customer is auto-assigned'
);
select results_eq(
  $$select (public.customer_filter_facets() -> 'status' ->> 'contacting')::int$$,
  array[1],
  'Facet counts are calculated inside Sale A RLS scope'
);
select lives_ok(
  $$select public.set_customer_tags(
    '40000000-0000-0000-0000-000000000001',
    array[(select id from public.customer_tags where name = 'Ưu tiên')]
  )$$,
  'Sale A can replace tags on own customer'
);
select results_eq(
  $$select count(*)::bigint from public.customer_tag_links
    where customer_id = '40000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'Tag replacement leaves the requested tag set'
);
select throws_ok(
  $$select public.create_customer_with_assignment(
    'Khách trùng', '+84 901 111 111', null,
    (select id from public.lead_sources where name = 'Website')
  )$$,
  '23505',
  'customer_duplicate',
  'Normalized duplicate phone is blocked organization-wide'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.customers', array[1::bigint], 'Sale B sees own customer only');
select throws_ok(
  $$select public.set_customer_tags(
    '40000000-0000-0000-0000-000000000001',
    '{}'::uuid[]
  )$$,
  '42501',
  'customer_tag_update_denied',
  'Sale B cannot change tags on Sale A customer'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.customers', array[3::bigint], 'Leader A sees assigned and unassigned Team A customers');
select lives_ok(
  $$select public.transfer_customer(
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000004',
    'Phân khách mới trong team'
  )$$,
  'Leader A can assign a Team A customer'
);
select throws_ok(
  $$select public.transfer_customer(
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000005',
    'Thử chuyển khác team'
  )$$,
  '42501',
  'cross_team_transfer_denied',
  'Leader A cannot transfer to Team B'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.customers', array[1::bigint], 'Leader B sees Team B customer only');
select results_eq(
  $$select count(*)::bigint from public.customers where id = '40000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'Leader B cannot see Team A customer'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.customers', array[4::bigint], 'Admin sees every active customer');
select lives_ok(
  $$select public.transfer_customer(
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000005',
    'Admin chuyển khách liên team'
  )$$,
  'Admin can transfer across teams'
);
select results_eq(
  $$select team_id from public.customers where id = '40000000-0000-0000-0000-000000000001'$$,
  array['30000000-0000-0000-0000-000000000002'::uuid],
  'Cross-team transfer updates customer team'
);
select results_eq(
  $$select count(*)::bigint from public.customer_assignments where customer_id = '40000000-0000-0000-0000-000000000001' and ended_at is null$$,
  array[1::bigint],
  'Customer has exactly one open assignment'
);
select lives_ok(
  $$select public.soft_delete_customer('40000000-0000-0000-0000-000000000003', 'Bản ghi kiểm thử cần xóa')$$,
  'Admin can soft-delete a customer'
);
select results_eq('select count(*)::bigint from public.customers where deleted_at is null', array[3::bigint], 'Soft-delete preserves row but removes it from active set');
select ok(
  (select count(*) > 0 from public.audit_logs where entity_type = 'customers'),
  'Customer changes are audited'
);
select ok(
  not exists (
    select 1 from public.audit_logs
    where entity_type = 'customers'
      and (before_data ? 'phone' or after_data ? 'phone' or before_data ? 'email' or after_data ? 'email')
  ),
  'Customer audit payload redacts contact PII'
);

select * from finish();
rollback;
