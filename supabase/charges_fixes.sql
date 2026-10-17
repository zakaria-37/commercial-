-- ============================================================
-- MARIA BAG — CHARGES FIXES de chaque jour + FINITION EXTÉRIEURE
-- 1) charges_fixes : dîner, loyer, électricité, autre charge fixe…
--    On les règle UNE SEULE FOIS (montant par jour) : l'application les
--    applique automatiquement à chaque jour, sans les ressaisir.
--    Seules ces charges fixes entrent dans la main d'œuvre d'une pièce
--    (les charges variables saisies jour par jour n'y entrent pas).
-- 2) composants.type / prix_unitaire : une ligne de la fiche matières peut
--    être une « finition extérieure » payée à la pièce aux finisseurs.
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query.
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.charges_fixes (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,                                   -- ex : Loyer, Dîner des employés
  categorie text not null default 'Autre charge fixe',     -- Électricité, Loyer, Dîner des employés, Autre charge fixe
  montant numeric(12,2) not null default 0 check (montant >= 0),   -- montant PAR JOUR (DA)
  jours text not null default 'travailles' check (jours in ('travailles', 'tous')),  -- jours travaillés (pointage) ou tous les jours
  date_debut date not null default current_date,           -- la charge s'applique à partir de cette date
  date_fin date,                                           -- vide = jusqu'à nouvel ordre
  actif boolean not null default true,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Finition extérieure (Production > fiche matières)
do $$
begin
  if to_regclass('public.composants') is not null then
    alter table public.composants add column if not exists type text not null default 'matiere';
    alter table public.composants add column if not exists prix_unitaire numeric(14,2) not null default 0;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_charges_fixes_updated_at on public.charges_fixes;
create trigger trg_charges_fixes_updated_at before update on public.charges_fixes
for each row execute function public.set_updated_at();

-- Sécurité (RLS) — même logique que les autres tables
alter table public.charges_fixes enable row level security;
drop policy if exists "charges_fixes_select_all" on public.charges_fixes;
create policy "charges_fixes_select_all" on public.charges_fixes for select using (true);
drop policy if exists "charges_fixes_insert_all" on public.charges_fixes;
create policy "charges_fixes_insert_all" on public.charges_fixes for insert with check (true);
drop policy if exists "charges_fixes_update_all" on public.charges_fixes;
create policy "charges_fixes_update_all" on public.charges_fixes for update using (true) with check (true);
drop policy if exists "charges_fixes_delete_all" on public.charges_fixes;
create policy "charges_fixes_delete_all" on public.charges_fixes for delete using (true);

notify pgrst, 'reload schema';
