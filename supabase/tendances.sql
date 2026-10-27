-- ============================================================
-- MARIA BAG — TENDANCES : veille sur les modèles et produits « winner » de la maroquinerie
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create table if not exists public.tendances (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  type text not null default 'Modèle' check (type in ('Modèle', 'Produit winner', 'Matière / couleur')),
  categorie text default '',
  region text default 'Monde',
  periode text default '',
  resume text default '',
  pourquoi text default '',
  idee_maria text default '',
  prix_indicatif text default '',
  potentiel integer not null default 3 check (potentiel between 1 and 5),
  statut text not null default 'À étudier' check (statut in ('À étudier', 'En test', 'Lancé', 'Rejeté')),
  source_nom text default '',
  source_url text default '',
  image_url text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tendances_type_idx on public.tendances (type);
drop trigger if exists trg_tendances_updated_at on public.tendances;
create trigger trg_tendances_updated_at before update on public.tendances for each row execute function public.set_updated_at();
alter table public.tendances enable row level security;
drop policy if exists "tendances_all" on public.tendances;
create policy "tendances_all" on public.tendances for all using (true) with check (true);
grant select, insert, update, delete on public.tendances to anon, authenticated, service_role;
do $$
begin
  if to_regprocedure('public.journaliser()') is not null then
    execute 'drop trigger if exists trg_journal on public.tendances';
    execute 'create trigger trg_journal after insert or update or delete on public.tendances for each row execute function public.journaliser()';
  end if;
end $$;
notify pgrst, 'reload schema';
