-- =====================================================================
-- MIGRATION 16 : AUCUN DROIT TANT QUE LE MOT DE PASSE PROVISOIRE
--                N'EST PAS REMPLACÉ
-- ---------------------------------------------------------------------
-- Quand l'administrateur réinitialise le mot de passe d'un agent (par
-- exemple parce qu'il a pu être découvert), Supabase ferme les sessions
-- ouvertes ; mais un jeton déjà délivré reste valable jusqu'à une heure.
--
-- Désormais, tant que le mot de passe provisoire n'est pas remplacé, le
-- compte n'a aucun droit sur les données : l'écran l'imposait déjà
-- (fichiers 17 et 19), la base l'impose aussi, immédiatement.
--
-- Restent permis avant le remplacement : lire son propre profil, noter sa
-- connexion au journal, lire ses propres connexions, et lever l'obligation
-- une fois le mot de passe réellement changé (migration 14).
-- =====================================================================

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
    and not u.doit_changer_mot_de_passe
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
    and not u.doit_changer_mot_de_passe
    and (not u.double_verification or public.niveau_verification() = 'aal2')
$$;

comment on function public.role_courant() is
  'Rôle de l''utilisateur connecté (vide si compte inexistant ou désactivé, mot de passe provisoire pas encore remplacé, ou code de vérification pas encore validé).';
