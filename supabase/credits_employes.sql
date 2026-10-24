-- ============================================================
-- MARIA BAG — CRÉDIT PERSONNEL DES EMPLOYÉS (hors travail : mariage, urgence…)
--   credit  = somme prêtée à l'employé
--   retenue = somme remboursée, retenue sur le salaire du mois (diminue le « reste à payer » du mois)
--   report  = crédit déjà dû avant d'utiliser la plateforme (solde de départ)
--   Crédit restant dû = crédits + reports − retenues
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create table if not exists public.credits_employes (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  date_op date not null default current_date,
  type text not null default 'credit' check (type in ('credit', 'retenue', 'report')),
  montant numeric(14,2) not null check (montant > 0),
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credits_employes_emp_idx on public.credits_employes (employe_id);
drop trigger if exists trg_credits_employes_updated_at on public.credits_employes;
create trigger trg_credits_employes_updated_at before update on public.credits_employes for each row execute function public.set_updated_at();
alter table public.credits_employes enable row level security;
drop policy if exists "credits_employes_all" on public.credits_employes;
create policy "credits_employes_all" on public.credits_employes for all using (true) with check (true);
grant select, insert, update, delete on public.credits_employes to anon, authenticated, service_role;
do $$
begin
  if to_regprocedure('public.journaliser()') is not null then
    execute 'drop trigger if exists trg_journal on public.credits_employes';
    execute 'create trigger trg_journal after insert or update or delete on public.credits_employes for each row execute function public.journaliser()';
  end if;
end $$;
notify pgrst, 'reload schema';
