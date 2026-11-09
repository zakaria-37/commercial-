-- Calepinage : gabarits (largeur × hauteur) d'une ligne de tissu / doublure / PVC pour calculer les mètres par pièce
alter table public.produit_lignes add column if not exists gabarits jsonb;
