-- Public (signed-out) access for the guest-facing listing + availability page.
--
-- DESIGN NOTE — why views and not RLS policies on the base tables:
-- the anon key ships inside the front-end bundle, so anything anon can SELECT is
-- readable by anyone with the URL, straight from /rest/v1/<table>. Granting anon
-- on `listings` would therefore expose base_price and airbnb_listing_name, and
-- granting it on `bookings` would expose guest_name, confirmation_code and
-- amounts. Instead we add narrow views that hold only the columns a guest may
-- see, mark them security_invoker=false so they may read past RLS, and grant
-- anon on the views alone. The base tables keep their existing
-- authenticated-only policies and stay unreachable over REST.

-- ── Listings ────────────────────────────────────────────────────────────────
-- Same column set as sales_listings_view (no base_price, no cleaning_fee, no
-- airbnb_listing_name), and only listings that are actually live.
create or replace view public.public_listings_view
with (security_invoker = false) as
select id, title, description, address, city, country,
       bedrooms, bathrooms, max_guests, cover_image_url
from public.listings
where status = 'active';

-- ── Photos and rooms ────────────────────────────────────────────────────────
create or replace view public.public_listing_rooms_view
with (security_invoker = false) as
select r.id, r.listing_id, r.name, r.position
from public.listing_rooms r
join public.listings l on l.id = r.listing_id
where l.status = 'active';

create or replace view public.public_listing_images_view
with (security_invoker = false) as
select i.id, i.listing_id, i.url, i.room_id, i.position
from public.listing_images i
join public.listings l on l.id = i.listing_id
where l.status = 'active';

-- ── Amenities ───────────────────────────────────────────────────────────────
create or replace view public.public_listing_amenities_view
with (security_invoker = false) as
select la.listing_id, a.id as amenity_id, a.name, a.icon, a.category
from public.listing_amenities la
join public.amenities a on a.id = la.amenity_id
join public.listings l on l.id = la.listing_id
where l.status = 'active';

-- ── Availability ────────────────────────────────────────────────────────────
-- Busy dates only. A guest learns THAT a date is taken, never who booked it or
-- for how much: no guest_name, no confirmation_code, no amount, and the reason
-- is flattened to a coarse label.
--
-- CONVENTION: end_date is EXCLUSIVE on every row, so a consumer needs one rule
-- — mark [start_date, end_date). bookings.check_out and listing_blocks.end_date
-- are already half-open (the internal calendar tests `ds < end_date`);
-- listing_calendar holds one row per day, so its single date gets + 1 to fit.
create or replace view public.public_availability_view
with (security_invoker = false) as
select b.listing_id, b.check_in as start_date, b.check_out as end_date, 'booked'::text as kind
from public.bookings b
join public.listings l on l.id = b.listing_id
where l.status = 'active' and b.status <> 'cancelled'
union all
select bl.listing_id, bl.start_date, bl.end_date, 'blocked'::text as kind
from public.listing_blocks bl
join public.listings l on l.id = bl.listing_id
where l.status = 'active'
union all
select c.listing_id, c.date as start_date, (c.date + 1) as end_date, 'blocked'::text as kind
from public.listing_calendar c
join public.listings l on l.id = c.listing_id
where l.status = 'active' and c.status <> 'available';

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Read-only, views only. Nothing here grants access to a base table.
grant select on public.public_listings_view           to anon, authenticated;
grant select on public.public_listing_rooms_view      to anon, authenticated;
grant select on public.public_listing_images_view     to anon, authenticated;
grant select on public.public_listing_amenities_view  to anon, authenticated;
grant select on public.public_availability_view       to anon, authenticated;
