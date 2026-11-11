-- ============================================================
-- MARIA BAG — ÉTAPE B : SÉCURISER LA BASE (à lancer SEULEMENT après avoir vérifié la connexion par compte)
-- Avant de lancer ce script :
--   1. Créez votre compte administrateur dans la plateforme et vérifiez que vous pouvez entrer (menu « Équipe » visible).
--   2. Faites passer AUTH_REQUIRED à true dans js/config.js (désactive le mot de passe provisoire).
-- Effet : plus aucun accès sans compte. Seuls les comptes « admin » et « equipe » lisent et écrivent les données.
-- En cas de problème : lancez supabase/ouvrir_acces_temporaire.sql pour rétablir l'ancien accès.
-- ============================================================
do $$
declare t text; p record;
begin
  foreach t in array array['contacts','ateliers','employes','modeles','stock_articles','composants','productions','commandes','acomptes','pointages','charges',
                           'produits','produit_lignes','stock_mouvements','charges_fixes','pf_mouvements','inventaires','inventaire_lignes','documents','document_lignes','paiements','parametres','remises_hs','paiements_ateliers','credits_employes','rendez_vous','notes_perso','credits_tiers','caisse','bons_sortie'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "membres_acces" on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
-- Conversation ZACKsmart : chaque compte ne voit que SES messages
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'zacksmart_messages' loop
    execute format('drop policy %I on public.zacksmart_messages', p.policyname);
  end loop;
  create policy "zacksmart_prive" on public.zacksmart_messages for all to authenticated
    using (public.is_member() and proprietaire = auth.uid()::text) with check (public.is_member() and proprietaire = auth.uid()::text);
  revoke all on public.zacksmart_messages from anon;
end $$;
notify pgrst, 'reload schema';
