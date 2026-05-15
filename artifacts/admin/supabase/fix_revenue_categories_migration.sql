-- Fix revenue category consistency
-- Run this once in Supabase SQL Editor to clean up stale rows.
--
-- Correct categories: booking_revenue | cancellation_revenue ONLY
-- Wrong categories to remove: booking, booking_balance, deposit, extra, other, refund

-- 1. Remap "booking" → "booking_revenue" (old name for the same concept)
UPDATE revenues
SET category = 'booking_revenue'
WHERE category = 'booking';

-- 2. Remap "booking_balance" → "booking_revenue"
--    (balance-payment revenues should be merged into the single booking_revenue row;
--     if a booking_revenue row already exists for the same booking, delete the duplicate)
DELETE FROM revenues r
WHERE r.category = 'booking_balance'
  AND EXISTS (
    SELECT 1 FROM revenues r2
    WHERE r2.booking_id = r.booking_id
      AND r2.category = 'booking_revenue'
      AND r2.id <> r.id
  );

UPDATE revenues
SET category = 'booking_revenue'
WHERE category = 'booking_balance';

-- 3. Delete "deposit" revenue rows that duplicate a booking_revenue row
DELETE FROM revenues r
WHERE r.category = 'deposit'
  AND EXISTS (
    SELECT 1 FROM revenues r2
    WHERE r2.booking_id = r.booking_id
      AND r2.category = 'booking_revenue'
      AND r2.id <> r.id
  );

-- 4. Remaining orphan "deposit" rows (no booking_revenue sibling) → remap
UPDATE revenues
SET category = 'booking_revenue'
WHERE category = 'deposit';

-- 5. Delete "extra" and "other" rows (no longer recognised)
DELETE FROM revenues WHERE category IN ('extra', 'other');

-- 6. Delete "refund" rows from revenues table (refunds belong in payments, not revenues)
DELETE FROM revenues WHERE category = 'refund';

-- Verify: all remaining rows should be booking_revenue or cancellation_revenue
SELECT category, COUNT(*) AS rows, SUM(amount) AS total
FROM revenues
GROUP BY category
ORDER BY category;
