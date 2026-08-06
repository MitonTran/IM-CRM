-- M3.1–M3.2: hành trình chăm sóc, timeline và follow-up có lịch sử.

create type public.activity_type as enum (
  'customer_created', 'call', 'message', 'appointment', 'consultation', 'note',
  'status_change', 'assignment_change', 'registration'
);

create type public.activity_outcome as enum (
  'connected', 'no_answer', 'replied', 'booked', 'attended', 'cancelled',
  'interested', 'objection', 'not_interested', 'completed'
);

create type public.follow_up_status as enum ('pending', 'completed', 'cancelled');
create type public.follow_up_event_type as enum ('created', 'completed', 'cancelled', 'rescheduled', 'reassigned');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  type public.activity_type not null,
  outcome public.activity_outcome,
  content text check (content is null or char_length(trim(content)) between 1 and 4000),
  occurred_at timestamptz not null,
  performed_by uuid not null references public.profiles(id) on delete restrict,
  next_action text check (next_action is null or char_length(trim(next_action)) between 2 and 500),
  follow_up_at timestamptz,
  is_late_entry boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_reason text check (deleted_reason is null or char_length(trim(deleted_reason)) between 3 and 500),
  constraint activities_follow_up_fields_consistent check (
    (follow_up_at is null and next_action is null) or (follow_up_at is not null and next_action is not null)
  ),
  constraint activities_delete_fields_consistent check (
    (deleted_at is null and deleted_by is null and deleted_reason is null)
    or (deleted_at is not null and deleted_reason is not null)
  )
);

create index activities_customer_occurred_idx on public.activities (customer_id, occurred_at desc) where deleted_at is null;
create index activities_performer_occurred_idx on public.activities (performed_by, occurred_at desc) where deleted_at is null;
create index activities_type_occurred_idx on public.activities (type, occurred_at desc) where deleted_at is null;

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  activity_id uuid not null unique references public.activities(id) on delete restrict,
  assignee_user_id uuid not null references public.profiles(id) on delete restrict,
  due_at timestamptz not null,
  status public.follow_up_status not null default 'pending',
  priority public.customer_priority not null default 'normal',
  completed_at timestamptz,
  completion_reason text check (completion_reason is null or char_length(trim(completion_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint follow_up_task_completion_consistent check (
    (status = 'pending' and completed_at is null and completion_reason is null)
    or (status in ('completed', 'cancelled') and completed_at is not null and completion_reason is not null)
  )
);

create index follow_up_tasks_assignee_due_pending_idx
  on public.follow_up_tasks (assignee_user_id, due_at)
  where status = 'pending';
create index follow_up_tasks_customer_status_idx on public.follow_up_tasks (customer_id, status, due_at);

create table public.follow_up_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.follow_up_tasks(id) on delete restrict,
  event_type public.follow_up_event_type not null,
  previous_due_at timestamptz,
  new_due_at timestamptz,
  previous_assignee_user_id uuid references public.profiles(id) on delete restrict,
  new_assignee_user_id uuid references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index follow_up_task_events_task_created_idx on public.follow_up_task_events (task_id, created_at desc);

create trigger activities_set_audit_fields before update on public.activities
for each row execute function public.set_audit_fields();
create trigger follow_up_tasks_set_audit_fields before update on public.follow_up_tasks
for each row execute function public.set_audit_fields();

create or replace function public.write_activity_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_safe jsonb;
  after_safe jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then before_safe := to_jsonb(old) - array['content', 'next_action']; end if;
  if tg_op in ('INSERT', 'UPDATE') then after_safe := to_jsonb(new) - array['content', 'next_action']; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    (select auth.uid()), lower(tg_op), 'activities', coalesce(new.id, old.id), before_safe, after_safe,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.write_follow_up_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    (select auth.uid()), lower(tg_op), 'follow_up_tasks', coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'completion_reason' else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'completion_reason' else null end,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger activities_audit after insert or update or delete on public.activities
for each row execute function public.write_activity_audit_log();
create trigger follow_up_tasks_audit after insert or update or delete on public.follow_up_tasks
for each row execute function public.write_follow_up_audit_log();

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
  if new.status not in ('lost', 'unqualified') then new.status_reason := null; end if;
  return new;
end;
$$;

create trigger customers_validate_status_reason before insert or update of status, status_reason on public.customers
for each row execute function public.validate_customer_status_reason();

create or replace function public.write_customer_status_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor_id uuid := coalesce((select auth.uid()), new.updated_by, new.created_by);
begin
  if old.status is distinct from new.status and actor_id is not null then
    insert into public.activities(customer_id, type, content, occurred_at, performed_by, created_by, updated_by)
    values (new.id, 'status_change', old.status::text || ' → ' || new.status::text, now(), actor_id, actor_id, actor_id);
  end if;
  return new;
end;
$$;

create trigger customers_status_activity after update of status on public.customers
for each row execute function public.write_customer_status_activity();

create or replace function public.can_access_follow_up_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.follow_up_tasks task
    join public.customers c on c.id = task.customer_id and c.deleted_at is null
    where task.id = target_task_id
      and (
        public.is_admin()
        or (public.is_leader() and c.team_id = public.current_team_id())
        or (public.current_app_role() = 'sale' and task.assignee_user_id = (select auth.uid()))
      )
  );
$$;

create or replace function public.record_activity_with_follow_up(
  target_customer_id uuid,
  activity_kind public.activity_type,
  activity_outcome public.activity_outcome default null,
  activity_content text default null,
  activity_occurred_at timestamptz default now(),
  activity_next_action text default null,
  activity_follow_up_at timestamptz default null,
  task_priority public.customer_priority default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  customer_owner uuid;
  new_activity_id uuid;
  new_task_id uuid;
begin
  if actor_id is null or not public.can_access_customer(target_customer_id) then
    raise exception using errcode = '42501', message = 'activity_create_denied';
  end if;
  if activity_kind in ('customer_created', 'status_change', 'assignment_change', 'registration') then
    raise exception using errcode = '42501', message = 'system_activity_type_denied';
  end if;
  if activity_occurred_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'activity_time_in_future';
  end if;
  if activity_follow_up_at is not null then
    if activity_follow_up_at <= now() then
      raise exception using errcode = '22023', message = 'follow_up_time_must_be_future';
    end if;
    if char_length(trim(coalesce(activity_next_action, ''))) < 2 then
      raise exception using errcode = '22023', message = 'next_action_required';
    end if;
  elsif activity_next_action is not null then
    raise exception using errcode = '22023', message = 'follow_up_time_required';
  end if;

  select owner_user_id into customer_owner from public.customers where id = target_customer_id and deleted_at is null for update;
  if activity_follow_up_at is not null and customer_owner is null then
    raise exception using errcode = '22023', message = 'customer_owner_required_for_follow_up';
  end if;

  insert into public.activities(
    customer_id, type, outcome, content, occurred_at, performed_by, next_action,
    follow_up_at, is_late_entry, created_by, updated_by
  ) values (
    target_customer_id, activity_kind, activity_outcome, nullif(trim(activity_content), ''),
    activity_occurred_at, actor_id, nullif(trim(activity_next_action), ''), activity_follow_up_at,
    activity_occurred_at < now() - interval '24 hours', actor_id, actor_id
  ) returning id into new_activity_id;

  if activity_follow_up_at is not null then
    insert into public.follow_up_tasks(
      customer_id, activity_id, assignee_user_id, due_at, priority, created_by, updated_by
    ) values (
      target_customer_id, new_activity_id, customer_owner, activity_follow_up_at,
      task_priority, actor_id, actor_id
    ) returning id into new_task_id;
    insert into public.follow_up_task_events(task_id, event_type, new_due_at, new_assignee_user_id, reason, actor_user_id)
    values (new_task_id, 'created', activity_follow_up_at, customer_owner, trim(activity_next_action), actor_id);
  end if;
  return new_activity_id;
end;
$$;

create or replace function public.manage_follow_up_task(
  target_task_id uuid,
  task_action text,
  task_reason text,
  new_due_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  current_task public.follow_up_tasks%rowtype;
begin
  if actor_id is null or not public.can_access_follow_up_task(target_task_id) then
    raise exception using errcode = '42501', message = 'follow_up_task_update_denied';
  end if;
  if task_action not in ('complete', 'cancel', 'reschedule') then
    raise exception using errcode = '22023', message = 'invalid_follow_up_action';
  end if;
  if char_length(trim(coalesce(task_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'follow_up_reason_required';
  end if;

  select * into current_task from public.follow_up_tasks where id = target_task_id for update;
  if current_task.status <> 'pending' then
    raise exception using errcode = '22023', message = 'follow_up_task_already_closed';
  end if;

  if task_action = 'reschedule' then
    if new_due_at is null or new_due_at <= now() then
      raise exception using errcode = '22023', message = 'new_due_time_must_be_future';
    end if;
    update public.follow_up_tasks set due_at = new_due_at where id = target_task_id;
    insert into public.follow_up_task_events(task_id, event_type, previous_due_at, new_due_at, reason, actor_user_id)
    values (target_task_id, 'rescheduled', current_task.due_at, new_due_at, trim(task_reason), actor_id);
  else
    update public.follow_up_tasks
    set status = case when task_action = 'complete' then 'completed'::public.follow_up_status else 'cancelled'::public.follow_up_status end,
        completed_at = now(), completion_reason = trim(task_reason)
    where id = target_task_id;
    insert into public.follow_up_task_events(task_id, event_type, previous_due_at, reason, actor_user_id)
    values (
      target_task_id,
      case when task_action = 'complete' then 'completed'::public.follow_up_event_type else 'cancelled'::public.follow_up_event_type end,
      current_task.due_at, trim(task_reason), actor_id
    );
  end if;
end;
$$;

create or replace function public.update_activity(
  target_activity_id uuid,
  new_outcome public.activity_outcome,
  new_content text,
  new_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.app_role := public.current_app_role();
  current_activity public.activities%rowtype;
begin
  select * into current_activity from public.activities where id = target_activity_id and deleted_at is null for update;
  if not found or actor_id is null or not public.can_access_customer(current_activity.customer_id) then
    raise exception using errcode = '42501', message = 'activity_update_denied';
  end if;
  if current_activity.type in ('customer_created', 'status_change', 'assignment_change', 'registration') then
    raise exception using errcode = '42501', message = 'system_activity_update_denied';
  end if;
  if actor_role = 'sale' and (current_activity.performed_by <> actor_id or current_activity.created_at < now() - interval '24 hours') then
    raise exception using errcode = '42501', message = 'activity_edit_window_closed';
  end if;
  if actor_role not in ('admin', 'leader', 'sale') then
    raise exception using errcode = '42501', message = 'activity_update_denied';
  end if;
  if new_occurred_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'activity_time_in_future';
  end if;
  update public.activities
  set outcome = new_outcome, content = nullif(trim(new_content), ''), occurred_at = new_occurred_at,
      is_late_entry = new_occurred_at < created_at - interval '24 hours'
  where id = target_activity_id;
end;
$$;

create or replace function public.soft_delete_activity(target_activity_id uuid, delete_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.app_role := public.current_app_role();
  current_activity public.activities%rowtype;
begin
  select * into current_activity from public.activities where id = target_activity_id and deleted_at is null for update;
  if not found or actor_id is null or not public.can_access_customer(current_activity.customer_id) then
    raise exception using errcode = '42501', message = 'activity_delete_denied';
  end if;
  if current_activity.type in ('customer_created', 'status_change', 'assignment_change', 'registration') then
    raise exception using errcode = '42501', message = 'system_activity_delete_denied';
  end if;
  if actor_role = 'sale' and (current_activity.performed_by <> actor_id or current_activity.created_at < now() - interval '24 hours') then
    raise exception using errcode = '42501', message = 'activity_edit_window_closed';
  end if;
  if char_length(trim(coalesce(delete_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'activity_delete_reason_required';
  end if;
  update public.activities
  set deleted_at = now(), deleted_by = actor_id, deleted_reason = trim(delete_reason)
  where id = target_activity_id;
end;
$$;

drop function public.transfer_customer(uuid, uuid, text);
create or replace function public.transfer_customer(
  target_customer_id uuid,
  new_owner_user_id uuid,
  transfer_reason text,
  task_policy text default 'reassign'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.app_role := public.current_app_role();
  actor_team uuid := public.current_team_id();
  current_customer public.customers%rowtype;
  new_owner_team uuid;
  open_task record;
begin
  if actor_id is null or actor_role not in ('admin', 'leader') then raise exception using errcode = '42501', message = 'transfer_denied'; end if;
  if char_length(trim(coalesce(transfer_reason, ''))) < 3 then raise exception using errcode = '22023', message = 'transfer_reason_required'; end if;
  if task_policy not in ('reassign', 'cancel') then raise exception using errcode = '22023', message = 'invalid_task_policy'; end if;
  select * into current_customer from public.customers where id = target_customer_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'customer_not_found'; end if;
  if actor_role = 'leader' and current_customer.team_id <> actor_team then raise exception using errcode = '42501', message = 'cross_team_transfer_denied'; end if;
  select p.team_id into new_owner_team from public.profiles p where p.id = new_owner_user_id and p.is_active and p.role = 'sale';
  if new_owner_team is null then raise exception using errcode = '22023', message = 'invalid_customer_owner'; end if;
  if actor_role = 'leader' and new_owner_team <> actor_team then raise exception using errcode = '42501', message = 'cross_team_transfer_denied'; end if;
  if current_customer.owner_user_id = new_owner_user_id then return; end if;

  update public.customer_assignments set ended_at = now() where customer_id = target_customer_id and ended_at is null;
  insert into public.customer_assignments(customer_id, assignee_user_id, team_id, reason, assigned_by)
  values (target_customer_id, new_owner_user_id, new_owner_team, trim(transfer_reason), actor_id);

  for open_task in select * from public.follow_up_tasks where customer_id = target_customer_id and status = 'pending' for update loop
    if task_policy = 'reassign' then
      update public.follow_up_tasks set assignee_user_id = new_owner_user_id where id = open_task.id;
      insert into public.follow_up_task_events(task_id, event_type, previous_assignee_user_id, new_assignee_user_id, reason, actor_user_id)
      values (open_task.id, 'reassigned', open_task.assignee_user_id, new_owner_user_id, trim(transfer_reason), actor_id);
    else
      update public.follow_up_tasks set status = 'cancelled', completed_at = now(), completion_reason = trim(transfer_reason) where id = open_task.id;
      insert into public.follow_up_task_events(task_id, event_type, previous_due_at, reason, actor_user_id)
      values (open_task.id, 'cancelled', open_task.due_at, trim(transfer_reason), actor_id);
    end if;
  end loop;

  update public.customers set owner_user_id = new_owner_user_id, team_id = new_owner_team where id = target_customer_id;
  insert into public.activities(customer_id, type, content, occurred_at, performed_by, created_by, updated_by)
  values (target_customer_id, 'assignment_change', trim(transfer_reason), now(), actor_id, actor_id, actor_id);
end;
$$;

create or replace function public.create_customer_with_assignment(
  customer_full_name text,
  customer_phone text,
  customer_email text,
  customer_source_id uuid,
  customer_priority public.customer_priority default 'normal',
  customer_note_summary text default null,
  customer_owner_user_id uuid default null,
  customer_team_id uuid default null,
  customer_tag_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid()); actor_role public.app_role := public.current_app_role(); actor_team uuid := public.current_team_id();
  effective_owner uuid; effective_team uuid; owner_team uuid; new_customer_id uuid;
begin
  if actor_id is null or not public.is_active_user() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  if nullif(trim(customer_phone), '') is null and nullif(trim(customer_email), '') is null then raise exception using errcode = '22023', message = 'customer_contact_required'; end if;
  if not exists (select 1 from public.lead_sources s where s.id = customer_source_id and s.is_active) then raise exception using errcode = '22023', message = 'invalid_lead_source'; end if;
  if actor_role = 'sale' then effective_owner := actor_id; effective_team := actor_team;
  elsif actor_role = 'leader' then effective_owner := customer_owner_user_id; effective_team := actor_team;
  elsif actor_role = 'admin' then effective_owner := customer_owner_user_id; effective_team := customer_team_id;
  else raise exception using errcode = '42501', message = 'not_authorized'; end if;
  if effective_owner is not null then
    select p.team_id into owner_team from public.profiles p where p.id = effective_owner and p.is_active and p.role = 'sale';
    if owner_team is null then raise exception using errcode = '22023', message = 'invalid_customer_owner'; end if;
    if effective_team is null then effective_team := owner_team; end if;
    if effective_team <> owner_team then raise exception using errcode = '22023', message = 'owner_team_mismatch'; end if;
  end if;
  if effective_team is null or not exists (select 1 from public.teams t where t.id = effective_team and t.is_active) then raise exception using errcode = '22023', message = 'invalid_customer_team'; end if;
  if actor_role = 'leader' and effective_team <> actor_team then raise exception using errcode = '42501', message = 'cross_team_assignment_denied'; end if;
  if exists (select 1 from unnest(customer_tag_ids) tag_id where not exists (select 1 from public.customer_tags t where t.id = tag_id and t.is_active)) then raise exception using errcode = '22023', message = 'invalid_customer_tag'; end if;
  begin
    insert into public.customers(full_name, phone, email, source_id, owner_user_id, team_id, priority, note_summary, created_by, updated_by)
    values (trim(customer_full_name), nullif(trim(customer_phone), ''), nullif(trim(customer_email), ''), customer_source_id, effective_owner, effective_team, customer_priority, nullif(trim(customer_note_summary), ''), actor_id, actor_id)
    returning id into new_customer_id;
  exception when unique_violation then raise exception using errcode = '23505', message = 'customer_duplicate'; end;
  insert into public.customer_tag_links(customer_id, tag_id, created_by) select new_customer_id, tag_id, actor_id from unnest(customer_tag_ids) tag_id;
  if effective_owner is not null then
    insert into public.customer_assignments(customer_id, assignee_user_id, team_id, reason, assigned_by)
    values (new_customer_id, effective_owner, effective_team, 'Tạo mới và giao khách', actor_id);
  end if;
  insert into public.activities(customer_id, type, content, occurred_at, performed_by, created_by, updated_by)
  values (new_customer_id, 'customer_created', 'Khách hàng được tạo trên IM CRM', now(), actor_id, actor_id, actor_id);
  return new_customer_id;
end;
$$;

create or replace function public.soft_delete_customer(target_customer_id uuid, delete_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid()); actor_role public.app_role := public.current_app_role();
  actor_team uuid := public.current_team_id(); customer_team uuid; open_task record;
begin
  if actor_id is null or actor_role not in ('admin', 'leader') then raise exception using errcode = '42501', message = 'delete_denied'; end if;
  if char_length(trim(coalesce(delete_reason, ''))) < 3 then raise exception using errcode = '22023', message = 'delete_reason_required'; end if;
  select team_id into customer_team from public.customers where id = target_customer_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'customer_not_found'; end if;
  if actor_role = 'leader' and customer_team <> actor_team then raise exception using errcode = '42501', message = 'cross_team_delete_denied'; end if;
  for open_task in select * from public.follow_up_tasks where customer_id = target_customer_id and status = 'pending' for update loop
    update public.follow_up_tasks set status = 'cancelled', completed_at = now(), completion_reason = trim(delete_reason) where id = open_task.id;
    insert into public.follow_up_task_events(task_id, event_type, previous_due_at, reason, actor_user_id)
    values (open_task.id, 'cancelled', open_task.due_at, trim(delete_reason), actor_id);
  end loop;
  update public.customer_assignments set ended_at = now() where customer_id = target_customer_id and ended_at is null;
  update public.customers set deleted_at = now(), deleted_by = actor_id, deleted_reason = trim(delete_reason) where id = target_customer_id;
end;
$$;

alter table public.activities enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.follow_up_task_events enable row level security;

create policy activities_select_by_customer on public.activities
for select to authenticated using (
  (deleted_at is null and public.can_access_customer(customer_id))
  or (public.is_admin() and exists (select 1 from public.customers c where c.id = customer_id))
);

create policy follow_up_tasks_select_by_scope on public.follow_up_tasks
for select to authenticated using (
  public.is_admin()
  or (public.is_leader() and public.can_access_customer(customer_id))
  or (public.current_app_role() = 'sale' and assignee_user_id = (select auth.uid()) and public.can_access_customer(customer_id))
);

create policy follow_up_task_events_select_by_task on public.follow_up_task_events
for select to authenticated using (public.can_access_follow_up_task(task_id));

revoke all on public.activities, public.follow_up_tasks, public.follow_up_task_events from anon, authenticated;
grant select on public.activities, public.follow_up_tasks, public.follow_up_task_events to authenticated;

revoke all on function public.can_access_follow_up_task(uuid) from public;
revoke all on function public.record_activity_with_follow_up(uuid, public.activity_type, public.activity_outcome, text, timestamptz, text, timestamptz, public.customer_priority) from public;
revoke all on function public.manage_follow_up_task(uuid, text, text, timestamptz) from public;
revoke all on function public.update_activity(uuid, public.activity_outcome, text, timestamptz) from public;
revoke all on function public.soft_delete_activity(uuid, text) from public;
revoke all on function public.transfer_customer(uuid, uuid, text, text) from public;

grant execute on function public.can_access_follow_up_task(uuid) to authenticated;
grant execute on function public.record_activity_with_follow_up(uuid, public.activity_type, public.activity_outcome, text, timestamptz, text, timestamptz, public.customer_priority) to authenticated;
grant execute on function public.manage_follow_up_task(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.update_activity(uuid, public.activity_outcome, text, timestamptz) to authenticated;
grant execute on function public.soft_delete_activity(uuid, text) to authenticated;
grant execute on function public.transfer_customer(uuid, uuid, text, text) to authenticated;

comment on table public.activities is 'Timeline chăm sóc; activity hệ thống chỉ được tạo qua RPC đặc quyền.';
comment on table public.follow_up_tasks is 'Lịch follow-up theo assignee; trạng thái thay đổi qua RPC và có event history.';
