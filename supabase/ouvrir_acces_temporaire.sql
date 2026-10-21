-- ============================================================
-- MARIA BAG — SECOURS : rétablit l'accès ouvert (comme avant la sécurisation).
-- À utiliser uniquement si vous êtes bloqué après supabase/securiser.sql ; puis remettez AUTH_REQUIRED à false dans js/config.js.
-- ============================================================
do $$
declare t text; p record;
begin
  foreach t in array array['contacts','ateliers','employes','modeles','stock_articles','composants','productions','commandes','acomptes','pointages','charges',
                           'produits','produit_lignes','stock_mouvements','charges_fixes','pf_mouvements','inventaires','inventaire_lignes','paiements'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "acces_ouvert" on public.%I for all using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
notify pgrst, 'reload schema';
