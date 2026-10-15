-- ============================================================
-- MARIA BAG — Salaire par POINTAGE (heures par jour)
-- À exécuter UNE FOIS dans Supabase > SQL Editor (après employes.sql).
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Taux horaire (DA / heure) pour chaque employé
alter table public.employes
  add column if not exists taux_horaire numeric(12,2) not null default 0;

-- 2) Table des pointages : heures travaillées chaque jour
create table if not exists public.pointages (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  date_pointage date not null,
  heures numeric(5,2) not null default 0 check (heures >= 0 and heures <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employe_id, date_pointage)
);

-- Heure de début et heure de fin de travail (ex : 08:12 -> 19:05)
alter table public.pointages add column if not exists heure_debut time;
alter table public.pointages add column if not exists heure_fin time;

create index if not exists pointages_employe_idx on public.pointages (employe_id);
create index if not exists pointages_date_idx on public.pointages (date_pointage);

-- 3) updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pointages_updated_at on public.pointages;
create trigger trg_pointages_updated_at before update on public.pointages
for each row execute function public.set_updated_at();

-- 4) Sécurité (RLS) — même logique que les autres tables
alter table public.pointages enable row level security;
drop policy if exists "pointages_select_all" on public.pointages;
create policy "pointages_select_all" on public.pointages for select using (true);
drop policy if exists "pointages_insert_all" on public.pointages;
create policy "pointages_insert_all" on public.pointages for insert with check (true);
drop policy if exists "pointages_update_all" on public.pointages;
create policy "pointages_update_all" on public.pointages for update using (true) with check (true);
drop policy if exists "pointages_delete_all" on public.pointages;
create policy "pointages_delete_all" on public.pointages for delete using (true);

notify pgrst, 'reload schema';