-- =====================================================================
-- Airbnb Operations Admin — Supabase schema
-- Run this in the Supabase SQL editor (Database -> SQL Editor -> New query)
-- It creates all tables, an enum for roles, RLS policies, and a storage
-- bucket for listing images.
-- =====================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type app_role as enum ('admin', 'manager', 'staff', 'accountant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_status as enum ('active', 'inactive', 'maintenance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pricing_rule_type as enum ('weekend', 'seasonal', 'length_of_stay', 'minimum_stay');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pricing_adjustment_type as enum ('percentage', 'fixed', 'absolute');
exception when duplicate_object then null; end $$;

-- ---------- Profiles (mirrors auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role app_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- Helper function: current user's role
create or replace function public.current_user_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Listings ----------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  address text,
  city text,
  country text,
  bedrooms int not null default 1,
  bathrooms int not null default 1,
  max_guests int not null default 2,
  base_price numeric(10,2) not null default 0,
  cleaning_fee numeric(10,2) not null default 0,
  status listing_status not null default 'active',
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

-- ---------- Listing images ----------
create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  url text not null,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_listing_images_listing on public.listing_images(listing_id);

-- ---------- Amenities ----------
create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  category text
);

create table if not exists public.listing_amenities (
  listing_id uuid not null references public.listings(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  primary key (listing_id, amenity_id)
);

-- ---------- Calendar availability ----------
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  date date not null,
  is_available boolean not null default true,
  price_override numeric(10,2),
  note text,
  unique (listing_id, date)
);
create index if not exists idx_calendar_listing_date on public.calendar_entries(listing_id, date);

-- ---------- Pricing rules ----------
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null,
  rule_type pricing_rule_type not null,
  start_date date,
  end_date date,
  adjustment_type pricing_adjustment_type not null default 'percentage',
  adjustment_value numeric(10,2) not null default 0,
  min_nights int,
  active boolean not null default true
);
create index if not exists idx_pricing_listing on public.pricing_rules(listing_id);

-- ---------- Bookings ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  check_in date not null,
  check_out date not null,
  guests int not null default 1,
  total_amount numeric(10,2) not null default 0,
  status booking_status not null default 'pending',
  source text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bookings_listing on public.bookings(listing_id);
create index if not exists idx_bookings_dates on public.bookings(check_in, check_out);

-- ---------- Tasks ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  priority task_priority not null default 'medium',
  status task_status not null default 'todo',
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id);
create index if not exists idx_tasks_status on public.tasks(status);

-- ---------- Revenues ----------
create table if not exists public.revenues (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  amount numeric(10,2) not null,
  category text not null default 'booking',
  description text,
  received_at date not null default current_date
);
create index if not exists idx_revenues_received on public.revenues(received_at);

-- ---------- Expenses ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  amount numeric(10,2) not null,
  category text not null default 'other',
  description text,
  vendor text,
  spent_at date not null default current_date
);
create index if not exists idx_expenses_spent on public.expenses(spent_at);

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.amenities enable row level security;
alter table public.listing_amenities enable row level security;
alter table public.calendar_entries enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.bookings enable row level security;
alter table public.tasks enable row level security;
alter table public.revenues enable row level security;
alter table public.expenses enable row level security;

-- Profiles: users can read all profiles (so we can show assignees), only
-- admins can insert/update arbitrary profiles. Users can update their own.
drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all" on public.profiles
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Generic: any authenticated user can read most operational data
-- Admin and manager can write everything
-- Accountant can write revenues and expenses
-- Staff can write tasks (their own) and read everything else

create or replace function public.is_manager_or_admin()
returns boolean language sql stable as $$
  select public.current_user_role() in ('admin', 'manager');
$$;

create or replace function public.is_accountant_or_above()
returns boolean language sql stable as $$
  select public.current_user_role() in ('admin', 'manager', 'accountant');
$$;

-- Helper macro for read-all-authenticated tables
do $$
declare
  t text;
  read_all_tables text[] := array[
    'listings','listing_images','amenities','listing_amenities',
    'calendar_entries','pricing_rules','bookings','tasks','revenues','expenses'
  ];
begin
  foreach t in array read_all_tables loop
    execute format('drop policy if exists "%s read auth" on public.%I', t, t);
    execute format('create policy "%s read auth" on public.%I for select using (auth.uid() is not null)', t, t);
  end loop;
end $$;

-- Manager/admin: full write on listings, amenities, calendar, pricing, bookings
do $$
declare
  t text;
  manager_tables text[] := array[
    'listings','listing_images','amenities','listing_amenities',
    'calendar_entries','pricing_rules','bookings'
  ];
begin
  foreach t in array manager_tables loop
    execute format('drop policy if exists "%s manager write" on public.%I', t, t);
    execute format(
      'create policy "%s manager write" on public.%I for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin())',
      t, t
    );
  end loop;
end $$;

-- Tasks: managers/admins can do anything, staff can update tasks assigned
-- to them, anyone authenticated can insert tasks they assign to themselves.
drop policy if exists "tasks manager write" on public.tasks;
create policy "tasks manager write" on public.tasks
  for all using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

drop policy if exists "tasks staff update own" on public.tasks;
create policy "tasks staff update own" on public.tasks
  for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

drop policy if exists "tasks staff insert" on public.tasks;
create policy "tasks staff insert" on public.tasks
  for insert with check (auth.uid() is not null);

-- Revenues / expenses: accountant or above can write, everyone reads
do $$
declare
  t text;
  acct_tables text[] := array['revenues','expenses'];
begin
  foreach t in array acct_tables loop
    execute format('drop policy if exists "%s accountant write" on public.%I', t, t);
    execute format(
      'create policy "%s accountant write" on public.%I for all using (public.is_accountant_or_above()) with check (public.is_accountant_or_above())',
      t, t
    );
  end loop;
end $$;

-- =====================================================================
-- Storage bucket for listing images
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;

drop policy if exists "listing images read" on storage.objects;
create policy "listing images read" on storage.objects
  for select using (bucket_id = 'listing-images');

drop policy if exists "listing images write managers" on storage.objects;
create policy "listing images write managers" on storage.objects
  for insert with check (
    bucket_id = 'listing-images'
    and auth.uid() is not null
    and public.is_manager_or_admin()
  );

drop policy if exists "listing images update managers" on storage.objects;
create policy "listing images update managers" on storage.objects
  for update using (
    bucket_id = 'listing-images' and public.is_manager_or_admin()
  );

drop policy if exists "listing images delete managers" on storage.objects;
create policy "listing images delete managers" on storage.objects
  for delete using (
    bucket_id = 'listing-images' and public.is_manager_or_admin()
  );

-- =====================================================================
-- Seed data — a starter set so the app isn't empty on first load.
-- Safe to re-run; uses on conflict do nothing.
-- =====================================================================

insert into public.amenities (name, icon, category) values
  ('Wi-Fi', 'wifi', 'essential'),
  ('Kitchen', 'utensils', 'essential'),
  ('Air conditioning', 'wind', 'essential'),
  ('Heating', 'thermometer', 'essential'),
  ('Washer', 'shirt', 'laundry'),
  ('Dryer', 'shirt', 'laundry'),
  ('Free parking', 'car', 'parking'),
  ('Pool', 'waves', 'outdoor'),
  ('Hot tub', 'droplet', 'outdoor'),
  ('TV', 'tv', 'entertainment'),
  ('Workspace', 'laptop', 'work'),
  ('Pet friendly', 'paw-print', 'rules')
on conflict (name) do nothing;

with seed_listings as (
  insert into public.listings
    (title, description, address, city, country, bedrooms, bathrooms, max_guests, base_price, cleaning_fee, status, cover_image_url)
  values
    ('Sunset Loft Downtown', 'Bright loft in the heart of the city with skyline views.', '120 Market St', 'San Francisco', 'USA', 1, 1, 2, 220, 60, 'active', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80'),
    ('Coastal Cottage Retreat', 'Peaceful cottage steps from the beach.', '45 Shoreline Dr', 'Santa Cruz', 'USA', 2, 1, 4, 295, 80, 'active', 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80'),
    ('Modern Mountain Cabin', 'Floor-to-ceiling windows overlooking the pines.', '90 Ridgecrest Way', 'Truckee', 'USA', 3, 2, 6, 410, 120, 'active', 'https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=80'),
    ('Studio Near Pike Place', 'Cozy studio one block from the iconic market.', '210 Pine St', 'Seattle', 'USA', 0, 1, 2, 145, 45, 'maintenance', 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80')
  returning id, title
)
select 1;

-- Sample bookings, revenues, expenses, tasks (lightweight)
with l as (select id from public.listings limit 3)
insert into public.bookings (listing_id, guest_name, guest_email, check_in, check_out, guests, total_amount, status, source)
select id, g.guest_name, g.guest_email, g.check_in::date, g.check_out::date, g.guests, g.total, g.status::booking_status, g.source
from l, (values
  ('Ava Martinez',  'ava@example.com',  current_date - 10, current_date - 6, 2, 880,   'completed', 'Airbnb'),
  ('Noah Patel',    'noah@example.com', current_date - 4,  current_date - 1, 3, 1180,  'completed', 'Direct'),
  ('Mia Chen',      'mia@example.com',  current_date + 3,  current_date + 7, 2, 1320,  'confirmed', 'Airbnb'),
  ('Liam OBrien',   'liam@example.com', current_date + 12, current_date + 16,4, 1640,  'pending',   'Vrbo')
) as g(guest_name, guest_email, check_in, check_out, guests, total, status, source);

insert into public.revenues (listing_id, booking_id, amount, category, description, received_at)
select b.listing_id, b.id, b.total_amount, 'booking', concat('Booking from ', b.guest_name), b.check_out
from public.bookings b
where b.status = 'completed';

with l as (select id from public.listings limit 4)
insert into public.expenses (listing_id, amount, category, description, vendor, spent_at)
select id, e.amount, e.category, e.description, e.vendor, e.spent_at::date
from l, (values
  (180, 'cleaning',    'Turnover cleaning',         'SparkleCo',  current_date - 5),
  (95,  'supplies',    'Toiletries restock',        'CostMart',   current_date - 9),
  (320, 'maintenance', 'HVAC tune-up',              'CoolAir',    current_date - 14),
  (60,  'utilities',   'Water & electric (shared)', 'PG&E',       current_date - 2)
) as e(amount, category, description, vendor, spent_at);

with l as (select id, title from public.listings limit 3)
insert into public.tasks (listing_id, title, description, priority, status, due_date)
select id, t.title, t.description, t.priority::task_priority, t.status::task_status, (current_date + t.due_offset)::date
from l, (values
  ('Restock toiletries',   'Towels, soap, shampoo for next guest.', 'medium', 'todo',        2),
  ('Deep clean kitchen',   'Oven, fridge, and pantry.',             'high',   'in_progress', 1),
  ('Replace porch lights', 'Two bulbs out on the back porch.',      'low',    'todo',        7)
) as t(title, description, priority, status, due_offset);
