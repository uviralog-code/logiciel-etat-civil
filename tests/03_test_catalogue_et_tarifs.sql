-- =====================================================================
-- TESTS du fichier 03 : CATALOGUE DES ACTES ET TARIFS
-- Transaction annulée à la fin. Les dates sont relatives à aujourd'hui
-- ("J" = aujourd'hui), pour que les tests restent valables tout le temps.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Données d'essai
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',  'commune'),
  ('KAV', 'Commune de Kavimvira', 'commune');

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into public.types_actes (numero, code, libelle, famille, tarif_distinct_etranger, couleur) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance',  'extrait',         false, '#2E7D32'),
  ( 5, 'ATRES',  'Attestation de résidence',      'attestation',     true,  '#1565C0'),
  ( 2, 'DEC',    'Acte de décès',                 'acte_etat_civil', false, '#455A64');

select id as nais from public.types_actes where code = 'EXNAIS' \gset
select id as res  from public.types_actes where code = 'ATRES'  \gset
select id as dec  from public.types_actes where code = 'DEC'    \gset

-- ---------------------------------------------------------------------
-- 1. Catalogue des actes
-- ---------------------------------------------------------------------
select test.verifier((select count(*) from public.types_actes) = 3, 'Trois types d''actes enregistrés');
select test.doit_echouer(
  $q$ insert into public.types_actes (numero, code, libelle, famille) values (9, 'nais', 'Minuscules', 'extrait') $q$,
  'Un code d''acte en minuscules est refusé'
);
select test.doit_echouer(
  $q$ insert into public.types_actes (numero, code, libelle, famille) values (9, 'AT-RES', 'Avec tiret', 'attestation') $q$,
  'Un code d''acte avec tiret est refusé (le tiret sépare les parties de l''ID)'
);
select test.doit_echouer(
  $q$ insert into public.types_actes (numero, code, libelle, famille) values (22, 'AUTRE', 'Numéro pris', 'extrait') $q$,
  'Deux actes ne peuvent pas avoir le même numéro de fiche'
);
select test.doit_echouer(
  $q$ insert into public.types_actes (numero, code, libelle, famille, couleur) values (9, 'COUL', 'Couleur', 'extrait', 'vert') $q$,
  'Une couleur qui n''est pas au format #RRGGBB est refusée'
);

-- ---------------------------------------------------------------------
-- 2. Grille commune
-- ---------------------------------------------------------------------
-- Extrait de naissance : 25 $ il y a 200 jours, puis 30 $ depuis 100 jours
insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif) values
  (:'nais', 'national', 25, 'USD', current_date - 200, 'Ancienne grille'),
  (:'nais', 'national', 30, 'USD', current_date - 100, 'Grille 2026');
-- Attestation de résidence : 18 000 FC nationaux, 39 000 FC étrangers
insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis) values
  (:'res', 'national', 18000, 'CDF', current_date - 100),
  (:'res', 'etranger', 39000, 'CDF', current_date - 100);
-- Acte de décès : 15 000 FC
insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis) values
  (:'dec', 'national', 15000, 'CDF', current_date - 100);

select test.doit_echouer(
  format($q$ insert into public.tarifs_communs (type_acte_id, montant, devise) values (%L, 0, 'CDF') $q$, :'dec'),
  'Un tarif à zéro est refusé (la gratuité passe par l''exonération)'
);
select test.doit_echouer(
  format($q$ insert into public.tarifs_communs (type_acte_id, categorie, montant, devise) values (%L, 'etranger', 50, 'USD') $q$, :'nais'),
  'Un tarif Étrangers est refusé pour un acte qui n''en a pas'
);
select test.doit_echouer(
  format($q$ insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis)
             values (%L, 99, 'USD', current_date - 100) $q$, :'nais'),
  'Deux tarifs pour le même acte à la même date sont refusés'
);

-- ---------------------------------------------------------------------
-- 3. Le bon prix à la bonne date
-- ---------------------------------------------------------------------
select test.verifier(
  (select montant = 30 and devise = 'USD' and source = 'commune'
   from public.tarif_applicable(:'mul', :'nais', 'national')),
  'Aujourd''hui, l''extrait de naissance coûte 30 $ (grille commune)'
);
select test.verifier(
  (select montant = 25 from public.tarif_applicable(:'mul', :'nais', 'national', current_date - 150)),
  'Il y a 150 jours, il coûtait 25 $ : l''historique est respecté'
);
select test.verifier(
  not exists (select 1 from public.tarif_applicable(:'mul', :'nais', 'national', current_date - 300)),
  'Avant la première grille, aucun tarif n''est trouvé'
);
select test.verifier(
  (select montant = 39000 from public.tarif_applicable(:'mul', :'res', 'etranger')),
  'Attestation de résidence pour un étranger : 39 000 FC'
);
select test.verifier(
  (select montant = 18000 from public.tarif_applicable(:'mul', :'res', 'national')),
  'Attestation de résidence pour un national : 18 000 FC'
);
select test.verifier(
  (select montant = 30 from public.tarif_applicable(:'mul', :'nais', 'etranger')),
  'Un étranger paie le tarif national quand l''acte n''a pas de tarif Étrangers'
);
select test.verifier(
  not exists (select 1 from public.tarif_applicable(:'mul', extensions.gen_random_uuid(), 'national')),
  'Un type d''acte inconnu ne donne aucun tarif'
);

-- Changement programmé : 35 $ dans 10 jours
insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis)
  values (:'nais', 35, 'USD', current_date + 10);
select test.verifier(
  (select montant = 30 from public.tarif_applicable(:'mul', :'nais', 'national')),
  'Un tarif programmé pour plus tard ne s''applique pas encore'
);
select test.verifier(
  (select montant = 35 from public.tarif_applicable(:'mul', :'nais', 'national', current_date + 10)),
  'Le tarif programmé s''applique à partir de sa date'
);

-- ---------------------------------------------------------------------
-- 4. Ajustements propres à une entité
-- ---------------------------------------------------------------------
-- Kavimvira fixe l'attestation de résidence (nationaux) à 20 000 FC depuis 30 jours
insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
  values (:'kav', :'res', 'national', 20000, 'CDF', current_date - 30, 'Décision locale');

select test.verifier(
  (select montant = 20000 and source = 'entite' from public.tarif_applicable(:'kav', :'res', 'national')),
  'Kavimvira applique son propre tarif : 20 000 FC'
);
select test.verifier(
  (select montant = 18000 and source = 'commune' from public.tarif_applicable(:'mul', :'res', 'national')),
  'Mulongwe n''est pas touchée par l''ajustement de Kavimvira : 18 000 FC'
);
select test.verifier(
  (select montant = 39000 from public.tarif_applicable(:'kav', :'res', 'etranger')),
  'L''ajustement « nationaux » de Kavimvira ne change pas le tarif « étrangers »'
);
select test.verifier(
  (select montant = 18000 from public.tarif_applicable(:'kav', :'res', 'national', current_date - 60)),
  'Avant son ajustement, Kavimvira appliquait la grille commune'
);

-- Vue des écarts pour l'admin
select test.verifier(
  (select count(*) = 1 and min(entite_code) = 'KAV' and min(montant_commun) = 18000 and min(montant_entite) = 20000
   from public.vue_ecarts_tarifs),
  'La vue des écarts montre l''écart de Kavimvira (20 000 FC contre 18 000 FC)'
);

-- Retour à la grille commune programmé dans 5 jours
insert into public.tarifs_entites (entite_id, type_acte_id, categorie, suit_grille_commune, en_vigueur_depuis, motif)
  values (:'kav', :'res', 'national', true, current_date + 5, 'Alignement sur la grille commune');
select test.verifier(
  (select montant = 18000 and source = 'commune'
   from public.tarif_applicable(:'kav', :'res', 'national', current_date + 5)),
  'Après le retour à la grille commune, Kavimvira repasse à 18 000 FC'
);

select test.doit_echouer(
  format($q$ insert into public.tarifs_entites (entite_id, type_acte_id, suit_grille_commune, montant, devise)
             values (%L, %L, true, 10, 'CDF') $q$, :'mul', :'dec'),
  'Un retour à la grille commune ne peut pas porter de montant'
);
select test.doit_echouer(
  format($q$ insert into public.tarifs_entites (entite_id, type_acte_id) values (%L, %L) $q$, :'mul', :'dec'),
  'Un ajustement local sans montant est refusé'
);

-- ---------------------------------------------------------------------
-- 5. Protection de l'historique
-- ---------------------------------------------------------------------
select test.doit_echouer(
  format($q$ update public.tarifs_communs set montant = 28
             where type_acte_id = %L and en_vigueur_depuis = current_date - 100 $q$, :'nais'),
  'Un tarif commun déjà en vigueur ne peut pas être modifié'
);
select test.doit_echouer(
  format($q$ delete from public.tarifs_communs
             where type_acte_id = %L and en_vigueur_depuis = current_date - 100 $q$, :'nais'),
  'Un tarif commun déjà en vigueur ne peut pas être supprimé'
);
select test.doit_echouer(
  format($q$ update public.tarifs_entites set montant = 21000 where entite_id = %L and montant = 20000 $q$, :'kav'),
  'Un ajustement local déjà en vigueur ne peut pas être modifié'
);

update public.tarifs_communs set montant = 34
  where type_acte_id = :'nais' and en_vigueur_depuis = current_date + 10;
select test.verifier(
  (select montant = 34 from public.tarif_applicable(:'mul', :'nais', 'national', current_date + 10)),
  'Un tarif programmé pour plus tard peut encore être corrigé'
);
delete from public.tarifs_communs where type_acte_id = :'nais' and en_vigueur_depuis = current_date + 10;
select test.verifier(
  (select montant = 30 from public.tarif_applicable(:'mul', :'nais', 'national', current_date + 10)),
  'Un tarif programmé pour plus tard peut encore être supprimé'
);

-- ---------------------------------------------------------------------
-- 6. Taux de change
-- ---------------------------------------------------------------------
select test.verifier(
  public.taux_applicable(:'mul') is null,
  'Sans taux saisi, aucun taux n''est appliqué'
);

insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values
  (:'mul', 2800, now() - interval '3 days'),
  (:'mul', 2850, now() - interval '1 day'),
  (:'kav', 2900, now() - interval '2 days');

select test.verifier(public.taux_applicable(:'mul') = 2850, 'Mulongwe : le taux du jour est le plus récent (2 850 FC)');
select test.verifier(
  public.taux_applicable(:'mul', now() - interval '2 days') = 2800,
  'Mulongwe : il y a 2 jours, le taux était de 2 800 FC'
);
select test.verifier(public.taux_applicable(:'kav') = 2900, 'Kavimvira a son propre taux (2 900 FC)');

select test.doit_echouer(
  format($q$ insert into public.taux_change (entite_id, taux) values (%L, 28.5) $q$, :'mul'),
  'Un taux invraisemblable (28,5) est refusé'
);
select test.doit_echouer(
  format($q$ insert into public.taux_change (entite_id, taux) values (%L, 285000) $q$, :'mul'),
  'Un taux invraisemblable (285 000) est refusé'
);
select test.doit_echouer(
  format($q$ update public.taux_change set taux = 2000 where entite_id = %L $q$, :'kav'),
  'Un taux déjà en vigueur ne peut pas être modifié'
);
select test.doit_echouer(
  format($q$ delete from public.taux_change where entite_id = %L $q$, :'kav'),
  'Un taux déjà en vigueur ne peut pas être supprimé'
);

-- ---------------------------------------------------------------------
-- 7. Conversion en francs congolais
-- ---------------------------------------------------------------------
select test.verifier(public.convertir_en_cdf(75, 'USD', 2850) = 213750, '75 $ au taux de 2 850 = 213 750 FC');
select test.verifier(public.convertir_en_cdf(15000, 'CDF', 2850) = 15000, 'Un montant déjà en FC reste inchangé');
select test.verifier(public.convertir_en_cdf(30, 'USD', 2850.55) = 85517, 'Le résultat est arrondi au franc (85 516,5 -> 85 517)');
select test.verifier(public.convertir_en_cdf(30, 'USD', null) is null, 'Un montant en $ sans taux ne peut pas être converti');

-- ---------------------------------------------------------------------
-- 8. Verrouillage par défaut
-- ---------------------------------------------------------------------
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id)
  values ('00000000-0000-0000-0000-000000000001', 'mulongwe.caissier', 'Caissier test', 'caissier', :'mul');
select test.se_connecter('00000000-0000-0000-0000-000000000001');
select test.verifier(
  (select count(*) from public.types_actes) = 0
  and (select count(*) from public.tarifs_communs) = 0
  and (select count(*) from public.taux_change) = 0,
  'Sans règle d''accès, un utilisateur connecté ne voit ni actes, ni tarifs, ni taux'
);
select test.se_deconnecter();

rollback;
