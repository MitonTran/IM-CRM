-- M4: mục tiêu KPI và hàm tổng hợp dashboard có kiểm tra scope rõ ràng.

create type public.kpi_metric_code as enum (
  'new_customers', 'contact_attempts', 'successful_contacts', 'appointments',
  'consultations', 'tasks_on_time', 'won_customers', 'revenue_vnd'
);
create type public.kpi_scope_type as enum ('user', 'team');
create type public.kpi_period_type as enum ('day', 'month', 'year');

create table public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  metric_code public.kpi_metric_code not null,
  scope_type public.kpi_scope_type not null,
  user_id uuid references public.profiles(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  period_type public.kpi_period_type not null,
  period_start date not null,
  period_end date not null,
  target_value numeric(18, 2) not null check (target_value >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint kpi_targets_scope_consistent check (
    (scope_type = 'user' and user_id is not null and team_id is null)
    or (scope_type = 'team' and team_id is not null and user_id is null)
  ),
  constraint kpi_targets_period_order check (period_end >= period_start)
);

create unique index kpi_targets_user_period_unique
  on public.kpi_targets(metric_code, user_id, period_type, period_start, period_end)
  where scope_type = 'user';
create unique index kpi_targets_team_period_unique
  on public.kpi_targets(metric_code, team_id, period_type, period_start, period_end)
  where scope_type = 'team';
create index kpi_targets_period_idx on public.kpi_targets(period_type, period_start, period_end);

create trigger kpi_targets_set_audit_fields before update on public.kpi_targets
for each row execute function public.set_audit_fields();
create trigger kpi_targets_audit after insert or update or delete on public.kpi_targets
for each row execute function public.write_audit_log();

create or replace function public.assert_kpi_filter_scope(filter_user_id uuid, filter_team_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare actor_id uuid := (select auth.uid()); actor_role public.app_role := public.current_app_role(); actor_team uuid := public.current_team_id();
begin
  if actor_id is null or not public.is_active_user() then raise exception using errcode = '42501', message = 'kpi_access_denied'; end if;
  if actor_role = 'sale' then
    if (filter_user_id is not null and filter_user_id <> actor_id) or (filter_team_id is not null and filter_team_id <> actor_team) then
      raise exception using errcode = '42501', message = 'kpi_filter_scope_denied';
    end if;
  elsif actor_role = 'leader' then
    if filter_team_id is not null and filter_team_id <> actor_team then raise exception using errcode = '42501', message = 'kpi_filter_scope_denied'; end if;
    if filter_user_id is not null and not exists (select 1 from public.profiles p where p.id = filter_user_id and p.team_id = actor_team and p.is_active) then
      raise exception using errcode = '42501', message = 'kpi_filter_scope_denied';
    end if;
  elsif actor_role <> 'admin' then raise exception using errcode = '42501', message = 'kpi_access_denied';
  end if;
end;
$$;

create or replace function public.get_kpi_summary(
  range_start timestamptz,
  range_end timestamptz,
  filter_user_id uuid default null,
  filter_team_id uuid default null,
  filter_source_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid()); actor_role public.app_role := public.current_app_role(); actor_team uuid := public.current_team_id();
  result jsonb;
begin
  perform public.assert_kpi_filter_scope(filter_user_id, filter_team_id);
  if range_start is null or range_end is null or range_end <= range_start then raise exception using errcode = '22023', message = 'invalid_kpi_range'; end if;

  with scoped_customers as (
    select c.* from public.customers c
    where c.deleted_at is null
      and (actor_role = 'admin' or (actor_role = 'leader' and c.team_id = actor_team) or (actor_role = 'sale' and c.owner_user_id = actor_id))
      and (filter_user_id is null or c.owner_user_id = filter_user_id)
      and (filter_team_id is null or c.team_id = filter_team_id)
      and (filter_source_id is null or c.source_id = filter_source_id)
  ),
  scoped_activities as (
    select a.* from public.activities a
    join public.customers c on c.id = a.customer_id and c.deleted_at is null
    join public.profiles performer on performer.id = a.performed_by
    where a.deleted_at is null
      and (actor_role = 'admin' or (actor_role = 'leader' and performer.team_id = actor_team) or (actor_role = 'sale' and a.performed_by = actor_id))
      and (filter_user_id is null or a.performed_by = filter_user_id)
      and (filter_team_id is null or performer.team_id = filter_team_id)
      and (filter_source_id is null or c.source_id = filter_source_id)
  ),
  scoped_tasks as (
    select task.* from public.follow_up_tasks task
    join public.customers c on c.id = task.customer_id and c.deleted_at is null
    join public.profiles assignee on assignee.id = task.assignee_user_id
    where (actor_role = 'admin' or (actor_role = 'leader' and assignee.team_id = actor_team) or (actor_role = 'sale' and task.assignee_user_id = actor_id))
      and (filter_user_id is null or task.assignee_user_id = filter_user_id)
      and (filter_team_id is null or assignee.team_id = filter_team_id)
      and (filter_source_id is null or c.source_id = filter_source_id)
  ),
  scoped_deals as (
    select d.* from public.deals d
    join public.customers c on c.id = d.customer_id and c.deleted_at is null
    where d.status = 'active'
      and (actor_role = 'admin' or (actor_role = 'leader' and d.team_id = actor_team) or (actor_role = 'sale' and d.owner_user_id = actor_id))
      and (filter_user_id is null or d.owner_user_id = filter_user_id)
      and (filter_team_id is null or d.team_id = filter_team_id)
      and (filter_source_id is null or c.source_id = filter_source_id)
  ),
  attempts as (
    select customer_id from scoped_activities where type in ('call', 'message') and occurred_at >= range_start and occurred_at < range_end
  ), successes as (
    select customer_id from scoped_activities where type in ('call', 'message') and outcome in ('connected', 'replied') and occurred_at >= range_start and occurred_at < range_end
  ), appointments_set as (
    select distinct customer_id from scoped_activities where outcome = 'booked' and occurred_at >= range_start and occurred_at < range_end
  ), consultations_set as (
    select distinct customer_id from scoped_activities where type = 'consultation' and outcome in ('completed', 'interested', 'objection') and occurred_at >= range_start and occurred_at < range_end
  ), wins as (
    select distinct customer_id from scoped_deals where registered_at >= range_start and registered_at < range_end
  )
  select jsonb_build_object(
    'new_customers', (select count(*) from scoped_customers where created_at >= range_start and created_at < range_end),
    'contact_attempts', (select count(*) from scoped_activities where type in ('call', 'message') and occurred_at >= range_start and occurred_at < range_end),
    'successful_contacts', (select count(*) from scoped_activities where type in ('call', 'message') and outcome in ('connected', 'replied') and occurred_at >= range_start and occurred_at < range_end),
    'appointments', (select count(*) from scoped_activities where outcome = 'booked' and occurred_at >= range_start and occurred_at < range_end),
    'consultations', (select count(*) from scoped_activities where type = 'consultation' and outcome in ('completed', 'interested', 'objection') and occurred_at >= range_start and occurred_at < range_end),
    'late_entries', (select count(*) from scoped_activities where is_late_entry and occurred_at >= range_start and occurred_at < range_end),
    'tasks_completed', (select count(*) from scoped_tasks where status = 'completed' and completed_at >= range_start and completed_at < range_end),
    'tasks_on_time', (select count(*) from scoped_tasks where status = 'completed' and completed_at <= due_at and completed_at >= range_start and completed_at < range_end),
    'overdue_now', (select count(*) from scoped_tasks where status = 'pending' and due_at < now()),
    'won_customers', (select count(*) from wins),
    'revenue_vnd', coalesce((select sum(amount_vnd) from scoped_deals where registered_at >= range_start and registered_at < range_end), 0),
    'contact_rate', (select case when (select count(*) from attempts) = 0 then null else round((select count(*) from successes)::numeric * 100 / (select count(*) from attempts), 2) end),
    'appointment_to_consultation_rate', (select case when (select count(*) from appointments_set) = 0 then null else round((select count(*) from consultations_set)::numeric * 100 / (select count(*) from appointments_set), 2) end),
    'consultation_to_win_rate', (select case when (select count(*) from consultations_set) = 0 then null else round((select count(*) from wins)::numeric * 100 / (select count(*) from consultations_set), 2) end)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_kpi_leaderboard(
  range_start timestamptz,
  range_end timestamptz,
  filter_team_id uuid default null,
  filter_source_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare actor_role public.app_role := public.current_app_role(); actor_team uuid := public.current_team_id(); effective_team uuid; result jsonb;
begin
  if actor_role = 'sale' or actor_role is null then raise exception using errcode = '42501', message = 'kpi_leaderboard_denied'; end if;
  effective_team := case when actor_role = 'leader' then actor_team else filter_team_id end;
  if actor_role = 'leader' and filter_team_id is not null and filter_team_id <> actor_team then raise exception using errcode = '42501', message = 'kpi_filter_scope_denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.revenue_vnd desc, row_data.successful_contacts desc), '[]'::jsonb)
  into result
  from (
    select p.id as user_id, p.full_name,
      (select count(*) from public.activities a join public.customers c on c.id = a.customer_id and c.deleted_at is null where a.performed_by = p.id and a.deleted_at is null and a.type in ('call','message') and a.occurred_at >= range_start and a.occurred_at < range_end and (filter_source_id is null or c.source_id = filter_source_id)) as contact_attempts,
      (select count(*) from public.activities a join public.customers c on c.id = a.customer_id and c.deleted_at is null where a.performed_by = p.id and a.deleted_at is null and a.type in ('call','message') and a.outcome in ('connected','replied') and a.occurred_at >= range_start and a.occurred_at < range_end and (filter_source_id is null or c.source_id = filter_source_id)) as successful_contacts,
      (select count(distinct d.customer_id) from public.deals d join public.customers c on c.id = d.customer_id and c.deleted_at is null where d.owner_user_id = p.id and d.status = 'active' and d.registered_at >= range_start and d.registered_at < range_end and (filter_source_id is null or c.source_id = filter_source_id)) as won_customers,
      coalesce((select sum(d.amount_vnd) from public.deals d join public.customers c on c.id = d.customer_id and c.deleted_at is null where d.owner_user_id = p.id and d.status = 'active' and d.registered_at >= range_start and d.registered_at < range_end and (filter_source_id is null or c.source_id = filter_source_id)), 0) as revenue_vnd,
      (select count(*) from public.follow_up_tasks task join public.customers c on c.id = task.customer_id and c.deleted_at is null where task.assignee_user_id = p.id and task.status = 'pending' and task.due_at < now() and (filter_source_id is null or c.source_id = filter_source_id)) as overdue_now
    from public.profiles p
    where p.role = 'sale' and p.is_active and (effective_team is null or p.team_id = effective_team)
  ) row_data;
  return result;
end;
$$;

create or replace function public.upsert_kpi_target(
  target_metric public.kpi_metric_code,
  target_scope public.kpi_scope_type,
  target_user_id uuid,
  target_team_id uuid,
  target_period public.kpi_period_type,
  target_period_start date,
  target_period_end date,
  target_value numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor_id uuid := (select auth.uid()); actor_role public.app_role := public.current_app_role(); actor_team uuid := public.current_team_id(); result_id uuid;
begin
  if actor_role not in ('leader', 'admin') then raise exception using errcode = '42501', message = 'kpi_target_write_denied'; end if;
  if target_value is null or target_value < 0 or target_period_end < target_period_start then raise exception using errcode = '22023', message = 'invalid_kpi_target'; end if;
  if target_scope = 'user' then
    if target_user_id is null or target_team_id is not null or not exists (select 1 from public.profiles p where p.id = target_user_id and p.role = 'sale' and p.is_active and (actor_role = 'admin' or p.team_id = actor_team)) then
      raise exception using errcode = '42501', message = 'kpi_target_scope_denied';
    end if;
    insert into public.kpi_targets(metric_code, scope_type, user_id, period_type, period_start, period_end, target_value, created_by, updated_by)
    values (target_metric, 'user', target_user_id, target_period, target_period_start, target_period_end, target_value, actor_id, actor_id)
    on conflict (metric_code, user_id, period_type, period_start, period_end) where scope_type = 'user'
    do update set target_value = excluded.target_value
    returning id into result_id;
  else
    if target_team_id is null or target_user_id is not null or (actor_role = 'leader' and target_team_id <> actor_team) then raise exception using errcode = '42501', message = 'kpi_target_scope_denied'; end if;
    insert into public.kpi_targets(metric_code, scope_type, team_id, period_type, period_start, period_end, target_value, created_by, updated_by)
    values (target_metric, 'team', target_team_id, target_period, target_period_start, target_period_end, target_value, actor_id, actor_id)
    on conflict (metric_code, team_id, period_type, period_start, period_end) where scope_type = 'team'
    do update set target_value = excluded.target_value
    returning id into result_id;
  end if;
  return result_id;
end;
$$;

alter table public.kpi_targets enable row level security;
create policy kpi_targets_select_by_scope on public.kpi_targets
for select to authenticated using (
  public.is_admin()
  or (public.current_app_role() = 'sale' and scope_type = 'user' and user_id = (select auth.uid()))
  or (public.is_leader() and (
    (scope_type = 'team' and team_id = public.current_team_id())
    or (scope_type = 'user' and exists (select 1 from public.profiles p where p.id = user_id and p.team_id = public.current_team_id()))
  ))
);

revoke all on public.kpi_targets from anon, authenticated;
grant select on public.kpi_targets to authenticated;
revoke all on function public.assert_kpi_filter_scope(uuid, uuid) from public;
revoke all on function public.get_kpi_summary(timestamptz, timestamptz, uuid, uuid, uuid) from public;
revoke all on function public.get_kpi_leaderboard(timestamptz, timestamptz, uuid, uuid) from public;
revoke all on function public.upsert_kpi_target(public.kpi_metric_code, public.kpi_scope_type, uuid, uuid, public.kpi_period_type, date, date, numeric) from public;
grant execute on function public.get_kpi_summary(timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_kpi_leaderboard(timestamptz, timestamptz, uuid, uuid) to authenticated;
grant execute on function public.upsert_kpi_target(public.kpi_metric_code, public.kpi_scope_type, uuid, uuid, public.kpi_period_type, date, date, numeric) to authenticated;

comment on function public.get_kpi_summary is 'Tổng hợp KPI theo occurred_at/registered_at và scope actor; filter chỉ được thu hẹp quyền.';
