begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

select has_table('public', 'ai_conversations', 'AI conversations table exists');
select has_table('public', 'ai_messages', 'AI messages table exists');
select has_table('public', 'ai_request_ledger', 'Shared AI quota ledger exists');
select has_function('public', 'create_ai_assistant_request', array['uuid','text'], 'Assistant request RPC exists');
select has_function('public', 'complete_ai_assistant_message', array['uuid','text','jsonb','jsonb','text','integer','integer','integer','integer','numeric'], 'Assistant completion RPC exists');
select has_function('public', 'fail_ai_assistant_message', array['uuid','text','integer'], 'Assistant failure RPC exists');
select has_function('public', 'search_documents', array['text','integer'], 'ACL document search tool exists');
select has_function('public', 'get_document_excerpt', array['uuid','integer'], 'ACL document excerpt tool exists');
select has_function('public', 'purge_expired_ai_history', array[]::text[], 'AI retention purge function exists');
select policies_are('public', 'ai_conversations', array['ai_conversations_select_owner'], 'Conversations are owner-only');
select policies_are('public', 'ai_messages', array['ai_messages_select_owner'], 'Messages are owner-only');
select policies_are('public', 'ai_request_ledger', array['ai_request_ledger_select_self_or_admin'], 'Quota ledger policy is explicit');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data) values
('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-admin@test.invalid','{"full_name":"Assistant Admin"}'),
('d0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-leader-a@test.invalid','{"full_name":"Assistant Leader A"}'),
('d0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-leader-b@test.invalid','{"full_name":"Assistant Leader B"}'),
('d0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-sale-a@test.invalid','{"full_name":"Assistant Sale A"}'),
('d0000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-sale-b@test.invalid','{"full_name":"Assistant Sale B"}');
insert into public.teams(id,name) values
('d1000000-0000-4000-8000-000000000001','Assistant Team A'),
('d1000000-0000-4000-8000-000000000002','Assistant Team B');
update public.profiles set role='admin',is_active=true where id='d0000000-0000-4000-8000-000000000001';
update public.profiles set role='leader',team_id='d1000000-0000-4000-8000-000000000001',is_active=true where id='d0000000-0000-4000-8000-000000000002';
update public.profiles set role='leader',team_id='d1000000-0000-4000-8000-000000000002',is_active=true where id='d0000000-0000-4000-8000-000000000003';
update public.profiles set role='sale',team_id='d1000000-0000-4000-8000-000000000001',is_active=true where id='d0000000-0000-4000-8000-000000000004';
update public.profiles set role='sale',team_id='d1000000-0000-4000-8000-000000000002',is_active=true where id='d0000000-0000-4000-8000-000000000005';

insert into public.customers(id,full_name,phone,source_id,owner_user_id,team_id,created_by,updated_by) values
('d2000000-0000-4000-8000-000000000001','Khách Assistant A','0909000001',(select id from public.lead_sources where name='Website'),'d0000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');

insert into public.documents(id,title,scope_type,team_id,user_id,created_by,updated_by) values
('d3000000-0000-4000-8000-000000000001','Alpha công ty','organization',null,null,'d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
('d3000000-0000-4000-8000-000000000002','Alpha Team A','team','d1000000-0000-4000-8000-000000000001',null,'d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
('d3000000-0000-4000-8000-000000000003','Alpha Team B','team','d1000000-0000-4000-8000-000000000002',null,'d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
('d3000000-0000-4000-8000-000000000004','Alpha cá nhân Sale A','user',null,'d0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
insert into public.document_versions(id,document_id,version_no,original_file_name,storage_path,mime_type,size_bytes,checksum_sha256,extraction_status,uploaded_by,created_by) values
('d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',1,'org.pdf','assistant/org.pdf','application/pdf',10,repeat('a',64),'ready','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
('d4000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002',1,'a.pdf','assistant/a.pdf','application/pdf',10,repeat('b',64),'ready','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
('d4000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003',1,'b.pdf','assistant/b.pdf','application/pdf',10,repeat('c',64),'ready','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
('d4000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004',1,'personal.pdf','assistant/personal.pdf','application/pdf',10,repeat('d',64),'ready','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
update public.documents d set current_version_id=v.id from public.document_versions v where v.document_id=d.id;
insert into public.document_chunks(id,document_version_id,chunk_index,content,token_count,metadata) values
('d5000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',0,'alpha quy trình chung',5,'{"page":1}'),
('d5000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002',0,'alpha bí quyết Team A',5,'{"page":2}'),
('d5000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000003',0,'alpha bí quyết Team B',5,'{"page":3}'),
('d5000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000004',0,'alpha ghi chú cá nhân',5,'{"page":4}');

update public.ai_settings set daily_request_quota=1;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select lives_ok($$select public.create_ai_assistant_request(null,'Tìm alpha trong tài liệu')$$,'Sale A creates an assistant request');
select set_config('test.sale_conversation_id',(select id::text from public.ai_conversations limit 1),true);
select set_config('test.sale_message_id',(select id::text from public.ai_messages where role='assistant' limit 1),true);
select results_eq('select count(*)::bigint from public.ai_conversations',array[1::bigint],'Sale A sees own conversation');
select results_eq('select count(*)::bigint from public.ai_messages',array[2::bigint],'Request creates user and pending assistant messages');
select lives_ok(format(
  'select public.create_ai_assistant_request(%L::uuid,%L)',
  current_setting('test.sale_conversation_id'),'Câu hỏi thứ hai không bị chặn theo lượt'
),'Sale A can continue asking after the configured analysis quota');
select set_config('test.sale_second_message_id',(
  select id::text from public.ai_messages
  where role='assistant' and id <> current_setting('test.sale_message_id')::uuid
  order by created_at desc limit 1
),true);
select throws_ok($$insert into public.ai_conversations(owner_user_id,title) values ('d0000000-0000-4000-8000-000000000004','Giả mạo')$$,'42501',null,'Authenticated user cannot insert conversations directly');
select throws_ok($$update public.ai_messages set content='Giả mạo' where role='assistant'$$,'42501',null,'Authenticated user cannot forge assistant content');
select results_eq($$select count(*)::bigint from public.search_documents('alpha',10)$$,array[3::bigint],'Sale A retrieval sees organization, Team A and personal chunks');
select results_eq($$select count(*)::bigint from public.get_document_excerpt('d4000000-0000-4000-8000-000000000003',0)$$,array[0::bigint],'Sale A cannot retrieve Team B excerpt by UUID');
select lives_ok($$select public.create_ai_customer_analysis_request('d2000000-0000-4000-8000-000000000001')$$,'Assistant requests do not consume the customer-analysis quota');

select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select results_eq('select count(*)::bigint from public.ai_conversations',array[0::bigint],'Sale B cannot see Sale A conversation');
select results_eq($$select count(*)::bigint from public.search_documents('alpha',10)$$,array[2::bigint],'Sale B retrieval sees organization and Team B only');
select throws_ok(format('select public.create_ai_assistant_request(%L::uuid,%L)',current_setting('test.sale_conversation_id'),'Chèn vào hội thoại khác'),'42501','ai_conversation_scope_denied','Sale B cannot append to Sale A conversation');

select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents('alpha',10)$$,array[2::bigint],'Leader A retrieval sees organization and Team A, not personal docs');
select lives_ok($$select public.create_ai_assistant_request(null,'KPI tháng này')$$,'Leader A creates an owner-only conversation');
select set_config('test.leader_message_id',(select id::text from public.ai_messages where role='assistant' limit 1),true);
select results_eq('select count(*)::bigint from public.ai_conversations',array[1::bigint],'Leader A sees only own conversation');

select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents('alpha',10)$$,array[2::bigint],'Leader B retrieval sees organization and Team B only');
select results_eq('select count(*)::bigint from public.ai_conversations',array[0::bigint],'Leader B cannot see Leader A conversation');

select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents('alpha',10)$$,array[4::bigint],'Admin retrieval sees all document scopes');
select results_eq('select count(*)::bigint from public.ai_conversations',array[0::bigint],'Admin still cannot read other users conversations');

reset role;
set local role service_role;
select throws_ok(format(
  'select public.complete_ai_assistant_message(%L::uuid,%L,%L::jsonb,%L::jsonb,%L,10,5,15,100,null)',
  current_setting('test.sale_message_id'),'Sai tool','[]','[{"tool":"run_sql","result_count":1}]','test-model'
),'22023','ai_tool_call_invalid','Completion rejects tools outside allowlist');
select throws_ok(format(
  'select public.complete_ai_assistant_message(%L::uuid,%L,%L::jsonb,%L::jsonb,%L,10,5,15,100,null)',
  current_setting('test.sale_message_id'),'Sai scope','[{"kind":"document","document_id":"d3000000-0000-4000-8000-000000000003","version_id":"d4000000-0000-4000-8000-000000000003","title":"Team B","locator":"Trang 3","label":"Team B · Trang 3"}]','[{"tool":"search_documents","result_count":1}]','test-model'
),'42501','ai_citation_scope_denied','Completion rejects a citation outside request owner ACL');
select lives_ok(format(
  'select public.complete_ai_assistant_message(%L::uuid,%L,%L::jsonb,%L::jsonb,%L,10,5,15,100,null)',
  current_setting('test.sale_message_id'),'Thông tin từ tài liệu Team A.','[{"kind":"document","document_id":"d3000000-0000-4000-8000-000000000002","version_id":"d4000000-0000-4000-8000-000000000002","title":"Alpha Team A","locator":"Trang 2","label":"Alpha Team A · Trang 2"}]','[{"tool":"search_documents","result_count":3}]','test-model'
),'Service role completes a scoped assistant answer');
select lives_ok(format(
  'select public.fail_ai_assistant_message(%L::uuid,%L,20000)',current_setting('test.leader_message_id'),'model_timeout'
),'Service role records a sanitized assistant failure');
select public.fail_ai_assistant_message(current_setting('test.sale_second_message_id')::uuid,'test_cleanup',0);
reset role;

select results_eq($$select request_count from public.ai_usage_daily where user_id='d0000000-0000-4000-8000-000000000004'$$,array[1],'Completed assistant request increments usage');
select results_eq($$select status from public.ai_messages where id=current_setting('test.sale_message_id')::uuid$$,array['completed'::text],'Completed assistant message has explicit status');
select results_eq($$select status from public.ai_messages where id=current_setting('test.leader_message_id')::uuid$$,array['failed'::text],'Failed assistant message has explicit status');
select ok(not exists(
  select 1 from public.audit_logs where entity_type in ('ai_conversations','ai_messages') and (
    coalesce(before_data,'{}'::jsonb) ?| array['content','citations','tool_calls']
    or coalesce(after_data,'{}'::jsonb) ?| array['content','citations','tool_calls']
  )
),'AI conversation audit never copies message or tool payloads');
select results_eq($$select count(*)::bigint from public.ai_request_ledger$$,array[4::bigint],'Usage ledger contains one reservation per AI request');
select ok((select count(*) >= 6 from public.audit_logs where entity_type in ('ai_conversations','ai_messages')),'Conversation and message state changes are audited');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select results_eq($$select content from public.ai_messages where id=current_setting('test.sale_message_id')::uuid$$,array['Thông tin từ tài liệu Team A.'::text],'Sale A reads the completed answer in own conversation');
select results_eq($$select count(*)::bigint from public.ai_request_ledger$$,array[3::bigint],'Sale A sees only own usage reservations');

reset role;
insert into public.ai_conversations(id,owner_user_id,title,created_at,updated_at,last_message_at) values
('d6000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000005','Hội thoại hết hạn',now()-interval '91 days',now()-interval '91 days',now()-interval '91 days');
set local role service_role;
select results_eq($$select public.purge_expired_ai_history()$$,array[1],'Retention job purges conversations older than configured days');
reset role;
select results_eq($$select count(*)::bigint from public.ai_conversations where id='d6000000-0000-4000-8000-000000000001'$$,array[0::bigint],'Expired conversation is removed');

select * from finish();
rollback;
