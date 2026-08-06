begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select ok((select not public and file_size_limit = 10485760 from storage.buckets where id = 'document-extracted'), 'Extracted text bucket is private');
select has_column('public', 'document_versions', 'extraction_started_at', 'Extraction start timestamp exists');
select has_column('public', 'document_versions', 'extraction_attempt_count', 'Extraction attempts are tracked');
select has_function('public', 'search_document_ids', array['text'], 'ACL full-text search function exists');
select has_function('public', 'claim_next_document_extraction', array[]::text[], 'Worker queue claim function exists');
select has_function('public', 'claim_document_extraction', array['uuid'], 'Specific worker claim function exists');
select has_function('public', 'complete_document_extraction', array['uuid','text','jsonb'], 'Transactional extraction completion function exists');
select has_function('public', 'fail_document_extraction', array['uuid','document_extraction_status','text'], 'Worker failure function exists');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data) values
('b0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','extract-admin@test.invalid','{"full_name":"Extract Admin"}'),
('b0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','extract-leader-a@test.invalid','{"full_name":"Extract Leader A"}'),
('b0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','extract-leader-b@test.invalid','{"full_name":"Extract Leader B"}'),
('b0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','extract-sale-a@test.invalid','{"full_name":"Extract Sale A"}'),
('b0000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','extract-sale-b@test.invalid','{"full_name":"Extract Sale B"}');
insert into public.teams(id,name) values ('b1000000-0000-0000-0000-000000000001','Extract Team A'),('b1000000-0000-0000-0000-000000000002','Extract Team B');
update public.profiles set role='admin',is_active=true where id='b0000000-0000-0000-0000-000000000001';
update public.profiles set role='leader',team_id='b1000000-0000-0000-0000-000000000001',is_active=true where id='b0000000-0000-0000-0000-000000000002';
update public.profiles set role='leader',team_id='b1000000-0000-0000-0000-000000000002',is_active=true where id='b0000000-0000-0000-0000-000000000003';
update public.profiles set role='sale',team_id='b1000000-0000-0000-0000-000000000001',is_active=true where id='b0000000-0000-0000-0000-000000000004';
update public.profiles set role='sale',team_id='b1000000-0000-0000-0000-000000000002',is_active=true where id='b0000000-0000-0000-0000-000000000005';

insert into public.documents(id,title,scope_type,team_id,user_id,created_by,updated_by) values
('b2000000-0000-0000-0000-000000000001','Chung công ty','organization',null,null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b2000000-0000-0000-0000-000000000002','Team A secret','team','b1000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b2000000-0000-0000-0000-000000000003','Team B secret','team','b1000000-0000-0000-0000-000000000002',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b2000000-0000-0000-0000-000000000004','Retry Team A','team','b1000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b2000000-0000-0000-0000-000000000005','Worker pending','organization',null,null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b2000000-0000-0000-0000-000000000006','Worker invalid','organization',null,null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
insert into public.document_versions(id,document_id,version_no,original_file_name,storage_path,mime_type,size_bytes,checksum_sha256,extraction_status,extraction_error,uploaded_by,created_by) values
('b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001',1,'org.pdf','org/v1/file.pdf','application/pdf',10,repeat('a',64),'ready',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b3000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002',1,'a.pdf','a/v1/file.pdf','application/pdf',10,repeat('b',64),'ready',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b3000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000003',1,'b.pdf','b/v1/file.pdf','application/pdf',10,repeat('c',64),'ready',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b3000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000004',1,'retry.pdf','retry/v1/file.pdf','application/pdf',10,repeat('d',64),'failed','File test lỗi','b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b3000000-0000-0000-0000-000000000005','b2000000-0000-0000-0000-000000000005',1,'pending.pdf','pending/v1/file.pdf','application/pdf',10,repeat('e',64),'pending',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001'),
('b3000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000006',1,'invalid.pdf','invalid/v1/file.pdf','application/pdf',10,repeat('f',64),'pending',null,'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
update public.documents d set current_version_id = v.id from public.document_versions v where v.document_id = d.id;
insert into public.document_chunks(document_version_id,chunk_index,content,token_count,metadata) values
('b3000000-0000-0000-0000-000000000001',0,'alpha kiến thức chung',5,'{"page":1}'),
('b3000000-0000-0000-0000-000000000002',0,'alpha bí quyết Team A',5,'{"page":1}'),
('b3000000-0000-0000-0000-000000000003',0,'alpha bí quyết Team B',5,'{"page":1}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_document_ids('alpha')$$,array[2::bigint],'Sale A full-text search sees organization and Team A only');
select results_eq($$select count(*)::bigint from public.document_chunks$$,array[2::bigint],'Sale A cannot read Team B chunk directly');
select throws_ok($$select public.claim_next_document_extraction()$$,'42501','permission denied for function claim_next_document_extraction','Authenticated user cannot execute worker claim');
select throws_ok($$select public.complete_document_extraction('b3000000-0000-0000-0000-000000000005','b2000000-0000-0000-0000-000000000005/b3000000-0000-0000-0000-000000000005.txt','[]')$$,'42501','permission denied for function complete_document_extraction','Authenticated user cannot complete extraction');

select set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.retry_document_extraction('b3000000-0000-0000-0000-000000000004')$$,'Leader A retries failed Team A version');
select set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.retry_document_extraction('b3000000-0000-0000-0000-000000000004')$$,'42501','document_retry_denied','Leader B cannot retry Team A version by UUID');

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select results_eq($$select version_id from public.claim_document_extraction('b3000000-0000-0000-0000-000000000005')$$,array['b3000000-0000-0000-0000-000000000005'::uuid],'Service worker claims one pending version');
select lives_ok($$select public.complete_document_extraction('b3000000-0000-0000-0000-000000000005','b2000000-0000-0000-0000-000000000005/b3000000-0000-0000-0000-000000000005.txt','[{"chunk_index":0,"content":"worker text","token_count":3,"metadata":{"page":1}}]')$$,'Service worker completes chunks transactionally');
reset role;
select results_eq($$select extraction_status::text from public.document_versions where id='b3000000-0000-0000-0000-000000000005'$$,array['ready'::text],'Completed version becomes ready');
select results_eq($$select count(*)::bigint from public.document_chunks where document_version_id='b3000000-0000-0000-0000-000000000005'$$,array[1::bigint],'Completed chunks are stored');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select results_eq($$select version_id from public.claim_document_extraction('b3000000-0000-0000-0000-000000000006')$$,array['b3000000-0000-0000-0000-000000000006'::uuid],'Service claims second pending version');
select throws_ok($$select public.complete_document_extraction('b3000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000006/b3000000-0000-0000-0000-000000000006.txt','[{"chunk_index":0,"content":"x","token_count":1,"metadata":null}]')$$,'22023','document_extraction_chunk_invalid','Worker rejects malformed chunk metadata');
select lives_ok($$select public.fail_document_extraction('b3000000-0000-0000-0000-000000000006','failed','File kiểm thử không đọc được')$$,'Worker records a safe extraction failure');
reset role;
select results_eq($$select extraction_status::text from public.document_versions where id='b3000000-0000-0000-0000-000000000006'$$,array['failed'::text],'Failed version has explicit status');
select results_eq($$select extraction_attempt_count from public.document_versions where id='b3000000-0000-0000-0000-000000000006'$$,array[1],'Claim increments attempt count');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select results_eq($$select version_id from public.claim_next_document_extraction()$$,array['b3000000-0000-0000-0000-000000000004'::uuid],'Worker queue claims the retried job next');
reset role;

select * from finish();
rollback;
