-- ============================================================
-- MARIA BAG — Schéma Supabase complet (Contacts + Ateliers)
-- À exécuter une seule fois dans : Supabase > SQL Editor > New query
-- ============================================================

create extension if not exists pgcrypto;

-- ======================= TABLE: CONTACTS =======================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  nom text not null default '',
  prenom text default '',
  poste text default '',
  societe text default '',
  type text not null default 'Client',
  statut text not null default 'En attente',
  tel text default '',
  email text default '',
  ville text default '',
  source text default '',
  produits text default '',
  derniere date,
  relance date,
  notes text default '',
  hist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_relance_idx on public.contacts (relance);
create index if not exists contacts_type_idx on public.contacts (type);
create index if not exists contacts_statut_idx on public.contacts (statut);

-- ======================= TABLE: ATELIERS =======================
create table if not exists public.ateliers (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  adresse text default '',
  tel text default '',
  email text default '',
  responsable text default '',
  capacite_journaliere int default 0,
  statut text not null default 'Actif',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ateliers_statut_idx on public.ateliers (statut);

-- ======================= TABLE: PRODUCTIONS =======================
create table if not exists public.productions (
  id uuid primary key default gen_random_uuid(),
  atelier_id uuid not null references public.ateliers(id) on delete cascade,
  modele_nom text not null,
  quantite_lancee int not null default 0,
  date_lancement date not null,
  date_reception_prevue date not null,
  date_reception_reelle date,
  statut text not null default 'En cours',
  delai_jours int,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists productions_atelier_idx on public.productions (atelier_id);
create index if not exists productions_statut_idx on public.productions (statut);
create index if not exists productions_date_lancement_idx on public.productions (date_lancement);
create index if not exists productions_date_reception_idx on public.productions (date_reception_prevue);

-- ======================= TABLE: COMMANDES =======================
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  commande_numero text unique,
  quantite_commandee int not null default 0,
  quantite_recue int default 0,
  date_commande date not null,
  date_reception_prevue date,
  statut text not null default 'En attente',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commandes_production_idx on public.commandes (production_id);
create index if not exists commandes_contact_idx on public.commandes (contact_id);
create index if not exists commandes_statut_idx on public.commandes (statut);

-- ======================= FONCTION: MISE À JOUR updated_at =======================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger pour contacts
drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- Trigger pour ateliers
drop trigger if exists trg_ateliers_updated_at on public.ateliers;
create trigger trg_ateliers_updated_at
before update on public.ateliers
for each row execute function public.set_updated_at();

-- Trigger pour productions
drop trigger if exists trg_productions_updated_at on public.productions;
create trigger trg_productions_updated_at
before update on public.productions
for each row execute function public.set_updated_at();

-- Trigger pour commandes
drop trigger if exists trg_commandes_updated_at on public.commandes;
create trigger trg_commandes_updated_at
before update on public.commandes
for each row execute function public.set_updated_at();

-- ======================= SÉCURITÉ (RLS) =======================
-- RLS pour contacts
alter table public.contacts enable row level security;
drop policy if exists "contacts_select_all" on public.contacts;
create policy "contacts_select_all" on public.contacts for select using (true);
drop policy if exists "contacts_insert_all" on public.contacts;
create policy "contacts_insert_all" on public.contacts for insert with check (true);
drop policy if exists "contacts_update_all" on public.contacts;
create policy "contacts_update_all" on public.contacts for update using (true) with check (true);
drop policy if exists "contacts_delete_all" on public.contacts;
create policy "contacts_delete_all" on public.contacts for delete using (true);

-- RLS pour ateliers
alter table public.ateliers enable row level security;
drop policy if exists "ateliers_select_all" on public.ateliers;
create policy "ateliers_select_all" on public.ateliers for select using (true);
drop policy if exists "ateliers_insert_all" on public.ateliers;
create policy "ateliers_insert_all" on public.ateliers for insert with check (true);
drop policy if exists "ateliers_update_all" on public.ateliers;
create policy "ateliers_update_all" on public.ateliers for update using (true) with check (true);
drop policy if exists "ateliers_delete_all" on public.ateliers;
create policy "ateliers_delete_all" on public.ateliers for delete using (true);

-- RLS pour productions
alter table public.productions enable row level security;
drop policy if exists "productions_select_all" on public.productions;
create policy "productions_select_all" on public.productions for select using (true);
drop policy if exists "productions_insert_all" on public.productions;
create policy "productions_insert_all" on public.productions for insert with check (true);
drop policy if exists "productions_update_all" on public.productions;
create policy "productions_update_all" on public.productions for update using (true) with check (true);
drop policy if exists "productions_delete_all" on public.productions;
create policy "productions_delete_all" on public.productions for delete using (true);

-- RLS pour commandes
alter table public.commandes enable row level security;
drop policy if exists "commandes_select_all" on public.commandes;
create policy "commandes_select_all" on public.commandes for select using (true);
drop policy if exists "commandes_insert_all" on public.commandes;
create policy "commandes_insert_all" on public.commandes for insert with check (true);
drop policy if exists "commandes_update_all" on public.commandes;
create policy "commandes_update_all" on public.commandes for update using (true) with check (true);
drop policy if exists "commandes_delete_all" on public.commandes;
create policy "commandes_delete_all" on public.commandes for delete using (true);