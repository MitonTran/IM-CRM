-- M3.3: giao dịch VND, idempotency, trạng thái active/void và audit.

create type public.deal_status as enum ('active', 'void');

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  amount_vnd numeric(15, 0) not null check (amount_vnd >= 0),
  registered_at timestamptz not null,
  status public.deal_status not null default 'active',
  idempotency_key uuid not null,
  note text check (note is null or char_length(trim(note)) between 1 and 2000),
  void_reason text check (void_reason is null or char_length(trim(void_reason)) between 3 and 500),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint deals_void_fields_consistent check (
    (status = 'active' and void_reason is null and voided_at is null and voided_by is null)
    or (status = 'void' and void_reason is not null and voided_at is not null)
  )
);

create unique index deals_idempotency_unique on public.deals (idempotency_key);
create index deals_owner_registered_idx on public.deals (owner_user_id, registered_at desc) where status = 'active';
create index deals_team_registered_idx on public.deals (team_id, registered_at desc) where status = 'active';
create index deals_customer_registered_idx on public.deals (customer_id, registered_at desc);

create trigger deals_set_audit_fields before update on public.deals
for each row execute function public.set_audit_fields();

create or replace function public.write_deal_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare before_safe jsonb; after_safe jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then before_safe := to_jsonb(old) - array['note', 'idempotency_key']; end if;
  if tg_op in ('INSERT', 'UPDATE') then after_safe := to_jsonb(new) - array['note', 'idempotency_key']; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    (select auth.uid()), lower(tg_op), 'deals', coalesce(new.id, old.id), before_safe, after_safe,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger deals_audit after insert or update or delete on public.deals
for each row execute function public.write_deal_audit_log();

create or replace function public.validate_customer_status_reason()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status in ('lost', 'unqualified') and char_length(trim(coalesce(new.status_reason, ''))) < 3 then
    raise exception using errcode = '23514', message = 'customer_status_reason_required';
  end if;
  if new.status = 'won' and not exists (
    select 1 from public.deals d where d.customer_id = new.id and d.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'active_deal_required_for_won';
  end if;
  if new.status not in ('lost', 'unqualified') then new.status_reason := null; end if;
  return new;
end;
$$;

create or replace function public.register_deal(
  target_customer_id uuid,
  deal_amount_vnd numeric,
  deal_registered_at timestamptz,
  request_idempotency_key uuid,
  deal_note text default null,
  close_pending_tasks boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  current_customer public.customers%rowtype;
  existing_deal public.deals%rowtype;
  new_deal_id uuid;
  open_task record;
begin
  if actor_id is null or not public.can_access_customer(target_customer_id) then
    raise exception using errcode = '42501', message = 'deal_create_denied';
  end if;
  if deal_amount_vnd is null or deal_amount_vnd < 0 or deal_amount_vnd > 999999999999999 then
    raise exception using errcode = '22023', message = 'invalid_deal_amount';
  end if;
  if deal_registered_at is null or deal_registered_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid_registered_at';
  end if;
  if request_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency_key_required';
  end if;

  select * into existing_deal from public.deals where idempotency_key = request_idempotency_key;
  if found then
    if existing_deal.created_by = actor_id and existing_deal.customer_id = target_customer_id then return existing_deal.id; end if;
    raise exception using errcode = '23505', message = 'idempotency_key_conflict';
  end if;

  select * into current_customer from public.customers
  where id = target_customer_id and deleted_at is null for update;
  if not found or current_customer.owner_user_id is null then
    raise exception using errcode = '22023', message = 'customer_owner_required_for_deal';
  end if;

  insert into public.deals(
    customer_id, owner_user_id, team_id, amount_vnd, registered_at, idempotency_key,
    note, created_by, updated_by
  ) values (
    target_customer_id, current_customer.owner_user_id, current_customer.team_id,
    deal_amount_vnd, deal_registered_at, request_idempotency_key,
    nullif(trim(deal_note), ''), actor_id, actor_id
  ) returning id into new_deal_id;

  insert into public.activities(customer_id, type, outcome, content, occurred_at, performed_by, created_by, updated_by)
  values (target_customer_id, 'registration', 'completed', 'Đã ghi nhận giao dịch', deal_registered_at, actor_id, actor_id, actor_id);

  if current_customer.status <> 'won' then
    update public.customers set status = 'won', status_reason = null where id = target_customer_id;
  end if;

  if close_pending_tasks then
    for open_task in select * from public.follow_up_tasks where customer_id = target_customer_id and status = 'pending' for update loop
      update public.follow_up_tasks set status = 'completed', completed_at = now(), completion_reason = 'Khách đã đăng ký' where id = open_task.id;
      insert into public.follow_up_task_events(task_id, event_type, previous_due_at, reason, actor_user_id)
      values (open_task.id, 'completed', open_task.due_at, 'Khách đã đăng ký', actor_id);
    end loop;
  end if;
  return new_deal_id;
end;
$$;

create or replace function public.void_deal(target_deal_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.app_role := public.current_app_role();
  current_deal public.deals%rowtype;
begin
  if actor_id is null or actor_role not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'deal_void_denied';
  end if;
  if char_length(trim(coalesce(reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'deal_void_reason_required';
  end if;
  select * into current_deal from public.deals where id = target_deal_id for update;
  if not found or current_deal.status <> 'active' or not public.can_access_customer(current_deal.customer_id) then
    raise exception using errcode = '42501', message = 'deal_void_denied';
  end if;
  update public.deals
  set status = 'void', void_reason = trim(reason), voided_at = now(), voided_by = actor_id
  where id = target_deal_id;

  if not exists (select 1 from public.deals where customer_id = current_deal.customer_id and status = 'active') then
    update public.customers set status = 'follow_up', status_reason = null where id = current_deal.customer_id;
  end if;
end;
$$;

alter table public.deals enable row level security;
create policy deals_select_by_customer on public.deals
for select to authenticated using (
  public.can_access_customer(customer_id)
  or (public.is_admin() and exists (select 1 from public.customers c where c.id = customer_id))
);

revoke all on public.deals from anon, authenticated;
grant select on public.deals to authenticated;

revoke all on function public.register_deal(uuid, numeric, timestamptz, uuid, text, boolean) from public;
revoke all on function public.void_deal(uuid, text) from public;
grant execute on function public.register_deal(uuid, numeric, timestamptz, uuid, text, boolean) to authenticated;
grant execute on function public.void_deal(uuid, text) to authenticated;

comment on table public.deals is 'Giao dịch VND bất biến về owner/team tại thời điểm đăng ký; chỉ vô hiệu hóa, không xóa.';
comment on function public.register_deal is 'Đăng ký giao dịch idempotent, tạo activity registration và chuyển khách sang won.';
