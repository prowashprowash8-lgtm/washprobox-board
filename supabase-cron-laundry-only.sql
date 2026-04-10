-- Cron : appeler laundry-notifications toutes les minutes
-- Les secrets project_url et anon_key existent déjà → on ne fait que le cron
-- Exécuter dans Supabase → SQL Editor

-- 1. Supprimer l'ancien cron si présent (éviter les doublons)
DO $$
BEGIN
  PERFORM cron.unschedule('laundry-notifications-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Planifier l'appel toutes les minutes
SELECT cron.schedule(
  'laundry-notifications-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/laundry-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
