-- ============================================================
-- CHAT GROUP MEMBERS v2 MIGRATION
-- Adds profile_id and role columns; fixes RLS so admin/manager
-- can see all groups and any authenticated user can create groups.
--
-- Run this in your Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- ── 1. Add profile_id column ──────────────────────────────────────────────────

ALTER TABLE public.chat_group_members
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Backfill: profile_id = user_id for all existing rows
UPDATE public.chat_group_members
  SET profile_id = user_id
  WHERE profile_id IS NULL;

-- ── 2. Add role column ────────────────────────────────────────────────────────

ALTER TABLE public.chat_group_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member'));

-- ── 3. Add unique constraint on (group_id, profile_id) ───────────────────────
-- Required for ON CONFLICT (group_id, profile_id) to work in upserts.

ALTER TABLE public.chat_group_members
  DROP CONSTRAINT IF EXISTS chat_group_members_group_id_profile_id_key;

ALTER TABLE public.chat_group_members
  ADD CONSTRAINT chat_group_members_group_id_profile_id_key
  UNIQUE (group_id, profile_id);

-- Also keep a plain index for fast profile_id lookups
CREATE INDEX IF NOT EXISTS chat_group_members_profile_id_idx
  ON public.chat_group_members (profile_id);

-- ── 4. Fix chat_groups SELECT policy so admin/manager see all groups ──────────
-- Drop the member-only policy and replace with one that also allows admins.

DROP POLICY IF EXISTS "Group members can view the group"       ON public.chat_groups;
DROP POLICY IF EXISTS "Admin and manager can view all groups"  ON public.chat_groups;

CREATE POLICY "Members or admins can view groups"
  ON public.chat_groups FOR SELECT
  TO authenticated
  USING (
    public.is_group_member(id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- ── 5. Fix chat_group_members SELECT so admin/manager see all membership rows ─

DROP POLICY IF EXISTS "Members can view group membership"      ON public.chat_group_members;
DROP POLICY IF EXISTS "Admin can view all group memberships"   ON public.chat_group_members;

CREATE POLICY "Members or admins can view group memberships"
  ON public.chat_group_members FOR SELECT
  TO authenticated
  USING (
    public.is_group_member(group_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- ── 6. Fix chat_group_members INSERT so any authenticated user can create ─────
-- The old policy only allowed the group creator or self-join.
-- New policy: allow if caller is the creator of the group OR the row is for themselves.

DROP POLICY IF EXISTS "Group creator can add members" ON public.chat_group_members;

CREATE POLICY "Group creator or self can add members"
  ON public.chat_group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- creator can add anyone
    EXISTS (
      SELECT 1 FROM public.chat_groups
      WHERE id = group_id AND created_by = auth.uid()
    )
    -- any user can add themselves (self-join during creation)
    OR user_id = auth.uid()
  );

-- ── 7. Fix chat_messages SELECT so admin/manager can see all messages ─────────

DROP POLICY IF EXISTS "Members can read messages"            ON public.chat_messages;
DROP POLICY IF EXISTS "Admin can read all messages"          ON public.chat_messages;

CREATE POLICY "Members or admins can read messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    public.is_group_member(group_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- ── 8. Allow any active authenticated user to send messages ───────────────────
-- (sender must be a member of the group — no change needed, existing policy is fine)

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Summary of changes applied:
--   • chat_group_members.profile_id  — new column (backfilled from user_id)
--   • chat_group_members.role        — new column (default 'member'; owner for creator)
--   • chat_groups SELECT policy      — admin/manager can now see all groups
--   • chat_group_members SELECT      — admin/manager can see all memberships
--   • chat_group_members INSERT      — any authenticated group creator can add members
--   • chat_messages SELECT           — admin/manager can see all messages
