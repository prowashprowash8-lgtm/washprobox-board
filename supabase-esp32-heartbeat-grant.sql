-- Permettre à l'app (anon + authenticated) d'appeler check_esp32_online
-- Exécuter dans Supabase → SQL Editor si "Machine Hors-ligne" persiste

GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO authenticated;
