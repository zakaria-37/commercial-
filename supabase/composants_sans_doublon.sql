-- Un composant ne peut pas apparaître deux fois dans le même modèle (évite les doublons de synchronisation)
with d as (select id, row_number() over (partition by modele_id, type, coalesce(article_id::text, lower(btrim(nom))), unite, prix_unitaire order by created_at, id) rn from composants)
delete from composants c using d where c.id = d.id and d.rn > 1;
create unique index if not exists composants_sans_doublon on public.composants (modele_id, type, (coalesce(article_id::text, lower(btrim(nom)))), unite, prix_unitaire);
