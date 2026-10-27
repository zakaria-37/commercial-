-- ============================================================
-- MARIA BAG — NOTES PERSONNELLES (pense-bête du gérant)
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create table if not exists public.notes_perso (
  id uuid primary key default gen_random_uuid(),
  titre text default '',
  contenu text not null,
  categorie text default 'À ne pas oublier',
  couleur text default 'jaune',
  rappel date,
  epingle boolean not null default false,
  fait boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_perso_rappel_idx on public.notes_perso (rappel);
drop trigger if exists trg_notes_perso_updated_at on public.notes_perso;
create trigger trg_notes_perso_updated_at before update on public.notes_perso for each row execute function public.set_updated_at();
alter table public.notes_perso enable row level security;
drop policy if exists "notes_perso_all" on public.notes_perso;
create policy "notes_perso_all" on public.notes_perso for all using (true) with check (true);
grant select, insert, update, delete on public.notes_perso to anon, authenticated, service_role;
do $$
begin
  if to_regprocedure('public.journaliser()') is not null then
    execute 'drop trigger if exists trg_journal on public.notes_perso';
    execute 'create trigger trg_journal after insert or update or delete on public.notes_perso for each row execute function public.journaliser()';
  end if;
end $$;
notify pgrst, 'reload schema';
