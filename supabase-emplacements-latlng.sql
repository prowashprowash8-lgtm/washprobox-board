-- Ajoute latitude/longitude sur les emplacements BOARD (si absent).
-- But: éviter les écarts board/CRM et stabiliser la carte CRM.

alter table public.emplacements
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists idx_emplacements_lat_lng
  on public.emplacements (latitude, longitude);

comment on column public.emplacements.latitude is
  'Latitude de la laverie côté board (optionnelle, auto-géocodée lors de la création).';
comment on column public.emplacements.longitude is
  'Longitude de la laverie côté board (optionnelle, auto-géocodée lors de la création).';
