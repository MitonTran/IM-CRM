-- M6.3: OpenAI embeddings + hybrid document retrieval, always constrained by existing document RLS.

create extension if not exists vector with schema extensions;

alter table public.document_chunks
  add column embedding extensions.vector(1536),
  add column embedding_model text,
  add column embedded_at timestamptz,
  add constraint document_chunks_embedding_state_check check (
    (embedding is null and embedding_model is null and embedded_at is null)
    or (embedding is not null and embedding_model = 'text-embedding-3-small' and embedded_at is not null)
  );

alter table public.document_versions
  add column embedding_status text not null default 'not_applicable'
    check (embedding_status in ('not_applicable', 'pending', 'processing', 'ready', 'failed')),
  add column embedding_error text check (embedding_error is null or char_length(trim(embedding_error)) between 3 and 300),
  add column embedding_started_at timestamptz,
  add column embedding_completed_at timestamptz,
  add column embedding_attempt_count integer not null default 0 check (embedding_attempt_count between 0 and 50),
  add constraint document_versions_embedding_state_check check (
    (embedding_status = 'failed' and embedding_error is not null)
    or (embedding_status <> 'failed' and embedding_error is null)
  );

create index document_chunks_embedding_hnsw_idx
on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops)
where embedding is not null;

create index document_versions_embedding_queue_idx
on public.document_versions(embedding_status, embedding_started_at, created_at)
where embedding_status in ('pending', 'processing');

update public.document_versions v
set embedding_status = 'pending'
where v.extraction_status = 'ready'
  and exists (select 1 from public.document_chunks c where c.document_version_id = v.id);

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
  set extraction_status = 'pending', extraction_error = null, extraction_started_at = null, extraction_completed_at = null,
      embedding_status = 'not_applicable', embedding_error = null, embedding_started_at = null,
      embedding_completed_at = null, embedding_attempt_count = 0
  where id = target_version_id and extraction_status = 'failed' and extraction_attempt_count < 10;
  if not found then raise exception using errcode = '22023', message = 'document_retry_invalid_state'; end if;
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
  update public.document_versions set
    extraction_status = 'ready', extraction_error = null, extracted_text_path = text_storage_path, extraction_completed_at = now(),
    embedding_status = 'pending', embedding_error = null, embedding_started_at = null,
    embedding_completed_at = null, embedding_attempt_count = 0
  where id = target_version_id;
end;
$$;

create or replace function public.claim_next_document_embedding()
returns table(version_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare candidate public.document_versions%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_embedding_worker_denied'; end if;
  select v.* into candidate
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  where v.extraction_status = 'ready'
    and v.embedding_status in ('pending', 'processing')
    and (v.embedding_status = 'pending' or v.embedding_started_at < now() - interval '10 minutes')
    and v.embedding_attempt_count < 50
    and d.deleted_at is null
    and exists (select 1 from public.document_chunks c where c.document_version_id = v.id and c.embedding is null)
  order by v.created_at
  for update of v skip locked
  limit 1;
  if not found then return; end if;
  update public.document_versions v set
    embedding_status = 'processing', embedding_error = null, embedding_started_at = now(),
    embedding_completed_at = null, embedding_attempt_count = v.embedding_attempt_count + 1
  where v.id = candidate.id;
  return query select candidate.id;
end;
$$;

create or replace function public.store_document_embedding_batch(
  target_version_id uuid,
  model_name text,
  embeddings jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare payload_count integer;
declare updated_count integer;
declare remaining_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_embedding_worker_denied'; end if;
  if model_name <> 'text-embedding-3-small' or jsonb_typeof(embeddings) <> 'array' then
    raise exception using errcode = '22023', message = 'document_embedding_payload_invalid';
  end if;
  payload_count := jsonb_array_length(embeddings);
  if payload_count not between 1 and 64 then raise exception using errcode = '22023', message = 'document_embedding_batch_invalid'; end if;
  if not exists (
    select 1 from public.document_versions v
    where v.id = target_version_id and v.extraction_status = 'ready' and v.embedding_status = 'processing'
  ) then raise exception using errcode = '22023', message = 'document_embedding_state_invalid'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(embeddings) as item(chunk_id uuid, embedding jsonb)
    where item.chunk_id is null or jsonb_typeof(item.embedding) <> 'array'
  ) or (
    select count(distinct item.chunk_id)
    from jsonb_to_recordset(embeddings) as item(chunk_id uuid, embedding jsonb)
  ) <> payload_count then raise exception using errcode = '22023', message = 'document_embedding_batch_invalid'; end if;

  begin
    if exists (
      select 1
      from jsonb_to_recordset(embeddings) as item(chunk_id uuid, embedding jsonb)
      where vector_dims((item.embedding::text)::extensions.vector) <> 1536
    ) then raise exception using errcode = '22023', message = 'document_embedding_vector_invalid'; end if;

    update public.document_chunks c set
      embedding = (item.embedding::text)::extensions.vector(1536),
      embedding_model = model_name,
      embedded_at = now()
    from jsonb_to_recordset(embeddings) as item(chunk_id uuid, embedding jsonb)
    where c.id = item.chunk_id and c.document_version_id = target_version_id and c.embedding is null;
  exception when data_exception or invalid_text_representation then
    raise exception using errcode = '22023', message = 'document_embedding_vector_invalid';
  end;

  get diagnostics updated_count = row_count;
  if updated_count <> payload_count then raise exception using errcode = '22023', message = 'document_embedding_chunk_invalid'; end if;
  select count(*) into remaining_count from public.document_chunks c
  where c.document_version_id = target_version_id and c.embedding is null;
  update public.document_versions set
    embedding_status = case when remaining_count = 0 then 'ready' else 'pending' end,
    embedding_error = null,
    embedding_started_at = null,
    embedding_completed_at = case when remaining_count = 0 then now() else null end
  where id = target_version_id;
  return remaining_count;
end;
$$;

create or replace function public.fail_document_embedding(target_version_id uuid, safe_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception using errcode = '42501', message = 'document_embedding_worker_denied'; end if;
  if char_length(trim(coalesce(safe_error, ''))) not between 3 and 300 then raise exception using errcode = '22023', message = 'document_embedding_failure_invalid'; end if;
  update public.document_versions set
    embedding_status = 'failed', embedding_error = trim(safe_error),
    embedding_started_at = null, embedding_completed_at = now()
  where id = target_version_id and embedding_status = 'processing';
  if not found then raise exception using errcode = '22023', message = 'document_embedding_state_invalid'; end if;
end;
$$;

create or replace function public.retry_document_embedding(target_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_document_id uuid;
begin
  select document_id into target_document_id from public.document_versions where id = target_version_id;
  if target_document_id is null or not public.can_manage_document(target_document_id) then
    raise exception using errcode = '42501', message = 'document_embedding_retry_denied';
  end if;
  update public.document_versions set
    embedding_status = 'pending', embedding_error = null, embedding_started_at = null, embedding_completed_at = null
  where id = target_version_id and extraction_status = 'ready' and embedding_status = 'failed' and embedding_attempt_count < 50;
  if not found then raise exception using errcode = '22023', message = 'document_embedding_retry_invalid_state'; end if;
end;
$$;

create or replace function public.search_documents_hybrid(
  search_text text,
  query_embedding extensions.vector(1536),
  max_results integer default 6
)
returns table (
  chunk_id uuid, document_id uuid, version_id uuid, title text, version_no integer,
  chunk_index integer, excerpt text, locator jsonb, rank real
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with accessible as materialized (
    select c.id as chunk_id, d.id as document_id, v.id as version_id, d.title, v.version_no,
      c.chunk_index, c.content, c.metadata, c.embedding, d.updated_at,
      to_tsvector('simple', d.title || ' ' || c.content) as search_vector
    from public.document_chunks c
    join public.document_versions v on v.id = c.document_version_id and v.extraction_status = 'ready'
    join public.documents d on d.id = v.document_id and d.deleted_at is null
    where char_length(trim(search_text)) between 2 and 300
  ),
  query as (
    select websearch_to_tsquery('simple', left(trim(search_text), 300)) as value
  ),
  lexical as (
    select a.chunk_id,
      row_number() over (order by ts_rank_cd(a.search_vector, q.value) desc, a.updated_at desc, a.chunk_index) as position
    from accessible a cross join query q
    where a.search_vector @@ q.value
    order by ts_rank_cd(a.search_vector, q.value) desc, a.updated_at desc, a.chunk_index
    limit (least(greatest(max_results, 1), 10) * 4)
  ),
  semantic as (
    select a.chunk_id,
      row_number() over (order by a.embedding <=> query_embedding, a.updated_at desc, a.chunk_index) as position
    from accessible a
    where a.embedding is not null and query_embedding is not null
    order by a.embedding <=> query_embedding, a.updated_at desc, a.chunk_index
    limit (least(greatest(max_results, 1), 10) * 4)
  ),
  fused as (
    select candidate.chunk_id, sum(candidate.score)::real as hybrid_rank
    from (
      select l.chunk_id, 1.0 / (60 + l.position) as score from lexical l
      union all
      select s.chunk_id, 1.0 / (60 + s.position) as score from semantic s
    ) candidate
    group by candidate.chunk_id
  )
  select a.chunk_id, a.document_id, a.version_id, a.title, a.version_no, a.chunk_index,
    left(a.content, 1800), a.metadata, f.hybrid_rank
  from fused f join accessible a on a.chunk_id = f.chunk_id
  order by f.hybrid_rank desc, a.updated_at desc, a.chunk_index
  limit least(greatest(max_results, 1), 10);
$$;

revoke all on function public.claim_next_document_embedding() from public;
revoke all on function public.store_document_embedding_batch(uuid, text, jsonb) from public;
revoke all on function public.fail_document_embedding(uuid, text) from public;
revoke all on function public.retry_document_embedding(uuid) from public;
revoke all on function public.search_documents_hybrid(text, extensions.vector, integer) from public;

grant execute on function public.claim_next_document_embedding(), public.store_document_embedding_batch(uuid, text, jsonb), public.fail_document_embedding(uuid, text) to service_role;
grant execute on function public.retry_document_embedding(uuid), public.search_documents_hybrid(text, extensions.vector, integer) to authenticated;

comment on column public.document_chunks.embedding is 'OpenAI text-embedding-3-small vector 1536 chiều; chỉ service worker ghi.';
comment on column public.document_versions.embedding_status is 'Queue embedding tách khỏi extraction; lexical search vẫn dùng được khi embedding pending/failed.';
comment on function public.search_documents_hybrid(text, extensions.vector, integer) is 'Hybrid RRF lexical + semantic trên tập chunks đã qua RLS của phiên hiện tại.';
