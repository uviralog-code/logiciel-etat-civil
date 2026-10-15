-- =====================================================================
-- MIGRATION 15 : LA DOUBLE VÉRIFICATION EST EXIGÉE PAR LA BASE
-- ---------------------------------------------------------------------
-- Un compte protégé par la double vérification (l'administrateur, et tout
-- compte pour lequel elle serait activée plus tard) n'a AUCUN droit tant
-- que le code à 6 chiffres n'a pas été validé pendant la session.
--
-- Sans cette règle, quelqu'un qui aurait seulement découvert le mot de
-- passe de l'administrateur pourrait contourner l'écran du code et
-- interroger directement la base avec tous les pouvoirs de l'admin.
--
-- Supabase indique le niveau de la session dans le jeton de connexion :
--   « aal1 » = mot de passe seulement ; « aal2 » = mot de passe + code.
--
-- Avant le code, l'agent peut seulement : lire son propre profil, noter
-- sa connexion au journal, lire ses propres connexions et remplacer son
-- mot de passe provisoire.
-- =====================================================================

-- Niveau de vérification de la session en cours (« aal1 » par défaut)
create or replace function public.niveau_verification()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  )
$$;

comment on function public.niveau_verification() is
  'Niveau de vérification de la session : aal1 (mot de passe) ou aal2 (mot de passe + code à 6 chiffres).';


-- Le rôle n'est reconnu qu'avec le niveau de vérification exigé pour le compte.
-- Toutes les règles d'accès (est_admin, est_officier, est_caissier, peut_voir_entite…)
-- reposent sur cette fonction : elles suivent automatiquement.
create or replace function public.role_courant()
returns public.role_utilisateur
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.utilisateurs u
  where u.id = auth.uid()
    and u.actif
    and (not u.double_verification or public.niveau_verification() = 'aal2')
$$;

create or replace function public.entite_courante()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.entite_id
  from public.utilisateurs u
  where u.id = auth.uid()
    and u.actif
    and (not u.double_verification or public.niveau_verification() = 'aal2')
$$;

comment on function public.role_courant() is
  'Rôle de l''utilisateur connecté (vide si compte inexistant, désactivé, ou code de vérification pas encore validé).';


-- Droits sur les fonctions de ce fichier (même règle qu'au fichier 08)
revoke execute on function public.niveau_verification() from public, anon;
grant  execute on function public.niveau_verification() to authenticated, service_role;
