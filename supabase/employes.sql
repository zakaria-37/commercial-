-- ============================================================
-- MARIA BAG — Module EMPLOYÉS (à exécuter dans Supabase > SQL Editor)
-- Sans risque : peut être relancé plusieurs fois.
-- ============================================================

create extension if not exists pgcrypto;

-- ======================= TABLE: EMPLOYES =======================
create table if not exists public.employes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text default '',
  poste text default '',
  salaire_mensuel numeric(12,2) not null default 0,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ======================= TABLE: ACOMPTES (avances hebdomadaires) =======================
create table if not exists public.acomptes (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  date_acompte date not null,
  montant numeric(12,2) not null default 0,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acomptes_employe_idx on public.acomptes (employe_id);
create index if not exists acomptes_date_idx on public.acomptes (date_acompte);

-- ======================= updated_at =======================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employes_updated_at on public.employes;
create trigger trg_employes_updated_at before update on public.employes
for each row execute function public.set_updated_at();

drop trigger if exists trg_acomptes_updated_at on public.acomptes;
create trigger trg_acomptes_updated_at before update on public.acomptes
for each row execute function public.set_updated_at();

-- ======================= SÉCURITÉ (RLS) — même logique que les autres tables =======================
alter table public.employes enable row level security;
drop policy if exists "employes_select_all" on public.employes;
create policy "employes_select_all" on public.employes for select using (true);
drop policy if exists "employes_insert_all" on public.employes;
create policy "employes_insert_all" on public.employes for insert with check (true);
drop policy if exists "employes_update_all" on public.employes;
create policy "employes_update_all" on public.employes for update using (true) with check (true);
drop policy if exists "employes_delete_all" on public.employes;
create policy "employes_delete_all" on public.employes for delete using (true);

alter table public.acomptes enable row level security;
drop policy if exists "acomptes_select_all" on public.acomptes;
create policy "acomptes_select_all" on public.acomptes for select using (true);
drop policy if exists "acomptes_insert_all" on public.acomptes;
create policy "acomptes_insert_all" on public.acomptes for insert with check (true);
drop policy if exists "acomptes_update_all" on public.acomptes;
create policy "acomptes_update_all" on public.acomptes for update using (true) with check (true);
drop policy if exists "acomptes_delete_all" on public.acomptes;
create policy "acomptes_delete_all" on public.acomptes for delete using (true);

notify pgrst, 'reload schema';
