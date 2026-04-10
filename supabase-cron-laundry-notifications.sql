-- Cron : appeler laundry-notifications toutes les minutes
-- Exécuter dans Supabase → SQL Editor
-- Prérequis : extensions pg_cron et pg_net activées

-- 1. Activer les extensions (si pas déjà fait)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Stocker les secrets dans le Vault (à exécuter une seule fois)
-- Si erreur "already exists", ignorer et passer à l'étape 3
SELECT vault.create_secret('https://ftechtqyocgdabfkmclm.supabase.co', 'project_url');
SELECT vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZWNodHF5b2NnZGFiZmttY2xtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODIwNjIsImV4cCI6MjA4ODM1ODA2Mn0.JJ3XgrH5u1nfUH9HADiEAd_KOfcDyNQHt_D_MykS3k4', 'anon_key');

-- 3. Supprimer l'ancien cron si tu le relances (éviter les doublons)
DO $$
BEGIN
  PERFORM cron.unschedule('laundry-notifications-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Planifier l'appel toutes les minutes
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
