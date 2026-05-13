-- ============================================================
-- CHAT ATTACHMENTS MIGRATION
-- Run this in your Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- STEP 0: Create the storage bucket manually in Supabase Dashboard
-- Go to: Storage > New Bucket
-- Name: chat-attachments
-- Public: YES (checked)  ← required for public URL access
-- Alternatively, the INSERT policy below will enable uploads via SQL.

-- ============================================================
-- 1. chat_attachments table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  group_id     uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  topic_id     uuid NOT NULL REFERENCES public.chat_topics(id) ON DELETE CASCADE,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_url     text NOT NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_type    text NOT NULL,
  file_size    integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_attachments_message_id_idx ON public.chat_attachments (message_id);
CREATE INDEX IF NOT EXISTS chat_attachments_topic_id_idx   ON public.chat_attachments (topic_id);

-- ============================================================
-- 2. RLS on chat_attachments
-- ============================================================

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- Members of the group can view attachments
DROP POLICY IF EXISTS "Members can view chat attachments" ON public.chat_attachments;
CREATE POLICY "Members can view chat attachments"
  ON public.chat_attachments FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

-- Members can upload (insert) attachments for their own messages
DROP POLICY IF EXISTS "Members can upload chat attachments" ON public.chat_attachments;
CREATE POLICY "Members can upload chat attachments"
  ON public.chat_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_group_member(group_id)
    AND uploaded_by = auth.uid()
  );

-- Uploader can delete their own attachment
DROP POLICY IF EXISTS "Uploader can delete chat attachment" ON public.chat_attachments;
CREATE POLICY "Uploader can delete chat attachment"
  ON public.chat_attachments FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- ============================================================
-- 3. Storage bucket RLS (storage.objects)
-- NOTE: The bucket must exist before these policies take effect.
-- ============================================================

-- Allow authenticated group members to upload
DROP POLICY IF EXISTS "Chat attachment upload" ON storage.objects;
CREATE POLICY "Chat attachment upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to read
DROP POLICY IF EXISTS "Chat attachment read" ON storage.objects;
CREATE POLICY "Chat attachment read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments');

-- Allow uploader to delete
DROP POLICY IF EXISTS "Chat attachment delete" ON storage.objects;
CREATE POLICY "Chat attachment delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = 'chat');

-- ============================================================
-- 4. Enable realtime for chat_attachments (optional but nice)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_attachments;
