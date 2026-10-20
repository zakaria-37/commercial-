-- ============================================================
-- MARIA BAG — STOCK DES PRODUITS FINIS
-- Un produit fini = un produit de l'onglet Produits (même modèle).
-- Le stock = SOMME des mouvements (pièces) :
--   entree     production terminée / réception d'atelier (+)
--   livraison  livraison à un client, liée à une commande (−)
--   retour     retour d'un client (+)
--   perte      casse, défaut, échantillon (−)
--   ajustement inventaire (±)
-- Liens :
--   pf_mouvements.contact_id    -> Contacts (clients livrés)
--   pf_mouvements.commande_id   -> Ateliers > Suivi & commandes
--                                  (la quantité reçue de la commande suit les livraisons)
--   pf_mouvements.production_id -> Ateliers > Productions (entrée automatique)
--   productions.produit_id      -> produit fini correspondant au modèle de la production
--   produits.prix_vente / seuil_pf : prix de vente (marge) et seuil d'alerte
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query.
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

-- Produits : prix de vente et seuil d'alerte du stock fini
alter table public.produits add column if not exists prix_vente numeric(14,2) not null default 0 check (prix_vente >= 0);
alter table public.produits add column if not exists seuil_pf int not null default 0 check (seuil_pf >= 0);

-- Productions : produit fini correspondant (mémorisé quand on le choisit)
alter table public.productions add column if not exists produit_id uuid references public.produits(id) on delete set null;
create index if not exists productions_produit_idx on public.productions (produit_id);

-- Mouvements du stock des produits finis
create table if not exists public.pf_mouvements (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  date_mvt date not null default current_date,
  type text not null default 'entree' check (type in ('entree', 'livraison', 'retour', 'perte', 'ajustement')),
  quantite int not null,                                   -- pièces ; positif = entrée, négatif = sortie
  contact_id uuid references public.contacts(id) on delete set null,   -- client livré
  client_nom text default '',                              -- copie du nom : l'historique reste lisible si le contact est supprimé
  commande_id uuid references public.commandes(id) on delete set null,
  production_id uuid references public.productions(id) on delete set null,
  prix_vente numeric(14,2),                                -- prix de vente d'une pièce à cette livraison (DA)
  reference text default '',                               -- n° de bon de livraison (BL-…), de production…
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pf_mouvements_produit_idx on public.pf_mouvements (produit_id);
create index if not exists pf_mouvements_contact_idx on public.pf_mouvements (contact_id);
create index if not exists pf_mouvements_commande_idx on public.pf_mouvements (commande_id);
create index if not exists pf_mouvements_production_idx on public.pf_mouvements (production_id);
create index if not exists pf_mouvements_date_idx on public.pf_mouvements (date_mvt);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pf_mouvements_updated_at on public.pf_mouvements;
create trigger trg_pf_mouvements_updated_at before update on public.pf_mouvements
for each row execute function public.set_updated_at();

-- Sécurité (RLS) — même logique que les autres tables
alter table public.pf_mouvements enable row level security;
drop policy if exists "pf_mouvements_select_all" on public.pf_mouvements;
create policy "pf_mouvements_select_all" on public.pf_mouvements for select using (true);
drop policy if exists "pf_mouvements_insert_all" on public.pf_mouvements;
create policy "pf_mouvements_insert_all" on public.pf_mouvements for insert with check (true);
drop policy if exists "pf_mouvements_update_all" on public.pf_mouvements;
create policy "pf_mouvements_update_all" on public.pf_mouvements for update using (true) with check (true);
drop policy if exists "pf_mouvements_delete_all" on public.pf_mouvements;
create policy "pf_mouvements_delete_all" on public.pf_mouvements for delete using (true);

-- Droits d'accès à l'API (obligatoires pour les nouvelles tables à partir du 30 octobre 2026)
grant select, insert, update, delete on public.pf_mouvements to anon, authenticated, service_role;

notify pgrst, 'reload schema';
