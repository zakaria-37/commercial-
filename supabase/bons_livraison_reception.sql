-- ============================================================
-- Commerce : bons de livraison (clients) et bons de réception (produits finis ou éléments)
-- Plusieurs lignes par bon ; chaque ligne garde sa référence (ref).
-- ============================================================
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in ('devis', 'facture', 'bon_commande', 'bon_livraison', 'bon_reception'));
alter table public.document_lignes add column if not exists ref text default '';
notify pgrst, 'reload schema';
