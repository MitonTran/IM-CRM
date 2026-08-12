begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_function(
  'public', 'admin_manage_team', array['uuid', 'text', 'boolean'],
  'Admin team management RPC exists'
);
select has_function(
  'public', 'admin_manage_profile', array['uuid', 'text', 'app_role', 'uuid', 'boolean'],
  'Admin profile management RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_manage_team(uuid,text,boolean)', 'EXECUTE'),
  'Authenticated sessions can invoke the guarded team RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_manage_profile(uuid,text,app_role,uuid,boolean)', 'EXECUTE'),
  'Authenticated sessions can invoke the guarded profile RPC'
);
select ok(not has_table_privilege('authenticated', 'public.teams', 'DELETE'), 'Authenticated cannot hard-delete teams');
select ok(not has_table_privilege('authenticated', 'public.teams', 'UPDATE'), 'Authenticated cannot bypass team RPC');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'Authenticated cannot bypass profile RPC');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid', '{"full_name":"Admin Test"}'),
  ('a7000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader-a@test.invalid', '{"full_name":"Leader A"}'),
  ('a7000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader-b@test.invalid', '{"full_name":"Leader B"}'),
  ('a7000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sale-a@test.invalid', '{"full_name":"Sale A"}'),
  ('a7000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sale-b@test.invalid', '{"full_name":"Sale B"}'),
  ('a7000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'spare-sale@test.invalid', '{"full_name":"Spare Sale"}');

insert into public.teams(id, name, is_active) values
  ('a7100000-0000-4000-8000-000000000001', 'Management Team A', true),
  ('a7100000-0000-4000-8000-000000000002', 'Management Team B', true),
  ('a7100000-0000-4000-8000-000000000003', 'Management Team Tasks', true),
  ('a7100000-0000-4000-8000-000000000004', 'Management Team Customers', true),
  ('a7100000-0000-4000-8000-000000000005', 'Management Team Empty', true),
  ('a7100000-0000-4000-8000-000000000006', 'Management Team Inactive', false);

update public.profiles set role = 'admin', is_active = true
where id = 'a7000000-0000-4000-8000-000000000001';
update public.profiles set role = 'leader', team_id = 'a7100000-0000-4000-8000-000000000001', is_active = true
where id = 'a7000000-0000-4000-8000-000000000002';
update public.profiles set role = 'leader', team_id = 'a7100000-0000-4000-8000-000000000002', is_active = true
where id = 'a7000000-0000-4000-8000-000000000003';
update public.profiles set role = 'sale', team_id = 'a7100000-0000-4000-8000-000000000001', is_active = true
where id = 'a7000000-0000-4000-8000-000000000004';
update public.profiles set role = 'sale', team_id = 'a7100000-0000-4000-8000-000000000002', is_active = true
where id = 'a7000000-0000-4000-8000-000000000005';
update public.profiles set role = 'sale', team_id = 'a7100000-0000-4000-8000-000000000003', is_active = true
where id = 'a7000000-0000-4000-8000-000000000006';

insert into public.customers(
  id, full_name, email, source_id, owner_user_id, team_id, created_by, updated_by
) values
  (
    'a7200000-0000-4000-8000-000000000001', 'Management Customer Sale A', 'manage-sale-a@test.invalid',
    (select id from public.lead_sources where name = 'Website'),
    'a7000000-0000-4000-8000-000000000004', 'a7100000-0000-4000-8000-000000000001',
    'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001'
  ),
  (
    'a7200000-0000-4000-8000-000000000002', 'Management Customer Sale B', 'manage-sale-b@test.invalid',
    (select id from public.lead_sources where name = 'Website'),
    'a7000000-0000-4000-8000-000000000005', 'a7100000-0000-4000-8000-000000000002',
    'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001'
  ),
  (
    'a7200000-0000-4000-8000-000000000003', 'Management Unassigned Customer', 'manage-unassigned@test.invalid',
    (select id from public.lead_sources where name = 'Website'),
    null, 'a7100000-0000-4000-8000-000000000004',
    'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001'
  );

insert into public.activities(
  id, customer_id, type, occurred_at, performed_by, created_by, updated_by
) values (
  'a7300000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000002',
  'note', now(), 'a7000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001'
);
insert into public.follow_up_tasks(
  id, customer_id, activity_id, assignee_user_id, due_at, created_by, updated_by
) values (
  'a7400000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000002',
  'a7300000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000006',
  now() + interval '1 day', 'a7000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000004', 'Sale A', 'admin', null, true)$$,
  '42501', 'profile_manage_denied', 'Sale A cannot manage profiles'
);

select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_manage_team('a7100000-0000-4000-8000-000000000002', 'Blocked Team B', true)$$,
  '42501', 'team_manage_denied', 'Sale B cannot manage teams'
);

select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000004', 'Blocked Sale A', 'sale', 'a7100000-0000-4000-8000-000000000001', true)$$,
  '42501', 'profile_manage_denied', 'Leader A cannot manage profiles'
);

select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_manage_team('a7100000-0000-4000-8000-000000000002', 'Blocked Leader B', true)$$,
  '42501', 'team_manage_denied', 'Leader B cannot manage teams'
);

select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_manage_team('a7100000-0000-4000-8000-000000000001', 'Management Team A', false)$$,
  '55000', 'team_manage_active_members', 'Admin cannot stop a team with active members'
);
select throws_ok(
  $$select public.admin_manage_team('a7100000-0000-4000-8000-000000000004', 'Management Team Customers', false)$$,
  '55000', 'team_manage_active_customers', 'Admin cannot stop a team with active customers'
);
select lives_ok(
  $$select public.admin_manage_team('a7100000-0000-4000-8000-000000000005', 'Management Team Archived', false)$$,
  'Admin can rename and stop an empty team'
);
select results_eq(
  $$select name, is_active from public.teams where id = 'a7100000-0000-4000-8000-000000000005'$$,
  $$values ('Management Team Archived'::text, false)$$,
  'Stopped team keeps its row and new name'
);
select lives_ok(
  $$select public.admin_manage_team('a7100000-0000-4000-8000-000000000005', 'Management Team Archived', true)$$,
  'Admin can reactivate a stopped team'
);
select lives_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000004', 'Sale A Renamed', 'sale', 'a7100000-0000-4000-8000-000000000001', true)$$,
  'Admin can rename a Sale without changing scope'
);
select results_eq(
  $$select full_name from public.profiles where id = 'a7000000-0000-4000-8000-000000000004'$$,
  array['Sale A Renamed'::text],
  'Sale rename is persisted'
);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000004', 'Sale A Renamed', 'sale', 'a7100000-0000-4000-8000-000000000001', false)$$,
  '55000', 'profile_manage_active_customers', 'Admin must transfer active customers before locking a Sale'
);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000006', 'Spare Sale', 'sale', 'a7100000-0000-4000-8000-000000000003', false)$$,
  '55000', 'profile_manage_pending_tasks', 'Admin must resolve pending tasks before locking a Sale'
);
select lives_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000003', 'Leader B', 'leader', 'a7100000-0000-4000-8000-000000000002', false)$$,
  'Admin can lock a Leader without owned customers or pending tasks'
);
select results_eq(
  $$select is_active from public.profiles where id = 'a7000000-0000-4000-8000-000000000003'$$,
  array[false],
  'Locked Leader profile remains in history'
);
select lives_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000003', 'Leader B', 'leader', 'a7100000-0000-4000-8000-000000000002', true)$$,
  'Admin can reactivate a locked Leader'
);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000003', 'Leader B', 'leader', 'a7100000-0000-4000-8000-000000000006', true)$$,
  '22023', 'profile_manage_team_invalid', 'Admin cannot activate a user in an inactive team'
);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000003', 'Leader B', 'leader', null, true)$$,
  '22023', 'profile_manage_team_required', 'Non-admin profiles always require a team'
);
select lives_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000001', 'Admin Renamed', 'admin', null, true)$$,
  'Admin can rename their own profile'
);
select results_eq(
  $$select full_name from public.profiles where id = 'a7000000-0000-4000-8000-000000000001'$$,
  array['Admin Renamed'::text],
  'Self rename keeps Admin privileges intact'
);
select throws_ok(
  $$select public.admin_manage_profile('a7000000-0000-4000-8000-000000000001', 'Admin Renamed', 'sale', 'a7100000-0000-4000-8000-000000000001', true)$$,
  '42501', 'profile_manage_self_privileges', 'Admin cannot demote their current session'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = 'a7000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'Admin cannot bypass profile guardrails with direct update'
);
select throws_ok(
  $$update public.teams set is_active = false where id = 'a7100000-0000-4000-8000-000000000001'$$,
  '42501', null, 'Admin cannot bypass team guardrails with direct update'
);
select throws_ok(
  $$delete from public.teams where id = 'a7100000-0000-4000-8000-000000000005'$$,
  '42501', null, 'Admin cannot hard-delete a team'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs where actor_user_id = 'a7000000-0000-4000-8000-000000000001' and entity_type = 'profiles' and action = 'update'$$,
  array[4::bigint],
  'Profile rename, lock, reactivate and self rename are audited'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs where actor_user_id = 'a7000000-0000-4000-8000-000000000001' and entity_type = 'teams' and action = 'update'$$,
  array[2::bigint],
  'Team stop/rename and reactivation are audited'
);
select results_eq($$select count(*)::bigint from public.profiles$$, array[6::bigint], 'All profile history remains');
select results_eq($$select count(*)::bigint from public.teams$$, array[6::bigint], 'All team history remains');

select * from finish();
rollback;
