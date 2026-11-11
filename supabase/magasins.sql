-- MAGASINS ⇄ DÉPÔT : commandes des magasins (Boumati, Bab El Zouar) préparées au dépôt
alter table public.pf_mouvements drop constraint if exists pf_mouvements_type_check;
alter table public.pf_mouvements add constraint pf_mouvements_type_check check (type = any (array['entree','livraison','retour','perte','ajustement','transfert']));
alter table public.produits add column if not exists par_carton integer not null default 0;
create table if not exists public.magasins (id uuid primary key default gen_random_uuid(), nom text not null default '', responsable text not null default '', adresse text not null default '', note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.magasins enable row level security;
drop policy if exists magasins_all on public.magasins;
drop policy if exists membres_acces on public.magasins;
create policy membres_acces on public.magasins for all to authenticated using (public.is_member()) with check (public.is_member());
revoke all on public.magasins from anon;
create table if not exists public.commandes_magasin (id uuid primary key default gen_random_uuid(), numero text not null default '', magasin_id uuid references public.magasins(id) on delete set null, magasin_nom text not null default '', date_cmd date default current_date, lignes jsonb not null default '[]'::jsonb, statut text not null default 'envoyee' check (statut in ('envoyee','livree','annulee')), cree_par text not null default '', prepare_par text not null default '', valide_le timestamptz, message text not null default '', note text not null default '', stock_sorti boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.commandes_magasin enable row level security;
drop policy if exists commandes_magasin_all on public.commandes_magasin;
drop policy if exists membres_acces on public.commandes_magasin;
create policy membres_acces on public.commandes_magasin for all to authenticated using (public.is_member()) with check (public.is_member());
revoke all on public.commandes_magasin from anon;
create index if not exists commandes_magasin_statut_idx on public.commandes_magasin (statut, date_cmd);
insert into public.magasins (nom, responsable) select * from (values ('Boumati','Idris'),('Bab El Zouar','Fatah')) v(nom, responsable) where not exists (select 1 from public.magasins);
notify pgrst, 'reload schema';
