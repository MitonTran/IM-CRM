begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'teams', 'teams table exists');
select has_table('public', 'audit_logs', 'audit table exists');
select policies_are('public', 'profiles', array['profiles_select_self_team_or_admin', 'profiles_update_admin_only'], 'profiles policies are explicit');
select policies_are('public', 'teams', array['teams_insert_admin_only', 'teams_select_own_or_admin', 'teams_update_admin_only'], 'teams policies are explicit and hard delete is unavailable');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid', '{"full_name":"Admin Test"}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader-a@test.invalid', '{"full_name":"Leader A"}'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader-b@test.invalid', '{"full_name":"Leader B"}'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sale-a@test.invalid', '{"full_name":"Sale A"}'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sale-b@test.invalid', '{"full_name":"Sale B"}');

insert into public.teams(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Team A'),
  ('10000000-0000-0000-0000-000000000002', 'Team B');

update public.profiles set role = 'admin', is_active = true where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set role = 'leader', team_id = '10000000-0000-0000-0000-000000000001', is_active = true where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set role = 'leader', team_id = '10000000-0000-0000-0000-000000000002', is_active = true where id = '00000000-0000-0000-0000-000000000003';
update public.profiles set role = 'sale', team_id = '10000000-0000-0000-0000-000000000001', is_active = true where id = '00000000-0000-0000-0000-000000000004';
update public.profiles set role = 'sale', team_id = '10000000-0000-0000-0000-000000000002', is_active = true where id = '00000000-0000-0000-0000-000000000005';

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.profiles', array[1::bigint], 'Sale A sees only self');
select results_eq($$select count(*)::bigint from public.teams$$, array[1::bigint], 'Sale A sees own team only');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000004'$$,
  '42501', null, 'Sale A cannot elevate role through a direct table update'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.profiles', array[1::bigint], 'Sale B sees only self');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.profiles', array[2::bigint], 'Leader A sees leader and Sale A');
select results_eq($$select count(*)::bigint from public.profiles where id = '00000000-0000-0000-0000-000000000005'$$, array[0::bigint], 'Leader A cannot see Sale B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.profiles', array[2::bigint], 'Leader B sees leader and Sale B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.profiles', array[5::bigint], 'Admin sees all profiles');
select results_eq('select count(*)::bigint from public.teams', array[2::bigint], 'Admin sees all teams');
select ok((select count(*) > 0 from public.audit_logs), 'Admin can read audit logs');

select * from finish();
rollback;
