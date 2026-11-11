-- Sections accessibles par compte (null = toutes) + bons de sortie préparés par le magasinier
alter table public.profils add column if not exists sections text[];
alter table public.invitations add column if not exists sections text[];
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role text; v_sec text[];
begin
  select role, sections into v_role, v_sec from public.invitations where lower(email) = lower(new.email);
  insert into public.profils (id, email, nom, role, sections)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nom', ''), coalesce(v_role, 'en_attente'), v_sec)
  on conflict (id) do nothing;
  return new;
end $$;
create table if not exists public.bons_sortie (
  id uuid primary key default gen_random_uuid(), numero text not null default '', date_bon date default current_date,
  modele_id uuid, modele_nom text not null default '', quantite numeric not null default 0, atelier text not null default '', chef text not null default '',
  lignes jsonb not null default '[]'::jsonb, statut text not null default 'a_preparer' check (statut in ('a_preparer','valide','annule')),
  cree_par text not null default '', valide_par text not null default '', valide_le timestamptz, message text not null default '',
  stock_sorti boolean not null default false, note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.bons_sortie enable row level security;
drop policy if exists bons_sortie_all on public.bons_sortie;
create policy bons_sortie_all on public.bons_sortie for all using (true) with check (true);
-- La création des comptes par l'administrateur passe par la fonction « comptes » (supabase/functions/comptes).
