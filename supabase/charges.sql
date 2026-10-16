-- ============================================================
-- MARIA BAG — Charges de l'atelier (dépenses de chaque jour)
-- Catégories : Paie des employés, Électricité, Loyer,
--              Dîner des employés, Autre charge
-- À exécuter UNE FOIS dans Supabase > SQL Editor > New query.
-- Sans risque : peut être relancé plusieurs fois, aucune donnée supprimée.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  date_charge date not null,
  categorie text not null,
  montant numeric(12,2) not null default 0 check (montant >= 0),
  employe_id uuid references public.employes(id) on delete set null,
  employe_nom text default '',          -- copie du nom : l'historique reste lisible si l'employé est supprimé
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charges_date_idx on public.charges (date_charge);
create index if not exists charges_categorie_idx on public.charges (categorie);
create index if not exists charges_employe_idx on public.charges (employe_id);

-- updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_charges_updated_at on public.charges;
create trigger trg_charges_updated_at before update on public.charges
for each row execute function public.set_updated_at();

-- Sécurité (RLS) — même logique que les autres tables
alter table public.charges enable row level security;
drop policy if exists "charges_select_all" on public.charges;
create policy "charges_select_all" on public.charges for select using (true);
drop policy if exists "charges_insert_all" on public.charges;
create policy "charges_insert_all" on public.charges for insert with check (true);
drop policy if exists "charges_update_all" on public.charges;
create policy "charges_update_all" on public.charges for update using (true) with check (true);
drop policy if exists "charges_delete_all" on public.charges;
create policy "charges_delete_all" on public.charges for delete using (true);

notify pgrst, 'reload schema';
