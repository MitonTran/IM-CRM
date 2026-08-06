begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

select has_table('public', 'document_folders', 'Document folders table exists');
select has_table('public', 'documents', 'Documents table exists');
select has_table('public', 'document_versions', 'Document versions table exists');
select has_table('public', 'document_chunks', 'Document chunks table exists');
select ok((select not public and file_size_limit = 26214400 from storage.buckets where id = 'documents'), 'Documents bucket is private and limited to 25 MB');
select has_function('public', 'create_document_upload', array['text','uuid','document_scope_type','uuid','uuid','text','text','bigint'], 'Prepare upload RPC exists');
select has_function('public', 'finalize_document_upload', array['uuid','text'], 'Finalize upload RPC exists');

insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-admin@test.invalid', '{"full_name":"Doc Admin"}'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-leader-a@test.invalid', '{"full_name":"Doc Leader A"}'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-leader-b@test.invalid', '{"full_name":"Doc Leader B"}'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-sale-a@test.invalid', '{"full_name":"Doc Sale A"}'),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doc-sale-b@test.invalid', '{"full_name":"Doc Sale B"}');
insert into public.teams(id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'Doc Team A'),
  ('a1000000-0000-0000-0000-000000000002', 'Doc Team B');
update public.profiles set role = 'admin', is_active = true where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'leader', team_id = 'a1000000-0000-0000-0000-000000000001', is_active = true where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set role = 'leader', team_id = 'a1000000-0000-0000-0000-000000000002', is_active = true where id = 'a0000000-0000-0000-0000-000000000003';
update public.profiles set role = 'sale', team_id = 'a1000000-0000-0000-0000-000000000001', is_active = true where id = 'a0000000-0000-0000-0000-000000000004';
update public.profiles set role = 'sale', team_id = 'a1000000-0000-0000-0000-000000000002', is_active = true where id = 'a0000000-0000-0000-0000-000000000005';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_document_folder('Chung', 'organization')$$, 'Admin creates organization folder');
select lives_ok($$select public.create_document_upload('Quy trình chung', null, 'organization', null, null, 'quy-trinh.pdf', 'application/pdf', 1024)$$, 'Admin prepares organization document');
select lives_ok($$select public.create_document_upload('Tài liệu riêng A', null, 'user', null, 'a0000000-0000-0000-0000-000000000004', 'rieng-a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2048)$$, 'Admin prepares user document');
select lives_ok($$select public.create_document_upload('Team B handbook', null, 'team', 'a1000000-0000-0000-0000-000000000002', null, 'team-b.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 4096)$$, 'Admin prepares Team B document');
select results_eq('select count(*)::bigint from public.documents', array[3::bigint], 'Admin sees all prepared documents');
select throws_ok($$select public.create_document_upload('Sai MIME', null, 'organization', null, null, 'malware.pdf', 'application/javascript', 10)$$, '22023', 'document_file_type_invalid', 'MIME and extension allowlist is enforced');
select throws_ok($$select public.create_document_upload('Quá lớn', null, 'organization', null, null, 'large.pdf', 'application/pdf', 26214401)$$, '22023', 'document_file_size_invalid', '25 MB limit is enforced');
select lives_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata)
  select 'documents', v.storage_path, 'a0000000-0000-0000-0000-000000000001', jsonb_build_object('size', v.size_bytes, 'mimetype', v.mime_type)
  from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team B handbook'$$, 'Admin uploads prepared Team B object');
select lives_ok($$select public.finalize_document_upload((select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team B handbook'), repeat('b', 64))$$, 'Admin finalizes Team B object');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.create_document_folder('Team A', 'team', 'a1000000-0000-0000-0000-000000000001')$$, 'Leader A creates own team folder');
select lives_ok($$select public.create_document_upload('Team A playbook', null, 'team', 'a1000000-0000-0000-0000-000000000001', null, 'playbook.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 3072)$$, 'Leader A prepares own team document');
select lives_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata)
  select 'documents', v.storage_path, 'a0000000-0000-0000-0000-000000000002', jsonb_build_object('size', v.size_bytes, 'mimetype', v.mime_type)
  from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team A playbook'$$, 'Leader A uploads prepared object');
select lives_ok($$select public.finalize_document_upload((select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team A playbook'), repeat('a', 64))$$, 'Leader A finalizes own team object');
select results_eq($$select extraction_status::text from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team A playbook'$$, array['pending'::text], 'Finalized upload is pending extraction');
select throws_ok($$select public.create_document_upload('Không được', null, 'organization', null, null, 'x.pdf', 'application/pdf', 10)$$, '42501', 'document_manage_denied', 'Leader cannot manage organization documents');
select throws_ok($$select public.create_document_upload('Không được', null, 'team', 'a1000000-0000-0000-0000-000000000002', null, 'x.pdf', 'application/pdf', 10)$$, '42501', 'document_manage_denied', 'Leader cannot manage another team');
select throws_ok($$select public.create_document_upload('Không được', null, 'user', null, 'a0000000-0000-0000-0000-000000000004', 'x.pdf', 'application/pdf', 10)$$, '42501', 'document_manage_denied', 'Leader cannot manage user-scoped documents');
select results_eq('select count(*)::bigint from public.documents', array[2::bigint], 'Leader A sees organization and Team A only');

reset role;
update public.document_versions set extraction_status = 'ready' where extraction_status = 'pending';
insert into public.document_chunks(document_version_id, chunk_index, content, metadata)
select v.id, 0, d.title || ' extracted text', '{"page":1}' from public.document_versions v join public.documents d on d.id = v.document_id where d.title in ('Team A playbook', 'Team B handbook');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.documents', array[3::bigint], 'Sale A sees organization, own team and own user document');
select results_eq('select count(*)::bigint from storage.objects', array[1::bigint], 'Sale A sees only Team A object despite knowing paths');
select results_eq('select count(*)::bigint from public.document_chunks', array[1::bigint], 'Sale A search chunks exclude Team B');
select throws_ok($$select public.create_document_upload('Sale upload', null, 'team', 'a1000000-0000-0000-0000-000000000001', null, 'x.pdf', 'application/pdf', 10)$$, '42501', 'document_manage_denied', 'Sale cannot prepare uploads');
select throws_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata) values ('documents', 'known/fake/path.pdf', 'a0000000-0000-0000-0000-000000000004', '{"size":10,"mimetype":"application/pdf"}')$$, '42501', 'new row violates row-level security policy for table "objects"', 'Sale cannot bypass prepared Storage path');
select lives_ok($$select public.record_document_download((select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team A playbook'))$$, 'Sale can audit an allowed download');
select throws_ok($$select public.record_document_download((select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team B handbook'))$$, '42501', 'document_download_denied', 'Sale cannot download another team version by UUID');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.documents', array[2::bigint], 'Sale B sees organization and Team B only');
select results_eq('select count(*)::bigint from storage.objects', array[1::bigint], 'Sale B sees Team B object only');
select results_eq('select count(*)::bigint from public.document_chunks', array[1::bigint], 'Sale B chunks exclude Team A');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.documents', array[2::bigint], 'Leader B sees organization and Team B only');
select throws_ok($$select public.soft_delete_document((select id from public.documents where title = 'Team A playbook'), 'Không thuộc team')$$, '42501', 'document_delete_denied', 'Leader B cannot delete Team A document by UUID');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.documents', array[4::bigint], 'Admin sees every document');
select ok((select count(*) >= 4 from public.audit_logs where entity_type in ('documents', 'document_versions')), 'Uploads and versions are audited');
select ok((select count(*) = 1 from public.audit_logs where action = 'download' and entity_type = 'document_versions'), 'Download is audited without file content');
select lives_ok($$select public.create_document_version_upload((select id from public.documents where title = 'Team B handbook'), 'team-b-v2.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 5000)$$, 'Admin prepares an immutable second version');
select results_eq($$select v.version_no from public.documents d join public.document_versions v on v.id = d.current_version_id where d.title = 'Team B handbook'$$, array[1], 'Failed or unfinished upload does not replace current version');
select lives_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata)
  select 'documents', v.storage_path, 'a0000000-0000-0000-0000-000000000001', jsonb_build_object('size', v.size_bytes, 'mimetype', v.mime_type)
  from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team B handbook' and v.version_no = 2$$, 'Admin uploads second version object');
select lives_ok($$select public.finalize_document_upload((select v.id from public.document_versions v join public.documents d on d.id = v.document_id where d.title = 'Team B handbook' and v.version_no = 2), repeat('c', 64))$$, 'Admin finalizes second version');
select results_eq($$select v.version_no from public.documents d join public.document_versions v on v.id = d.current_version_id where d.title = 'Team B handbook'$$, array[2], 'Verified upload becomes current version');
select lives_ok($$select public.soft_delete_document((select id from public.documents where title = 'Tài liệu riêng A'), 'Thu hồi tài liệu')$$, 'Admin soft deletes a document');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq('select count(*)::bigint from public.documents', array[2::bigint], 'Soft-deleted document disappears immediately from Sale A');

select * from finish();
rollback;
