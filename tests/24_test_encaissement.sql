-- =====================================================================
-- TESTS du fichier 24 : ENCAISSEMENT
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as atidc from public.types_actes where code = 'ATIDC' \gset
select id as exnais from public.types_actes where code = 'EXNAIS' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',        'Abbé Justin Nkunzi', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier', 'Bahati Mugisho',     'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier', 'Neema Furaha',       'caissier', :'mul', false, false);

-- ---------------------------------------------------------------------
-- 1. Conversion en francs : à la centaine la plus proche
-- ---------------------------------------------------------------------
select test.verifier(public.convertir_en_cdf(30, 'USD', 2850) = 85500, 'Conversion : 30 $ × 2 850 = 85 500 FC (déjà rond)');
select test.verifier(public.convertir_en_cdf(2.5, 'USD', 2873) = 7200, 'Conversion : 7 182,5 FC → 7 200 FC');
select test.verifier(public.convertir_en_cdf(25, 'USD', 2850) = 71300, 'Conversion : 71 250 FC → 71 300 FC (la moitié monte)');
select test.verifier(public.convertir_en_cdf(10, 'USD', 2814) = 28100, 'Conversion : 28 140 FC → 28 100 FC');
select test.verifier(public.convertir_en_cdf(0.01, 'USD', 600) = 100, 'Conversion : jamais moins de 100 FC');
select test.verifier(public.convertir_en_cdf(18000, 'CDF', null) = 18000, 'Tarif en francs : inchangé');
select test.verifier(public.convertir_en_cdf(30, 'USD', null) is null, 'Dollars sans taux : vide');
select test.verifier(public.montant_lisible(85500, 'CDF') = '85 500 FC' and public.montant_lisible(1234567.5, 'USD') = '1 234 567,50 $'
  and public.montant_lisible(30, 'USD') = '30 $', 'Montants lisibles dans les messages');

-- ---------------------------------------------------------------------
-- 2. Acte chez le Caissier : figé pour l'Officier
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.enregistrer_acte(:'atidc', 'national', 'Furaha Neema', null, null, null, null, null, true)).id as a_fc \gset
select (public.enregistrer_acte(:'exnais', 'national', 'Kahindo Aline', null, null, null, null,
          '{"sexe": "F", "date_naissance": "2020-02-02"}'::jsonb, true)).id as a_usd \gset
select (public.enregistrer_acte(:'exnais', 'national', 'Mapendo Grace', null, null, null, null,
          '{"sexe": "F", "date_naissance": "2020-02-02"}'::jsonb, true)).id as a_usd2 \gset
select (public.enregistrer_acte(:'atidc', 'national', 'A annuler', null, null, null, null, null, true)).id as a_annuler \gset
select (public.enregistrer_acte(:'atidc', 'national', 'Brouillon', null, null, null, null, null, false)).id as brouillon \gset

select test.doit_echouer(format($q$ update public.actes set categorie = 'etranger' where id = %L $q$, :'a_fc'),
  'Officier : la catégorie d''un acte transmis ne change plus (le prix non plus)', 'Cet acte est chez le Caissier');
select test.doit_echouer(format($q$ update public.actes set titulaire_nom = 'Autre Nom' where id = %L $q$, :'a_fc'),
  'Officier : le nom d''un acte transmis ne change plus', 'Cet acte est chez le Caissier');
select test.doit_echouer(format($q$ update public.actes set statut = 'enregistre', motif_renvoi = 'je reprends' where id = %L $q$, :'a_fc'),
  'Officier : il ne reprend pas lui-même un acte transmis', 'Demandez au Caissier de vous le renvoyer');
update public.actes set statut = 'annule', motif_annulation = 'Demandeur parti' where id = :'a_annuler';
select test.verifier((select statut = 'annule' and annule_par = '00000000-0000-0000-0000-000000000081' from public.actes where id = :'a_annuler'),
  'Officier : il peut encore annuler un acte transmis (avec motif)');
update public.actes set categorie = 'etranger' where id = :'brouillon';
select test.verifier((select categorie = 'etranger' from public.actes where id = :'brouillon'),
  'Officier : un acte pas encore transmis se modifie toujours');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Encaissement
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ select public.encaisser(%L, 'USD') $q$, :'a_fc'),
  'Acte en francs : paiement en dollars refusé', 'il se paie en francs congolais');
select (public.encaisser_verifie(:'a_fc', 'CDF', 8000)).id as recu_fc \gset
select test.verifier((select montant_recu = 8000 and devise_recue = 'CDF' and taux_applique is null and montant_equivalent_cdf = 8000
                      from public.recus where id = :'recu_fc'),
  'Acte en francs payé en francs, sans taux du jour : aucun taux sur le reçu');

select test.doit_echouer(format($q$ select public.encaisser_verifie(%L, 'CDF', 85500) $q$, :'a_usd'),
  'Acte en dollars sans aucun taux : refusé', 'enregistrez le taux du jour');
insert into public.taux_change (entite_id, taux) values (:'mul', 2873);
select test.se_deconnecter();
select dernier_numero as avant from public.compteurs_recus where entite_id = :'mul' and annee = extract(year from public.aujourdhui()) \gset
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ select public.encaisser_verifie(%L, 'CDF', 85500) $q$, :'a_usd'),
  'Montant annoncé dépassé par un nouveau taux : rien n''est encaissé',
  'Le montant à percevoir a changé (nouveau taux du jour) : 86 200 FC au lieu de 85 500 FC');
select test.se_deconnecter();
select test.verifier(
  (select statut = 'en_attente_paiement' from public.actes where id = :'a_usd')
  and (select count(*) = 0 from public.recus where acte_id = :'a_usd')
  and (select dernier_numero = :'avant' from public.compteurs_recus where entite_id = :'mul' and annee = extract(year from public.aujourdhui())),
  '… l''acte reste en attente et aucun numéro de reçu n''est consommé');
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select (public.encaisser_verifie(:'a_usd', 'CDF', 86200)).id as recu_usd \gset
select test.verifier((select montant_recu = 86200 and devise_recue = 'CDF' and taux_applique = 2873 and montant_equivalent_cdf = 86200
                      from public.recus where id = :'recu_usd'),
  'Acte en dollars payé en francs : 30 $ × 2 873 = 86 190 → 86 200 FC, taux sur le reçu');
select (public.encaisser_verifie(:'a_usd2', 'USD', 30)).id as recu_usd2 \gset
select test.verifier((select montant_recu = 30 and devise_recue = 'USD' and taux_applique = 2873 and montant_equivalent_cdf = 86200
                      from public.recus where id = :'recu_usd2'),
  'Acte en dollars payé en dollars : 30 $, équivalent arrondi pour les rapports');
select test.doit_echouer(format($q$ select public.encaisser_verifie(%L, null, 30) $q$, :'a_usd2'),
  'Monnaie obligatoire', 'Indiquez la monnaie');
select test.se_deconnecter();

-- L'Officier ne peut pas encaisser à la place du Caissier
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.enregistrer_acte(:'atidc', 'national', 'Encore un', null, null, null, null, null, true)).id as a_off \gset
select test.doit_echouer(format($q$ select public.encaisser_verifie(%L, 'CDF', 8000) $q$, :'a_off'),
  'Officier : pas d''encaissement');
select test.se_deconnecter();

rollback;
