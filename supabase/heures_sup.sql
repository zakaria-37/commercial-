-- ============================================================
-- MARIA BAG — HEURES SUPPLÉMENTAIRES MISES DE CÔTÉ
-- La paie des heures sup est séparée de la paie ordinaire : elle n'est pas versée avec le salaire mais gardée
-- pour l'employé, puis remise plus tard (remise) ; « report » = montant déjà mis de côté avant d'utiliser la plateforme.
--   Solde à remettre = heures sup travaillées (× taux sup, depuis le début) + reports − remises
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create table if not exists public.remises_hs (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.employes(id) on delete cascade,
  date_op date not null default current_date,
  type text not null default 'remise' check (type in ('remise', 'report')),
  montant numeric(14,2) not null check (montant > 0),
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists remises_hs_emp_idx on public.remises_hs (employe_id);
drop trigger if exists trg_remises_hs_updated_at on public.remises_hs;
create trigger trg_remises_hs_updated_at before update on public.remises_hs for each row execute function public.set_updated_at();
alter table public.remises_hs enable row level security;
drop policy if exists "remises_hs_all" on public.remises_hs;
create policy "remises_hs_all" on public.remises_hs for all using (true) with check (true);
grant select, insert, update, delete on public.remises_hs to anon, authenticated, service_role;
do $$
begin
  if to_regprocedure('public.journaliser()') is not null then
    execute 'drop trigger if exists trg_journal on public.remises_hs';
    execute 'create trigger trg_journal after insert or update or delete on public.remises_hs for each row execute function public.journaliser()';
  end if;
end $$;
notify pgrst, 'reload schema';
