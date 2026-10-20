-- ============================================================
-- MARIA BAG — INVENTAIRE ANNUEL
-- Un inventaire = une photo figée de l'atelier à une date (ex. « Inventaire 2026 ») :
--   ACTIFS   : stock des éléments, stock des produits finis (au coût de revient),
--              créances clients, avances aux employés, autres créances / trésorerie
--   PASSIFS  : dettes fournisseurs, sommes dues aux employés, autres dettes
--   VALEUR NETTE = actifs − passifs ; on la compare d'une année à l'autre.
-- Les lignes copient les noms et prix au moment de l'inventaire : l'historique ne change plus
-- même si on renomme ou supprime un article, un client ou un produit.
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.inventaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  annee int not null,
  date_inventaire date not null default current_date,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'cloture')),
  debut_periode date,                                   -- date de l'inventaire précédent (exclue)
  ventes numeric(16,2) not null default 0,              -- chiffre d'affaires de la période (figé à la clôture)
  achats numeric(16,2) not null default 0,              -- achats fournisseurs de la période (figé à la clôture)
  valeur_nette numeric(16,2) not null default 0,        -- figée à la clôture
  stock_applique boolean not null default false,        -- les écarts ont été reportés dans le stock
  notes text default '',
  cloture_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventaire_lignes (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references public.inventaires(id) on delete cascade,
  section text not null check (section in ('matiere', 'produit_fini', 'client', 'fournisseur', 'employe_creance', 'employe_dette', 'autre_actif', 'autre_passif')),
  ref_id uuid,                                          -- article / produit / contact / employé d'origine (copie, sans lien bloquant)
  libelle text not null default '',
  detail text default '',                               -- catégorie, couleur…
  unite text default '',
  quantite_theorique numeric(16,4),                     -- stock selon la plateforme
  quantite numeric(16,4) check (quantite is null or quantite >= 0),   -- stock réellement compté
  prix_unitaire numeric(18,6) not null default 0 check (prix_unitaire >= 0),   -- par unité de mesure (m, pièce…)
  cond_nom text default '',                             -- rouleau, carton… (si l'article se compte ainsi)
  cond_qte numeric(16,4) not null default 0,            -- contenu d'un rouleau en unité de mesure
  prix_vente numeric(16,2) default 0,
  montant numeric(16,2) not null default 0 check (montant >= 0),
  note text default '',
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventaire_lignes_inv_idx on public.inventaire_lignes (inventaire_id);

drop trigger if exists trg_inventaires_updated_at on public.inventaires;
create trigger trg_inventaires_updated_at before update on public.inventaires for each row execute function public.set_updated_at();
drop trigger if exists trg_inventaire_lignes_updated_at on public.inventaire_lignes;
create trigger trg_inventaire_lignes_updated_at before update on public.inventaire_lignes for each row execute function public.set_updated_at();

alter table public.inventaires enable row level security;
alter table public.inventaire_lignes enable row level security;
drop policy if exists "inventaires_select_all" on public.inventaires;
create policy "inventaires_select_all" on public.inventaires for select using (true);
drop policy if exists "inventaires_insert_all" on public.inventaires;
create policy "inventaires_insert_all" on public.inventaires for insert with check (true);
drop policy if exists "inventaires_update_all" on public.inventaires;
create policy "inventaires_update_all" on public.inventaires for update using (true) with check (true);
drop policy if exists "inventaires_delete_all" on public.inventaires;
create policy "inventaires_delete_all" on public.inventaires for delete using (true);
drop policy if exists "inventaire_lignes_select_all" on public.inventaire_lignes;
create policy "inventaire_lignes_select_all" on public.inventaire_lignes for select using (true);
drop policy if exists "inventaire_lignes_insert_all" on public.inventaire_lignes;
create policy "inventaire_lignes_insert_all" on public.inventaire_lignes for insert with check (true);
drop policy if exists "inventaire_lignes_update_all" on public.inventaire_lignes;
create policy "inventaire_lignes_update_all" on public.inventaire_lignes for update using (true) with check (true);
drop policy if exists "inventaire_lignes_delete_all" on public.inventaire_lignes;
create policy "inventaire_lignes_delete_all" on public.inventaire_lignes for delete using (true);

-- Droits d'accès à l'API (obligatoires pour les nouvelles tables à partir du 30 octobre 2026)
grant select, insert, update, delete on public.inventaires to anon, authenticated, service_role;
grant select, insert, update, delete on public.inventaire_lignes to anon, authenticated, service_role;

notify pgrst, 'reload schema';
