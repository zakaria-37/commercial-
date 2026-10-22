-- ============================================================
-- MARIA BAG — PAIEMENTS DES ATELIERS
--   productions.prix_facon : prix de façon d'une pièce payé à l'atelier
--   paiements_ateliers     : paiements (type 'paiement') et soldes de départ (type 'report')
--   Dû à l'atelier = Σ prix_facon × quantité lancée (productions non annulées) + reports − paiements
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
alter table public.productions add column if not exists prix_facon numeric(14,2) not null default 0 check (prix_facon >= 0);

create table if not exists public.paiements_ateliers (
  id uuid primary key default gen_random_uuid(),
  atelier_id uuid references public.ateliers(id) on delete set null,
  atelier_nom text default '',
  production_id uuid references public.productions(id) on delete set null,
  type text not null default 'paiement' check (type in ('paiement', 'report')),
  date_paiement date not null default current_date,
  montant numeric(16,2) not null check (montant > 0),
  mode text default 'especes',
  reference text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paiements_ateliers_atelier_idx on public.paiements_ateliers (atelier_id);
create index if not exists paiements_ateliers_date_idx on public.paiements_ateliers (date_paiement);
drop trigger if exists trg_paiements_ateliers_updated_at on public.paiements_ateliers;
create trigger trg_paiements_ateliers_updated_at before update on public.paiements_ateliers for each row execute function public.set_updated_at();
alter table public.paiements_ateliers enable row level security;
drop policy if exists "paiements_ateliers_select_all" on public.paiements_ateliers;
create policy "paiements_ateliers_select_all" on public.paiements_ateliers for select using (true);
drop policy if exists "paiements_ateliers_insert_all" on public.paiements_ateliers;
create policy "paiements_ateliers_insert_all" on public.paiements_ateliers for insert with check (true);
drop policy if exists "paiements_ateliers_update_all" on public.paiements_ateliers;
create policy "paiements_ateliers_update_all" on public.paiements_ateliers for update using (true) with check (true);
drop policy if exists "paiements_ateliers_delete_all" on public.paiements_ateliers;
create policy "paiements_ateliers_delete_all" on public.paiements_ateliers for delete using (true);
grant select, insert, update, delete on public.paiements_ateliers to anon, authenticated, service_role;
drop trigger if exists trg_journal on public.paiements_ateliers;
create trigger trg_journal after insert or update or delete on public.paiements_ateliers for each row execute function public.journaliser();
