-- =====================================================================
-- TESTS du fichier 26 : ANNULATION D'UN REÇU
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as atidc from public.types_actes where code = 'ATIDC' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier', 'Bahati Mugisho', 'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier', 'Neema Furaha',   'caissier', :'mul', false, false);

select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.enregistrer_acte(:'atidc', 'national', 'Furaha Neema', null, null, null, null, null, true)).id as a1 \gset
select (public.enregistrer_acte(:'atidc', 'national', 'Bisimwa Paul', null, null, null, null, null, true)).id as a2 \gset
select (public.enregistrer_acte(:'atidc', 'national', 'Deja Delivre', null, null, null, null, null, true)).id as a3 \gset
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000082');
select (public.encaisser_verifie(:'a1', 'CDF', 8000)).id as r1 \gset
select (public.encaisser_verifie(:'a2', 'CDF', 8000)).id as r2 \gset
select (public.encaisser_verifie(:'a3', 'CDF', 8000)).id as r3 \gset

-- ---------------------------------------------------------------------
-- 1. Erreur de caisse : l'acte revient dans la file, puis un nouveau reçu
-- ---------------------------------------------------------------------
select test.doit_echouer(format($q$ select public.annuler_recu(%L, '  x ', true) $q$, :'r1'),
  'Motif trop court refusé', '3 caractères au moins');
select test.verifier((public.annuler_recu(:'r1', '  Mauvaise   monnaie choisie ', true)).suite_annulation = 'acte_remis_en_file',
  'Annulation avec remise en file');
select test.verifier(
  (select statut = 'annule' and motif_annulation = 'Mauvaise monnaie choisie' and annule_par = '00000000-0000-0000-0000-000000000082' from public.recus where id = :'r1')
  and (select statut = 'en_attente_paiement' and motif_annulation is null from public.actes where id = :'a1'),
  'Le reçu est annulé (motif nettoyé) ; l''acte revient « en attente de paiement »');
select (public.encaisser_verifie(:'a1', 'CDF', 8000)).id as r1bis \gset
select test.verifier(
  (select count(*) = 2 and count(*) filter (where statut = 'valide') = 1 from public.recus where acte_id = :'a1')
  and (select statut = 'paye' from public.actes where id = :'a1'),
  'Nouveau reçu pour le même acte : deux reçus, un seul valide ; l''acte est payé');
select test.doit_echouer(format($q$ insert into public.recus (acte_id, devise_recue) values (%L, 'CDF') $q$, :'a1'),
  'Jamais deux reçus valides pour un acte', 'en attente de paiement');

-- ---------------------------------------------------------------------
-- 2. Erreur sur l'acte : l'acte est annulé (règle du fichier 05)
-- ---------------------------------------------------------------------
select test.verifier((public.annuler_recu(:'r2', 'Erreur de type d''acte')).suite_annulation = 'acte_annule',
  'Annulation simple (par défaut : l''acte est annulé)');
select test.verifier((select statut = 'annule' and motif_annulation like 'Reçu MUL-REC-% annulé : Erreur de type d''acte' from public.actes where id = :'a2'),
  'L''acte est annulé avec le motif du reçu');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. Un acte délivré ne revient pas dans la file ; personne ne le remet directement
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
update public.actes set statut = 'delivre' where id = :'a3';
select test.doit_echouer(format($q$ update public.actes set statut = 'en_attente_paiement' where id = %L $q$, :'a1'),
  'Officier : ne remet pas lui-même un acte payé dans la file', 'non autorisé');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ select public.annuler_recu(%L, 'Erreur de caisse', true) $q$, :'r3'),
  'Acte déjà délivré : pas de remise en file', 'Cet acte est déjà « délivré » : il ne peut pas revenir dans la file');
select test.verifier((select statut = 'valide' from public.recus where id = :'r3'), '… et le reçu reste valide');
select test.doit_echouer(format($q$ update public.recus set suite_annulation = 'acte_remis_en_file' where id = %L $q$, :'r1bis'),
  'La suite ne se change pas sans annuler', 'Un reçu ne peut pas être modifié');

-- ---------------------------------------------------------------------
-- 4. Après la clôture : plus d'annulation
-- ---------------------------------------------------------------------
select test.verifier((public.cloturer_journee(:'mul', 0, 16000, 'Essai')).id is not null, 'Clôture de la journée');
select test.doit_echouer(format($q$ select public.annuler_recu(%L, 'Trop tard', true) $q$, :'r1bis'),
  'Journée clôturée : aucune annulation', 'est clôturée');
select test.se_deconnecter();

rollback;
