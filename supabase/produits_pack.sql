-- Packs : une ligne de coût peut contenir un autre produit (ex : modèle 380 = 3 produits)
alter table public.produit_lignes add column if not exists sous_produit_id uuid references public.produits(id) on delete cascade;
notify pgrst, 'reload schema';
