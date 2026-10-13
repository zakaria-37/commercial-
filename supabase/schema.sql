-- ============================================================
-- MARIA BAG — schéma Supabase pour la table des contacts
-- À exécuter une seule fois dans : Supabase > SQL Editor > New query
-- ============================================================

create extension if not exists pgcrypto;

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

-- Garde "updated_at" à jour automatiquement
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Sécurité (RLS)
-- ------------------------------------------------------------
-- Cette application n'utilise PAS de compte Supabase par utilisateur :
-- l'accès est protégé uniquement par l'écran "mot de passe" côté
-- interface (voir js/config.js -> APP_PASSWORD). La clé "anon" doit
-- donc pouvoir lire/écrire la table. Gardez l'URL et la clé anon de
-- votre projet hors des dépôts publics si vous voulez limiter l'accès
-- aux personnes qui connaissent déjà l'adresse du site.
alter table public.contacts enable row level security;

drop policy if exists "contacts_select_all" on public.contacts;
create policy "contacts_select_all" on public.contacts for select using (true);

drop policy if exists "contacts_insert_all" on public.contacts;
create policy "contacts_insert_all" on public.contacts for insert with check (true);

drop policy if exists "contacts_update_all" on public.contacts;
create policy "contacts_update_all" on public.contacts for update using (true) with check (true);

drop policy if exists "contacts_delete_all" on public.contacts;
create policy "contacts_delete_all" on public.contacts for delete using (true);
