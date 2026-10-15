-- =====================================================================
-- BANC D'ESSAI SUPABASE LOCAL — 2/2 : après le service de connexion
-- ---------------------------------------------------------------------
-- Les fonctions auth.uid(), auth.role()… viennent d'être créées par le
-- vrai service Auth. Comme sur Supabase, les rôles de l'API peuvent les
-- appeler (les règles d'accès du logiciel en dépendent).
-- =====================================================================
grant execute on all functions in schema auth to anon, authenticated, service_role;
