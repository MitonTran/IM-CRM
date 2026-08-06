-- M5: kho tài liệu private, version bất biến, ACL organization/team/user và nền tảng extraction.

create type public.document_scope_type as enum ('organization', 'team', 'user');
create type public.document_status as enum ('active', 'archived');
create type public.document_extraction_status as enum ('uploading', 'pending', 'processing', 'ready', 'failed', 'unsupported');

create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.document_folders(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  scope_type public.document_scope_type not null,
  team_id uuid references public.teams(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_reason text,
  constraint document_folders_scope_check check (
    (scope_type = 'organization' and team_id is null and user_id is null)
    or (scope_type = 'team' and team_id is not null and user_id is null)
    or (scope_type = 'user' and team_id is null and user_id is not null)
  ),
  constraint document_folders_delete_check check ((deleted_at is null and deleted_reason is null) or (deleted_at is not null and char_length(trim(deleted_reason)) >= 3))
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.document_folders(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 200),
  scope_type public.document_scope_type not null,
  team_id uuid references public.teams(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete restrict,
  current_version_id uuid,
  status public.document_status not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_reason text,
  constraint documents_scope_check check (
    (scope_type = 'organization' and team_id is null and user_id is null)
    or (scope_type = 'team' and team_id is not null and user_id is null)
    or (scope_type = 'user' and team_id is null and user_id is not null)
  ),
  constraint documents_delete_check check ((deleted_at is null and deleted_reason is null) or (deleted_at is not null and char_length(trim(deleted_reason)) >= 3))
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  original_file_name text not null check (char_length(trim(original_file_name)) between 1 and 255),
  storage_path text not null check (storage_path !~ '(^/|\.\.)'),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  extraction_status public.document_extraction_status not null default 'uploading',
  extraction_error text,
  extracted_text_path text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint document_versions_number_unique unique (document_id, version_no),
  constraint document_versions_storage_path_unique unique (storage_path),
  constraint document_versions_extraction_check check (
    (extraction_status = 'failed' and extraction_error is not null)
    or (extraction_status <> 'failed' and extraction_error is null)
  )
);

alter table public.documents add constraint documents_current_version_fk
foreign key (current_version_id) references public.document_versions(id) on delete restrict deferrable initially deferred;

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) > 0),
  token_count integer check (token_count is null or token_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint document_chunks_version_index_unique unique (document_version_id, chunk_index)
);

create index document_folders_parent_idx on public.document_folders(parent_id) where deleted_at is null;
create unique index document_folders_org_name_unique on public.document_folders(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where scope_type = 'organization' and deleted_at is null;
create unique index document_folders_team_name_unique on public.document_folders(team_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where scope_type = 'team' and deleted_at is null;
create unique index document_folders_user_name_unique on public.document_folders(user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where scope_type = 'user' and deleted_at is null;
create index documents_scope_team_idx on public.documents(scope_type, team_id, updated_at desc) where deleted_at is null;
create index documents_scope_user_idx on public.documents(scope_type, user_id, updated_at desc) where deleted_at is null;
create index documents_folder_idx on public.documents(folder_id, updated_at desc) where deleted_at is null;
create index documents_title_search_idx on public.documents using gin(to_tsvector('simple', title));
create index document_versions_document_idx on public.document_versions(document_id, version_no desc);
create index document_versions_extraction_idx on public.document_versions(extraction_status, created_at) where extraction_status in ('pending', 'processing');
create index document_chunks_version_idx on public.document_chunks(document_version_id, chunk_index);

create or replace function public.can_access_document_scope(target_scope public.document_scope_type, target_team_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_active_user() and (
    public.is_admin()
    or target_scope = 'organization'
    or (target_scope = 'team' and target_team_id = public.current_team_id())
    or (target_scope = 'user' and target_user_id = (select auth.uid()))
  );
$$;

create or replace function public.can_manage_document_scope(target_scope public.document_scope_type, target_team_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_active_user() and (
    public.is_admin()
    or (public.is_leader() and target_scope = 'team' and target_team_id = public.current_team_id())
  );
$$;

create or replace function public.can_access_document(target_document_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id and d.deleted_at is null
      and public.can_access_document_scope(d.scope_type, d.team_id, d.user_id)
  );
$$;

create or replace function public.can_manage_document(target_document_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id and d.deleted_at is null
      and public.can_manage_document_scope(d.scope_type, d.team_id, d.user_id)
  );
$$;

create or replace function public.assert_document_upload_file(file_name text, file_mime text, file_size bigint)
returns text language plpgsql immutable set search_path = public, pg_temp
as $$
declare extension text := lower(substring(trim(file_name) from '\.([^.]+)$'));
begin
  if file_size is null or file_size <= 0 or file_size > 26214400 then raise exception using errcode = '22023', message = 'document_file_size_invalid'; end if;
  if trim(coalesce(file_name, '')) = '' or char_length(trim(file_name)) > 255 then raise exception using errcode = '22023', message = 'document_file_name_invalid'; end if;
  if not (
    (file_mime = 'application/pdf' and extension = 'pdf')
    or (file_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and extension = 'docx')
    or (file_mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and extension = 'xlsx')
    or (file_mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' and extension = 'pptx')
    or (file_mime = 'image/png' and extension = 'png')
    or (file_mime = 'image/jpeg' and extension in ('jpg', 'jpeg'))
    or (file_mime = 'image/webp' and extension = 'webp')
  ) then raise exception using errcode = '22023', message = 'document_file_type_invalid'; end if;
  return extension;
end;
$$;

create or replace function public.create_document_folder(
  folder_name text, folder_scope public.document_scope_type, folder_team_id uuid default null,
  folder_user_id uuid default null, parent_folder_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare result_id uuid; parent_row public.document_folders%rowtype;
begin
  if char_length(trim(coalesce(folder_name, ''))) not between 1 and 120 then raise exception using errcode = '22023', message = 'document_folder_name_invalid'; end if;
  if not public.can_manage_document_scope(folder_scope, folder_team_id, folder_user_id) then raise exception using errcode = '42501', message = 'document_manage_denied'; end if;
  if parent_folder_id is not null then
    select * into parent_row from public.document_folders where id = parent_folder_id and deleted_at is null;
    if not found or parent_row.scope_type <> folder_scope or parent_row.team_id is distinct from folder_team_id or parent_row.user_id is distinct from folder_user_id then raise exception using errcode = '22023', message = 'document_parent_scope_invalid'; end if;
  end if;
  insert into public.document_folders(parent_id, name, scope_type, team_id, user_id, created_by, updated_by)
  values (parent_folder_id, trim(folder_name), folder_scope, folder_team_id, folder_user_id, auth.uid(), auth.uid()) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.create_document_upload(
  document_title text, folder_id uuid, document_scope public.document_scope_type,
  document_team_id uuid, document_user_id uuid, original_file_name text, file_mime_type text, file_size_bytes bigint
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_id uuid := auth.uid(); result_document_id uuid := gen_random_uuid(); result_version_id uuid := gen_random_uuid(); extension text; path text; folder_row public.document_folders%rowtype;
begin
  if char_length(trim(coalesce(document_title, ''))) not between 1 and 200 then raise exception using errcode = '22023', message = 'document_title_invalid'; end if;
  if not public.can_manage_document_scope(document_scope, document_team_id, document_user_id) then raise exception using errcode = '42501', message = 'document_manage_denied'; end if;
  extension := public.assert_document_upload_file(original_file_name, file_mime_type, file_size_bytes);
  if folder_id is not null then
    select * into folder_row from public.document_folders where id = folder_id and deleted_at is null;
    if not found or folder_row.scope_type <> document_scope or folder_row.team_id is distinct from document_team_id or folder_row.user_id is distinct from document_user_id then raise exception using errcode = '22023', message = 'document_folder_scope_invalid'; end if;
  end if;
  path := result_document_id::text || '/' || result_version_id::text || '/' || gen_random_uuid()::text || '.' || extension;
  insert into public.documents(id, folder_id, title, scope_type, team_id, user_id, current_version_id, created_by, updated_by)
  values (result_document_id, folder_id, trim(document_title), document_scope, document_team_id, document_user_id, result_version_id, actor_id, actor_id);
  insert into public.document_versions(id, document_id, version_no, original_file_name, storage_path, mime_type, size_bytes, uploaded_by, created_by)
  values (result_version_id, result_document_id, 1, trim(original_file_name), path, file_mime_type, file_size_bytes, actor_id, actor_id);
  return jsonb_build_object('documentId', result_document_id, 'versionId', result_version_id, 'storagePath', path);
end; $$;

create or replace function public.create_document_version_upload(
  target_document_id uuid, original_file_name text, file_mime_type text, file_size_bytes bigint
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_id uuid := auth.uid(); result_version_id uuid := gen_random_uuid(); next_version integer; extension text; path text;
begin
  if not public.can_manage_document(target_document_id) then raise exception using errcode = '42501', message = 'document_manage_denied'; end if;
  extension := public.assert_document_upload_file(original_file_name, file_mime_type, file_size_bytes);
  select coalesce(max(version_no), 0) + 1 into next_version from public.document_versions where document_id = target_document_id;
  path := target_document_id::text || '/' || result_version_id::text || '/' || gen_random_uuid()::text || '.' || extension;
  insert into public.document_versions(id, document_id, version_no, original_file_name, storage_path, mime_type, size_bytes, uploaded_by, created_by)
  values (result_version_id, target_document_id, next_version, trim(original_file_name), path, file_mime_type, file_size_bytes, actor_id, actor_id);
  return jsonb_build_object('documentId', target_document_id, 'versionId', result_version_id, 'storagePath', path);
end; $$;

create or replace function public.finalize_document_upload(target_version_id uuid, checksum text)
returns void language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare version_row public.document_versions%rowtype; object_row storage.objects%rowtype; actual_size bigint; actual_mime text;
begin
  select * into version_row from public.document_versions where id = target_version_id;
  if not found or version_row.extraction_status <> 'uploading' or version_row.uploaded_by <> auth.uid() or not public.can_manage_document(version_row.document_id) then raise exception using errcode = '42501', message = 'document_finalize_denied'; end if;
  if checksum is null or checksum !~ '^[a-f0-9]{64}$' then raise exception using errcode = '22023', message = 'document_checksum_invalid'; end if;
  select * into object_row from storage.objects where bucket_id = 'documents' and name = version_row.storage_path;
  if not found then raise exception using errcode = '22023', message = 'document_object_missing'; end if;
  actual_size := coalesce((object_row.metadata ->> 'size')::bigint, version_row.size_bytes);
  actual_mime := coalesce(object_row.metadata ->> 'mimetype', version_row.mime_type);
  if actual_size <> version_row.size_bytes or actual_mime <> version_row.mime_type then raise exception using errcode = '22023', message = 'document_object_mismatch'; end if;
  update public.document_versions set checksum_sha256 = checksum, extraction_status = 'pending' where id = target_version_id;
  update public.documents set current_version_id = target_version_id where id = version_row.document_id;
end; $$;

create or replace function public.update_document_access(
  target_document_id uuid, new_scope public.document_scope_type, new_team_id uuid, new_user_id uuid, new_folder_id uuid default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare folder_row public.document_folders%rowtype;
begin
  if not public.can_manage_document(target_document_id) or not public.can_manage_document_scope(new_scope, new_team_id, new_user_id) then raise exception using errcode = '42501', message = 'document_access_change_denied'; end if;
  if new_folder_id is not null then
    select * into folder_row from public.document_folders where id = new_folder_id and deleted_at is null;
    if not found or folder_row.scope_type <> new_scope or folder_row.team_id is distinct from new_team_id or folder_row.user_id is distinct from new_user_id then raise exception using errcode = '22023', message = 'document_folder_scope_invalid'; end if;
  end if;
  update public.documents set scope_type = new_scope, team_id = new_team_id, user_id = new_user_id, folder_id = new_folder_id where id = target_document_id;
end; $$;

create or replace function public.soft_delete_document(target_document_id uuid, reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_manage_document(target_document_id) then raise exception using errcode = '42501', message = 'document_delete_denied'; end if;
  if char_length(trim(coalesce(reason, ''))) < 3 then raise exception using errcode = '22023', message = 'document_delete_reason_invalid'; end if;
  update public.documents set deleted_at = now(), deleted_by = auth.uid(), deleted_reason = trim(reason) where id = target_document_id and deleted_at is null;
end; $$;

create or replace function public.record_document_download(target_version_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare document_id uuid;
begin
  select v.document_id into document_id from public.document_versions v where v.id = target_version_id;
  if document_id is null or not public.can_access_document(document_id) then raise exception using errcode = '42501', message = 'document_download_denied'; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'download', 'document_versions', target_version_id, jsonb_build_object('document_id', document_id));
end; $$;

create trigger document_folders_set_audit_fields before update on public.document_folders for each row execute function public.set_audit_fields();
create trigger documents_set_audit_fields before update on public.documents for each row execute function public.set_audit_fields();
create trigger document_folders_audit after insert or update on public.document_folders for each row execute function public.write_audit_log();
create trigger documents_audit after insert or update on public.documents for each row execute function public.write_audit_log();
create trigger document_versions_audit after insert or update on public.document_versions for each row execute function public.write_audit_log();

alter table public.document_folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_chunks enable row level security;

create policy document_folders_select_scope on public.document_folders for select to authenticated using (deleted_at is null and public.can_access_document_scope(scope_type, team_id, user_id));
create policy documents_select_scope on public.documents for select to authenticated using (deleted_at is null and public.can_access_document_scope(scope_type, team_id, user_id));
create policy document_versions_select_scope on public.document_versions for select to authenticated using (public.can_access_document(document_id));
create policy document_chunks_select_scope on public.document_chunks for select to authenticated using (
  exists (select 1 from public.document_versions v where v.id = document_version_id and v.extraction_status = 'ready' and public.can_access_document(v.document_id))
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp'
]) on conflict (id) do nothing;

create policy document_objects_select_scope on storage.objects for select to authenticated using (
  bucket_id = 'documents' and exists (
    select 1 from public.document_versions v where v.storage_path = name and public.can_access_document(v.document_id)
  )
);
create policy document_objects_insert_prepared on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and exists (
    select 1 from public.document_versions v
    where v.storage_path = name and v.extraction_status = 'uploading' and v.uploaded_by = auth.uid() and public.can_manage_document(v.document_id)
  )
);

revoke all on public.document_folders, public.documents, public.document_versions, public.document_chunks from anon, authenticated;
grant select on public.document_folders, public.documents, public.document_versions, public.document_chunks to authenticated;

revoke all on function public.can_access_document_scope(public.document_scope_type, uuid, uuid) from public;
revoke all on function public.can_manage_document_scope(public.document_scope_type, uuid, uuid) from public;
revoke all on function public.can_access_document(uuid) from public;
revoke all on function public.can_manage_document(uuid) from public;
revoke all on function public.assert_document_upload_file(text, text, bigint) from public;
revoke all on function public.create_document_folder(text, public.document_scope_type, uuid, uuid, uuid) from public;
revoke all on function public.create_document_upload(text, uuid, public.document_scope_type, uuid, uuid, text, text, bigint) from public;
revoke all on function public.create_document_version_upload(uuid, text, text, bigint) from public;
revoke all on function public.finalize_document_upload(uuid, text) from public;
revoke all on function public.update_document_access(uuid, public.document_scope_type, uuid, uuid, uuid) from public;
revoke all on function public.soft_delete_document(uuid, text) from public;
revoke all on function public.record_document_download(uuid) from public;

grant execute on function public.can_access_document_scope(public.document_scope_type, uuid, uuid), public.can_manage_document_scope(public.document_scope_type, uuid, uuid), public.can_access_document(uuid), public.can_manage_document(uuid) to authenticated;
grant execute on function public.create_document_folder(text, public.document_scope_type, uuid, uuid, uuid), public.create_document_upload(text, uuid, public.document_scope_type, uuid, uuid, text, text, bigint), public.create_document_version_upload(uuid, text, text, bigint), public.finalize_document_upload(uuid, text), public.update_document_access(uuid, public.document_scope_type, uuid, uuid, uuid), public.soft_delete_document(uuid, text), public.record_document_download(uuid) to authenticated;

comment on table public.document_versions is 'File gốc bất biến; object private, version mới không ghi đè version cũ.';
comment on table public.document_chunks is 'Text chunks chỉ đọc khi version ready và document vẫn còn quyền; embedding được thêm ở M6 theo model đã chọn.';
