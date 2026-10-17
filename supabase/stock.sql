-- ============================================================
-- MARIA BAG — STOCK des matières et fournitures
-- Chaque article = une variante précise d'une catégorie :
--   Tissu principal / Kawi normal, Tissu principal / Kawi bébé, Sky…
--   Doublure, Sangle, Curseur, Fermeture, Éponge, Poignée, Boucle,
--   Fil, Étiquette, Emballage…
-- Le tissu (et tout ce qui s'achète en rouleau) a un CONDITIONNEMENT :
--   ex. 1 rouleau Kawi normal = 45 m, prix d'achat du rouleau = X DA
--   -> prix du mètre = prix du rouleau ÷ 45 (calculé par l'application)
-- Le stock est la SOMME des mouvements (entrées, sorties, inventaires) :
--   jamais de total à corriger, aucun conflit entre PC et téléphone.
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query.
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

-- ======================= ARTICLES =======================
create table if not exists public.stock_articles (
  id uuid primary key default gen_random_uuid(),
  categorie text not null,                    -- Tissu principal, Doublure, Sangle…
  nom text not null,                          -- la variante : Kawi normal, Kawi bébé, Sky…
  unite text not null default 'm',            -- unité de mesure du stock (m, pcs, kg, bobine…)
  cond_nom text not null default '',          -- conditionnement d'achat : rouleau, carton, paquet… (vide = aucun)
  cond_qte numeric(14,4) not null default 0 check (cond_qte >= 0),    -- contenu d'un conditionnement, ex. 45 (m par rouleau)
  prix_achat numeric(14,2) not null default 0 check (prix_achat >= 0), -- prix d'UN conditionnement (ou d'une unité s'il n'y en a pas)
  seuil_alerte numeric(14,4) not null default 0 check (seuil_alerte >= 0),  -- alerte quand le stock descend à ce niveau (en unité de mesure)
  fournisseur text default '',
  couleur text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categorie, nom)
);
create index if not exists stock_articles_categorie_idx on public.stock_articles (categorie);

-- ======================= MOUVEMENTS =======================
create table if not exists public.stock_mouvements (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.stock_articles(id) on delete cascade,
  date_mvt date not null default current_date,
  type text not null default 'entree' check (type in ('entree', 'sortie', 'ajustement')),
  quantite numeric(14,4) not null,            -- en unité de mesure ; positif = entrée, négatif = sortie
  prix_achat numeric(14,2),                   -- prix d'un conditionnement à cet achat (entrées)
  fournisseur text default '',
  reference text default '',                  -- n° de bon (BM-…), facture, etc.
  note text default '',
  source text not null default 'manuel',      -- manuel | production
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stock_mouvements_article_idx on public.stock_mouvements (article_id);
create index if not exists stock_mouvements_date_idx on public.stock_mouvements (date_mvt);
create index if not exists stock_mouvements_ref_idx on public.stock_mouvements (reference);

-- ======================= LIENS avec les autres sections =======================
-- Fiche matières (Production) : chaque composant peut pointer vers un article du stock
do $$
begin
  if to_regclass('public.composants') is not null then
    alter table public.composants
      add column if not exists article_id uuid references public.stock_articles(id) on delete set null;
    create index if not exists composants_article_idx on public.composants (article_id);
  end if;
  -- Produits (coût de revient) : chaque ligne peut reprendre le prix du stock automatiquement
  if to_regclass('public.produit_lignes') is not null then
    alter table public.produit_lignes
      add column if not exists article_id uuid references public.stock_articles(id) on delete set null;
    create index if not exists produit_lignes_article_idx on public.produit_lignes (article_id);
  end if;
end $$;

-- updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_articles_updated_at on public.stock_articles;
create trigger trg_stock_articles_updated_at before update on public.stock_articles
for each row execute function public.set_updated_at();

drop trigger if exists trg_stock_mouvements_updated_at on public.stock_mouvements;
create trigger trg_stock_mouvements_updated_at before update on public.stock_mouvements
for each row execute function public.set_updated_at();

-- Sécurité (RLS) — même logique que les autres tables
alter table public.stock_articles enable row level security;
drop policy if exists "stock_articles_select_all" on public.stock_articles;
create policy "stock_articles_select_all" on public.stock_articles for select using (true);
drop policy if exists "stock_articles_insert_all" on public.stock_articles;
create policy "stock_articles_insert_all" on public.stock_articles for insert with check (true);
drop policy if exists "stock_articles_update_all" on public.stock_articles;
create policy "stock_articles_update_all" on public.stock_articles for update using (true) with check (true);
drop policy if exists "stock_articles_delete_all" on public.stock_articles;
create policy "stock_articles_delete_all" on public.stock_articles for delete using (true);

alter table public.stock_mouvements enable row level security;
drop policy if exists "stock_mouvements_select_all" on public.stock_mouvements;
create policy "stock_mouvements_select_all" on public.stock_mouvements for select using (true);
drop policy if exists "stock_mouvements_insert_all" on public.stock_mouvements;
create policy "stock_mouvements_insert_all" on public.stock_mouvements for insert with check (true);
drop policy if exists "stock_mouvements_update_all" on public.stock_mouvements;
create policy "stock_mouvements_update_all" on public.stock_mouvements for update using (true) with check (true);
drop policy if exists "stock_mouvements_delete_all" on public.stock_mouvements;
create policy "stock_mouvements_delete_all" on public.stock_mouvements for delete using (true);

notify pgrst, 'reload schema';
