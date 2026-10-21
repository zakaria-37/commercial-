-- ============================================================
-- MARIA BAG — PAIEMENTS ET SOLDES (clients et fournisseurs)
-- Un paiement = un encaissement d'un client ou un règlement à un fournisseur.
-- Un « solde de départ » (report) reprend ce qui était dû avant d'utiliser la plateforme.
--   Solde client      = report + ventes (livraisons − retours) − encaissements
--   Solde fournisseur = report + achats (entrées de stock avec prix) − règlements
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid(),
  date_paiement date not null default current_date,
  sens text not null check (sens in ('encaissement', 'reglement', 'report_client', 'report_fournisseur')),
  contact_id uuid references public.contacts(id) on delete set null,
  contact_nom text default '',                       -- copie du nom : l'historique reste lisible si le contact est supprimé
  montant numeric(16,2) not null check (montant > 0),
  mode text default 'especes',                       -- especes, cheque, virement, autre
  reference text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paiements_contact_idx on public.paiements (contact_id);
create index if not exists paiements_date_idx on public.paiements (date_paiement);

drop trigger if exists trg_paiements_updated_at on public.paiements;
create trigger trg_paiements_updated_at before update on public.paiements for each row execute function public.set_updated_at();

alter table public.paiements enable row level security;
drop policy if exists "paiements_select_all" on public.paiements;
create policy "paiements_select_all" on public.paiements for select using (true);
drop policy if exists "paiements_insert_all" on public.paiements;
create policy "paiements_insert_all" on public.paiements for insert with check (true);
drop policy if exists "paiements_update_all" on public.paiements;
create policy "paiements_update_all" on public.paiements for update using (true) with check (true);
drop policy if exists "paiements_delete_all" on public.paiements;
create policy "paiements_delete_all" on public.paiements for delete using (true);

grant select, insert, update, delete on public.paiements to anon, authenticated, service_role;

notify pgrst, 'reload schema';
