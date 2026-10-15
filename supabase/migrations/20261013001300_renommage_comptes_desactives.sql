-- =====================================================================
-- LOGICIEL D'ÉTAT CIVIL — CDJP/Bukavu
-- Fichier 13 : RENOMMAGE AUTOMATIQUE DES COMPTES DÉSACTIVÉS
-- ---------------------------------------------------------------------
-- Un nom d'utilisateur est unique, même pour un compte désactivé. Pour
-- que le remplaçant d'un agent puisse reprendre le nom habituel
-- (ex. « bavira.caissier »), l'ancien compte est renommé au moment de
-- sa désactivation :
--     bavira.caissier  ->  bavira.caissier.ancien20261005
-- L'ancien nom est conservé dans le profil et au journal d'audit.
--
-- Note pour l'application (étape 4) : l'adresse interne de connexion du
-- compte (bavira.caissier@…) est renommée de la même façon, côté
-- serveur, au même moment.
-- =====================================================================

alter table public.utilisateurs
  add column ancien_nom_utilisateur text,
  add column desactive_le           timestamptz;

comment on column public.utilisateurs.ancien_nom_utilisateur is
  'Nom d''utilisateur que le compte portait avant sa désactivation (libéré pour son remplaçant).';

-- Nom d'archive libre pour un nom donné, à une date donnée :
--   base.ancienAAAAMMJJ, puis base.ancienAAAAMMJJ.2, .3… si déjà pris
create or replace function public.nom_utilisateur_archive(p_nom text, p_jour date default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_racine text := p_nom || '.ancien' || to_char(coalesce(p_jour, public.aujourdhui()), 'YYYYMMDD');
  v_nom    text := v_racine;
  v_n      integer := 1;
begin
  while exists (select 1 from public.utilisateurs u where u.nom_utilisateur = v_nom) loop
    v_n   := v_n + 1;
    v_nom := v_racine || '.' || v_n;
  end loop;
  return v_nom;
end;
$$;

revoke execute on function public.nom_utilisateur_archive(text, date) from anon, public;

-- À la désactivation : renommage, date de désactivation
create or replace function public.renommer_compte_desactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.actif and not new.actif then
    new.desactive_le := now();
    if new.nom_utilisateur = old.nom_utilisateur then
      new.ancien_nom_utilisateur := old.nom_utilisateur;
      new.nom_utilisateur := public.nom_utilisateur_archive(old.nom_utilisateur);
    end if;
  elsif not old.actif and new.actif then
    new.desactive_le := null;   -- compte réactivé (il garde son nom d'archive)
  end if;
  return new;
end;
$$;

-- Nommé pour passer avant la normalisation et la date de modification
create trigger utilisateurs_a_desactivation
  before update on public.utilisateurs
  for each row execute function public.renommer_compte_desactive();
