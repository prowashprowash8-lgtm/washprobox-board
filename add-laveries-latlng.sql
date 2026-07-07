-- Ajoute latitude/longitude à laveries — colonnes déjà référencées par
-- insert_crm_laverie_from_board(uuid,text,text) et trg_emplacement_update_sync_crm() sans
-- jamais avoir été créées, ce qui faisait échouer silencieusement une partie de la synchro
-- emplacements → laveries (capturé dans crm_laverie_links.sync_status/last_error).
-- Trouvé le 2026-07-07 en construisant la carte des laveries de l'accueil CRM.

alter table public.laveries add column if not exists latitude double precision;
alter table public.laveries add column if not exists longitude double precision;

-- Recale les laveries déjà liées à un emplacement géolocalisé
update public.laveries l
set latitude = e.latitude, longitude = e.longitude
from public.crm_laverie_links k
join public.emplacements e on e.id = k.emplacement_id
where k.crm_site_id = l.id::text
  and e.latitude is not null
  and e.longitude is not null;
