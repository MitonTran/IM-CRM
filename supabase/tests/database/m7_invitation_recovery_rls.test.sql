begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

select has_function(
  'public',
  'configure_invited_profile',
  array['uuid', 'text', 'app_role', 'uuid', 'boolean'],
  'Invitation recovery RPC exists'
);

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data) values
  ('f0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid', '{"full_name":"Admin Test"}'),
  ('f0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader-a@test.invalid', '{"full_name":"Leader A"}'),
  ('f0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leader-b@test.invalid', '{"full_name":"Leader B"}'),
  ('f0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sale-a@test.invalid', '{"full_name":"Sale A"}'),
  ('f0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sale-b@test.invalid', '{"full_name":"Sale B"}'),
  ('f0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending@test.invalid', '{"full_name":"Pending Invite"}'),
  ('f0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending-admin@test.invalid', '{"full_name":"Pending Admin"}');

insert into public.teams(id, name, is_active) values
  ('f1000000-0000-4000-8000-000000000001', 'Invitation Team A', true),
  ('f1000000-0000-4000-8000-000000000002', 'Invitation Team B', true),
  ('f1000000-0000-4000-8000-000000000003', 'Invitation Team Inactive', false);

update public.profiles set role = 'admin', is_active = true where id = 'f0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'leader', team_id = 'f1000000-0000-4000-8000-000000000001', is_active = true where id = 'f0000000-0000-4000-8000-000000000002';
update public.profiles set role = 'leader', team_id = 'f1000000-0000-4000-8000-000000000002', is_active = true where id = 'f0000000-0000-4000-8000-000000000003';
update public.profiles set role = 'sale', team_id = 'f1000000-0000-4000-8000-000000000001', is_active = true where id = 'f0000000-0000-4000-8000-000000000004';
update public.profiles set role = 'sale', team_id = 'f1000000-0000-4000-8000-000000000002', is_active = true where id = 'f0000000-0000-4000-8000-000000000005';

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Blocked by Sale A', 'sale', 'f1000000-0000-4000-8000-000000000001', false)$$,
  '42501', 'invitation_profile_manage_denied', 'Sale A cannot configure invited profiles'
);

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Blocked by Sale B', 'sale', 'f1000000-0000-4000-8000-000000000002', false)$$,
  '42501', 'invitation_profile_manage_denied', 'Sale B cannot configure invited profiles'
);

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Blocked by Leader A', 'leader', 'f1000000-0000-4000-8000-000000000001', false)$$,
  '42501', 'invitation_profile_manage_denied', 'Leader A cannot configure invited profiles'
);

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Blocked by Leader B', 'leader', 'f1000000-0000-4000-8000-000000000002', false)$$,
  '42501', 'invitation_profile_manage_denied', 'Leader B cannot configure invited profiles'
);

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Missing Team', 'leader', null, false)$$,
  '22023', 'invitation_team_required', 'Admin must assign a team to a non-admin invite'
);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Inactive Team', 'leader', 'f1000000-0000-4000-8000-000000000003', false)$$,
  '22023', 'invitation_team_invalid', 'Admin cannot assign an inactive team'
);
select lives_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Recovered Leader B', 'leader', 'f1000000-0000-4000-8000-000000000002', false)$$,
  'Admin records the intended role while email delivery is pending'
);
select results_eq(
  $$select role::text, team_id, is_active from public.profiles where id = 'f0000000-0000-4000-8000-000000000006'$$,
  $$values ('leader'::text, 'f1000000-0000-4000-8000-000000000002'::uuid, false)$$,
  'Failed delivery keeps the correct role inactive'
);
select lives_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Recovered Leader B', 'leader', 'f1000000-0000-4000-8000-000000000002', true)$$,
  'Admin activates the same profile after delivery succeeds'
);
select results_eq(
  $$select role::text, team_id, is_active from public.profiles where id = 'f0000000-0000-4000-8000-000000000006'$$,
  $$values ('leader'::text, 'f1000000-0000-4000-8000-000000000002'::uuid, true)$$,
  'Successful retry activates the intended profile without a duplicate'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs where actor_user_id = 'f0000000-0000-4000-8000-000000000001' and entity_type = 'profiles' and entity_id = 'f0000000-0000-4000-8000-000000000006' and action = 'update'$$,
  array[2::bigint],
  'Both pending and activation changes are audited as Admin'
);
select throws_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000006', 'Hijacked Active User', 'admin', null, true)$$,
  '55000', 'invitation_profile_already_active', 'Invitation recovery cannot rewrite an active profile'
);
select lives_ok(
  $$select public.configure_invited_profile('f0000000-0000-4000-8000-000000000007', 'Pending Admin', 'admin', 'f1000000-0000-4000-8000-000000000001', false)$$,
  'Admin invite can be prepared without a team'
);
select results_eq(
  $$select team_id from public.profiles where id = 'f0000000-0000-4000-8000-000000000007'$$,
  array[null::uuid],
  'Admin invite always normalizes team to null'
);
select results_eq(
  $$select count(*)::bigint from public.profiles where id in ('f0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000007')$$,
  array[2::bigint],
  'Recovery keeps one profile per Auth user'
);
select results_eq(
  $$select count(*)::bigint from public.profiles$$,
  array[7::bigint],
  'Five UAT roles and both pending accounts remain intact'
);

select * from finish();
rollback;
