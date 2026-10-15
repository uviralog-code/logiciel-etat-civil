-- =====================================================================
-- MIGRATION 19 : ENREGISTRER UN ACTE AVEC SA FICHE, EN UNE SEULE OPÉRATION
-- ---------------------------------------------------------------------
-- Étape 6 (fichier 28). Un acte et sa fiche de détails (naissance,
-- mariage, décès) sont enregistrés ou corrigés ENSEMBLE : si la fiche est
-- refusée, l'acte n'est pas créé non plus. Jamais d'acte à moitié saisi.
--
-- Les fonctions agissent avec les droits de la personne connectée : seul
-- l'Officier de l'entité peut s'en servir (règles du fichier 08), et toutes
-- les règles déjà en place s'appliquent (ID, prix, cycle de vie, 7 jours…).
--
-- Contenu de « p_details » selon la fiche du type d'acte :
--   naissance : sexe (M/F), date_naissance, lieu_naissance, nom_pere, nom_mere
--   mariage   : date_celebration, lieu_celebration, temoins
--               (+ le second époux dans p_titulaire_2_nom, obligatoire)
--   deces     : sexe, date_deces, lieu_deces, age_au_deces, declarant_nom
--   generique : rien
--
-- Corrections apportées à la relecture (fichier 28) :
-- a) la date d'un nouvel acte et les contrôles « pas dans le futur » suivent
--    l'heure d'Uvira (la base comptait en heure universelle : entre minuit et
--    1 h à Uvira, un acte aurait été daté de la veille — et, le 1er janvier,
--    son ID aurait porté l'année précédente) ;
-- b) une correction complète n'est possible que sur un acte « enregistré »
--    (pas encore transmis, ou renvoyé par le Caissier) : le prix ne peut pas
--    changer pendant que le Caissier encaisse ;
-- c) un nom de titulaire vide reçoit un message clair.
-- =====================================================================

-- a) Contrôles de date à l'heure d'Uvira
alter table public.actes drop constraint actes_date_pas_future;
alter table public.actes add constraint actes_date_pas_future check (date_acte <= public.aujourdhui());
alter table public.details_naissance drop constraint details_naissance_date_naissance_check;
alter table public.details_naissance add constraint details_naissance_date_naissance_check check (date_naissance <= public.aujourdhui());
alter table public.details_mariage drop constraint details_mariage_date_celebration_check;
alter table public.details_mariage add constraint details_mariage_date_celebration_check check (date_celebration <= public.aujourdhui());
alter table public.details_deces drop constraint details_deces_date_deces_check;
alter table public.details_deces add constraint details_deces_date_deces_check check (date_deces <= public.aujourdhui());

-- Texte nettoyé : espaces en trop retirés, vide si rien
create or replace function public.texte_propre(p jsonb, cle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(p ->> cle, ''), '\s+', ' ', 'g')), '')
$$;


-- Écrit (ou réécrit) la fiche de détails d'un acte selon son modèle
create or replace function public.ecrire_fiche_acte(p_acte uuid, p_details jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_modele public.modele_fiche;
  v_d      jsonb := coalesce(p_details, '{}'::jsonb);
begin
  select t.modele_fiche into v_modele
  from public.actes a join public.types_actes t on t.id = a.type_acte_id
  where a.id = p_acte;

  if v_modele = 'naissance' then
    insert into public.details_naissance as d (acte_id, sexe, date_naissance, lieu_naissance, nom_pere, nom_mere)
    values (p_acte, public.texte_propre(v_d, 'sexe'), (v_d ->> 'date_naissance')::date,
            public.texte_propre(v_d, 'lieu_naissance'), public.texte_propre(v_d, 'nom_pere'), public.texte_propre(v_d, 'nom_mere'))
    on conflict (acte_id) do update
      set sexe = excluded.sexe, date_naissance = excluded.date_naissance, lieu_naissance = excluded.lieu_naissance,
          nom_pere = excluded.nom_pere, nom_mere = excluded.nom_mere;

  elsif v_modele = 'mariage' then
    insert into public.details_mariage as d (acte_id, date_celebration, lieu_celebration, temoins)
    values (p_acte, (v_d ->> 'date_celebration')::date, public.texte_propre(v_d, 'lieu_celebration'), public.texte_propre(v_d, 'temoins'))
    on conflict (acte_id) do update
      set date_celebration = excluded.date_celebration, lieu_celebration = excluded.lieu_celebration, temoins = excluded.temoins;

  elsif v_modele = 'deces' then
    insert into public.details_deces as d (acte_id, sexe, date_deces, lieu_deces, age_au_deces, declarant_nom)
    values (p_acte, public.texte_propre(v_d, 'sexe'), (v_d ->> 'date_deces')::date, public.texte_propre(v_d, 'lieu_deces'),
            (v_d ->> 'age_au_deces')::smallint, public.texte_propre(v_d, 'declarant_nom'))
    on conflict (acte_id) do update
      set sexe = excluded.sexe, date_deces = excluded.date_deces, lieu_deces = excluded.lieu_deces,
          age_au_deces = excluded.age_au_deces, declarant_nom = excluded.declarant_nom;
  end if;
end;
$$;


-- Contrôles propres à la saisie (messages clairs avant les contraintes de la base)
create or replace function public.controler_saisie_acte(p_type uuid, p_titulaire_nom text, p_titulaire_2_nom text, p_details jsonb)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_modele public.modele_fiche;
  v_d      jsonb := coalesce(p_details, '{}'::jsonb);
begin
  if nullif(btrim(coalesce(p_titulaire_nom, '')), '') is null then
    raise exception 'Le nom complet du titulaire de l''acte est obligatoire.' using errcode = 'P0001';
  end if;
  select modele_fiche into v_modele from public.types_actes where id = p_type;
  if v_modele = 'naissance' then
    if public.texte_propre(v_d, 'sexe') is null or (v_d ->> 'date_naissance') is null then
      raise exception 'Fiche de naissance : le sexe et la date de naissance sont obligatoires.' using errcode = 'P0001';
    end if;
  elsif v_modele = 'mariage' then
    if nullif(btrim(coalesce(p_titulaire_2_nom, '')), '') is null or (v_d ->> 'date_celebration') is null then
      raise exception 'Fiche de mariage : les noms des deux époux et la date de célébration sont obligatoires.' using errcode = 'P0001';
    end if;
  elsif v_modele = 'deces' then
    if (v_d ->> 'date_deces') is null then
      raise exception 'Fiche de décès : la date du décès est obligatoire.' using errcode = 'P0001';
    end if;
  end if;
end;
$$;


-- 1. Enregistrer un nouvel acte et sa fiche
create or replace function public.enregistrer_acte(
  p_type_acte           uuid,
  p_categorie           public.categorie_tarif,
  p_titulaire_nom       text,
  p_titulaire_2_nom     text,
  p_demandeur_nom       text,
  p_demandeur_telephone text,
  p_observations        text,
  p_details             jsonb,
  p_transmettre         boolean
)
returns public.actes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acte public.actes;
begin
  if not public.est_officier() then
    raise exception 'Seul l''Officier d''état civil peut enregistrer un acte.' using errcode = '42501';
  end if;
  perform public.controler_saisie_acte(p_type_acte, p_titulaire_nom, p_titulaire_2_nom, p_details);

  insert into public.actes (entite_id, type_acte_id, date_acte, categorie, titulaire_nom, titulaire_2_nom,
                            demandeur_nom, demandeur_telephone, observations, statut)
  values (public.entite_courante(), p_type_acte, public.aujourdhui(), coalesce(p_categorie, 'national'), p_titulaire_nom, p_titulaire_2_nom,
          p_demandeur_nom, nullif(btrim(coalesce(p_demandeur_telephone, '')), ''), nullif(btrim(coalesce(p_observations, '')), ''),
          case when p_transmettre then 'en_attente_paiement'::public.statut_acte else 'enregistre'::public.statut_acte end)
  returning * into v_acte;

  perform public.ecrire_fiche_acte(v_acte.id, p_details);
  return v_acte;
end;
$$;

comment on function public.enregistrer_acte is
  'Enregistre un nouvel acte et sa fiche de détails en une seule opération (Officier). Statut : enregistré, ou en attente de paiement si transmis.';


-- 2. Corriger un acte et sa fiche (et, si demandé, le transmettre au Caissier)
create or replace function public.corriger_acte(
  p_acte                uuid,
  p_categorie           public.categorie_tarif,
  p_titulaire_nom       text,
  p_titulaire_2_nom     text,
  p_demandeur_nom       text,
  p_demandeur_telephone text,
  p_observations        text,
  p_details             jsonb,
  p_transmettre         boolean
)
returns public.actes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acte public.actes;
begin
  if not public.est_officier() then
    raise exception 'Seul l''Officier d''état civil peut corriger un acte.' using errcode = '42501';
  end if;
  select * into v_acte from public.actes where id = p_acte;
  if v_acte.id is null then
    raise exception 'Acte introuvable.' using errcode = 'P0001';
  end if;
  if v_acte.statut = 'annule' then
    raise exception 'Cet acte est annulé : il ne peut plus être modifié.' using errcode = 'P0001';
  end if;
  if v_acte.statut <> 'enregistre' then
    raise exception 'Seul un acte « enregistré » (pas encore transmis, ou renvoyé par le Caissier) se corrige ici. Pour un acte déjà transmis, demandez au Caissier de vous le renvoyer.'
      using errcode = 'P0001';
  end if;
  perform public.controler_saisie_acte(v_acte.type_acte_id, p_titulaire_nom, p_titulaire_2_nom, p_details);

  update public.actes
     set categorie           = coalesce(p_categorie, categorie),
         titulaire_nom       = p_titulaire_nom,
         titulaire_2_nom     = p_titulaire_2_nom,
         demandeur_nom       = p_demandeur_nom,
         demandeur_telephone = nullif(btrim(coalesce(p_demandeur_telephone, '')), ''),
         observations        = nullif(btrim(coalesce(p_observations, '')), ''),
         statut              = case when p_transmettre then 'en_attente_paiement'::public.statut_acte else statut end
   where id = p_acte
  returning * into v_acte;
  if v_acte.id is null then
    raise exception 'Cet acte n''appartient pas à votre entité.' using errcode = '42501';
  end if;

  perform public.ecrire_fiche_acte(v_acte.id, p_details);
  return v_acte;
end;
$$;

comment on function public.corriger_acte is
  'Corrige un acte « enregistré » et sa fiche en une seule opération (Officier) ; peut le transmettre au Caissier dans la foulée.';


-- Droits sur les fonctions de ce fichier (même règle qu'au fichier 08)
revoke execute on function public.texte_propre(jsonb, text) from public, anon;
revoke execute on function public.ecrire_fiche_acte(uuid, jsonb) from public, anon;
revoke execute on function public.controler_saisie_acte(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.enregistrer_acte(uuid, public.categorie_tarif, text, text, text, text, text, jsonb, boolean) from public, anon;
revoke execute on function public.corriger_acte(uuid, public.categorie_tarif, text, text, text, text, text, jsonb, boolean) from public, anon;
-- (les fonctions d'aide agissent avec les droits de la personne connectée : sans danger)
grant  execute on function public.texte_propre(jsonb, text) to authenticated;
grant  execute on function public.ecrire_fiche_acte(uuid, jsonb) to authenticated;
grant  execute on function public.controler_saisie_acte(uuid, text, text, jsonb) to authenticated;
grant  execute on function public.enregistrer_acte(uuid, public.categorie_tarif, text, text, text, text, text, jsonb, boolean) to authenticated;
grant  execute on function public.corriger_acte(uuid, public.categorie_tarif, text, text, text, text, text, jsonb, boolean) to authenticated;
