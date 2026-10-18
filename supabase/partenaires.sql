-- ============================================================
-- MARIA BAG — FOURNISSEURS & CLIENTS (classement dans l'onglet Contacts)
-- Un fournisseur = un contact de type « Fournisseur ».
--   stock_articles.contact_id    : fournisseur habituel de l'article
--   stock_mouvements.contact_id  : fournisseur de CET achat (sert à comparer les prix)
-- Les clients sont déjà liés aux livraisons (pf_mouvements.contact_id).
-- Sans risque : peut être relancé, aucune donnée supprimée.
-- ============================================================
alter table public.stock_articles   add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.stock_mouvements add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists stock_articles_contact_idx   on public.stock_articles (contact_id);
create index if not exists stock_mouvements_contact_idx on public.stock_mouvements (contact_id);

-- Rattache les noms déjà saisis en texte aux contacts du même nom (société ou nom)
update public.stock_articles s set contact_id = c.id
from public.contacts c
where s.contact_id is null and coalesce(s.fournisseur,'') <> ''
  and lower(trim(s.fournisseur)) in (lower(trim(c.societe)), lower(trim(c.nom)), lower(trim(concat_ws(' ', c.prenom, c.nom))));
update public.stock_mouvements s set contact_id = c.id
from public.contacts c
where s.contact_id is null and coalesce(s.fournisseur,'') <> ''
  and lower(trim(s.fournisseur)) in (lower(trim(c.societe)), lower(trim(c.nom)), lower(trim(concat_ws(' ', c.prenom, c.nom))));

notify pgrst, 'reload schema';

-- Marque : tous les éléments de stock et produits finis sont « MARIA BAG » par défaut
alter table public.stock_articles add column if not exists marque text not null default 'MARIA BAG';
alter table public.produits       add column if not exists marque text not null default 'MARIA BAG';
notify pgrst, 'reload schema';
