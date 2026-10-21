-- ============================================================
-- MARIA BAG — COMPTES UTILISATEURS, RÔLES ET JOURNAL DES MODIFICATIONS
-- ÉTAPE A (sans risque, ne change pas l'accès actuel) : crée les comptes, les rôles et le journal.
--   Rôles : admin (tout + gestion de l'équipe + journal) | equipe (travail quotidien) |
--           en_attente (compte créé, pas encore approuvé) | desactive (accès retiré)
-- Un nouveau compte n'a AUCUN accès tant qu'un administrateur ne l'a pas invité (par e-mail) ou approuvé.
-- ÉTAPE B : supabase/securiser.sql (à lancer seulement après avoir vérifié que la connexion fonctionne).
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nom text default '',
  role text not null default 'en_attente' check (role in ('admin', 'equipe', 'en_attente', 'desactive')),
  derniere_connexion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.invitations (
  email text primary key,
  role text not null default 'equipe' check (role in ('admin', 'equipe')),
  created_at timestamptz not null default now()
);
create table if not exists public.journal (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  utilisateur_id uuid,
  email text,
  table_name text not null,
  action text not null,                    -- INSERT, UPDATE, DELETE
  enregistrement_id text,
  details jsonb
);
create index if not exists journal_at_idx on public.journal (at desc);
create index if not exists journal_table_idx on public.journal (table_name);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role in ('admin', 'equipe'));
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.invitations where lower(email) = lower(new.email);
  insert into public.profils (id, email, nom, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nom', ''), coalesce(v_role, 'en_attente'));
  delete from public.invitations where lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_login() returns void language sql security definer set search_path = public as $$
  update public.profils set derniere_connexion = now() where id = auth.uid();
$$;

create or replace function public.journaliser() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id text; v_det jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := to_jsonb(old)->>'id'; v_det := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_id := to_jsonb(new)->>'id';
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('avant', o.value, 'apres', n.value)), '{}'::jsonb) into v_det
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'updated_at';
    if v_det = '{}'::jsonb then return new; end if;
  else
    v_id := to_jsonb(new)->>'id'; v_det := to_jsonb(new);
  end if;
  insert into public.journal (utilisateur_id, email, table_name, action, enregistrement_id, details)
  values (auth.uid(), coalesce(auth.jwt()->>'email', current_user), tg_table_name, tg_op, v_id, v_det);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Journal sur toutes les tables de l'application
do $$
declare t text;
begin
  foreach t in array array['contacts','ateliers','employes','modeles','stock_articles','composants','productions','commandes','acomptes','pointages','charges',
                           'produits','produit_lignes','stock_mouvements','charges_fixes','pf_mouvements','inventaires','inventaire_lignes','paiements'] loop
    execute format('drop trigger if exists trg_journal on public.%I', t);
    execute format('create trigger trg_journal after insert or update or delete on public.%I for each row execute function public.journaliser()', t);
  end loop;
end $$;

-- Droits : chacun voit son profil ; l'administrateur gère tout
alter table public.profils enable row level security;
alter table public.invitations enable row level security;
alter table public.journal enable row level security;
drop policy if exists "profils_select" on public.profils;
create policy "profils_select" on public.profils for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profils_update_admin" on public.profils;
create policy "profils_update_admin" on public.profils for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "invitations_admin" on public.invitations;
create policy "invitations_admin" on public.invitations for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "journal_select_admin" on public.journal;
create policy "journal_select_admin" on public.journal for select to authenticated using (public.is_admin());
grant select, update on public.profils to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select on public.journal to authenticated;
grant all on public.profils, public.invitations, public.journal to service_role;
grant execute on function public.is_admin(), public.is_member(), public.touch_login() to authenticated;

-- Premier administrateur : invitation par e-mail (le compte doit être créé avec cette adresse)
insert into public.invitations (email, role) values ('zakariabenouadah@gmail.com', 'admin') on conflict (email) do nothing;

notify pgrst, 'reload schema';
