-- M7 UAT: điều chỉnh giao dịch bằng phiên bản thay thế, giữ lịch sử và KPI nhất quán.

alter table public.deals
  add column replaces_deal_id uuid,
  add column amendment_reason text;

alter table public.deals
  add constraint deals_replaces_deal_fkey
    foreign key (replaces_deal_id) references public.deals(id) on delete restrict,
  add constraint deals_amendment_fields_consistent check (
    (replaces_deal_id is null and amendment_reason is null)
    or (
      replaces_deal_id is not null
      and replaces_deal_id <> id
      and char_length(trim(amendment_reason)) between 3 and 500
    )
  );

create unique index deals_one_direct_replacement_unique
  on public.deals (replaces_deal_id)
  where replaces_deal_id is not null;

create index deals_replacement_chain_idx
  on public.deals (replaces_deal_id, created_at desc)
  where replaces_deal_id is not null;

create or replace function public.amend_deal(
  target_deal_id uuid,
  amended_amount_vnd numeric,
  amended_registered_at timestamptz,
  amended_note text,
  reason text,
  request_idempotency_key uuid
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
  current_deal public.deals%rowtype;
  existing_deal public.deals%rowtype;
  replacement_id uuid;
  normalized_note text := nullif(trim(amended_note), '');
  normalized_reason text := trim(reason);
begin
  if actor_id is null or actor_role is null then
    raise exception using errcode = '42501', message = 'deal_amend_denied';
  end if;
  if amended_amount_vnd is null or amended_amount_vnd < 0 or amended_amount_vnd > 999999999999999 then
    raise exception using errcode = '22023', message = 'invalid_deal_amount';
  end if;
  if amended_registered_at is null or amended_registered_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid_registered_at';
  end if;
  if request_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency_key_required';
  end if;
  if char_length(coalesce(normalized_reason, '')) < 3 or char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'deal_amend_reason_required';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_deal_note';
  end if;

  select * into existing_deal
  from public.deals
  where idempotency_key = request_idempotency_key;
  if found then
    if existing_deal.created_by = actor_id and existing_deal.replaces_deal_id = target_deal_id then
      return existing_deal.id;
    end if;
    raise exception using errcode = '23505', message = 'idempotency_key_conflict';
  end if;

  select * into current_deal
  from public.deals
  where id = target_deal_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'deal_amend_denied';
  end if;

  -- Một retry đồng thời có thể đã hoàn tất trong lúc chờ khóa bản gốc.
  select * into existing_deal
  from public.deals
  where idempotency_key = request_idempotency_key;
  if found then
    if existing_deal.created_by = actor_id and existing_deal.replaces_deal_id = target_deal_id then
      return existing_deal.id;
    end if;
    raise exception using errcode = '23505', message = 'idempotency_key_conflict';
  end if;

  if current_deal.status <> 'active' then
    raise exception using errcode = '22023', message = 'deal_amend_inactive';
  end if;
  if not public.can_access_customer(current_deal.customer_id) then
    raise exception using errcode = '42501', message = 'deal_amend_denied';
  end if;
  if actor_role = 'sale' then
    if current_deal.created_by is distinct from actor_id
      or current_deal.owner_user_id <> actor_id
      or current_deal.created_at < now() - interval '24 hours' then
      raise exception using errcode = '42501', message = 'deal_amend_window_expired';
    end if;
  elsif actor_role = 'leader' then
    if actor_team is null or current_deal.team_id <> actor_team then
      raise exception using errcode = '42501', message = 'deal_amend_denied';
    end if;
  elsif actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'deal_amend_denied';
  end if;
  if exists (select 1 from public.deals where replaces_deal_id = current_deal.id) then
    raise exception using errcode = '23505', message = 'deal_amend_already_replaced';
  end if;
  if current_deal.amount_vnd = amended_amount_vnd
    and date_trunc('minute', current_deal.registered_at) = date_trunc('minute', amended_registered_at)
    and coalesce(current_deal.note, '') = coalesce(normalized_note, '') then
    raise exception using errcode = '22023', message = 'deal_amend_no_changes';
  end if;

  update public.deals
  set status = 'void', void_reason = normalized_reason, voided_at = now(), voided_by = actor_id
  where id = current_deal.id;

  insert into public.deals(
    customer_id, owner_user_id, team_id, amount_vnd, registered_at, status,
    idempotency_key, note, replaces_deal_id, amendment_reason, created_by, updated_by
  ) values (
    current_deal.customer_id, current_deal.owner_user_id, current_deal.team_id,
    amended_amount_vnd, amended_registered_at, 'active', request_idempotency_key,
    normalized_note, current_deal.id, normalized_reason, actor_id, actor_id
  ) returning id into replacement_id;

  return replacement_id;
end;
$$;

revoke all on function public.amend_deal(uuid, numeric, timestamptz, text, text, uuid) from public;
grant execute on function public.amend_deal(uuid, numeric, timestamptz, text, text, uuid) to authenticated;

comment on column public.deals.replaces_deal_id is
  'Giao dịch active này thay thế đúng một giao dịch cũ; FK và unique index ngăn bản mồ côi hoặc chồng phiên bản.';
comment on column public.deals.amendment_reason is
  'Lý do bắt buộc khi tạo phiên bản giao dịch thay thế.';
comment on function public.amend_deal(uuid, numeric, timestamptz, text, text, uuid) is
  'Điều chỉnh giao dịch nguyên tử: khóa bản active, vô hiệu bản cũ và tạo đúng một bản thay thế idempotent.';
