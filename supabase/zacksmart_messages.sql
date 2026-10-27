-- ============================================================
-- MARIA BAG — CONVERSATION ZACKsmart synchronisée entre appareils (PC, téléphone, tablette)
--   Un message = une ligne ; « proprietaire » = identifiant du compte (ou « partage » avec l'ancien mot de passe).
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create table if not exists public.zacksmart_messages (
  id uuid primary key default gen_random_uuid(),
  proprietaire text not null default 'partage',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zacksmart_messages_prop_idx on public.zacksmart_messages (proprietaire, created_at);
drop trigger if exists trg_zacksmart_messages_updated_at on public.zacksmart_messages;
create trigger trg_zacksmart_messages_updated_at before update on public.zacksmart_messages for each row execute function public.set_updated_at();
alter table public.zacksmart_messages enable row level security;
drop policy if exists "zacksmart_messages_all" on public.zacksmart_messages;
create policy "zacksmart_messages_all" on public.zacksmart_messages for all using (true) with check (true);
grant select, insert, update, delete on public.zacksmart_messages to anon, authenticated, service_role;
notify pgrst, 'reload schema';
