-- M6.1: nền tảng phân tích khách hàng bằng AI, chỉ đọc và có quota/audit.

create table public.ai_settings (
  singleton_id boolean primary key default true check (singleton_id),
  is_enabled boolean not null default true,
  daily_request_quota integer not null default 20 check (daily_request_quota between 1 and 500),
  max_input_chars integer not null default 30000 check (max_input_chars between 1000 and 100000),
  max_output_tokens integer not null default 1800 check (max_output_tokens between 256 and 8000),
  retention_days integer not null default 90 check (retention_days between 7 and 365),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.ai_settings(singleton_id) values (true);

create table public.ai_customer_analyses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  result jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_customer_analyses_customer_created_idx
  on public.ai_customer_analyses(customer_id, created_at desc);
create index ai_customer_analyses_requester_created_idx
  on public.ai_customer_analyses(requested_by, created_at desc);
create index ai_customer_analyses_pending_idx
  on public.ai_customer_analyses(created_at) where status = 'pending';

create table public.ai_usage_daily (
  usage_date date not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_date, user_id)
);

create trigger ai_settings_set_audit_fields before update on public.ai_settings
for each row execute function public.set_audit_fields();

create or replace function public.write_ai_settings_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, before_data, after_data, request_id)
  values (
    (select auth.uid()),
    'update',
    'ai_settings',
    to_jsonb(old) - 'updated_by',
    to_jsonb(new) - 'updated_by',
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return new;
end;
$$;

create trigger ai_settings_audit after update on public.ai_settings
for each row execute function public.write_ai_settings_audit_log();

create or replace function public.write_ai_analysis_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    coalesce((select auth.uid()), new.requested_by, old.requested_by),
    lower(tg_op),
    'ai_customer_analyses',
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'customer_id', old.customer_id, 'requested_by', old.requested_by, 'status', old.status,
      'model', old.model, 'total_tokens', old.total_tokens, 'latency_ms', old.latency_ms
    ) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object(
      'customer_id', new.customer_id, 'requested_by', new.requested_by, 'status', new.status,
      'model', new.model, 'total_tokens', new.total_tokens, 'latency_ms', new.latency_ms
    ) else null end,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger ai_customer_analyses_audit after insert or update on public.ai_customer_analyses
for each row execute function public.write_ai_analysis_audit_log();

create or replace function public.create_ai_customer_analysis_request(target_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  request_id uuid := gen_random_uuid();
  request_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  day_start timestamptz;
  day_end timestamptz;
  cfg public.ai_settings%rowtype;
  used_requests integer;
  snapshot jsonb;
begin
  if actor_id is null or not public.is_active_user() then
    raise exception using errcode = '42501', message = 'ai_request_denied';
  end if;
  if not public.can_access_customer(target_customer_id) then
    raise exception using errcode = '42501', message = 'ai_customer_scope_denied';
  end if;

  select * into strict cfg from public.ai_settings where singleton_id;
  if not cfg.is_enabled then
    raise exception using errcode = '55000', message = 'ai_disabled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || request_day::text, 0));
  day_start := request_day::timestamp at time zone 'Asia/Ho_Chi_Minh';
  day_end := (request_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  select count(*) into used_requests
  from public.ai_customer_analyses
  where requested_by = actor_id and created_at >= day_start and created_at < day_end;
  if used_requests >= cfg.daily_request_quota then
    raise exception using errcode = 'P0001', message = 'ai_daily_quota_exceeded';
  end if;

  select jsonb_build_object(
    'snapshot_version', 1,
    'captured_at', now(),
    'customer', jsonb_build_object(
      'id', c.id,
      'status', c.status,
      'priority', c.priority,
      'source', s.name,
      'owner', p.full_name,
      'team', t.name,
      'note_summary', left(c.note_summary, 2000),
      'tags', coalesce((
        select jsonb_agg(ct.name order by ct.name)
        from public.customer_tag_links ctl
        join public.customer_tags ct on ct.id = ctl.tag_id
        where ctl.customer_id = c.id
      ), '[]'::jsonb)
    ),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'type', a.type,
        'outcome', a.outcome,
        'content', left(a.content, 800),
        'next_action', left(a.next_action, 300),
        'follow_up_at', a.follow_up_at,
        'occurred_at', a.occurred_at
      ) order by a.occurred_at desc)
      from (
        select * from public.activities
        where customer_id = c.id and deleted_at is null
        order by occurred_at desc limit 30
      ) a
    ), '[]'::jsonb),
    'follow_ups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'status', f.status,
        'priority', f.priority,
        'due_at', f.due_at,
        'completion_reason', left(f.completion_reason, 300)
      ) order by f.due_at desc)
      from (
        select * from public.follow_up_tasks
        where customer_id = c.id
        order by due_at desc limit 20
      ) f
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'amount_vnd', d.amount_vnd,
        'registered_at', d.registered_at,
        'status', d.status,
        'note', left(d.note, 500)
      ) order by d.registered_at desc)
      from (
        select * from public.deals
        where customer_id = c.id
        order by registered_at desc limit 20
      ) d
    ), '[]'::jsonb)
  ) into snapshot
  from public.customers c
  join public.lead_sources s on s.id = c.source_id
  left join public.profiles p on p.id = c.owner_user_id
  join public.teams t on t.id = c.team_id
  where c.id = target_customer_id and c.deleted_at is null;

  if snapshot is null then
    raise exception using errcode = 'P0002', message = 'ai_customer_not_found';
  end if;
  if char_length(snapshot::text) > cfg.max_input_chars then
    raise exception using errcode = '22001', message = 'ai_input_too_large';
  end if;

  insert into public.ai_customer_analyses(id, customer_id, requested_by, input_snapshot)
  values (request_id, target_customer_id, actor_id, snapshot);
  return request_id;
end;
$$;

create or replace function public.is_valid_ai_customer_analysis_result(value jsonb, snapshot jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  evidence_id text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if not coalesce(
    jsonb_typeof(value -> 'summary') = 'string'
    and value ->> 'potential_level' in ('low', 'medium', 'high')
    and jsonb_typeof(value -> 'lead_score') = 'number'
    and (value ->> 'lead_score')::numeric between 0 and 100
    and jsonb_typeof(value -> 'score_reasons') = 'array'
    and jsonb_typeof(value -> 'key_needs') = 'array'
    and jsonb_typeof(value -> 'objections') = 'array'
    and jsonb_typeof(value -> 'risks') = 'array'
    and jsonb_typeof(value -> 'next_actions') = 'array'
    and jsonb_typeof(value -> 'missing_information') = 'array'
    and value ->> 'confidence' in ('low', 'medium', 'high')
    and jsonb_typeof(value -> 'evidence_activity_ids') = 'array'
    and (jsonb_typeof(value -> 'suggested_follow_up_at') in ('string', 'null'))
    and (jsonb_typeof(value -> 'suggested_message') in ('string', 'null')),
    false
  ) then return false; end if;

  if jsonb_typeof(value -> 'suggested_follow_up_at') = 'string' then
    if value ->> 'suggested_follow_up_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
    perform (value ->> 'suggested_follow_up_at')::timestamptz;
  end if;

  for evidence_id in select jsonb_array_elements_text(value -> 'evidence_activity_ids') loop
    if evidence_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not exists (
        select 1 from jsonb_array_elements(snapshot -> 'activities') activity
        where activity ->> 'id' = evidence_id
      )
    then return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.complete_ai_customer_analysis(
  target_analysis_id uuid,
  analysis_result jsonb,
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
  row_data public.ai_customer_analyses%rowtype;
  usage_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into row_data from public.ai_customer_analyses where id = target_analysis_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ai_analysis_not_found'; end if;
  if row_data.status <> 'pending' then raise exception using errcode = '55000', message = 'ai_analysis_not_pending'; end if;
  if not public.is_valid_ai_customer_analysis_result(analysis_result, row_data.input_snapshot) then
    raise exception using errcode = '22023', message = 'ai_result_invalid';
  end if;
  if char_length(trim(coalesce(model_name, ''))) = 0
    or used_input_tokens < 0 or used_output_tokens < 0 or used_total_tokens < 0
    or used_total_tokens < used_input_tokens + used_output_tokens
    or request_latency_ms < 0
  then raise exception using errcode = '22023', message = 'ai_usage_invalid'; end if;

  update public.ai_customer_analyses set
    result = analysis_result,
    status = 'completed',
    model = left(trim(model_name), 120),
    input_tokens = used_input_tokens,
    output_tokens = used_output_tokens,
    total_tokens = used_total_tokens,
    estimated_cost_usd = estimated_cost,
    latency_ms = request_latency_ms,
    error_code = null,
    completed_at = now()
  where id = target_analysis_id;

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

create or replace function public.fail_ai_customer_analysis(
  target_analysis_id uuid,
  failure_code text,
  request_latency_ms integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(coalesce(failure_code, ''))) = 0 or request_latency_ms < 0 then
    raise exception using errcode = '22023', message = 'ai_failure_invalid';
  end if;
  update public.ai_customer_analyses set
    status = 'failed', error_code = left(trim(failure_code), 80),
    latency_ms = request_latency_ms, completed_at = now()
  where id = target_analysis_id and status = 'pending';
  if not found then raise exception using errcode = 'P0002', message = 'ai_analysis_not_pending'; end if;
end;
$$;

alter table public.ai_settings enable row level security;
alter table public.ai_customer_analyses enable row level security;
alter table public.ai_usage_daily enable row level security;

create policy ai_settings_select_active on public.ai_settings
for select to authenticated using (public.is_active_user());
create policy ai_settings_update_admin on public.ai_settings
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ai_customer_analyses_select_by_customer on public.ai_customer_analyses
for select to authenticated using (public.can_access_customer(customer_id));

create policy ai_usage_daily_select_self_or_admin on public.ai_usage_daily
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.ai_settings, public.ai_customer_analyses, public.ai_usage_daily from anon, authenticated;
grant select on public.ai_settings, public.ai_customer_analyses, public.ai_usage_daily to authenticated;
grant update(is_enabled, daily_request_quota, max_input_chars, max_output_tokens, retention_days)
  on public.ai_settings to authenticated;

revoke all on function public.create_ai_customer_analysis_request(uuid) from public;
revoke all on function public.is_valid_ai_customer_analysis_result(jsonb, jsonb) from public;
revoke all on function public.complete_ai_customer_analysis(uuid, jsonb, text, integer, integer, integer, integer, numeric) from public;
revoke all on function public.fail_ai_customer_analysis(uuid, text, integer) from public;
grant execute on function public.create_ai_customer_analysis_request(uuid) to authenticated;
grant execute on function public.complete_ai_customer_analysis(uuid, jsonb, text, integer, integer, integer, integer, numeric) to service_role;
grant execute on function public.fail_ai_customer_analysis(uuid, text, integer) to service_role;

comment on table public.ai_customer_analyses is 'Phân tích AI bất biến theo snapshot; AI chỉ đưa đề xuất, không ghi CRM.';
comment on column public.ai_customer_analyses.input_snapshot is 'Snapshot tối thiểu, không chứa số điện thoại hoặc email.';
comment on function public.create_ai_customer_analysis_request(uuid) is 'Kiểm tra RLS/quota và dựng snapshot phía database để client không thể mở rộng scope.';
