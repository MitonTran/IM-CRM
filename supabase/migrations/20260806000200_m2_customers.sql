-- M2: nguồn khách, khách hàng, nhãn, lịch sử phân công và RLS theo vai trò.

create extension if not exists pg_trgm with schema extensions;

create type public.customer_status as enum (
  'new',
  'contacting',
  'consulting',
  'follow_up',
  'won',
  'lost',
  'unqualified'
);

create type public.customer_priority as enum ('low', 'normal', 'high', 'urgent');

create or replace function public.normalize_customer_phone(value text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case
    when regexp_replace(value, '[^0-9]', '', 'g') like '84%'
      then '0' || substring(regexp_replace(value, '[^0-9]', '', 'g') from 3)
    else regexp_replace(value, '[^0-9]', '', 'g')
  end;
$$;

create or replace function public.normalize_customer_email(value text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$ select lower(trim(value)); $$;

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index lead_sources_name_lower_unique on public.lead_sources (lower(name));
create index lead_sources_active_idx on public.lead_sources (is_active) where is_active;

create table public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index customer_tags_name_lower_unique on public.customer_tags (lower(name));
create index customer_tags_active_idx on public.customer_tags (is_active) where is_active;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text,
  phone_normalized text generated always as (
    nullif(public.normalize_customer_phone(phone), '')
  ) stored,
  email text,
  email_normalized text generated always as (
    nullif(public.normalize_customer_email(email), '')
  ) stored,
  source_id uuid not null references public.lead_sources(id) on delete restrict,
  status public.customer_status not null default 'new',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  owner_user_id uuid references public.profiles(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  priority public.customer_priority not null default 'normal',
  note_summary text check (note_summary is null or char_length(note_summary) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_reason text check (deleted_reason is null or char_length(trim(deleted_reason)) between 3 and 500),
  constraint customers_contact_required check (phone_normalized is not null or email_normalized is not null),
  constraint customers_delete_fields_consistent check (
    (deleted_at is null and deleted_by is null and deleted_reason is null)
    or (deleted_at is not null and deleted_reason is not null)
  )
);

create unique index customers_phone_active_unique
  on public.customers (phone_normalized)
  where phone_normalized is not null and deleted_at is null;
create unique index customers_email_active_unique
  on public.customers (email_normalized)
  where email_normalized is not null and deleted_at is null;
create index customers_owner_status_idx on public.customers (owner_user_id, status) where deleted_at is null;
create index customers_team_status_idx on public.customers (team_id, status) where deleted_at is null;
create index customers_source_idx on public.customers (source_id) where deleted_at is null;
create index customers_updated_idx on public.customers (updated_at desc) where deleted_at is null;
create index customers_name_trgm_idx on public.customers using gin (full_name extensions.gin_trgm_ops);
create index customers_phone_trgm_idx on public.customers using gin (phone_normalized extensions.gin_trgm_ops);

create table public.customer_tag_links (
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (customer_id, tag_id)
);

create index customer_tag_links_tag_idx on public.customer_tag_links (tag_id, customer_id);

create table public.customer_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  assignee_user_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  assigned_by uuid references auth.users(id) on delete set null,
  constraint customer_assignments_time_order check (ended_at is null or ended_at >= started_at)
);

create unique index customer_assignments_one_open_unique
  on public.customer_assignments (customer_id)
  where ended_at is null;
create index customer_assignments_assignee_idx
  on public.customer_assignments (assignee_user_id, started_at desc);

create trigger lead_sources_set_audit_fields before update on public.lead_sources
for each row execute function public.set_audit_fields();
create trigger customer_tags_set_audit_fields before update on public.customer_tags
for each row execute function public.set_audit_fields();
create trigger customers_set_audit_fields before update on public.customers
for each row execute function public.set_audit_fields();

create trigger lead_sources_audit after insert or update or delete on public.lead_sources
for each row execute function public.write_audit_log();
create trigger customer_tags_audit after insert or update or delete on public.customer_tags
for each row execute function public.write_audit_log();
create trigger customer_assignments_audit after insert or update or delete on public.customer_assignments
for each row execute function public.write_audit_log();

create or replace function public.write_customer_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_safe jsonb;
  after_safe jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    before_safe := to_jsonb(old) - array['phone', 'phone_normalized', 'email', 'email_normalized', 'note_summary'];
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    after_safe := to_jsonb(new) - array['phone', 'phone_normalized', 'email', 'email_normalized', 'note_summary'];
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    (select auth.uid()),
    lower(tg_op),
    'customers',
    coalesce(new.id, old.id),
    before_safe,
    after_safe,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger customers_audit after insert or update or delete on public.customers
for each row execute function public.write_customer_audit_log();

create or replace function public.write_customer_tag_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end,
    'customers',
    coalesce(new.customer_id, old.customer_id),
    case when tg_op = 'DELETE' then jsonb_build_object('tag_id', old.tag_id) else null end,
    case when tg_op = 'INSERT' then jsonb_build_object('tag_id', new.tag_id) else null end,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
  return coalesce(new, old);
end;
$$;

create trigger customer_tag_links_audit after insert or delete on public.customer_tag_links
for each row execute function public.write_customer_tag_audit_log();

create or replace function public.can_access_customer(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and c.deleted_at is null
      and (
        public.is_admin()
        or (public.is_leader() and c.team_id = public.current_team_id())
        or (public.current_app_role() = 'sale' and c.owner_user_id = (select auth.uid()))
      )
  );
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
  actor_id uuid := (select auth.uid());
  actor_role public.app_role := public.current_app_role();
  actor_team uuid := public.current_team_id();
  effective_owner uuid;
  effective_team uuid;
  owner_team uuid;
  new_customer_id uuid;
begin
  if actor_id is null or not public.is_active_user() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if nullif(trim(customer_phone), '') is null and nullif(trim(customer_email), '') is null then
    raise exception using errcode = '22023', message = 'customer_contact_required';
  end if;
  if not exists (select 1 from public.lead_sources s where s.id = customer_source_id and s.is_active) then
    raise exception using errcode = '22023', message = 'invalid_lead_source';
  end if;

  if actor_role = 'sale' then
    effective_owner := actor_id;
    effective_team := actor_team;
  elsif actor_role = 'leader' then
    effective_owner := customer_owner_user_id;
    effective_team := actor_team;
  elsif actor_role = 'admin' then
    effective_owner := customer_owner_user_id;
    effective_team := customer_team_id;
  else
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if effective_owner is not null then
    select p.team_id into owner_team
    from public.profiles p
    where p.id = effective_owner and p.is_active and p.role = 'sale';
    if owner_team is null then
      raise exception using errcode = '22023', message = 'invalid_customer_owner';
    end if;
    if effective_team is null then effective_team := owner_team; end if;
    if effective_team <> owner_team then
      raise exception using errcode = '22023', message = 'owner_team_mismatch';
    end if;
  end if;

  if effective_team is null
    or not exists (select 1 from public.teams t where t.id = effective_team and t.is_active) then
    raise exception using errcode = '22023', message = 'invalid_customer_team';
  end if;

  if actor_role = 'leader' and effective_team <> actor_team then
    raise exception using errcode = '42501', message = 'cross_team_assignment_denied';
  end if;
  if exists (
    select 1 from unnest(customer_tag_ids) tag_id
    where not exists (select 1 from public.customer_tags t where t.id = tag_id and t.is_active)
  ) then
    raise exception using errcode = '22023', message = 'invalid_customer_tag';
  end if;

  begin
    insert into public.customers (
      full_name, phone, email, source_id, owner_user_id, team_id, priority,
      note_summary, created_by, updated_by
    ) values (
      trim(customer_full_name), nullif(trim(customer_phone), ''), nullif(trim(customer_email), ''),
      customer_source_id, effective_owner, effective_team, customer_priority,
      nullif(trim(customer_note_summary), ''), actor_id, actor_id
    ) returning id into new_customer_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'customer_duplicate';
  end;

  insert into public.customer_tag_links(customer_id, tag_id, created_by)
  select new_customer_id, tag_id, actor_id from unnest(customer_tag_ids) tag_id;

  if effective_owner is not null then
    insert into public.customer_assignments(
      customer_id, assignee_user_id, team_id, reason, assigned_by
    ) values (new_customer_id, effective_owner, effective_team, 'Tạo mới và giao khách', actor_id);
  end if;

  return new_customer_id;
end;
$$;

create or replace function public.transfer_customer(
  target_customer_id uuid,
  new_owner_user_id uuid,
  transfer_reason text
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
begin
  if actor_id is null or actor_role not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'transfer_denied';
  end if;
  if char_length(trim(coalesce(transfer_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'transfer_reason_required';
  end if;

  select * into current_customer
  from public.customers
  where id = target_customer_id and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'customer_not_found';
  end if;
  if actor_role = 'leader' and current_customer.team_id <> actor_team then
    raise exception using errcode = '42501', message = 'cross_team_transfer_denied';
  end if;

  select p.team_id into new_owner_team
  from public.profiles p
  where p.id = new_owner_user_id and p.is_active and p.role = 'sale';
  if new_owner_team is null then
    raise exception using errcode = '22023', message = 'invalid_customer_owner';
  end if;
  if actor_role = 'leader' and new_owner_team <> actor_team then
    raise exception using errcode = '42501', message = 'cross_team_transfer_denied';
  end if;
  if current_customer.owner_user_id = new_owner_user_id then return; end if;

  update public.customer_assignments
  set ended_at = now()
  where customer_id = target_customer_id and ended_at is null;

  insert into public.customer_assignments(
    customer_id, assignee_user_id, team_id, reason, assigned_by
  ) values (target_customer_id, new_owner_user_id, new_owner_team, trim(transfer_reason), actor_id);

  update public.customers
  set owner_user_id = new_owner_user_id, team_id = new_owner_team
  where id = target_customer_id;
end;
$$;

create or replace function public.soft_delete_customer(
  target_customer_id uuid,
  delete_reason text
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
  customer_team uuid;
begin
  if actor_id is null or actor_role not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'delete_denied';
  end if;
  if char_length(trim(coalesce(delete_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'delete_reason_required';
  end if;

  select team_id into customer_team
  from public.customers
  where id = target_customer_id and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'customer_not_found';
  end if;
  if actor_role = 'leader' and customer_team <> actor_team then
    raise exception using errcode = '42501', message = 'cross_team_delete_denied';
  end if;

  update public.customer_assignments set ended_at = now()
  where customer_id = target_customer_id and ended_at is null;
  update public.customers
  set deleted_at = now(), deleted_by = actor_id, deleted_reason = trim(delete_reason)
  where id = target_customer_id;
end;
$$;

create or replace function public.set_customer_tags(
  target_customer_id uuid,
  target_tag_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_tag_ids uuid[] := coalesce(target_tag_ids, '{}'::uuid[]);
begin
  if actor_id is null or not public.can_access_customer(target_customer_id) then
    raise exception using errcode = '42501', message = 'customer_tag_update_denied';
  end if;
  if cardinality(clean_tag_ids) > 10 then
    raise exception using errcode = '22023', message = 'too_many_customer_tags';
  end if;
  if exists (
    select 1 from unnest(clean_tag_ids) tag_id
    where not exists (select 1 from public.customer_tags t where t.id = tag_id and t.is_active)
  ) then
    raise exception using errcode = '22023', message = 'invalid_customer_tag';
  end if;

  delete from public.customer_tag_links link
  where link.customer_id = target_customer_id
    and not (link.tag_id = any(clean_tag_ids));

  insert into public.customer_tag_links(customer_id, tag_id, created_by)
  select target_customer_id, tag_id, actor_id
  from (select distinct unnest(clean_tag_ids) as tag_id) requested
  on conflict (customer_id, tag_id) do nothing;
end;
$$;

create or replace function public.customer_filter_facets(
  filter_q text default null,
  filter_status public.customer_status default null,
  filter_owner_id uuid default null,
  filter_team_id uuid default null,
  filter_source_id uuid default null,
  filter_tag_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with visible as (
    select c.status, c.source_id
    from public.customers c
    where c.deleted_at is null
      and (filter_q is null or trim(filter_q) = '' or c.full_name ilike '%' || trim(filter_q) || '%'
        or c.phone ilike '%' || trim(filter_q) || '%' or c.email ilike '%' || trim(filter_q) || '%')
      and (filter_status is null or c.status = filter_status)
      and (filter_owner_id is null or c.owner_user_id = filter_owner_id)
      and (filter_team_id is null or c.team_id = filter_team_id)
      and (filter_source_id is null or c.source_id = filter_source_id)
      and (filter_tag_id is null or exists (
        select 1 from public.customer_tag_links link
        where link.customer_id = c.id and link.tag_id = filter_tag_id
      ))
  )
  select jsonb_build_object(
    'status', coalesce((
      select jsonb_object_agg(group_key, total)
      from (select status::text as group_key, count(*)::int as total from visible group by status) grouped
    ), '{}'::jsonb),
    'source', coalesce((
      select jsonb_object_agg(group_key, total)
      from (select source_id::text as group_key, count(*)::int as total from visible group by source_id) grouped
    ), '{}'::jsonb)
  );
$$;

alter table public.lead_sources enable row level security;
alter table public.customer_tags enable row level security;
alter table public.customers enable row level security;
alter table public.customer_tag_links enable row level security;
alter table public.customer_assignments enable row level security;

create policy lead_sources_select_active_or_admin on public.lead_sources
for select to authenticated using (public.is_admin() or (public.is_active_user() and is_active));
create policy lead_sources_admin_insert on public.lead_sources
for insert to authenticated with check (public.is_admin());
create policy lead_sources_admin_update on public.lead_sources
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lead_sources_admin_delete on public.lead_sources
for delete to authenticated using (public.is_admin());

create policy customer_tags_select_active_or_admin on public.customer_tags
for select to authenticated using (public.is_admin() or (public.is_active_user() and is_active));
create policy customer_tags_admin_insert on public.customer_tags
for insert to authenticated with check (public.is_admin());
create policy customer_tags_admin_update on public.customer_tags
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy customer_tags_admin_delete on public.customer_tags
for delete to authenticated using (public.is_admin());

create policy customers_select_by_scope on public.customers
for select to authenticated
using (
  public.is_active_user()
  and (deleted_at is null or public.is_admin())
  and (
    public.is_admin()
    or (public.is_leader() and team_id = public.current_team_id())
    or (public.current_app_role() = 'sale' and owner_user_id = (select auth.uid()))
  )
);

create policy customers_update_by_scope on public.customers
for update to authenticated
using (
  deleted_at is null
  and (
    public.is_admin()
    or (public.is_leader() and team_id = public.current_team_id())
    or (public.current_app_role() = 'sale' and owner_user_id = (select auth.uid()))
  )
)
with check (
  deleted_at is null
  and (
    public.is_admin()
    or (public.is_leader() and team_id = public.current_team_id())
    or (public.current_app_role() = 'sale' and owner_user_id = (select auth.uid()))
  )
);

create policy customer_tag_links_select_by_customer on public.customer_tag_links
for select to authenticated using (public.can_access_customer(customer_id));
create policy customer_tag_links_insert_by_customer on public.customer_tag_links
for insert to authenticated with check (
  public.can_access_customer(customer_id)
  and exists (select 1 from public.customer_tags t where t.id = tag_id and t.is_active)
);
create policy customer_tag_links_delete_by_customer on public.customer_tag_links
for delete to authenticated using (
  public.can_access_customer(customer_id)
);

create policy customer_assignments_select_by_customer on public.customer_assignments
for select to authenticated using (
  public.can_access_customer(customer_id)
  or (public.is_admin() and exists (select 1 from public.customers c where c.id = customer_id))
);

revoke all on public.lead_sources, public.customer_tags, public.customers,
  public.customer_tag_links, public.customer_assignments from anon;
revoke all on public.lead_sources, public.customer_tags, public.customers,
  public.customer_tag_links, public.customer_assignments from authenticated;

grant select on public.lead_sources, public.customer_tags, public.customers,
  public.customer_tag_links, public.customer_assignments to authenticated;
grant insert, update, delete on public.lead_sources, public.customer_tags to authenticated;
grant update (full_name, phone, email, source_id, status, status_reason, priority, note_summary)
  on public.customers to authenticated;
grant insert, delete on public.customer_tag_links to authenticated;

revoke all on function public.normalize_customer_phone(text) from public;
revoke all on function public.normalize_customer_email(text) from public;
revoke all on function public.can_access_customer(uuid) from public;
revoke all on function public.create_customer_with_assignment(
  text, text, text, uuid, public.customer_priority, text, uuid, uuid, uuid[]
) from public;
revoke all on function public.transfer_customer(uuid, uuid, text) from public;
revoke all on function public.soft_delete_customer(uuid, text) from public;
revoke all on function public.set_customer_tags(uuid, uuid[]) from public;
revoke all on function public.customer_filter_facets(text, public.customer_status, uuid, uuid, uuid, uuid) from public;

grant execute on function public.create_customer_with_assignment(
  text, text, text, uuid, public.customer_priority, text, uuid, uuid, uuid[]
) to authenticated;
grant execute on function public.normalize_customer_phone(text) to authenticated;
grant execute on function public.normalize_customer_email(text) to authenticated;
grant execute on function public.can_access_customer(uuid) to authenticated;
grant execute on function public.transfer_customer(uuid, uuid, text) to authenticated;
grant execute on function public.soft_delete_customer(uuid, text) to authenticated;
grant execute on function public.set_customer_tags(uuid, uuid[]) to authenticated;
grant execute on function public.customer_filter_facets(text, public.customer_status, uuid, uuid, uuid, uuid) to authenticated;

insert into public.lead_sources(name, is_active)
values ('Facebook', true), ('Website', true), ('Giới thiệu', true), ('Walk-in', true), ('Khác', true);

insert into public.customer_tags(name, color, is_active)
values ('Tiềm năng', '#16a34a', true), ('Ưu tiên', '#dc2626', true), ('Cần gọi lại', '#d97706', true);

comment on table public.customers is 'Hồ sơ khách hàng; chống trùng liên hệ đang hoạt động và xóa mềm.';
comment on table public.customer_assignments is 'Lịch sử giao/chuyển khách; tối đa một phân công đang mở.';
comment on function public.create_customer_with_assignment is 'Điểm ghi duy nhất để tạo khách và phân công ban đầu theo vai trò.';
comment on function public.transfer_customer is 'Chuyển khách có kiểm tra team; Leader chỉ trong team, Admin liên-team.';
