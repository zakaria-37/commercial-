-- ============================================================
-- Commerce › Journal & caisse : ouverture, clôture (argent compté, solde attendu, écart), entrées et sorties diverses
-- + n° de facture du fournisseur / réf. du client sur les bons (documents.ref_externe)
-- ============================================================
create table if not exists public.caisse (
  id uuid primary key default gen_random_uuid(),
  date_op date not null default current_date,
  type text not null check (type in ('ouverture', 'cloture', 'entree', 'sortie')),
  montant numeric(16,2) not null default 0 check (montant >= 0),
  theorique numeric(16,2),
  ecart numeric(16,2),
  libelle text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists caisse_date_idx on public.caisse (date_op);
drop trigger if exists trg_caisse_updated_at on public.caisse;
create trigger trg_caisse_updated_at before update on public.caisse for each row execute function public.set_updated_at();
alter table public.caisse enable row level security;
drop policy if exists "caisse_all" on public.caisse;
create policy "caisse_all" on public.caisse for all using (true) with check (true);
grant select, insert, update, delete on public.caisse to anon, authenticated, service_role;
alter table public.documents add column if not exists ref_externe text default '';
notify pgrst, 'reload schema';
-- Mode de paiement d'un bon payé cash (espèces, chèque, virement)
alter table public.documents add column if not exists mode_paiement text default 'especes';
notify pgrst, 'reload schema';
