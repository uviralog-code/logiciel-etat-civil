-- =====================================================================
-- TESTS du fichier 18 : CATALOGUE DES ACTES PROTÉGÉ
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as exnais from public.types_actes where code = 'EXNAIS' \gset
select (public.aujourdhui() + 1)::text as demain, public.aujourdhui()::text as jour \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',        'Administrateur', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier', 'Bahati M.',      'officier', :'mul', false, false);

-- ---------------------------------------------------------------------
-- 1. Ajout d'un type d'acte avec son prix
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');

select public.ajouter_type_acte(27::smallint, 'ATBVM', 'Attestation de bonne vie et mœurs', 'attestation', 'generique', true, '#1565C0',
                                12000, 'CDF', 30000, 'CDF', :'demain'::date, 'Arrêté n° 3/2026') as nouveau \gset
select test.verifier(
  (select count(*) = 1 from public.types_actes where id = :'nouveau' and actif and code = 'ATBVM'),
  'Ajout : le type d''acte est au catalogue');
select test.verifier(
  (select count(*) = 2 from public.tarifs_communs where type_acte_id = :'nouveau' and en_vigueur_depuis = :'demain'::date),
  'Ajout : avec ses deux prix (National et Étranger), dès demain');
select test.verifier(
  (select montant = 30000 from public.tarif_applicable(:'mul', :'nouveau', 'etranger', :'demain'::date)),
  'Ajout : le bon prix est trouvé à partir de demain');
select test.verifier(
  (select count(*) = 0 from public.tarif_applicable(:'mul', :'nouveau', 'national')),
  'Ajout : aujourd''hui, pas encore de prix (au plus tôt demain)');

select test.doit_echouer(
  format($$select public.ajouter_type_acte(28::smallint, 'ATTST', 'Essai', 'attestation', 'generique', false, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'jour'),
  'Ajout : un prix pour aujourd''hui est refusé', 'au plus tôt demain');
select test.verifier(
  (select count(*) = 0 from public.types_actes where code = 'ATTST'),
  '… et le type d''acte n''est pas créé non plus (tout ou rien)');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(28::smallint, 'ATTST', 'Essai', 'attestation', 'generique', true, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'demain'),
  'Ajout : tarif Étrangers distinct mais non indiqué', 'indiquez-le aussi');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(28::smallint, 'ATTST', 'Essai', 'attestation', 'generique', false, null, null, null, null, null, %L::date, 'x')$$, :'demain'),
  'Ajout : sans prix, refusé', 'toujours un prix');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(5::smallint, 'ATTST', 'Essai', 'attestation', 'generique', false, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'demain'),
  'Ajout : numéro déjà pris', 'types_actes_numero_key');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(28::smallint, 'EXNAIS', 'Essai', 'attestation', 'generique', false, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'demain'),
  'Ajout : code déjà pris', 'types_actes_code_key');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(28::smallint, 'AT-1', 'Essai', 'attestation', 'generique', false, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'demain'),
  'Ajout : code avec tiret ou chiffre refusé', 'types_actes_code_format');

-- ---------------------------------------------------------------------
-- 2. Ce qui se corrige, ce qui est figé, ce qui ne se supprime jamais
-- ---------------------------------------------------------------------
update public.types_actes set libelle = 'Attestation de bonne vie et mœurs (corrigé)', famille = 'certificat', couleur = '#00727C'
 where id = :'nouveau';
select test.verifier(
  (select libelle like '%(corrigé)' and famille = 'certificat' from public.types_actes where id = :'nouveau'),
  'Correction : libellé, famille et couleur se corrigent');
update public.types_actes set actif = false where id = :'exnais';
select test.verifier((select not actif from public.types_actes where id = :'exnais'), 'Retirer : un type d''acte se retire du catalogue');
update public.types_actes set actif = true where id = :'exnais';
select test.verifier((select actif from public.types_actes where id = :'exnais'), 'Remettre : et se remet');

select test.doit_echouer(format($$update public.types_actes set code = 'EXNAI' where id = %L$$, :'exnais'),
  'Figé : le code', 'fixés à sa création');
select test.doit_echouer(format($$update public.types_actes set numero = 99 where id = %L$$, :'exnais'),
  'Figé : le numéro', 'fixés à sa création');
select test.doit_echouer(format($$update public.types_actes set modele_fiche = 'generique' where id = %L$$, :'exnais'),
  'Figé : le modèle de fiche', 'fixés à sa création');
select test.doit_echouer(format($$update public.types_actes set tarif_distinct_etranger = true where id = %L$$, :'exnais'),
  'Figé : le tarif Étrangers distinct', 'fixés à sa création');
select test.doit_echouer(format($$delete from public.types_actes where id = %L$$, :'nouveau'),
  'Jamais de suppression, même d''un type d''acte tout neuf', 'ne se supprime jamais');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Les autres rôles
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(29::smallint, 'ATOFF', 'Essai officier', 'attestation', 'generique', false, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'demain'),
  'Officier : ne peut pas ajouter de type d''acte', 'réservée à l''administrateur');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-00000000000a', 'aal1');
select test.doit_echouer(
  format($$select public.ajouter_type_acte(29::smallint, 'ATSAN', 'Essai sans code', 'attestation', 'generique', false, null, 5000, 'CDF', null, null, %L::date, 'x')$$, :'demain'),
  'Administrateur sans le code à 6 chiffres : refusé', 'réservée à l''administrateur');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 4. Maintenance de la base : non concernée
-- ---------------------------------------------------------------------
update public.types_actes set code = 'ATBVMX' where id = :'nouveau';
select test.verifier((select code = 'ATBVMX' from public.types_actes where id = :'nouveau'),
  'Maintenance de la base : une correction technique reste possible');

rollback;
