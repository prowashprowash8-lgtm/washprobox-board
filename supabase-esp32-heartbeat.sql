-- WashPro : Détection automatique de l'ESP32 en ligne
-- Exécuter dans Supabase → SQL Editor
-- L'ESP32 envoie un heartbeat à chaque poll. L'app vérifie avant d'autoriser le paiement.

-- 1. Table heartbeat
create table if not exists public.esp32_heartbeat (
  esp32_id text primary key,
  last_seen timestamptz not null default now()
);

-- 2. Trigger : last_seen = now() à chaque insert/update
create or replace function public.esp32_heartbeat_set_last_seen()
returns trigger language plpgsql as $$
begin
  new.last_seen := now();
  return new;
end;
$$;

drop trigger if exists esp32_heartbeat_touch on public.esp32_heartbeat;
create trigger esp32_heartbeat_touch
  before insert or update on public.esp32_heartbeat
  for each row execute function public.esp32_heartbeat_set_last_seen();

-- 3. RLS
alter table public.esp32_heartbeat enable row level security;

drop policy if exists "ESP32 upsert heartbeat" on public.esp32_heartbeat;
create policy "ESP32 upsert heartbeat"
  on public.esp32_heartbeat for all using (true) with check (true);

-- 4. RPC : vérifier si l'ESP32 est en ligne (pollé dans les 45 dernières secondes)
create or replace function public.check_esp32_online(p_esp32_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  if p_esp32_id is null or trim(p_esp32_id) = '' then return false; end if;
  select last_seen into v_last from esp32_heartbeat where esp32_id = trim(p_esp32_id);
  return v_last is not null and (now() - v_last) < interval '15 seconds';
end;
$$;

grant execute on function public.check_esp32_online(text) to anon;

-- 5. RPC : enregistrer le heartbeat (appelé par l'ESP32)
create or replace function public.register_esp32_heartbeat(p_esp32_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_esp32_id is null or trim(p_esp32_id) = '' then return; end if;
  insert into esp32_heartbeat (esp32_id, last_seen)
  values (trim(p_esp32_id), now())
  on conflict (esp32_id) do update set last_seen = now();
end;
$$;

grant execute on function public.register_esp32_heartbeat(text) to anon;
