-- M7: phục hồi lời mời Auth theo cách idempotent và không tin cậy user metadata cho quyền.

create or replace function public.configure_invited_profile(
  target_user_id uuid,
  invited_full_name text,
  invited_role public.app_role,
  invited_team_id uuid,
  activate_profile boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_exists boolean;
  target_is_active boolean;
  affected_rows integer;
  normalized_name text := trim(invited_full_name);
  normalized_team_id uuid := case when invited_role = 'admin' then null else invited_team_id end;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'invitation_profile_manage_denied';
  end if;

  if target_user_id is null or invited_role is null or activate_profile is null then
    raise exception using errcode = '22023', message = 'invitation_profile_input_invalid';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invitation_full_name_invalid';
  end if;

  if invited_role <> 'admin' and normalized_team_id is null then
    raise exception using errcode = '22023', message = 'invitation_team_required';
  end if;

  if normalized_team_id is not null and not exists (
    select 1 from public.teams t where t.id = normalized_team_id and t.is_active
  ) then
    raise exception using errcode = '22023', message = 'invitation_team_invalid';
  end if;

  select true, p.is_active
    into target_exists, target_is_active
  from public.profiles p
  where p.id = target_user_id
  for update;

  if coalesce(target_exists, false) and target_is_active then
    raise exception using errcode = '55000', message = 'invitation_profile_already_active';
  end if;

  insert into public.profiles(id, full_name, role, team_id, is_active, created_by, updated_by)
  values (
    target_user_id,
    normalized_name,
    invited_role,
    normalized_team_id,
    activate_profile,
    (select auth.uid()),
    (select auth.uid())
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    team_id = excluded.team_id,
    is_active = excluded.is_active
  where not public.profiles.is_active;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception using errcode = '55000', message = 'invitation_profile_already_active';
  end if;
end;
$$;

revoke all on function public.configure_invited_profile(uuid, text, public.app_role, uuid, boolean) from public;
grant execute on function public.configure_invited_profile(uuid, text, public.app_role, uuid, boolean) to authenticated;

comment on function public.configure_invited_profile(uuid, text, public.app_role, uuid, boolean) is
  'Admin-only RPC: chuẩn hóa hồ sơ Auth chưa kích hoạt và chỉ kích hoạt sau khi email mời được gửi thành công.';
