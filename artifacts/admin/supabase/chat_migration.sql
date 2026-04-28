-- ============================================================
-- CHAT SYSTEM MIGRATION
-- Run this once in your Supabase SQL editor (Database > SQL Editor)
-- ============================================================

-- 1. Chat groups (channels / rooms)
create table if not exists public.chat_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 2. Group membership
create table if not exists public.chat_group_members (
  group_id  uuid not null references public.chat_groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 3. Messages
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.chat_groups(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now()
);

-- 4. Read receipts (optional — tracks who has read up to which message)
create table if not exists public.chat_message_reads (
  group_id      uuid not null references public.chat_groups(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ============================================================
-- Indexes for performance
-- ============================================================
create index if not exists chat_messages_group_id_idx
  on public.chat_messages (group_id, created_at);

create index if not exists chat_group_members_user_id_idx
  on public.chat_group_members (user_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.chat_groups        enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.chat_message_reads enable row level security;

-- Helper: is the current user a member of a group?
create or replace function public.is_group_member(gid uuid)
  returns boolean
  language sql stable
as $$
  select exists (
    select 1 from public.chat_group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- chat_groups: any authenticated user can create; members can read
create policy "Authenticated users can create groups"
  on public.chat_groups for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "Group members can view the group"
  on public.chat_groups for select
  to authenticated
  using (public.is_group_member(id));

create policy "Creator can delete group"
  on public.chat_groups for delete
  to authenticated
  using (created_by = auth.uid());

-- chat_group_members: members can read; group creators / admins can insert/delete
create policy "Members can view group membership"
  on public.chat_group_members for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "Group creator can add members"
  on public.chat_group_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.chat_groups
      where id = group_id and created_by = auth.uid()
    )
    or user_id = auth.uid()   -- allow self-join at group creation
  );

create policy "Group creator can remove members"
  on public.chat_group_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.chat_groups
      where id = group_id and created_by = auth.uid()
    )
    or user_id = auth.uid()   -- allow self-leave
  );

-- chat_messages: members can read/insert; sender can delete
create policy "Members can read messages"
  on public.chat_messages for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "Members can send messages"
  on public.chat_messages for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and sender_id = auth.uid()
  );

create policy "Sender can delete own message"
  on public.chat_messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- chat_message_reads: only the owner row
create policy "Users manage own read receipts"
  on public.chat_message_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Enable Realtime for live message updates
-- ============================================================
alter publication supabase_realtime add table public.chat_messages;
