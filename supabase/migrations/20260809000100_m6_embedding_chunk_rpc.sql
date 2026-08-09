-- M6.3: expose a bounded, service-role-only chunk batch to the embedding worker.

create or replace function public.get_document_embedding_batch(
  target_version_id uuid,
  max_chunks integer default 64
)
returns table (id uuid, content text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'document_embedding_worker_denied';
  end if;
  if max_chunks not between 1 and 64 then
    raise exception using errcode = '22023', message = 'document_embedding_batch_invalid';
  end if;
  if not exists (
    select 1 from public.document_versions v
    where v.id = target_version_id
      and v.extraction_status = 'ready'
      and v.embedding_status = 'processing'
  ) then
    raise exception using errcode = '22023', message = 'document_embedding_state_invalid';
  end if;

  return query
  select c.id, c.content
  from public.document_chunks c
  where c.document_version_id = target_version_id
    and c.embedding is null
  order by c.chunk_index
  limit max_chunks;
end;
$$;

revoke all on function public.get_document_embedding_batch(uuid, integer) from public;
grant execute on function public.get_document_embedding_batch(uuid, integer) to service_role;

comment on function public.get_document_embedding_batch(uuid, integer) is
  'Returns a bounded text-only chunk batch to the service-role embedding worker.';
