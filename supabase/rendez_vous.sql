-- ============================================================
-- MARIA BAG — NOTES & RENDEZ-VOUS (clients, prospects, grandes surfaces…)
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create table if not exists public.rendez_vous (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  date_rdv date not null,
  heure time,
  type text default 'Client',
  contact_id uuid references public.contacts(id) on delete set null,
  contact_nom text default '',
  tel text default '',
  lieu text default '',
  objet text default '',
  statut text not null default 'Prévu' check (statut in ('Prévu', 'Fait', 'Reporté', 'Annulé')),
  resultat text default '',
  relance date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rendez_vous_date_idx on public.rendez_vous (date_rdv);
drop trigger if exists trg_rendez_vous_updated_at on public.rendez_vous;
create trigger trg_rendez_vous_updated_at before update on public.rendez_vous for each row execute function public.set_updated_at();
alter table public.rendez_vous enable row level security;
drop policy if exists "rendez_vous_all" on public.rendez_vous;
create policy "rendez_vous_all" on public.rendez_vous for all using (true) with check (true);
grant select, insert, update, delete on public.rendez_vous to anon, authenticated, service_role;
do $$
begin
  if to_regprocedure('public.journaliser()') is not null then
    execute 'drop trigger if exists trg_journal on public.rendez_vous';
    execute 'create trigger trg_journal after insert or update or delete on public.rendez_vous for each row execute function public.journaliser()';
  end if;
end $$;
notify pgrst, 'reload schema';
