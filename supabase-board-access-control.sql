-- Board access control
-- But : attribuer un rôle "patron" ou "residence" à un compte auth,
-- puis lier un compte "residence" à une ou plusieurs laveries (emplacements).
--
-- Important :
-- - sans ligne dans board_account_roles, le board garde son comportement actuel
--   (fallback "patron" côté front pour ne pas casser les comptes existants)
-- - pour restreindre un compte, ajoute une ligne role = 'residence'
--   puis une ou plusieurs lignes dans board_account_emplacements

create table if not exists public.board_account_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('patron', 'residence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_account_emplacements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  emplacement_id uuid not null references public.emplacements (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, emplacement_id)
);

create index if not exists idx_board_account_emplacements_user
  on public.board_account_emplacements (user_id);

create index if not exists idx_board_account_emplacements_emplacement
  on public.board_account_emplacements (emplacement_id);

create or replace function public.board_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_board_account_roles_updated_at on public.board_account_roles;
create trigger trg_board_account_roles_updated_at
before update on public.board_account_roles
for each row execute function public.board_touch_updated_at();

alter table public.board_account_roles enable row level security;
alter table public.board_account_emplacements enable row level security;

drop policy if exists "board_roles_self_or_patron_read" on public.board_account_roles;
create policy "board_roles_self_or_patron_read"
on public.board_account_roles
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
);

drop policy if exists "board_roles_patron_manage" on public.board_account_roles;
create policy "board_roles_patron_manage"
on public.board_account_roles
for all
using (
  exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
)
with check (
  exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
);

drop policy if exists "board_emplacements_self_or_patron_read" on public.board_account_emplacements;
create policy "board_emplacements_self_or_patron_read"
on public.board_account_emplacements
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
);

drop policy if exists "board_emplacements_patron_manage" on public.board_account_emplacements;
create policy "board_emplacements_patron_manage"
on public.board_account_emplacements
for all
using (
  exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
)
with check (
  exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
);

-- Exemples :
-- 1) Donner un accès patron :
-- insert into public.board_account_roles (user_id, role)
-- values ('UUID_AUTH_ICI', 'patron')
-- on conflict (user_id) do update set role = excluded.role;
--
-- 2) Donner un accès résidence :
-- insert into public.board_account_roles (user_id, role)
-- values ('UUID_AUTH_ICI', 'residence')
-- on conflict (user_id) do update set role = excluded.role;
--
-- 3) Lier ce compte à une ou plusieurs laveries :
-- insert into public.board_account_emplacements (user_id, emplacement_id)
-- values ('UUID_AUTH_ICI', 'UUID_EMPLACEMENT_1'), ('UUID_AUTH_ICI', 'UUID_EMPLACEMENT_2')
-- on conflict (user_id, emplacement_id) do nothing;
