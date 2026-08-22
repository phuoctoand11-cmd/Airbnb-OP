-- Phase 2: atomic, idempotent Airbnb imports.
-- This migration is additive. It does not rewrite or delete existing data.

create table public.airbnb_payouts (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null,
  payout_date date not null,
  paid_amount numeric not null,
  currency text not null default 'VND',
  imported_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airbnb_payouts_reference_code_not_blank
    check (btrim(reference_code) <> ''),
  constraint airbnb_payouts_paid_amount_positive
    check (paid_amount > 0),
  constraint airbnb_payouts_currency_not_blank
    check (btrim(currency) <> ''),
  constraint airbnb_payouts_idempotency_uniq
    unique (reference_code, payout_date, paid_amount)
);

create table public.airbnb_booking_transactions (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.airbnb_payouts(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  confirmation_code text not null,
  payout_date date not null,
  transaction_type text not null,
  amount numeric not null,
  currency text not null,
  allocated_amount_vnd numeric not null,
  imported_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint airbnb_booking_transactions_confirmation_not_blank
    check (btrim(confirmation_code) <> ''),
  constraint airbnb_booking_transactions_type_not_blank
    check (btrim(transaction_type) <> ''),
  constraint airbnb_booking_transactions_currency_not_blank
    check (btrim(currency) <> ''),
  constraint airbnb_booking_transactions_allocated_amount_positive
    check (allocated_amount_vnd > 0),
  constraint airbnb_booking_transactions_idempotency_uniq
    unique (confirmation_code, payout_date, transaction_type, amount)
);

create index airbnb_booking_transactions_payout_id_idx
  on public.airbnb_booking_transactions (payout_id);

create index airbnb_booking_transactions_booking_id_idx
  on public.airbnb_booking_transactions (booking_id);

alter table public.airbnb_payouts enable row level security;
alter table public.airbnb_booking_transactions enable row level security;

-- The ledger is intentionally unavailable through the Data API. The only
-- write path is commit_airbnb_import(), whose role check and writes share one
-- PostgreSQL transaction.
revoke all on table public.airbnb_payouts from anon, authenticated;
revoke all on table public.airbnb_booking_transactions from anon, authenticated;

create or replace function public.commit_airbnb_import(
  p_payouts jsonb,
  p_expected_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_payout jsonb;
  v_transaction jsonb;
  v_payout_id uuid;
  v_booking_id uuid;
  v_listing_id uuid;
  v_existing_listing_id uuid;
  v_reference_code text;
  v_confirmation_code text;
  v_transaction_type text;
  v_guest_name text;
  v_payout_date date;
  v_check_in date;
  v_check_out date;
  v_paid_amount numeric;
  v_source_amount numeric;
  v_allocated_amount numeric;
  v_currency text;
  v_action text;
  v_written jsonb := '[]'::jsonb;
  v_written_count integer := 0;
  v_duplicate_count integer := 0;
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
    raise exception using errcode = '42501', message = 'Not authorized to import Airbnb payouts';
  end if;

  if p_payouts is null
     or jsonb_typeof(p_payouts) <> 'array'
     or jsonb_array_length(p_payouts) = 0 then
    raise exception using errcode = '22023', message = 'p_payouts must be a non-empty JSON array';
  end if;

  for v_payout in select value from jsonb_array_elements(p_payouts)
  loop
    v_payout_id := null;
    v_reference_code := btrim(v_payout->>'reference_code');
    v_payout_date := (v_payout->>'payout_date')::date;
    v_paid_amount := (v_payout->>'paid_amount')::numeric;

    if coalesce(v_reference_code, '') = '' or coalesce(v_paid_amount, 0) <= 0 then
      raise exception using errcode = '22023', message = 'Invalid payout identity';
    end if;

    insert into public.airbnb_payouts (
      reference_code, payout_date, paid_amount, currency, imported_by
    ) values (
      v_reference_code, v_payout_date, v_paid_amount, 'VND', v_actor_id
    )
    on conflict (reference_code, payout_date, paid_amount) do nothing
    returning id into v_payout_id;

    if v_payout_id is null then
      select id into strict v_payout_id
        from public.airbnb_payouts
       where reference_code = v_reference_code
         and payout_date = v_payout_date
         and paid_amount = v_paid_amount;
    end if;

    if jsonb_typeof(v_payout->'transactions') <> 'array'
       or jsonb_array_length(v_payout->'transactions') = 0 then
      raise exception using errcode = '22023', message = 'Payout transactions must be an array';
    end if;

    for v_transaction in select value from jsonb_array_elements(v_payout->'transactions')
    loop
      v_listing_id := (v_transaction->>'listing_id')::uuid;
      v_confirmation_code := btrim(v_transaction->>'confirmation_code');
      v_transaction_type := btrim(v_transaction->>'transaction_type');
      v_guest_name := btrim(v_transaction->>'guest_name');
      v_check_in := (v_transaction->>'check_in')::date;
      v_check_out := (v_transaction->>'check_out')::date;
      v_source_amount := (v_transaction->>'amount')::numeric;
      v_currency := upper(btrim(v_transaction->>'currency'));
      v_allocated_amount := (v_transaction->>'allocated_amount_vnd')::numeric;

      if coalesce(v_confirmation_code, '') = ''
         or coalesce(v_transaction_type, '') = ''
         or coalesce(v_guest_name, '') = ''
         or coalesce(v_currency, '') = ''
         or v_source_amount is null
         or v_check_out <= v_check_in
         or coalesce(v_allocated_amount, 0) <= 0 then
        raise exception using errcode = '22023', message = 'Invalid Airbnb booking transaction';
      end if;

      if p_expected_listing_id is not null and v_listing_id <> p_expected_listing_id then
        raise exception using errcode = '22023', message = 'Transaction does not match the selected listing';
      end if;

      perform 1 from public.listings where id = v_listing_id;
      if not found then
        raise exception using errcode = '23503', message = 'Airbnb transaction references an unknown listing';
      end if;

      perform pg_advisory_xact_lock(hashtextextended(
        v_confirmation_code || '|' || v_payout_date::text || '|' ||
        v_transaction_type || '|' || v_source_amount::text,
        0
      ));

      perform 1
        from public.airbnb_booking_transactions
       where confirmation_code = v_confirmation_code
         and payout_date = v_payout_date
         and transaction_type = v_transaction_type
         and amount = v_source_amount;

      if found then
        v_duplicate_count := v_duplicate_count + 1;
        v_written := v_written || jsonb_build_array(jsonb_build_object(
          'code', v_confirmation_code,
          'action', 'duplicate',
          'skipped', 'already_imported'
        ));
        continue;
      end if;

      v_booking_id := null;
      v_existing_listing_id := null;
      v_action := 'create';

      select id, listing_id into v_booking_id, v_existing_listing_id
        from public.bookings
       where confirmation_code = v_confirmation_code
       order by created_at
       limit 1;

      if v_booking_id is not null then
        if v_existing_listing_id <> v_listing_id then
          raise exception using errcode = '22023', message = 'Confirmation code belongs to another listing';
        end if;
        v_action := 'update_imported';
      else
        select id into v_booking_id
          from public.bookings
         where listing_id = v_listing_id
           and check_in = v_check_in
           and check_out = v_check_out
           and confirmation_code is null
         order by created_at
         limit 1;

        if v_booking_id is not null then
          v_action := 'merge_manual';
        end if;
      end if;

      if v_booking_id is null then
        insert into public.bookings (
          listing_id, guest_name, check_in, check_out, guests,
          total_amount, status, source, confirmation_code
        ) values (
          v_listing_id, v_guest_name, v_check_in, v_check_out, 1,
          v_allocated_amount, 'completed', 'Airbnb', v_confirmation_code
        ) returning id into v_booking_id;
      else
        update public.bookings
           set listing_id = v_listing_id,
               guest_name = v_guest_name,
               check_in = v_check_in,
               check_out = v_check_out,
               total_amount = v_allocated_amount,
               status = 'completed',
               source = 'Airbnb',
               confirmation_code = v_confirmation_code
         where id = v_booking_id;
      end if;

      insert into public.revenues (
        listing_id, booking_id, amount, category, received_at, description
      ) values (
        v_listing_id, v_booking_id, v_allocated_amount, 'booking_revenue',
        v_check_in + 1,
        'Airbnb ' || v_confirmation_code || ' - ' || v_guest_name
      )
      on conflict (booking_id, category) do update
        set listing_id = excluded.listing_id,
            amount = excluded.amount,
            received_at = excluded.received_at,
            description = excluded.description,
            updated_at = now();

      insert into public.airbnb_booking_transactions (
        payout_id, booking_id, listing_id, confirmation_code, payout_date,
        transaction_type, amount, currency, allocated_amount_vnd, imported_by
      ) values (
        v_payout_id, v_booking_id, v_listing_id, v_confirmation_code, v_payout_date,
        v_transaction_type, v_source_amount, v_currency, v_allocated_amount, v_actor_id
      );

      v_written_count := v_written_count + 1;
      v_written := v_written || jsonb_build_array(jsonb_build_object(
        'code', v_confirmation_code,
        'booking_id', v_booking_id,
        'action', v_action,
        'amount_vnd', v_allocated_amount
      ));
    end loop;
  end loop;

  insert into public.activity_logs (user_id, action, entity_type, metadata)
  values (
    v_actor_id,
    'airbnb_import_committed',
    'airbnb_import',
    jsonb_build_object(
      'written_count', v_written_count,
      'duplicate_count', v_duplicate_count,
      'payout_count', jsonb_array_length(p_payouts)
    )
  );

  return jsonb_build_object(
    'written_count', v_written_count,
    'duplicate_count', v_duplicate_count,
    'written', v_written
  );
end;
$function$;

revoke all on function public.commit_airbnb_import(jsonb, uuid) from public;
revoke all on function public.commit_airbnb_import(jsonb, uuid) from anon;
grant execute on function public.commit_airbnb_import(jsonb, uuid) to authenticated;
