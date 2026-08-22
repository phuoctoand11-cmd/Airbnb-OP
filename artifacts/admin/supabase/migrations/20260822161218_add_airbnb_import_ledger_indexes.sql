create index airbnb_payouts_imported_by_idx
  on public.airbnb_payouts (imported_by);

create index airbnb_booking_transactions_listing_id_idx
  on public.airbnb_booking_transactions (listing_id);

create index airbnb_booking_transactions_imported_by_idx
  on public.airbnb_booking_transactions (imported_by);
