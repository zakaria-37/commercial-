-- ============================================================
-- MARIA BAG — Produits : coût de revient d'UNE pièce avant production
-- Un produit (ex : Sac à dos) = des lignes de coût pour UNE pièce :
--   matière (tissu), doublure, sangle, curseur, emballage,
--   autres outils / fournitures (fil, fermeture, boucle, étiquette…)
-- + la main d'œuvre d'une pièce :
--   (salaires de tous les employés du jour + autres charges du jour)
--   ÷ nombre de pièces fabriquées le même jour
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query
-- (après production.sql, car un produit peut être lié à un modèle).
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

-- ======================= PRODUITS =======================
create table if not exists public.produits (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  description text default '',
  modele_id uuid references public.modeles(id) on delete set null,   -- fiche matières liée (facultatif)
  -- Main d'œuvre d'une pièce (journée de référence)
  mo_date date,                                                       -- jour de référence
  mo_salaires numeric(14,2) not null default 0 check (mo_salaires >= 0),  -- total des salaires du jour
  mo_charges numeric(14,2) not null default 0 check (mo_charges >= 0),    -- autres charges du jour (électricité, loyer, dîner…)
  mo_pieces int not null default 0 check (mo_pieces >= 0),                -- pièces fabriquées ce jour-là
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ======================= LIGNES DE COÛT d'un produit =======================
create table if not exists public.produit_lignes (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  categorie text not null default 'Autre outil',     -- Matière, Doublure, Sangle, Curseur, Emballage, Autre outil
  designation text not null default '',
  unite text not null default 'pcs',
  quantite numeric(14,4) not null default 0 check (quantite >= 0),            -- quantité pour UNE pièce
  prix_unitaire numeric(14,4) not null default 0 check (prix_unitaire >= 0),  -- prix d'achat d'une unité (DA)
  perte_pct numeric(6,2) not null default 0 check (perte_pct >= 0 and perte_pct <= 100),
  note text default '',
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists produit_lignes_produit_idx on public.produit_lignes (produit_id);
create index if not exists produits_modele_idx on public.produits (modele_id);

-- updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_produits_updated_at on public.produits;
create trigger trg_produits_updated_at before update on public.produits
for each row execute function public.set_updated_at();

drop trigger if exists trg_produit_lignes_updated_at on public.produit_lignes;
create trigger trg_produit_lignes_updated_at before update on public.produit_lignes
for each row execute function public.set_updated_at();

-- Sécurité (RLS) — même logique que les autres tables
alter table public.produits enable row level security;
drop policy if exists "produits_select_all" on public.produits;
create policy "produits_select_all" on public.produits for select using (true);
drop policy if exists "produits_insert_all" on public.produits;
create policy "produits_insert_all" on public.produits for insert with check (true);
drop policy if exists "produits_update_all" on public.produits;
create policy "produits_update_all" on public.produits for update using (true) with check (true);
drop policy if exists "produits_delete_all" on public.produits;
create policy "produits_delete_all" on public.produits for delete using (true);

alter table public.produit_lignes enable row level security;
drop policy if exists "produit_lignes_select_all" on public.produit_lignes;
create policy "produit_lignes_select_all" on public.produit_lignes for select using (true);
drop policy if exists "produit_lignes_insert_all" on public.produit_lignes;
create policy "produit_lignes_insert_all" on public.produit_lignes for insert with check (true);
drop policy if exists "produit_lignes_update_all" on public.produit_lignes;
create policy "produit_lignes_update_all" on public.produit_lignes for update using (true) with check (true);
drop policy if exists "produit_lignes_delete_all" on public.produit_lignes;
create policy "produit_lignes_delete_all" on public.produit_lignes for delete using (true);

notify pgrst, 'reload schema';
