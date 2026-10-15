-- =====================================================================
-- TESTS du fichier 17 : DATES D'EFFET DES TARIFS ET DES TAUX
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as exnais from public.types_actes where code = 'EXNAIS' \gset
select id as atres from public.types_actes where code = 'ATRES' \gset
select (public.aujourdhui())::text as jour, (public.aujourdhui() + 1)::text as demain,
       (public.aujourdhui() - 1)::text as hier, (public.aujourdhui() + 2)::text as apres_demain \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',        'Administrateur', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier', 'Bahati M.',      'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier', 'Neema F.',       'caissier', :'mul', false, false);

-- ---------------------------------------------------------------------
-- 1. Grille commune (administrateur)
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.doit_echouer(
  format($$insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis) values (%L, 35, 'USD', %L)$$, :'exnais', :'jour'),
  'Grille commune : un tarif pour aujourd''hui est refusé', 'au plus tôt demain');
select test.doit_echouer(
  format($$insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis) values (%L, 35, 'USD', %L)$$, :'exnais', :'hier'),
  'Grille commune : un tarif daté d''hier (réécrire l''historique) est refusé', 'au plus tôt demain');
select test.doit_echouer(
  format($$insert into public.tarifs_communs (type_acte_id, montant, devise) values (%L, 35, 'USD')$$, :'exnais'),
  'Grille commune : sans date, la date par défaut (aujourd''hui) est refusée', 'au plus tôt demain');
insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis, motif)
  values (:'exnais', 35, 'USD', :'demain', 'Arrêté d''essai');
select test.verifier(
  (select count(*) = 1 from public.tarifs_communs where type_acte_id = :'exnais' and en_vigueur_depuis = :'demain'::date),
  'Grille commune : un tarif programmé pour demain est accepté');

-- Correction d'un changement à venir : nouvelle date au plus tôt demain
select test.doit_echouer(
  format($$update public.tarifs_communs set en_vigueur_depuis = %L where type_acte_id = %L and en_vigueur_depuis = %L$$, :'jour', :'exnais', :'demain'),
  'Changement à venir : on ne peut pas l''avancer à aujourd''hui', 'au plus tôt demain');
update public.tarifs_communs set en_vigueur_depuis = :'apres_demain', montant = 36
 where type_acte_id = :'exnais' and en_vigueur_depuis = :'demain';
select test.verifier(
  (select montant = 36 from public.tarifs_communs where type_acte_id = :'exnais' and en_vigueur_depuis = :'apres_demain'::date),
  'Changement à venir : on peut le reporter et corriger son montant');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 2. Ajustements d'une entité (officier)
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.doit_echouer(
  format($$insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis) values (%L, %L, 'national', 20000, 'CDF', %L)$$, :'mul', :'atres', :'jour'),
  'Entité : un ajustement pour aujourd''hui est refusé', 'au plus tôt demain');
select test.doit_echouer(
  format($$insert into public.tarifs_entites (entite_id, type_acte_id, categorie, suit_grille_commune, en_vigueur_depuis) values (%L, %L, 'national', true, %L)$$, :'mul', :'atres', :'hier'),
  'Entité : un retour à la grille commune antidaté est refusé', 'au plus tôt demain');
insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
  values (:'mul', :'atres', 'national', 20000, 'CDF', :'demain', 'Décision du Bourgmestre n° 12');
select test.verifier(
  (select count(*) = 1 from public.tarifs_entites where entite_id = :'mul' and en_vigueur_depuis = :'demain'::date),
  'Entité : un ajustement programmé pour demain est accepté');
select test.verifier(
  (select montant = 18000 from public.tarif_applicable(:'mul', :'atres', 'national')),
  '… et le prix d''aujourd''hui ne change pas (18 000 FC)');
select test.verifier(
  (select montant = 20000 from public.tarif_applicable(:'mul', :'atres', 'national', :'demain'::date)),
  '… le nouveau prix s''applique à partir de demain (20 000 FC)');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Taux du jour (caissier)
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000082');
insert into public.taux_change (entite_id, taux) values (:'mul', 2850);
select test.verifier(
  public.taux_applicable(:'mul') = 2850,
  'Taux : saisi maintenant, il s''applique tout de suite');
select test.doit_echouer(
  format($$insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (%L, 2700, now() - interval '1 hour')$$, :'mul'),
  'Taux : antidaté d''une heure, refusé', 'ni antidaté');
select test.doit_echouer(
  format($$insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (%L, 2900, now() + interval '1 day')$$, :'mul'),
  'Taux : programmé pour demain, refusé', 'programmé à l''avance');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 4. Maintenance de la base : non concernée (reprise de données, corrections)
-- ---------------------------------------------------------------------
insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis, motif)
  values (:'exnais', 25, 'USD', '2025-06-01', 'Reprise d''un ancien tarif');
select test.verifier(
  (select count(*) = 1 from public.tarifs_communs where type_acte_id = :'exnais' and en_vigueur_depuis = '2025-06-01'),
  'Maintenance de la base : l''administrateur technique peut reprendre un ancien tarif');

rollback;
