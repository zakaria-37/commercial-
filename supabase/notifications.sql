-- NOTIFICATIONS SUR LE TÉLÉPHONE (Web Push) — commandes des magasins
-- Abonnements des appareils + déclencheur qui appelle la fonction « notifier » à chaque nouvelle commande
-- (et quand le dépôt l'envoie ou la refuse).
create extension if not exists pg_net with schema extensions;
create table if not exists public.push_abonnements (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique, p256dh text not null, auth text not null,
  user_id uuid, nom text not null default '', sections text[], magasin_id uuid, role text not null default '',
  appareil text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.push_abonnements enable row level security;
drop policy if exists push_abonnements_all on public.push_abonnements;
create policy push_abonnements_all on public.push_abonnements for all using (true) with check (true);
grant all on public.push_abonnements to anon, authenticated;

create or replace function public.notifier_commande_magasin() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if (tg_op = 'INSERT' and new.statut = 'envoyee') or (tg_op = 'UPDATE' and new.statut is distinct from old.statut and new.statut in ('livree','annulee')) then
    perform net.http_post(
      url := 'https://xvpqaewnpcspndyhwfit.supabase.co/functions/v1/notifier',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('table', 'commandes_magasin', 'id', new.id, 'op', tg_op));
  end if;
  return new;
end $$;
drop trigger if exists commandes_magasin_notifier on public.commandes_magasin;
create trigger commandes_magasin_notifier after insert or update of statut on public.commandes_magasin for each row execute function public.notifier_commande_magasin();
notify pgrst, 'reload schema';
