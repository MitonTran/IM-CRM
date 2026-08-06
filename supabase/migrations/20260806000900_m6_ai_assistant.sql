-- M6.3: hội thoại AI chỉ đọc, quota dùng chung và RAG luôn áp dụng ACL trước retrieval.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('user', 'assistant')),
  content text check (content is null or char_length(content) between 1 and 12000),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  tool_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_calls) = 'array'),
  model text check (model is null or char_length(model) <= 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_messages_state_check check (
    (role = 'user' and status = 'completed' and content is not null and completed_at is not null)
    or (role = 'assistant' and status = 'pending' and content is null and completed_at is null)
    or (role = 'assistant' and status in ('completed', 'failed') and content is not null and completed_at is not null)
  )
);

create table public.ai_request_ledger (
  request_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  request_type text not null check (request_type in ('customer_analysis', 'assistant_message')),
  requested_at timestamptz not null default now()
);

create index ai_conversations_owner_updated_idx on public.ai_conversations(owner_user_id, last_message_at desc);
create index ai_messages_conversation_created_idx on public.ai_messages(conversation_id, created_at);
create index ai_request_ledger_user_requested_idx on public.ai_request_ledger(user_id, requested_at desc);

create or replace function public.reserve_ai_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
  request_kind text;
  request_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  day_start timestamptz;
  day_end timestamptz;
  quota integer;
  used_requests integer;
begin
  if tg_table_name = 'ai_customer_analyses' then
    actor_id := new.requested_by;
    request_kind := 'customer_analysis';
  elsif tg_table_name = 'ai_messages' and new.role = 'assistant' then
    actor_id := new.requested_by;
    request_kind := 'assistant_message';
  else
    return new;
  end if;

  if actor_id is null then raise exception using errcode = '42501', message = 'ai_request_denied'; end if;
  select daily_request_quota into strict quota from public.ai_settings where singleton_id;
  day_start := request_day::timestamp at time zone 'Asia/Ho_Chi_Minh';
  day_end := (request_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || request_day::text, 0));
  select count(*) into used_requests from public.ai_request_ledger
  where user_id = actor_id and requested_at >= day_start and requested_at < day_end;
  if used_requests >= quota then raise exception using errcode = 'P0001', message = 'ai_daily_quota_exceeded'; end if;

  insert into public.ai_request_ledger(request_id, user_id, request_type)
  values (new.id, actor_id, request_kind);
  return new;
end;
$$;

create trigger ai_customer_analyses_reserve_quota before insert on public.ai_customer_analyses
for each row execute function public.reserve_ai_request();
create trigger ai_messages_reserve_quota before insert on public.ai_messages
for each row execute function public.reserve_ai_request();

create or replace function public.write_ai_conversation_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    coalesce((select auth.uid()), new.owner_user_id, old.owner_user_id), lower(tg_op), 'ai_conversations', coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then jsonb_build_object('owner_user_id', old.owner_user_id, 'last_message_at', old.last_message_at) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object('owner_user_id', new.owner_user_id, 'last_message_at', new.last_message_at) else null end,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.write_ai_message_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    coalesce((select auth.uid()), new.requested_by, old.requested_by), lower(tg_op), 'ai_messages', coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' then jsonb_build_object('conversation_id', old.conversation_id, 'role', old.role, 'status', old.status, 'model', old.model, 'total_tokens', old.total_tokens, 'latency_ms', old.latency_ms) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object('conversation_id', new.conversation_id, 'role', new.role, 'status', new.status, 'model', new.model, 'total_tokens', new.total_tokens, 'latency_ms', new.latency_ms) else null end,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger ai_conversations_audit after insert or update or delete on public.ai_conversations
for each row execute function public.write_ai_conversation_audit_log();
create trigger ai_messages_audit after insert or update on public.ai_messages
for each row execute function public.write_ai_message_audit_log();

create or replace function public.create_ai_assistant_request(target_conversation_id uuid, question text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  cfg public.ai_settings%rowtype;
  conversation_id uuid := target_conversation_id;
  user_message_id uuid := gen_random_uuid();
  assistant_message_id uuid := gen_random_uuid();
  normalized_question text := trim(question);
begin
  if actor_id is null or not public.is_active_user() then raise exception using errcode = '42501', message = 'ai_request_denied'; end if;
  select * into strict cfg from public.ai_settings where singleton_id;
  if not cfg.is_enabled then raise exception using errcode = '55000', message = 'ai_disabled'; end if;
  if char_length(normalized_question) not between 2 and least(2000, cfg.max_input_chars) then
    raise exception using errcode = '22001', message = 'ai_question_invalid';
  end if;

  if conversation_id is null then
    insert into public.ai_conversations(owner_user_id, title)
    values (actor_id, left(normalized_question, 120)) returning id into conversation_id;
  elsif not exists (
    select 1 from public.ai_conversations c where c.id = conversation_id and c.owner_user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'ai_conversation_scope_denied';
  end if;

  insert into public.ai_messages(id, conversation_id, requested_by, role, content, status, completed_at)
  values (user_message_id, conversation_id, actor_id, 'user', normalized_question, 'completed', now());
  insert into public.ai_messages(id, conversation_id, requested_by, role, status)
  values (assistant_message_id, conversation_id, actor_id, 'assistant', 'pending');
  update public.ai_conversations set updated_at = now(), last_message_at = now() where id = conversation_id;

  return jsonb_build_object(
    'conversation_id', conversation_id,
    'user_message_id', user_message_id,
    'assistant_message_id', assistant_message_id
  );
end;
$$;

create or replace function public.can_profile_access_document(target_user_id uuid, target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.documents d
    join public.profiles p on p.id = target_user_id and p.is_active
    where d.id = target_document_id and d.deleted_at is null and (
      p.role = 'admin'
      or d.scope_type = 'organization'
      or (d.scope_type = 'team' and d.team_id = p.team_id)
      or (d.scope_type = 'user' and d.user_id = p.id)
    )
  );
$$;

create or replace function public.complete_ai_assistant_message(
  target_message_id uuid,
  answer_content text,
  answer_citations jsonb,
  redacted_tool_calls jsonb,
  model_name text,
  used_input_tokens integer,
  used_output_tokens integer,
  used_total_tokens integer,
  request_latency_ms integer,
  estimated_cost numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data public.ai_messages%rowtype;
  citation jsonb;
  tool_call jsonb;
  usage_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  doc_id uuid;
  version_id uuid;
begin
  select * into row_data from public.ai_messages where id = target_message_id for update;
  if not found or row_data.role <> 'assistant' then raise exception using errcode = 'P0002', message = 'ai_message_not_found'; end if;
  if row_data.status <> 'pending' then raise exception using errcode = '55000', message = 'ai_message_not_pending'; end if;
  if char_length(trim(coalesce(answer_content, ''))) not between 1 and 12000
    or jsonb_typeof(answer_citations) <> 'array' or jsonb_array_length(answer_citations) > 12
    or jsonb_typeof(redacted_tool_calls) <> 'array' or jsonb_array_length(redacted_tool_calls) > 8
    or char_length(trim(coalesce(model_name, ''))) = 0
    or used_input_tokens < 0 or used_output_tokens < 0 or used_total_tokens < used_input_tokens + used_output_tokens
    or request_latency_ms < 0
  then raise exception using errcode = '22023', message = 'ai_message_result_invalid'; end if;

  for tool_call in select value from jsonb_array_elements(redacted_tool_calls) loop
    if tool_call ->> 'tool' not in (
      'get_customer_summary', 'list_follow_ups', 'get_kpi_summary', 'get_revenue_summary',
      'get_funnel_summary', 'search_documents', 'get_document_excerpt'
    ) or jsonb_typeof(tool_call -> 'result_count') <> 'number'
      or (tool_call ->> 'result_count')::integer not between 0 and 100
    then raise exception using errcode = '22023', message = 'ai_tool_call_invalid'; end if;
  end loop;

  for citation in select value from jsonb_array_elements(answer_citations) loop
    if citation ->> 'kind' = 'document' then
      if coalesce(citation ->> 'document_id', '') !~* '^[0-9a-f-]{36}$'
        or coalesce(citation ->> 'version_id', '') !~* '^[0-9a-f-]{36}$'
      then raise exception using errcode = '22023', message = 'ai_citation_invalid'; end if;
      doc_id := (citation ->> 'document_id')::uuid;
      version_id := (citation ->> 'version_id')::uuid;
      if not public.can_profile_access_document(row_data.requested_by, doc_id)
        or not exists (select 1 from public.document_versions v where v.id = version_id and v.document_id = doc_id)
      then raise exception using errcode = '42501', message = 'ai_citation_scope_denied'; end if;
    elsif citation ->> 'kind' = 'crm' then
      if coalesce(citation ->> 'href', '') !~ '^/(customers|tasks|dashboard|deals)([/?].*)?$'
        or citation ->> 'tool' not in ('get_customer_summary', 'list_follow_ups', 'get_kpi_summary', 'get_revenue_summary', 'get_funnel_summary')
      then raise exception using errcode = '22023', message = 'ai_citation_invalid'; end if;
    else
      raise exception using errcode = '22023', message = 'ai_citation_invalid';
    end if;
  end loop;

  update public.ai_messages set
    content = trim(answer_content), status = 'completed', citations = answer_citations,
    tool_calls = redacted_tool_calls, model = left(trim(model_name), 120),
    input_tokens = used_input_tokens, output_tokens = used_output_tokens, total_tokens = used_total_tokens,
    estimated_cost_usd = estimated_cost, latency_ms = request_latency_ms, error_code = null, completed_at = now()
  where id = target_message_id;

  insert into public.ai_usage_daily(usage_date, user_id, request_count, input_tokens, output_tokens, total_tokens)
  values (usage_day, row_data.requested_by, 1, used_input_tokens, used_output_tokens, used_total_tokens)
  on conflict (usage_date, user_id) do update set
    request_count = public.ai_usage_daily.request_count + 1,
    input_tokens = public.ai_usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_usage_daily.output_tokens + excluded.output_tokens,
    total_tokens = public.ai_usage_daily.total_tokens + excluded.total_tokens,
    updated_at = now();
end;
$$;

create or replace function public.fail_ai_assistant_message(target_message_id uuid, failure_code text, request_latency_ms integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(coalesce(failure_code, ''))) = 0 or request_latency_ms < 0 then
    raise exception using errcode = '22023', message = 'ai_failure_invalid';
  end if;
  update public.ai_messages set
    content = 'Không thể hoàn tất câu trả lời lúc này. Vui lòng thử lại.', status = 'failed',
    error_code = left(trim(failure_code), 80), latency_ms = request_latency_ms, completed_at = now()
  where id = target_message_id and role = 'assistant' and status = 'pending';
  if not found then raise exception using errcode = 'P0002', message = 'ai_message_not_pending'; end if;
end;
$$;

create or replace function public.search_documents(search_text text, max_results integer default 6)
returns table (
  chunk_id uuid, document_id uuid, version_id uuid, title text, version_no integer,
  chunk_index integer, excerpt text, locator jsonb, rank real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with query as (
    select websearch_to_tsquery('simple', left(trim(search_text), 300)) as value
  )
  select c.id, d.id, v.id, d.title, v.version_no, c.chunk_index, left(c.content, 1800), c.metadata,
    ts_rank_cd(to_tsvector('simple', d.title || ' ' || c.content), query.value)::real
  from query
  join public.document_chunks c on true
  join public.document_versions v on v.id = c.document_version_id and v.extraction_status = 'ready'
  join public.documents d on d.id = v.document_id and d.deleted_at is null
  where char_length(trim(search_text)) between 2 and 300
    and to_tsvector('simple', d.title || ' ' || c.content) @@ query.value
  order by 9 desc, d.updated_at desc, c.chunk_index
  limit least(greatest(max_results, 1), 10);
$$;

create or replace function public.get_document_excerpt(target_version_id uuid, target_chunk_index integer)
returns table (
  chunk_id uuid, document_id uuid, version_id uuid, title text, version_no integer,
  chunk_index integer, excerpt text, locator jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.id, d.id, v.id, d.title, v.version_no, c.chunk_index, left(c.content, 2400), c.metadata
  from public.document_chunks c
  join public.document_versions v on v.id = c.document_version_id and v.extraction_status = 'ready'
  join public.documents d on d.id = v.document_id and d.deleted_at is null
  where v.id = target_version_id and c.chunk_index = target_chunk_index;
$$;

create or replace function public.purge_expired_ai_history()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare deleted_count integer;
begin
  delete from public.ai_conversations
  where last_message_at < now() - (select retention_days * interval '1 day' from public.ai_settings where singleton_id);
  get diagnostics deleted_count = row_count;
  delete from public.ai_request_ledger
  where requested_at < now() - (select retention_days * interval '1 day' from public.ai_settings where singleton_id);
  return deleted_count;
end;
$$;

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_request_ledger enable row level security;

create policy ai_conversations_select_owner on public.ai_conversations
for select to authenticated using (owner_user_id = (select auth.uid()));
create policy ai_messages_select_owner on public.ai_messages
for select to authenticated using (
  exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.owner_user_id = (select auth.uid()))
);
create policy ai_request_ledger_select_self_or_admin on public.ai_request_ledger
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.ai_conversations, public.ai_messages, public.ai_request_ledger from anon, authenticated;
grant select on public.ai_conversations, public.ai_messages, public.ai_request_ledger to authenticated;

revoke all on function public.reserve_ai_request() from public;
revoke all on function public.write_ai_conversation_audit_log() from public;
revoke all on function public.write_ai_message_audit_log() from public;
revoke all on function public.create_ai_assistant_request(uuid, text) from public;
revoke all on function public.can_profile_access_document(uuid, uuid) from public;
revoke all on function public.complete_ai_assistant_message(uuid, text, jsonb, jsonb, text, integer, integer, integer, integer, numeric) from public;
revoke all on function public.fail_ai_assistant_message(uuid, text, integer) from public;
revoke all on function public.search_documents(text, integer) from public;
revoke all on function public.get_document_excerpt(uuid, integer) from public;
revoke all on function public.purge_expired_ai_history() from public;

grant execute on function public.create_ai_assistant_request(uuid, text) to authenticated;
grant execute on function public.search_documents(text, integer), public.get_document_excerpt(uuid, integer) to authenticated;
grant execute on function public.complete_ai_assistant_message(uuid, text, jsonb, jsonb, text, integer, integer, integer, integer, numeric) to service_role;
grant execute on function public.fail_ai_assistant_message(uuid, text, integer), public.purge_expired_ai_history() to service_role;

comment on table public.ai_conversations is 'Hội thoại AI riêng của từng người dùng; retention mặc định 90 ngày.';
comment on table public.ai_messages is 'Nội dung hội thoại và metadata AI; audit trigger không ghi content/citation/tool payload.';
comment on table public.ai_request_ledger is 'Nguồn quota dùng chung cho phân tích khách hàng và trợ lý hỏi đáp.';
comment on function public.search_documents(text, integer) is 'RAG lexical retrieval chạy security invoker; RLS chunk/document lọc ACL trước ranking.';
comment on function public.get_document_excerpt(uuid, integer) is 'Đọc một chunk theo version/locator sau khi RLS kiểm tra quyền hiện tại.';
