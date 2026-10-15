-- =====================================================================
-- MIGRATION 17 : DATES D'EFFET DES TARIFS ET DES TAUX
-- ---------------------------------------------------------------------
-- Décision de l'étape 5 : un prix ne change jamais en cours de journée.
--
-- 1. Un nouveau tarif (grille commune ou ajustement d'une entité, y compris
--    un « retour à la grille commune ») entre en vigueur AU PLUS TÔT LE
--    LENDEMAIN, à l'heure d'Uvira. Jusqu'ici, la base acceptait une date
--    passée : cela permettait de réécrire l'historique des prix.
-- 2. Un tarif encore à venir peut être corrigé, mais sa nouvelle date doit
--    elle aussi tomber au plus tôt le lendemain.
-- 3. Le taux du jour est enregistré à l'instant de sa saisie : il ne peut
--    être ni antidaté ni programmé à l'avance.
--
-- Les données de départ (grille du 1er janvier 2026, fichier 11) ne sont
-- pas concernées : la règle vaut pour les saisies faites par l'application.
-- =====================================================================

-- Rôles de l'application (les opérations de maintenance de la base n'y sont pas soumises)
create or replace function public.saisie_par_l_application()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated', 'service_role')
$$;


-- 1 et 2. Tarifs : au plus tôt le lendemain
create or replace function public.exiger_tarif_a_venir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.saisie_par_l_application() and new.en_vigueur_depuis <= public.aujourdhui() then
    raise exception 'Un nouveau tarif entre en vigueur au plus tôt demain (le %) : les prix ne changent jamais en cours de journée, ni dans le passé.',
      to_char(public.aujourdhui() + 1, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- « a_ » : passe avant la protection de l'historique (une ligne déjà en vigueur
-- reste de toute façon intouchable, fichier 03)
create trigger tarifs_communs_a_date_d_effet
  before insert or update of en_vigueur_depuis on public.tarifs_communs
  for each row execute function public.exiger_tarif_a_venir();

create trigger tarifs_entites_a_date_d_effet
  before insert or update of en_vigueur_depuis on public.tarifs_entites
  for each row execute function public.exiger_tarif_a_venir();


-- 3. Taux : enregistré à l'instant de la saisie
create or replace function public.exiger_taux_immediat()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.saisie_par_l_application()
     and new.en_vigueur_depuis not between now() - interval '5 minutes' and now() + interval '5 minutes' then
    raise exception 'Le taux du jour prend effet au moment où il est saisi : il ne peut être ni antidaté ni programmé à l''avance.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger taux_change_a_date_d_effet
  before insert or update of en_vigueur_depuis on public.taux_change
  for each row execute function public.exiger_taux_immediat();


-- Droits sur les fonctions de ce fichier (même règle qu'au fichier 08)
revoke execute on function public.saisie_par_l_application() from public, anon;
revoke execute on function public.exiger_tarif_a_venir() from public, anon, authenticated;
revoke execute on function public.exiger_taux_immediat() from public, anon, authenticated;
grant  execute on function public.saisie_par_l_application() to authenticated, service_role;
