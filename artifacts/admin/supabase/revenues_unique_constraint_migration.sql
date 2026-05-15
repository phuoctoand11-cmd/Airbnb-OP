-- ============================================================
-- REVENUES UNIQUE CONSTRAINT MIGRATION
-- Adds a unique constraint on (booking_id, category) so that
-- upsert with onConflict: "booking_id,category" works correctly
-- and prevents duplicate revenue rows per booking per category.
--
-- Run this in your Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- ── 1. Remove duplicate rows before adding the constraint ─────────────────────
-- Keep only the latest row per (booking_id, category) to avoid constraint errors.
DELETE FROM public.revenues
WHERE id NOT IN (
  SELECT DISTINCT ON (booking_id, category) id
  FROM public.revenues
  WHERE booking_id IS NOT NULL
  ORDER BY booking_id, category, created_at DESC
)
AND booking_id IS NOT NULL;

-- ── 2. Add the unique constraint ──────────────────────────────────────────────

ALTER TABLE public.revenues
  DROP CONSTRAINT IF EXISTS revenues_booking_id_category_key;

ALTER TABLE public.revenues
  ADD CONSTRAINT revenues_booking_id_category_key
  UNIQUE (booking_id, category);

-- ── 3. Clean up stale old-category rows ──────────────────────────────────────
-- Optional: delete any rows with legacy categories that should not exist.
-- Un-comment the lines below if you want to purge old data.
-- WARNING: This is destructive — review your data first.
--
-- DELETE FROM public.revenues
--   WHERE category IN ('booking', 'deposit', 'booking_balance')
--   AND booking_id IS NOT NULL;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- After running this migration:
--   • revenues table has UNIQUE (booking_id, category)
--   • Duplicate revenue rows for the same booking + category are removed
--   • App-side upsert with onConflict: "booking_id,category" will work correctly
