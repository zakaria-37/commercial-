-- ============================================================
-- Stock des produits finis : prix d'achat ou coût de fabrication d'une pièce
--   produits.prix_achat       : coût d'une pièce saisi à la main (prioritaire sur le calcul de l'onglet Produits)
--   pf_mouvements.prix_achat  : coût d'une pièce pour une entrée en stock (le coût du produit devient le coût moyen pondéré)
-- ============================================================
alter table public.produits add column if not exists prix_achat numeric(14,2) not null default 0;
alter table public.pf_mouvements add column if not exists prix_achat numeric(14,2);
notify pgrst, 'reload schema';
