-- Unifier promo_codes : codes créés par le board utilisables dans l'app
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run

-- Ajouter uses_remaining si absent (requis par l'app)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS uses_remaining integer;

-- Initialiser uses_remaining à partir de max_uses (pour codes existants)
UPDATE promo_codes SET uses_remaining = COALESCE(max_uses, 999) WHERE uses_remaining IS NULL;

-- use_promo_code : compatible board + app (uses_remaining, max_uses, used_count, expires_at)
CREATE OR REPLACE FUNCTION public.use_promo_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM promo_codes
  WHERE upper(trim(code)) = upper(trim(p_code))
  AND (uses_remaining IS NULL OR uses_remaining > 0)
  AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE promo_codes
  SET uses_remaining = CASE WHEN uses_remaining IS NULL THEN NULL ELSE uses_remaining - 1 END,
      used_count = COALESCE(used_count, 0) + 1
  WHERE id = v_row.id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_promo_code(text) TO anon;
