-- ============================================================
-- Commerce › Crédits : prêts (سلفة) avec un client, un fournisseur ou toute autre personne
-- nature : pret_donne (nous prêtons) · remb_recu (on nous rembourse) · pret_recu (on nous prête) · remb_fait (nous remboursons)
-- ============================================================
create table if not exists public.credits_tiers (
  id uuid primary key default gen_random_uuid(),
  date_op date not null default current_date,
  nature text not null check (nature in ('pret_donne', 'pret_recu', 'remb_recu', 'remb_fait')),
  contact_id uuid references public.contacts(id) on delete set null,
  personne text default '',
  categorie text default 'Autre',
  montant numeric(16,2) not null check (montant > 0),
  mode text default 'especes',
  echeance date,
  reference text default '',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credits_tiers_contact_idx on public.credits_tiers (contact_id);
create index if not exists credits_tiers_date_idx on public.credits_tiers (date_op);
drop trigger if exists trg_credits_tiers_updated_at on public.credits_tiers;
create trigger trg_credits_tiers_updated_at before update on public.credits_tiers for each row execute function public.set_updated_at();
alter table public.credits_tiers enable row level security;
drop policy if exists "credits_tiers_all" on public.credits_tiers;
create policy "credits_tiers_all" on public.credits_tiers for all using (true) with check (true);
grant select, insert, update, delete on public.credits_tiers to anon, authenticated, service_role;
notify pgrst, 'reload schema';
