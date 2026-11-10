-- Gabarits du produit (face, dos, soufflet… : largeur, hauteur, périmètre) réutilisés par les lignes de coût
alter table public.produits add column if not exists gabarits jsonb;
