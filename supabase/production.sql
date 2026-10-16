-- ============================================================
-- MARIA BAG — Production : fiche matières (nomenclature) par modèle
-- Un modèle (ex : Sac à dos) = une liste de composants avec la
-- quantité nécessaire POUR UNE PIÈCE (0,5 m de tissu, 3 sangles…).
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query.
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

-- ======================= MODÈLES (produits) =======================
create table if not exists public.modeles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ======================= COMPOSANTS d'un modèle =======================
create table if not exists public.composants (
  id uuid primary key default gen_random_uuid(),
  modele_id uuid not null references public.modeles(id) on delete cascade,
  nom text not null,
  unite text not null default 'pcs',                    -- m, pcs, paire, kg, g, L, bobine, rouleau, cm
  quantite numeric(14,4) not null default 0 check (quantite >= 0),   -- quantité pour UNE pièce
  perte_pct numeric(6,2) not null default 0 check (perte_pct >= 0 and perte_pct <= 100),  -- marge de chute (%)
  note text default '',
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists composants_modele_idx on public.composants (modele_id);

-- updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_modeles_updated_at on public.modeles;
create trigger trg_modeles_updated_at before update on public.modeles
for each row execute function public.set_updated_at();

drop trigger if exists trg_composants_updated_at on public.composants;
create trigger trg_composants_updated_at before update on public.composants
for each row execute function public.set_updated_at();

-- Sécurité (RLS) — même logique que les autres tables
alter table public.modeles enable row level security;
drop policy if exists "modeles_select_all" on public.modeles;
create policy "modeles_select_all" on public.modeles for select using (true);
drop policy if exists "modeles_insert_all" on public.modeles;
create policy "modeles_insert_all" on public.modeles for insert with check (true);
drop policy if exists "modeles_update_all" on public.modeles;
create policy "modeles_update_all" on public.modeles for update using (true) with check (true);
drop policy if exists "modeles_delete_all" on public.modeles;
create policy "modeles_delete_all" on public.modeles for delete using (true);

alter table public.composants enable row level security;
drop policy if exists "composants_select_all" on public.composants;
create policy "composants_select_all" on public.composants for select using (true);
drop policy if exists "composants_insert_all" on public.composants;
create policy "composants_insert_all" on public.composants for insert with check (true);
drop policy if exists "composants_update_all" on public.composants;
create policy "composants_update_all" on public.composants for update using (true) with check (true);
drop policy if exists "composants_delete_all" on public.composants;
create policy "composants_delete_all" on public.composants for delete using (true);

notify pgrst, 'reload schema';
