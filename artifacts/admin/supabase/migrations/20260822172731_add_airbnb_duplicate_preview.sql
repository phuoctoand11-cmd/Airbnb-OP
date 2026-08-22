-- Read-only duplicate classification for the Airbnb import preview.
-- The ledger remains unavailable through the Data API; callers only receive
-- the idempotency keys they submitted that already exist.
create or replace function public.preview_airbnb_import_duplicates(
  p_transactions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_matches jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select r.name
    into v_actor_role
    from public.users u
    join public.roles r on r.id = u.role_id
   where u.id = v_actor_id
     and coalesce(u.is_active, true);

  if v_actor_role is null or v_actor_role not in ('admin', 'manager', 'accountant') then
    raise exception using errcode = '42501', message = 'Not authorized to preview Airbnb payouts';
  end if;

  if p_transactions is null or jsonb_typeof(p_transactions) <> 'array' then
    raise exception using errcode = '22023', message = 'p_transactions must be a JSON array';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'confirmation_code', candidate.confirmation_code,
    'payout_date', candidate.payout_date,
    'transaction_type', candidate.transaction_type,
    'amount', candidate.amount
  )), '[]'::jsonb)
    into v_matches
    from jsonb_to_recordset(p_transactions) as candidate(
      confirmation_code text,
      payout_date date,
      transaction_type text,
      amount numeric
    )
    where exists (
      select 1
        from public.airbnb_booking_transactions existing
       where existing.confirmation_code = candidate.confirmation_code
         and existing.payout_date = candidate.payout_date
         and existing.transaction_type = candidate.transaction_type
         and existing.amount = candidate.amount
    );

  return v_matches;
end;
$function$;

revoke all on function public.preview_airbnb_import_duplicates(jsonb) from public;
revoke all on function public.preview_airbnb_import_duplicates(jsonb) from anon;
grant execute on function public.preview_airbnb_import_duplicates(jsonb) to authenticated;
