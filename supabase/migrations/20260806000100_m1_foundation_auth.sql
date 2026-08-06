-- M1: tổ chức, hồ sơ người dùng, quyền nền tảng và audit bất biến.

create type public.app_role as enum ('admin', 'leader', 'sale');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint teams_name_unique unique (name)
);

create unique index teams_name_lower_unique on public.teams (lower(name));
create index teams_active_idx on public.teams (is_active) where is_active;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role public.app_role not null default 'sale',
  team_id uuid references public.teams(id) on delete restrict,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint non_admin_requires_team check (not is_active or role = 'admin' or team_id is not null)
);

alter table public.teams
  add column leader_user_id uuid references public.profiles(id) on delete set null;

create index profiles_team_active_idx on public.profiles (team_id, is_active);
create index profiles_role_idx on public.profiles (role);
create unique index teams_one_leader_unique on public.teams (leader_user_id) where leader_user_id is not null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_created_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_action_created_idx on public.audit_logs (action, created_at desc);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active;
$$;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.team_id from public.profiles p where p.id = (select auth.uid()) and p.is_active;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce(public.current_app_role() = 'admin', false); $$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce(public.current_app_role() = 'leader', false); $$;

revoke all on function public.current_app_role() from public;
revoke all on function public.current_team_id() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_leader() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_leader() to authenticated;

create or replace function public.set_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger profiles_set_audit_fields before update on public.profiles
for each row execute function public.set_audit_fields();
create trigger teams_set_audit_fields before update on public.teams
for each row execute function public.set_audit_fields();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_id uuid;
begin
  row_id := coalesce(new.id, old.id);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    row_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function public.write_audit_log();
create trigger teams_audit after insert or update or delete on public.teams
for each row execute function public.write_audit_log();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proposed_name text;
begin
  proposed_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)));
  if char_length(proposed_name) < 2 then proposed_name := 'Thành viên mới'; end if;

  insert into public.profiles(id, full_name, role, is_active)
  values (new.id, proposed_name, 'sale', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self_team_or_admin on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or public.is_admin()
  or (public.is_leader() and team_id = public.current_team_id())
);

create policy profiles_update_admin_only on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy teams_select_own_or_admin on public.teams
for select to authenticated
using (public.is_admin() or (public.is_active_user() and id = public.current_team_id()));

create policy teams_insert_admin_only on public.teams
for insert to authenticated with check (public.is_admin());
create policy teams_update_admin_only on public.teams
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy teams_delete_admin_only on public.teams
for delete to authenticated using (public.is_admin());

create policy audit_logs_select_admin_only on public.audit_logs
for select to authenticated using (public.is_admin());

revoke all on public.teams, public.profiles, public.audit_logs from anon;
grant select on public.teams, public.profiles to authenticated;
grant insert, update, delete on public.teams to authenticated;
grant update on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;

comment on table public.profiles is 'Hồ sơ nội bộ nối 1-1 với auth.users; quyền không lấy từ client metadata.';
comment on table public.audit_logs is 'Lịch sử bất biến; client không có quyền insert/update/delete.';
