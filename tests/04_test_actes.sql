-- =====================================================================
-- TESTS du fichier 04 : LES ACTES
-- Transaction annulée à la fin.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Données d'essai
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type, active) values
  ('MUL', 'Commune de Mulongwe',  'commune', true),
  ('KAV', 'Commune de Kavimvira', 'commune', true),
  ('FER', 'Entité fermée',        'commune', false);

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset
select id as fer from public.entites where code = 'FER' \gset

insert into public.types_actes (numero, code, libelle, famille, tarif_distinct_etranger, modele_fiche, actif) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait',         false, 'naissance', true),
  ( 5, 'ATRES',  'Attestation de résidence',     'attestation',     true,  'generique', true),
  ( 2, 'DEC',    'Acte de décès',                'acte_etat_civil', false, 'deces',     true),
  ( 3, 'MAR',    'Célébration de mariage',       'acte_etat_civil', false, 'mariage',   true),
  (26, 'CVIE',   'Certificat de vie',            'certificat',      false, 'generique', true),
  (99, 'VIEUX',  'Acte retiré du catalogue',     'attestation',     false, 'generique', false);

select id as nais  from public.types_actes where code = 'EXNAIS' \gset
select id as res   from public.types_actes where code = 'ATRES'  \gset
select id as dec   from public.types_actes where code = 'DEC'    \gset
select id as mar   from public.types_actes where code = 'MAR'    \gset
select id as cvie  from public.types_actes where code = 'CVIE'   \gset
select id as vieux from public.types_actes where code = 'VIEUX'  \gset

insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis) values
  (:'nais',  'national', 30,    'USD', current_date - 100),
  (:'res',   'national', 18000, 'CDF', current_date - 100),
  (:'res',   'etranger', 39000, 'CDF', current_date - 100),
  (:'dec',   'national', 15000, 'CDF', current_date - 100),
  (:'mar',   'national', 75,    'USD', current_date - 100),
  (:'vieux', 'national', 1000,  'CDF', current_date - 100);
-- Le certificat de vie (CVIE) n'a volontairement AUCUN tarif.

select extract(year from current_date)::int as an \gset

-- ---------------------------------------------------------------------
-- 1. ID unique automatique
-- ---------------------------------------------------------------------
insert into public.actes (entite_id, type_acte_id, titulaire_nom, demandeur_nom)
  values (:'mul', :'nais', '  MUGISHO   Bahati  Jean ', 'Mugisho Pierre');

select test.verifier(
  (select identifiant = format('MUL-EXNAIS-%s-000001', :an) from public.actes where titulaire_nom like 'MUGISHO%'),
  format('Premier extrait de naissance de Mulongwe : MUL-EXNAIS-%s-000001', :an)
);

insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'mul', :'nais', 'Neema Furaha');
insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'kav', :'nais', 'Amani Byamungu');
insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'mul', :'dec',  'Kabila Ndoole');

select test.verifier(
  (select identifiant = format('MUL-EXNAIS-%s-000002', :an) from public.actes where titulaire_nom = 'Neema Furaha'),
  'Le deuxième acte du même type reçoit le numéro suivant (000002)'
);
select test.verifier(
  (select identifiant = format('KAV-EXNAIS-%s-000001', :an) from public.actes where titulaire_nom = 'Amani Byamungu'),
  'Chaque entité a sa propre numérotation (KAV recommence à 000001)'
);
select test.verifier(
  (select identifiant = format('MUL-DEC-%s-000001', :an) from public.actes where titulaire_nom = 'Kabila Ndoole'),
  'Chaque type d''acte a sa propre numérotation (DEC recommence à 000001)'
);

-- Un ID ou un numéro saisi à la main est ignoré
insert into public.actes (entite_id, type_acte_id, titulaire_nom, identifiant, numero_ordre)
  values (:'mul', :'nais', 'Tentative manuelle', 'MUL-EXNAIS-2026-999999', 999999);
select test.verifier(
  (select identifiant = format('MUL-EXNAIS-%s-000003', :an) from public.actes where titulaire_nom = 'Tentative manuelle'),
  'Un ID saisi à la main est ignoré : la base attribue le vrai numéro (000003)'
);

-- 50 actes d'affilée : numéros tous différents et sans trou
insert into public.actes (entite_id, type_acte_id, titulaire_nom)
  select :'kav', :'dec', 'Série ' || g from generate_series(1, 50) g;
select test.verifier(
  (select count(distinct identifiant) = 50 and min(numero_ordre) = 1 and max(numero_ordre) = 50
   from public.actes where entite_id = :'kav' and type_acte_id = :'dec'),
  '50 actes enregistrés d''affilée : 50 ID différents, numérotés de 1 à 50 sans trou'
);

-- ---------------------------------------------------------------------
-- 2. Prix calculé automatiquement
-- ---------------------------------------------------------------------
select test.verifier(
  (select montant_du = 30 and devise_du = 'USD' and tarif_source = 'commune' and statut = 'enregistre'
   from public.actes where titulaire_nom = 'Neema Furaha'),
  'Le prix (30 $) est calculé automatiquement depuis la grille'
);

insert into public.actes (entite_id, type_acte_id, titulaire_nom, montant_du, devise_du)
  values (:'mul', :'nais', 'Prix bricolé', 1, 'CDF');
select test.verifier(
  (select montant_du = 30 and devise_du = 'USD' from public.actes where titulaire_nom = 'Prix bricolé'),
  'Un prix saisi à la main (1 FC) est ignoré : l''acte coûte bien 30 $'
);

insert into public.actes (entite_id, type_acte_id, titulaire_nom, categorie)
  values (:'mul', :'res', 'John Smith', 'etranger');
select test.verifier(
  (select montant_du = 39000 and devise_du = 'CDF' from public.actes where titulaire_nom = 'John Smith'),
  'Attestation de résidence pour un étranger : 39 000 FC appliqués automatiquement'
);

-- ---------------------------------------------------------------------
-- 3. Refus à la création
-- ---------------------------------------------------------------------
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'Sans tarif') $q$, :'mul', :'cvie'),
  'Un acte sans tarif défini ne peut pas être enregistré'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'X') $q$, :'fer', :'nais'),
  'Un acte dans une entité désactivée est refusé'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'X') $q$, :'mul', :'vieux'),
  'Un acte d''un type retiré du catalogue est refusé'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut) values (%L, %L, 'X', 'paye') $q$, :'mul', :'nais'),
  'Un nouvel acte ne peut pas être créé directement « payé »'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, '   ') $q$, :'mul', :'nais'),
  'Un acte sans nom de titulaire est refusé'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom, date_acte) values (%L, %L, 'X', current_date - 10) $q$, :'mul', :'nais'),
  'Un nouvel acte daté de 10 jours en arrière est refusé (pas d''antidatage)'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom, date_acte) values (%L, %L, 'X', current_date + 1) $q$, :'mul', :'nais'),
  'Un acte daté dans le futur est refusé'
);
insert into public.actes (entite_id, type_acte_id, titulaire_nom, date_acte)
  values (:'mul', :'nais', 'Saisi hors-ligne', current_date - 3);
select test.verifier(
  exists (select 1 from public.actes where titulaire_nom = 'Saisi hors-ligne'),
  'Un acte daté de 3 jours (saisie hors-ligne) est accepté'
);

-- ---------------------------------------------------------------------
-- 4. Noms nettoyés et texte de recherche
-- ---------------------------------------------------------------------
select test.verifier(
  (select titulaire_nom = 'MUGISHO Bahati Jean'
          and recherche_noms = 'mugisho bahati jean mugisho pierre'
   from public.actes where titulaire_nom like 'MUGISHO%'),
  'Espaces superflus retirés ; texte de recherche prêt (titulaire + demandeur, sans majuscules)'
);

-- ---------------------------------------------------------------------
-- 5. Cycle de vie
-- ---------------------------------------------------------------------
select id as a1 from public.actes where titulaire_nom = 'John Smith' \gset

select test.doit_echouer(
  format($q$ update public.actes set statut = 'paye' where id = %L $q$, :'a1'),
  'Un acte « enregistré » ne peut pas passer directement à « payé »'
);

update public.actes set statut = 'en_attente_paiement' where id = :'a1';
select test.verifier(
  (select statut = 'en_attente_paiement' from public.actes where id = :'a1'),
  'Enregistré -> en attente de paiement : accepté'
);

-- Correction de la catégorie avant paiement : le prix suit
update public.actes set categorie = 'national' where id = :'a1';
select test.verifier(
  (select montant_du = 18000 from public.actes where id = :'a1'),
  'Avant paiement, corriger la catégorie (étranger -> national) recalcule le prix : 18 000 FC'
);

update public.actes set statut = 'paye' where id = :'a1';
select test.verifier(
  (select statut = 'paye' from public.actes where id = :'a1'),
  'En attente -> payé : accepté'
);

select test.doit_echouer(
  format($q$ update public.actes set montant_du = 100 where id = %L $q$, :'a1'),
  'Après paiement, le montant ne peut plus être modifié'
);
select test.doit_echouer(
  format($q$ update public.actes set categorie = 'etranger' where id = %L $q$, :'a1'),
  'Après paiement, la catégorie ne peut plus être modifiée'
);
select test.doit_echouer(
  format($q$ update public.actes set statut = 'enregistre' where id = %L $q$, :'a1'),
  'Un acte payé ne peut pas revenir à « enregistré »'
);

update public.actes set titulaire_nom = 'John SMITH' where id = :'a1';
select test.verifier(
  (select titulaire_nom = 'John SMITH' and recherche_noms = 'john smith' from public.actes where id = :'a1'),
  'Après paiement, l''orthographe d''un nom peut encore être corrigée'
);

update public.actes set statut = 'delivre' where id = :'a1';
select test.verifier(
  (select statut = 'delivre' and delivre_le is not null from public.actes where id = :'a1'),
  'Payé -> délivré : accepté, date de remise enregistrée'
);

select test.doit_echouer(
  format($q$ update public.actes set statut = 'annule' where id = %L $q$, :'a1'),
  'Une annulation sans motif est refusée'
);
update public.actes set statut = 'annule', motif_annulation = 'Erreur sur la personne' where id = :'a1';
select test.verifier(
  (select statut = 'annule' and annule_le is not null from public.actes where id = :'a1'),
  'Délivré -> annulé avec motif : accepté, date d''annulation enregistrée'
);
select test.doit_echouer(
  format($q$ update public.actes set observations = 'retouche' where id = %L $q$, :'a1'),
  'Un acte annulé ne peut plus être modifié du tout'
);

-- Retour pour correction
select id as a2 from public.actes where titulaire_nom = 'Neema Furaha' \gset
update public.actes set statut = 'en_attente_paiement' where id = :'a2';
update public.actes set statut = 'enregistre' where id = :'a2';
select test.verifier(
  (select statut = 'enregistre' from public.actes where id = :'a2'),
  'En attente -> enregistré (retour à l''Officier pour correction) : accepté'
);

-- Exonération
update public.actes set statut = 'en_attente_paiement' where id = :'a2';
update public.actes set statut = 'exonere' where id = :'a2';
update public.actes set statut = 'delivre' where id = :'a2';
select test.verifier(
  (select statut = 'delivre' from public.actes where id = :'a2'),
  'En attente -> exonéré -> délivré : accepté'
);

-- ---------------------------------------------------------------------
-- 6. Identification intouchable et suppression interdite
-- ---------------------------------------------------------------------
select id as a3 from public.actes where titulaire_nom = 'Kabila Ndoole' \gset
select test.doit_echouer(
  format($q$ update public.actes set type_acte_id = %L where id = %L $q$, :'nais', :'a3'),
  'Le type d''un acte ne peut pas être changé (l''ID en dépend)'
);
select test.doit_echouer(
  format($q$ update public.actes set identifiant = 'MUL-DEC-2026-000777' where id = %L $q$, :'a3'),
  'L''ID d''un acte ne peut pas être modifié'
);
select test.doit_echouer(
  format($q$ update public.actes set entite_id = %L where id = %L $q$, :'kav', :'a3'),
  'Un acte ne peut pas être déplacé vers une autre entité'
);
select test.doit_echouer(
  format($q$ delete from public.actes where id = %L $q$, :'a3'),
  'Un acte ne peut jamais être supprimé'
);

-- ---------------------------------------------------------------------
-- 7. Archives anciennes (anciens registres papier)
-- ---------------------------------------------------------------------
insert into public.actes (entite_id, type_acte_id, titulaire_nom, origine, date_acte, numero_registre, montant_du, devise_du)
  values (:'mul', :'nais', 'Furaha Espoir', 'archive_ancienne', '2019-05-10', 'Reg. 2019 n° 412', 30, 'USD');
select test.verifier(
  (select identifiant = 'MUL-EXNAIS-2019-000001'
          and statut = 'delivre'
          and montant_du is null
          and numero_registre = 'Reg. 2019 n° 412'
   from public.actes where titulaire_nom = 'Furaha Espoir'),
  'Archive ancienne : ID de son année (MUL-EXNAIS-2019-000001), déjà délivrée, sans montant'
);

-- ---------------------------------------------------------------------
-- 8. Fiches de détails
-- ---------------------------------------------------------------------
select id as a_nais from public.actes where titulaire_nom like 'MUGISHO%' \gset
insert into public.details_naissance (acte_id, sexe, date_naissance, lieu_naissance, nom_pere, nom_mere)
  values (:'a_nais', 'M', '2015-03-21', 'Uvira', 'Mugisho Pierre', 'Bahati Claire');
select test.verifier(
  exists (select 1 from public.details_naissance where acte_id = :'a_nais'),
  'Fiche naissance ajoutée à un extrait de naissance'
);
select test.doit_echouer(
  format($q$ insert into public.details_deces (acte_id, date_deces) values (%L, '2020-01-01') $q$, :'a_nais'),
  'Une fiche décès sur un acte de naissance est refusée'
);
select test.doit_echouer(
  format($q$ insert into public.details_naissance (acte_id, sexe, date_naissance) values (%L, 'F', '2015-01-01') $q$, :'a_nais'),
  'Une deuxième fiche pour le même acte est refusée'
);

insert into public.actes (entite_id, type_acte_id, titulaire_nom, titulaire_2_nom)
  values (:'mul', :'mar', 'Byamungu Amani', 'Mapendo Grace');
select id as a_mar from public.actes where titulaire_nom = 'Byamungu Amani' \gset
insert into public.details_mariage (acte_id, date_celebration, lieu_celebration)
  values (:'a_mar', current_date, 'Bureau de Mulongwe');
select test.verifier(
  (select recherche_noms = 'byamungu amani mapendo grace' from public.actes where id = :'a_mar'),
  'Mariage : les deux époux sont pris en compte pour la recherche'
);

select test.doit_echouer(
  format($q$ insert into public.details_deces (acte_id, sexe, date_deces) values (%L, 'X', '2020-01-01') $q$, :'a3'),
  'Un sexe autre que M ou F est refusé'
);
select test.doit_echouer(
  format($q$ insert into public.details_deces (acte_id, date_deces) values (%L, current_date + 1) $q$, :'a3'),
  'Une date de décès dans le futur est refusée'
);
-- Acte de décès annulé, puis tentative d'ajout de sa fiche décès
insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (:'mul', :'dec', 'Décès annulé');
select id as a_dec_annule from public.actes where titulaire_nom = 'Décès annulé' \gset
update public.actes set statut = 'annule', motif_annulation = 'Doublon' where id = :'a_dec_annule';
select test.doit_echouer(
  format($q$ insert into public.details_deces (acte_id, date_deces) values (%L, '2020-01-01') $q$, :'a_dec_annule'),
  'On ne peut pas ajouter de fiche à un acte annulé',
  'acte est annulé'
);
select test.doit_echouer(
  format($q$ delete from public.details_naissance where acte_id = %L $q$, :'a_nais'),
  'Une fiche de détails ne peut pas être supprimée'
);

-- ---------------------------------------------------------------------
-- 9. Verrouillage par défaut
-- ---------------------------------------------------------------------
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000001', 'mulongwe.officier', 'Officier test', 'officier', :'mul');
select test.se_connecter('00000000-0000-0000-0000-000000000001');
select test.verifier(
  (select count(*) from public.actes) = 0 and (select count(*) from public.details_naissance) = 0,
  'Sans règle d''accès, un utilisateur connecté ne voit aucun acte'
);
select test.se_deconnecter();

rollback;
