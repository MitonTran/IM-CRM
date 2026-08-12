-- M6.3: switch the Preview semantic index from OpenAI to Gemini without mixing vector spaces.

alter table public.document_chunks
  drop constraint document_chunks_embedding_state_check;

update public.document_chunks
set embedding = null,
    embedding_model = null,
    embedded_at = null
where embedding is not null
   or embedding_model is not null
   or embedded_at is not null;

alter table public.document_chunks
  add constraint document_chunks_embedding_state_check check (
    (embedding is null and embedding_model is null and embedded_at is null)
    or (embedding is not null and embedding_model = 'gemini-embedding-001' and embedded_at is not null)
  );

update public.document_versions v
set embedding_status = case
      when v.extraction_status = 'ready'
        and exists (
          select 1 from public.document_chunks c
          where c.document_version_id = v.id
        ) then 'pending'
      else 'not_applicable'
    end,
    embedding_error = null,
    embedding_started_at = null,
    embedding_completed_at = null,
    embedding_attempt_count = 0;

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
  if model_name <> 'gemini-embedding-001' or jsonb_typeof(embeddings) <> 'array' then
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

comment on column public.document_chunks.embedding is 'Google gemini-embedding-001 vector 1536 chiều; chỉ service worker ghi.';
