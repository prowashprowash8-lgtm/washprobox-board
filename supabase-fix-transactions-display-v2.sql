-- Corriger "column e.nom does not exist" + affichage board
-- Exécuter dans Supabase → SQL Editor → Run

-- 1. Ajouter les colonnes manquantes (emplacements/machines peuvent avoir name OU nom)
ALTER TABLE public.emplacements ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE public.emplacements ADD COLUMN IF NOT EXISTS name text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emplacements' AND column_name='name') THEN
    UPDATE public.emplacements SET nom = name WHERE nom IS NULL AND name IS NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emplacements' AND column_name='nom') THEN
    UPDATE public.emplacements SET name = nom WHERE name IS NULL AND nom IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS name text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' AND column_name='name') THEN
    UPDATE public.machines SET nom = name WHERE nom IS NULL AND name IS NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' AND column_name='nom') THEN
    UPDATE public.machines SET name = nom WHERE name IS NULL AND nom IS NOT NULL;
  END IF;
END $$;

-- 2. get_user_transactions : support name ET nom (sécurisé)
CREATE OR REPLACE FUNCTION public.get_user_transactions(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  amount decimal,
  payment_method text,
  promo_code text,
  status text,
  created_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  machine_name text,
  emplacement_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.amount,
    t.payment_method,
    t.promo_code,
    t.status,
    t.created_at,
    t.refunded_at,
    t.refund_reason,
    COALESCE(m.name, m.nom, 'Machine')::text AS machine_name,
    COALESCE(e.name, e.nom, 'Laverie')::text AS emplacement_name
  FROM transactions t
  LEFT JOIN machines m ON m.id = t.machine_id
  LEFT JOIN emplacements e ON e.id = t.emplacement_id
  WHERE t.user_id = p_user_id
  ORDER BY t.created_at DESC;
END;
$$;

-- 3. get_all_transactions : pour le board
CREATE OR REPLACE FUNCTION public.get_all_transactions()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  machine_id uuid,
  emplacement_id uuid,
  amount decimal,
  payment_method text,
  promo_code text,
  status text,
  created_at timestamptz,
  machine_name text,
  emplacement_name text,
  user_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.machine_id,
    t.emplacement_id,
    t.amount,
    t.payment_method,
    t.promo_code,
    t.status,
    t.created_at,
    COALESCE(m.name, m.nom, '—')::text AS machine_name,
    COALESCE(e.name, e.nom, '—')::text AS emplacement_name,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email,
      '—'
    )::text AS user_name
  FROM transactions t
  LEFT JOIN machines m ON m.id = t.machine_id
  LEFT JOIN emplacements e ON e.id = t.emplacement_id
  LEFT JOIN profiles p ON p.id = t.user_id
  ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_transactions(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_transactions() TO anon;
