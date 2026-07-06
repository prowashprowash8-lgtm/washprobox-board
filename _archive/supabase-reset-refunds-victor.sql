-- Réinitialiser les remboursements pour Victor Mortier
-- Exécuter dans Supabase → SQL Editor → Run

UPDATE transactions
SET status = 'completed',
    refunded_at = NULL,
    refund_reason = NULL
WHERE user_id IN (
  SELECT id FROM profiles
  WHERE (LOWER(COALESCE(first_name, '')) = 'victor' AND LOWER(COALESCE(last_name, '')) = 'mortier')
     OR LOWER(email) LIKE '%victor.mortier%'
     OR LOWER(email) LIKE '%victormortier%'
)
AND status = 'refunded';
