-- ============================================================
-- MARIA BAG — COMMERCE : devis, factures clients, bons de commande fournisseurs (avec prix) et réceptions
--   documents        : un devis, une facture ou un bon de commande (type) avec son numéro, son contact, sa TVA, sa remise
--   document_lignes  : les lignes (produit ou élément, quantité, prix) ; quantite_recue sert aux bons de commande
--   commandes.prix_unitaire : prix de vente d'une pièce pour les commandes clients (Ateliers)
--   paiements.document_id   : encaissement / règlement rattaché à une facture ou à un bon de commande
--   parametres       : informations de l'entreprise (nom, adresse, NIF, RC… utilisées sur les PDF)
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
create extension if not exists pgcrypto;

alter table public.commandes add column if not exists prix_unitaire numeric(14,2) not null default 0 check (prix_unitaire >= 0);
-- commandes.cout_unitaire : prix de production (coût de revient) d'une pièce, pour calculer la marge
alter table public.commandes add column if not exists cout_unitaire numeric(14,2) not null default 0 check (cout_unitaire >= 0);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('devis', 'facture', 'bon_commande')),
  numero text not null,
  date_doc date not null default current_date,
  echeance date,                                   -- validité du devis / échéance de la facture / livraison prévue
  contact_id uuid references public.contacts(id) on delete set null,
  contact_nom text default '',
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoye', 'accepte', 'refuse', 'facture', 'emise', 'annulee', 'recu_partiel', 'recu')),
  source_id uuid,                                  -- document d'origine (devis → facture)
  commande_id uuid references public.commandes(id) on delete set null,
  tva_taux numeric(5,2) not null default 0 check (tva_taux >= 0),
  remise numeric(14,2) not null default 0 check (remise >= 0),
  paiement text not null default 'terme' check (paiement in ('cash', 'terme', 'versement')),   -- cash = payé comptant, terme = plus tard, versement = par tranches
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, numero)
);
create index if not exists documents_contact_idx on public.documents (contact_id);
create index if not exists documents_type_idx on public.documents (type, date_doc);

create table if not exists public.document_lignes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  produit_id uuid references public.produits(id) on delete set null,
  article_id uuid references public.stock_articles(id) on delete set null,
  designation text not null default '',
  unite text default 'pcs',
  quantite numeric(16,4) not null default 0 check (quantite >= 0),
  prix_unitaire numeric(16,4) not null default 0 check (prix_unitaire >= 0),
  quantite_recue numeric(16,4) not null default 0 check (quantite_recue >= 0),
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_lignes_doc_idx on public.document_lignes (document_id);

alter table public.documents add column if not exists paiement text not null default 'terme' check (paiement in ('cash', 'terme', 'versement'));
alter table public.paiements add column if not exists document_id uuid references public.documents(id) on delete set null;
create index if not exists paiements_document_idx on public.paiements (document_id);

create table if not exists public.parametres (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique,
  valeur jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
drop trigger if exists trg_document_lignes_updated_at on public.document_lignes;
create trigger trg_document_lignes_updated_at before update on public.document_lignes for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
alter table public.document_lignes enable row level security;
alter table public.parametres enable row level security;
drop trigger if exists trg_parametres_updated_at on public.parametres;
create trigger trg_parametres_updated_at before update on public.parametres for each row execute function public.set_updated_at();
drop policy if exists "documents_all" on public.documents;
create policy "documents_all" on public.documents for all using (true) with check (true);
drop policy if exists "document_lignes_all" on public.document_lignes;
create policy "document_lignes_all" on public.document_lignes for all using (true) with check (true);
drop policy if exists "parametres_all" on public.parametres;
create policy "parametres_all" on public.parametres for all using (true) with check (true);
grant select, insert, update, delete on public.documents, public.document_lignes, public.parametres to anon, authenticated, service_role;

-- Journal des modifications (si supabase/comptes.sql a été lancé)
do $$
declare t text;
begin
  if to_regprocedure('public.journaliser()') is not null then
    foreach t in array array['documents', 'document_lignes'] loop
      execute format('drop trigger if exists trg_journal on public.%I', t);
      execute format('create trigger trg_journal after insert or update or delete on public.%I for each row execute function public.journaliser()', t);
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
