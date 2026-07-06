-- RPC pour modifier le profil utilisateur (first_name, last_name)
-- Exécuter dans Supabase → SQL Editor → Run

CREATE OR REPLACE FUNCTION public.update_profile(
  p_user_id uuid,
  p_first_name text default null,
  p_last_name text default null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user json;
BEGIN
  UPDATE profiles
  SET
    first_name = COALESCE(NULLIF(TRIM(p_first_name), ''), first_name),
    last_name = COALESCE(NULLIF(TRIM(p_last_name), ''), last_name)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'id', id,
    'email', email,
    'first_name', first_name,
    'last_name', last_name,
    'created_at', created_at,
    'last_login_at', last_login_at
  ) INTO v_user
  FROM profiles WHERE id = p_user_id;

  RETURN v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile(uuid, text, text) TO anon;
