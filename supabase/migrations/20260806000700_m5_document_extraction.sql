-- M5.3: trạng thái worker extraction, full-text search theo ACL và bucket text tách khỏi file gốc.

alter table public.document_versions
  add column extraction_started_at timestamptz,
  add column extraction_completed_at timestamptz,
  add column extraction_attempt_count integer not null default 0 check (extraction_attempt_count between 0 and 10);

create index document_chunks_content_search_idx on public.document_chunks using gin(to_tsvector('simple', content));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('document-extracted', 'document-extracted', false, 10485760, array['text/plain'])
on conflict (id) do nothing;

create or replace function public.search_document_ids(search_text text)
returns table(document_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with query as (
    select websearch_to_tsquery('simple', left(trim(search_text), 100)) as value
  )
  select d.id
  from public.documents d
  left join public.document_versions v on v.document_id = d.id and v.id = d.current_version_id and v.extraction_status = 'ready'
  left join public.document_chunks c on c.document_version_id = v.id
  cross join query q
  where char_length(trim(search_text)) > 0
    and (position(lower(trim(search_text)) in lower(d.title)) > 0 or to_tsvector('simple', d.title) @@ q.value or to_tsvector('simple', coalesce(c.content, '')) @@ q.value)
  group by d.id
  order by max(greatest(
    ts_rank(to_tsvector('simple', d.title), q.value),
    ts_rank(to_tsvector('simple', coalesce(c.content, '')), q.value)
  )) desc, d.updated_at desc
  limit 100;
$$;

create or replace function public.retry_document_extraction(target_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_document_id uuid;
begin
  select document_id into target_document_id from public.document_versions where id = target_version_id;
  if target_document_id is null or not public.can_manage_document(target_document_id) then
    raise exception using errcode = '42501', message = 'document_retry_denied';
  end if;
  update public.document_versions
  set extraction_status = 'pending', extraction_error = null, extraction_started_at = null, extraction_completed_at = null
  where id = target_version_id and extraction_status = 'failed' and extraction_attempt_count < 10;
  if not found then raise exception using errcode = '22023', message = 'document_retry_invalid_state'; end if;
end;
$$;

create or replace function public.claim_next_document_extraction()
returns table(version_id uuid, document_id uuid, storage_path text, mime_type text, size_bytes bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare candidate public.document_versions%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_worker_denied'; end if;
  select v.* into candidate
  from public.document_versions v join public.documents d on d.id = v.document_id
  where v.extraction_status = 'pending' and v.extraction_attempt_count < 10 and d.deleted_at is null
  order by v.created_at
  for update of v skip locked
  limit 1;
  if not found then return; end if;
  update public.document_versions v set extraction_status = 'processing', extraction_started_at = now(), extraction_completed_at = null, extraction_attempt_count = v.extraction_attempt_count + 1 where v.id = candidate.id;
  return query select candidate.id, candidate.document_id, candidate.storage_path, candidate.mime_type, candidate.size_bytes;
end;
$$;

create or replace function public.claim_document_extraction(target_version_id uuid)
returns table(version_id uuid, document_id uuid, storage_path text, mime_type text, size_bytes bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare candidate public.document_versions%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_worker_denied'; end if;
  select v.* into candidate from public.document_versions v join public.documents d on d.id = v.document_id
  where v.id = target_version_id and v.extraction_status = 'pending' and v.extraction_attempt_count < 10 and d.deleted_at is null
  for update of v skip locked;
  if not found then return; end if;
  update public.document_versions v set extraction_status = 'processing', extraction_started_at = now(), extraction_completed_at = null, extraction_attempt_count = v.extraction_attempt_count + 1 where v.id = candidate.id;
  return query select candidate.id, candidate.document_id, candidate.storage_path, candidate.mime_type, candidate.size_bytes;
end;
$$;

create or replace function public.complete_document_extraction(target_version_id uuid, text_storage_path text, chunks jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare chunk_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_worker_denied'; end if;
  if jsonb_typeof(chunks) <> 'array' or text_storage_path is null or text_storage_path !~ '^[a-f0-9-]+/[a-f0-9-]+\.txt$' then raise exception using errcode = '22023', message = 'document_extraction_payload_invalid'; end if;
  chunk_count := jsonb_array_length(chunks);
  if chunk_count < 1 or chunk_count > 1500 then raise exception using errcode = '22023', message = 'document_extraction_chunks_invalid'; end if;
  if not exists (select 1 from public.document_versions where id = target_version_id and extraction_status = 'processing') then raise exception using errcode = '22023', message = 'document_extraction_state_invalid'; end if;
  if exists (
    select 1 from jsonb_to_recordset(chunks) as item(chunk_index integer, content text, token_count integer, metadata jsonb)
    where item.chunk_index is null or item.chunk_index < 0 or item.content is null or char_length(item.content) not between 1 and 3000
      or item.token_count is null or item.token_count < 0 or coalesce(jsonb_typeof(item.metadata), 'null') <> 'object'
  ) then raise exception using errcode = '22023', message = 'document_extraction_chunk_invalid'; end if;
  delete from public.document_chunks where document_version_id = target_version_id;
  insert into public.document_chunks(document_version_id, chunk_index, content, token_count, metadata)
  select target_version_id, item.chunk_index, item.content, item.token_count, item.metadata
  from jsonb_to_recordset(chunks) as item(chunk_index integer, content text, token_count integer, metadata jsonb);
  update public.document_versions set extraction_status = 'ready', extraction_error = null, extracted_text_path = text_storage_path, extraction_completed_at = now() where id = target_version_id;
end;
$$;

create or replace function public.fail_document_extraction(target_version_id uuid, final_status public.document_extraction_status, safe_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_worker_denied'; end if;
  if final_status not in ('failed', 'unsupported') or (final_status = 'failed' and char_length(trim(coalesce(safe_error, ''))) not between 3 and 300) then raise exception using errcode = '22023', message = 'document_extraction_failure_invalid'; end if;
  update public.document_versions set extraction_status = final_status, extraction_error = case when final_status = 'failed' then trim(safe_error) else null end, extraction_completed_at = now()
  where id = target_version_id and extraction_status = 'processing';
  if not found then raise exception using errcode = '22023', message = 'document_extraction_state_invalid'; end if;
end;
$$;

revoke all on function public.search_document_ids(text) from public;
revoke all on function public.retry_document_extraction(uuid) from public;
revoke all on function public.claim_next_document_extraction() from public;
revoke all on function public.claim_document_extraction(uuid) from public;
revoke all on function public.complete_document_extraction(uuid, text, jsonb) from public;
revoke all on function public.fail_document_extraction(uuid, public.document_extraction_status, text) from public;
grant execute on function public.search_document_ids(text), public.retry_document_extraction(uuid) to authenticated;
grant execute on function public.claim_next_document_extraction(), public.claim_document_extraction(uuid), public.complete_document_extraction(uuid, text, jsonb), public.fail_document_extraction(uuid, public.document_extraction_status, text) to service_role;

comment on function public.search_document_ids is 'Tìm title/chunk bằng security invoker; RLS document và chunk luôn áp dụng trước ranking.';
comment on column public.document_versions.extraction_attempt_count is 'Worker tăng atomically khi claim; tối đa 10 lần để tránh vòng lặp lỗi vô hạn.';
