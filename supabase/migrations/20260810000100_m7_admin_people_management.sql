-- M7: quản trị team/thành viên bằng khóa mềm, giữ lịch sử và chặn bypass guardrail.

drop policy if exists teams_delete_admin_only on public.teams;

revoke update on public.profiles from authenticated;
revoke update, delete on public.teams from authenticated;

create or replace function public.admin_manage_team(
  target_team_id uuid,
  managed_name text,
  managed_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_name text := trim(managed_name);
  current_name text;
  current_is_active boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'team_manage_denied';
  end if;

  if target_team_id is null or managed_is_active is null
    or normalized_name is null or char_length(normalized_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'team_manage_input_invalid';
  end if;

  select t.name, t.is_active
    into current_name, current_is_active
  from public.teams t
  where t.id = target_team_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'team_manage_not_found';
  end if;

  if current_is_active and not managed_is_active then
    if exists (
      select 1 from public.profiles p
      where p.team_id = target_team_id and p.is_active
    ) then
      raise exception using errcode = '55000', message = 'team_manage_active_members';
    end if;

    if exists (
      select 1 from public.customers c
      where c.team_id = target_team_id and c.deleted_at is null
    ) then
      raise exception using errcode = '55000', message = 'team_manage_active_customers';
    end if;
  end if;

  if current_name = normalized_name and current_is_active = managed_is_active then
    return;
  end if;

  begin
    update public.teams
    set
      name = normalized_name,
      is_active = managed_is_active,
      leader_user_id = case when managed_is_active then leader_user_id else null end
    where id = target_team_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'team_manage_name_taken';
  end;
end;
$$;

create or replace function public.admin_manage_profile(
  target_user_id uuid,
  managed_full_name text,
  managed_role public.app_role,
  managed_team_id uuid,
  managed_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_name text := trim(managed_full_name);
  normalized_team_id uuid := case when managed_role = 'admin' then null else managed_team_id end;
  current_profile public.profiles%rowtype;
  selected_team_is_active boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'profile_manage_denied';
  end if;

  if target_user_id is null or managed_role is null or managed_is_active is null
    or normalized_name is null or char_length(normalized_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'profile_manage_input_invalid';
  end if;

  select p.*
    into current_profile
  from public.profiles p
  where p.id = target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile_manage_not_found';
  end if;

  if managed_role <> 'admin' and normalized_team_id is null then
    raise exception using errcode = '22023', message = 'profile_manage_team_required';
  end if;

  if normalized_team_id is not null then
    select t.is_active
      into selected_team_is_active
    from public.teams t
    where t.id = normalized_team_id;

    if not found or (managed_is_active and not selected_team_is_active) then
      raise exception using errcode = '22023', message = 'profile_manage_team_invalid';
    end if;
  end if;

  if target_user_id = actor_id and (
    managed_role <> current_profile.role
    or normalized_team_id is distinct from current_profile.team_id
    or managed_is_active <> current_profile.is_active
  ) then
    raise exception using errcode = '42501', message = 'profile_manage_self_privileges';
  end if;

  if current_profile.role = 'sale' and (
    managed_role <> 'sale'
    or normalized_team_id is distinct from current_profile.team_id
    or not managed_is_active
  ) then
    if exists (
      select 1 from public.customers c
      where c.owner_user_id = target_user_id and c.deleted_at is null
    ) then
      raise exception using errcode = '55000', message = 'profile_manage_active_customers';
    end if;

    if exists (
      select 1 from public.follow_up_tasks f
      where f.assignee_user_id = target_user_id and f.status = 'pending'
    ) then
      raise exception using errcode = '55000', message = 'profile_manage_pending_tasks';
    end if;
  end if;

  if normalized_name = current_profile.full_name
    and managed_role = current_profile.role
    and normalized_team_id is not distinct from current_profile.team_id
    and managed_is_active = current_profile.is_active then
    return;
  end if;

  update public.teams
  set leader_user_id = null
  where leader_user_id = target_user_id
    and (
      not managed_is_active
      or managed_role <> 'leader'
      or id is distinct from normalized_team_id
    );

  update public.profiles
  set
    full_name = normalized_name,
    role = managed_role,
    team_id = normalized_team_id,
    is_active = managed_is_active
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_manage_team(uuid, text, boolean) from public;
revoke all on function public.admin_manage_profile(uuid, text, public.app_role, uuid, boolean) from public;
grant execute on function public.admin_manage_team(uuid, text, boolean) to authenticated;
grant execute on function public.admin_manage_profile(uuid, text, public.app_role, uuid, boolean) to authenticated;

comment on function public.admin_manage_team(uuid, text, boolean) is
  'Admin-only: đổi tên hoặc ngừng/kích hoạt team; không xóa cứng và chặn team còn thành viên/khách hoạt động.';
comment on function public.admin_manage_profile(uuid, text, public.app_role, uuid, boolean) is
  'Admin-only: đổi tên, role, team hoặc khóa/kích hoạt profile; giữ lịch sử và chặn bỏ rơi khách/task.';
