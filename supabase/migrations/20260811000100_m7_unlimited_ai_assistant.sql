-- M7: trợ lý hỏi đáp không giới hạn lượt CRM nhưng vẫn giữ ledger/usage/audit.
-- Phân tích khách hàng tiếp tục dùng daily_request_quota để kiểm soát chi phí.

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

  if actor_id is null then
    raise exception using errcode = '42501', message = 'ai_request_denied';
  end if;

  if request_kind = 'customer_analysis' then
    select daily_request_quota into strict quota
    from public.ai_settings
    where singleton_id;

    day_start := request_day::timestamp at time zone 'Asia/Ho_Chi_Minh';
    day_end := (request_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
    perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || request_day::text, 0));
    select count(*) into used_requests
    from public.ai_request_ledger
    where user_id = actor_id
      and request_type = 'customer_analysis'
      and requested_at >= day_start
      and requested_at < day_end;
    if used_requests >= quota then
      raise exception using errcode = 'P0001', message = 'ai_daily_quota_exceeded';
    end if;
  end if;

  insert into public.ai_request_ledger(request_id, user_id, request_type)
  values (new.id, actor_id, request_kind);
  return new;
end;
$$;

comment on table public.ai_request_ledger is
  'Ledger usage AI; trợ lý hỏi đáp không giới hạn lượt CRM, phân tích khách hàng vẫn áp daily_request_quota.';
