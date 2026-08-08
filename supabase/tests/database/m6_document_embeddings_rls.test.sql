begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_extension('vector', 'pgvector extension exists');
select has_column('public', 'document_chunks', 'embedding', 'Document chunks have an embedding');
select has_column('public', 'document_chunks', 'embedding_model', 'Document chunks record the embedding model');
select has_column('public', 'document_chunks', 'embedded_at', 'Document chunks record embedding time');
select has_column('public', 'document_versions', 'embedding_status', 'Document versions expose embedding queue status');
select has_column('public', 'document_versions', 'embedding_attempt_count', 'Document versions bound embedding attempts');
select has_function('public', 'claim_next_document_embedding', array[]::text[], 'Embedding queue claim RPC exists');
select has_function('public', 'store_document_embedding_batch', array['uuid','text','jsonb'], 'Embedding batch RPC exists');
select has_function('public', 'fail_document_embedding', array['uuid','text'], 'Embedding failure RPC exists');
select has_function('public', 'retry_document_embedding', array['uuid'], 'Embedding retry RPC exists');
select has_function('public', 'search_documents_hybrid', 'Hybrid retrieval RPC exists');
select policies_are('public', 'document_chunks', array['document_chunks_select_scope'], 'Existing chunk RLS remains the only read policy');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data) values
('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','embedding-admin@test.invalid','{"full_name":"Embedding Admin"}'),
('e0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','embedding-leader-a@test.invalid','{"full_name":"Embedding Leader A"}'),
('e0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','embedding-leader-b@test.invalid','{"full_name":"Embedding Leader B"}'),
('e0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','embedding-sale-a@test.invalid','{"full_name":"Embedding Sale A"}'),
('e0000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','embedding-sale-b@test.invalid','{"full_name":"Embedding Sale B"}');
insert into public.teams(id,name) values
('e1000000-0000-4000-8000-000000000001','Embedding Team A'),
('e1000000-0000-4000-8000-000000000002','Embedding Team B');
update public.profiles set role='admin',is_active=true where id='e0000000-0000-4000-8000-000000000001';
update public.profiles set role='leader',team_id='e1000000-0000-4000-8000-000000000001',is_active=true where id='e0000000-0000-4000-8000-000000000002';
update public.profiles set role='leader',team_id='e1000000-0000-4000-8000-000000000002',is_active=true where id='e0000000-0000-4000-8000-000000000003';
update public.profiles set role='sale',team_id='e1000000-0000-4000-8000-000000000001',is_active=true where id='e0000000-0000-4000-8000-000000000004';
update public.profiles set role='sale',team_id='e1000000-0000-4000-8000-000000000002',is_active=true where id='e0000000-0000-4000-8000-000000000005';

insert into public.documents(id,title,scope_type,team_id,user_id,created_by,updated_by) values
('e2000000-0000-4000-8000-000000000001','Quy trình toàn hệ thống','organization',null,null,'e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e2000000-0000-4000-8000-000000000002','Quy trình Team A','team','e1000000-0000-4000-8000-000000000001',null,'e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e2000000-0000-4000-8000-000000000003','Quy trình Team B','team','e1000000-0000-4000-8000-000000000002',null,'e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e2000000-0000-4000-8000-000000000004','Ghi chú riêng Sale A','user',null,'e0000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e2000000-0000-4000-8000-000000000005','Tài liệu chờ embedding','organization',null,null,'e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001');
insert into public.document_versions(id,document_id,version_no,original_file_name,storage_path,mime_type,size_bytes,checksum_sha256,extraction_status,embedding_status,uploaded_by,created_by) values
('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',1,'org.pdf','embedding/org.pdf','application/pdf',10,repeat('a',64),'ready','ready','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002',1,'a.pdf','embedding/a.pdf','application/pdf',10,repeat('b',64),'ready','ready','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003',1,'b.pdf','embedding/b.pdf','application/pdf',10,repeat('c',64),'ready','ready','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e3000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000004',1,'personal.pdf','embedding/personal.pdf','application/pdf',10,repeat('d',64),'ready','ready','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001'),
('e3000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000005',1,'pending.pdf','embedding/pending.pdf','application/pdf',10,repeat('e',64),'ready','pending','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001');
update public.documents d set current_version_id=v.id from public.document_versions v where v.document_id=d.id;

insert into public.document_chunks(id,document_version_id,chunk_index,content,token_count,metadata,embedding,embedding_model,embedded_at) values
('e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',0,'alpha nội dung tổ chức',5,'{"page":1}',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),'text-embedding-3-small',now()),
('e4000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002',0,'alpha nội dung Team A',5,'{"page":2}',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),'text-embedding-3-small',now()),
('e4000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000003',0,'alpha nội dung Team B',5,'{"page":3}',(array[0::real,1::real] || array_fill(0::real,array[1534]))::extensions.vector(1536),'text-embedding-3-small',now()),
('e4000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000004',0,'alpha nội dung cá nhân',5,'{"page":4}',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),'text-embedding-3-small',now()),
('e4000000-0000-4000-8000-000000000005','e3000000-0000-4000-8000-000000000005',0,'chunk pending thứ nhất',5,'{"page":5}',null,null,null),
('e4000000-0000-4000-8000-000000000006','e3000000-0000-4000-8000-000000000005',1,'chunk pending thứ hai',5,'{"page":6}',null,null,null);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.claim_next_document_embedding()$$,'42501','permission denied for function claim_next_document_embedding','Sale cannot claim embedding work');
select throws_ok($$select public.store_document_embedding_batch('e3000000-0000-4000-8000-000000000005','text-embedding-3-small','[]')$$,'42501','permission denied for function store_document_embedding_batch','Sale cannot store embedding vectors');
select throws_ok($$select public.fail_document_embedding('e3000000-0000-4000-8000-000000000005','Lỗi giả')$$,'42501','permission denied for function fail_document_embedding','Sale cannot change embedding status');
select results_eq($$select count(*)::bigint from public.search_documents_hybrid('khái niệm không có từ khóa',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),10)$$,array[3::bigint],'Sale A hybrid retrieval sees organization, Team A and personal only');
select results_eq($$select count(*)::bigint from public.search_documents_hybrid('khái niệm không có từ khóa',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),10) where document_id='e2000000-0000-4000-8000-000000000003'$$,array[0::bigint],'Sale A hybrid retrieval never returns Team B');

select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents_hybrid('khái niệm không có từ khóa',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),10)$$,array[2::bigint],'Sale B hybrid retrieval sees organization and Team B only');
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents_hybrid('khái niệm không có từ khóa',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),10)$$,array[2::bigint],'Leader A hybrid retrieval sees organization and Team A only');
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents_hybrid('khái niệm không có từ khóa',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),10)$$,array[2::bigint],'Leader B hybrid retrieval sees organization and Team B only');
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.search_documents_hybrid('khái niệm không có từ khóa',(array[1::real] || array_fill(0::real,array[1535]))::extensions.vector(1536),10)$$,array[4::bigint],'Admin hybrid retrieval sees all embedded scopes');
select results_eq($$select count(*)::bigint from public.search_documents('alpha',10)$$,array[4::bigint],'Existing lexical retrieval remains available');

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select results_eq($$select version_id from public.claim_next_document_embedding()$$,array['e3000000-0000-4000-8000-000000000005'::uuid],'Service worker claims the pending version');
select results_eq($$select public.store_document_embedding_batch(
  'e3000000-0000-4000-8000-000000000005','text-embedding-3-small',
  jsonb_build_array(jsonb_build_object('chunk_id','e4000000-0000-4000-8000-000000000005','embedding',to_jsonb(array[1::real] || array_fill(0::real,array[1535]))))
)$$,array[1],'First embedding batch leaves one chunk pending');
reset role;
select results_eq($$select embedding_status from public.document_versions where id='e3000000-0000-4000-8000-000000000005'$$,array['pending'::text],'Partially embedded version returns to pending');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select results_eq($$select version_id from public.claim_next_document_embedding()$$,array['e3000000-0000-4000-8000-000000000005'::uuid],'Worker resumes the same version');
select throws_ok($$select public.store_document_embedding_batch(
  'e3000000-0000-4000-8000-000000000005','text-embedding-3-small',
  '[{"chunk_id":"e4000000-0000-4000-8000-000000000006","embedding":[1,0]}]'
)$$,'22023','document_embedding_vector_invalid','Worker rejects the wrong vector dimension');
select results_eq($$select public.store_document_embedding_batch(
  'e3000000-0000-4000-8000-000000000005','text-embedding-3-small',
  jsonb_build_array(jsonb_build_object('chunk_id','e4000000-0000-4000-8000-000000000006','embedding',to_jsonb(array[0::real,1::real] || array_fill(0::real,array[1534]))))
)$$,array[0],'Final embedding batch completes the version');
reset role;
select results_eq($$select embedding_status from public.document_versions where id='e3000000-0000-4000-8000-000000000005'$$,array['ready'::text],'Fully embedded version becomes ready');
select results_eq($$select count(*)::bigint from public.document_chunks where document_version_id='e3000000-0000-4000-8000-000000000005' and embedding_model='text-embedding-3-small'$$,array[2::bigint],'Every pending chunk records the fixed model');

update public.document_chunks set embedding=null,embedding_model=null,embedded_at=null where id='e4000000-0000-4000-8000-000000000002';
update public.document_versions set embedding_status='failed',embedding_error='Lỗi embedding giả' where id='e3000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.retry_document_embedding('e3000000-0000-4000-8000-000000000002')$$,'42501','document_embedding_retry_denied','Leader B cannot retry Team A embedding');
select set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.retry_document_embedding('e3000000-0000-4000-8000-000000000002')$$,'Leader A retries Team A embedding');
reset role;
select results_eq($$select embedding_status from public.document_versions where id='e3000000-0000-4000-8000-000000000002'$$,array['pending'::text],'Retry returns failed embedding to pending');

select * from finish();
rollback;
