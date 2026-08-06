begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'ai_settings', 'AI settings table exists');
select has_table('public', 'ai_customer_analyses', 'AI customer analyses table exists');
select has_table('public', 'ai_usage_daily', 'AI daily usage table exists');
select has_function('public', 'create_ai_customer_analysis_request', array['uuid'], 'AI request function exists');
select has_function('public', 'complete_ai_customer_analysis', array['uuid', 'jsonb', 'text', 'integer', 'integer', 'integer', 'integer', 'numeric'], 'AI completion function exists');
select has_function('public', 'fail_ai_customer_analysis', array['uuid', 'text', 'integer'], 'AI failure function exists');
select policies_are('public', 'ai_customer_analyses', array['ai_customer_analyses_select_by_customer'], 'AI analysis has one scoped read policy');
select policies_are('public', 'ai_settings', array['ai_settings_select_active', 'ai_settings_update_admin'], 'AI settings policies are explicit');
select policies_are('public', 'ai_usage_daily', array['ai_usage_daily_select_self_or_admin'], 'AI usage policy is explicit');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-admin@test.invalid', '{"full_name":"AI Admin"}'),
  ('c0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-leader-a@test.invalid', '{"full_name":"AI Leader A"}'),
  ('c0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-leader-b@test.invalid', '{"full_name":"AI Leader B"}'),
  ('c0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-sale-a@test.invalid', '{"full_name":"AI Sale A"}'),
  ('c0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-sale-b@test.invalid', '{"full_name":"AI Sale B"}');

insert into public.teams(id, name) values
  ('c1000000-0000-4000-8000-000000000001', 'AI Team A'),
  ('c1000000-0000-4000-8000-000000000002', 'AI Team B');

update public.profiles set role = 'admin', is_active = true where id = 'c0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'leader', team_id = 'c1000000-0000-4000-8000-000000000001', is_active = true where id = 'c0000000-0000-4000-8000-000000000002';
update public.profiles set role = 'leader', team_id = 'c1000000-0000-4000-8000-000000000002', is_active = true where id = 'c0000000-0000-4000-8000-000000000003';
update public.profiles set role = 'sale', team_id = 'c1000000-0000-4000-8000-000000000001', is_active = true where id = 'c0000000-0000-4000-8000-000000000004';
update public.profiles set role = 'sale', team_id = 'c1000000-0000-4000-8000-000000000002', is_active = true where id = 'c0000000-0000-4000-8000-000000000005';

insert into public.customers(id, full_name, phone, email, source_id, owner_user_id, team_id, note_summary, created_by, updated_by)
values
  ('c2000000-0000-4000-8000-000000000001', 'Khách AI A', '0909111222', 'a@test.invalid', (select id from public.lead_sources where name = 'Website'), 'c0000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'Quan tâm gói tư vấn.', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002', 'Khách AI B', '0909222333', null, (select id from public.lead_sources where name = 'Facebook'), 'c0000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000002', 'Đang so sánh giải pháp.', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');

insert into public.activities(id, customer_id, type, outcome, content, occurred_at, performed_by, created_by, updated_by)
values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'call', 'connected', 'Khách muốn nhận báo giá trong tuần.', now() - interval '1 day', 'c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004'),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'message', 'replied', 'Khách cần thêm thông tin.', now() - interval '2 days', 'c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005');

update public.ai_settings set daily_request_quota = 1;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select lives_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000001')$$, 'Sale A can request analysis for own customer');
select results_eq('select count(*)::bigint from public.ai_customer_analyses', array[1::bigint], 'Sale A sees own customer analysis');
select ok(not (select (input_snapshot -> 'customer') ?| array['phone', 'email'] from public.ai_customer_analyses limit 1), 'Snapshot excludes phone and email');
select results_eq($$select jsonb_array_length(input_snapshot -> 'activities') from public.ai_customer_analyses limit 1$$, array[1], 'Snapshot includes scoped activities');
select throws_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000002')$$, '42501', 'ai_customer_scope_denied', 'Sale A cannot analyze Team B customer');
select throws_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000001')$$, 'P0001', 'ai_daily_quota_exceeded', 'Daily quota is enforced atomically');
select throws_ok($$insert into public.ai_customer_analyses(customer_id, requested_by, input_snapshot) values ('c2000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', '{}'::jsonb)$$, '42501', null, 'Authenticated users cannot insert AI rows directly');
select throws_ok($$update public.ai_customer_analyses set status = 'completed'$$, '42501', null, 'Authenticated users cannot forge AI completion');
select lives_ok($$update public.ai_settings set daily_request_quota = 2$$, 'Sale settings update is safely filtered by RLS');
select results_eq('select daily_request_quota from public.ai_settings', array[1], 'Sale cannot change AI settings');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.ai_customer_analyses', array[0::bigint], 'Sale B cannot see Team A analysis');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000001')$$, 'Leader A can analyze Team A customer');
select throws_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000002')$$, '42501', 'ai_customer_scope_denied', 'Leader A cannot analyze Team B customer');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000002')$$, 'Leader B can analyze Team B customer');
select results_eq('select count(*)::bigint from public.ai_customer_analyses', array[1::bigint], 'Leader B sees Team B analysis only');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.ai_settings set daily_request_quota = 2$$, 'Admin can update AI settings');
select lives_ok($$select public.create_ai_customer_analysis_request('c2000000-0000-4000-8000-000000000002')$$, 'Admin can analyze any customer');
select results_eq('select count(*)::bigint from public.ai_customer_analyses', array[4::bigint], 'Admin sees every AI analysis');
select set_config('test.sale_analysis_id', (select id::text from public.ai_customer_analyses where requested_by = 'c0000000-0000-4000-8000-000000000004'), true);
select set_config('test.leader_analysis_id', (select id::text from public.ai_customer_analyses where requested_by = 'c0000000-0000-4000-8000-000000000002'), true);

reset role;
set local role service_role;
select throws_ok(
  $$select public.complete_ai_customer_analysis(
    current_setting('test.sale_analysis_id')::uuid,
    '{"summary":"Tóm tắt","potential_level":"high","lead_score":85,"score_reasons":[],"key_needs":[],"objections":[],"risks":[],"next_actions":[],"suggested_follow_up_at":null,"suggested_message":null,"missing_information":[],"confidence":"medium","evidence_activity_ids":["d3000000-0000-4000-8000-000000000099"]}'::jsonb,
    'test-model', 100, 50, 150, 250, null
  )$$,
  '22023', 'ai_result_invalid', 'Completion rejects evidence outside snapshot'
);
select lives_ok(
  $$select public.complete_ai_customer_analysis(
    current_setting('test.sale_analysis_id')::uuid,
    '{"summary":"Tóm tắt","potential_level":"high","lead_score":85,"score_reasons":["Đã yêu cầu báo giá"],"key_needs":["Báo giá"],"objections":[],"risks":[],"next_actions":[{"action":"Gửi báo giá","priority":"high","reason":"Khách đã yêu cầu"}],"suggested_follow_up_at":null,"suggested_message":"Em gửi anh/chị báo giá.","missing_information":[],"confidence":"medium","evidence_activity_ids":["c3000000-0000-4000-8000-000000000001"]}'::jsonb,
    'test-model', 100, 50, 150, 250, null
  )$$,
  'Service role completes a valid analysis'
);
reset role;
select results_eq($$select request_count from public.ai_usage_daily where user_id = 'c0000000-0000-4000-8000-000000000004'$$, array[1], 'Completed request increments usage');
set local role service_role;
select lives_ok(
  $$select public.fail_ai_customer_analysis(
    current_setting('test.leader_analysis_id')::uuid,
    'model_timeout', 20000
  )$$,
  'Service role can record a sanitized failure'
);

reset role;
select ok(
  not exists (
    select 1 from public.audit_logs where entity_type = 'ai_customer_analyses'
      and (coalesce(before_data, '{}'::jsonb) ?| array['input_snapshot', 'result']
        or coalesce(after_data, '{}'::jsonb) ?| array['input_snapshot', 'result'])
  ),
  'AI audit logs never copy prompts or results'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs where entity_type = 'ai_customer_analyses'$$,
  array[6::bigint],
  'AI request and status changes are audited'
);

select * from finish();
rollback;
