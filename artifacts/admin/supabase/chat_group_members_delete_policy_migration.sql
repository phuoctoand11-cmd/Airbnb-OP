-- ============================================================
-- CHAT GROUP MEMBERS — DELETE POLICY MIGRATION
-- Allows group owner AND admin/manager to remove members.
-- Run this in Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- Drop the original narrow policy (creator + self-leave only)
DROP POLICY IF EXISTS "Group creator can remove members" ON public.chat_group_members;

-- New policy: owner, admin/manager, or self-leave
CREATE POLICY "Owner or admin can remove members"
  ON public.chat_group_members FOR DELETE
  TO authenticated
  USING (
    -- Group creator/owner can remove any member
    EXISTS (
      SELECT 1 FROM public.chat_groups
      WHERE id = group_id AND created_by = auth.uid()
    )
    -- Admin or manager can remove anyone from any group
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
    -- Members can remove themselves (self-leave)
    OR user_id = auth.uid()
  );
