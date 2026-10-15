-- =====================================================================
-- TESTS du fichier 20 : FICHE D'UN ACTE
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset
select id as atidc from public.types_actes where code = 'ATIDC' \gset
select id as exnais from public.types_actes where code = 'EXNAIS' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082'),
  ('00000000-0000-0000-0000-000000000091');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Abbé Justin Nkunzi', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier',  'Bahati Mugisho',     'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier',  'Neema Furaha',       'caissier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000091', 'kavimvira.officier', 'Amani Byamungu',     'officier', :'kav', false, false);

-- ---------------------------------------------------------------------
-- 1. Heure de transmission
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.enregistrer_acte(:'atidc', 'national', 'Furaha Neema', null, null, null, null, null, true)).id as transmis \gset
select (public.enregistrer_acte(:'atidc', 'national', 'Bisimwa Paul', null, null, null, null, null, false)).id as brouillon \gset
select (public.enregistrer_acte(:'exnais', 'national', 'Kahindo Aline', null, 'Kahindo Marc', null, null,
          '{"sexe": "F", "date_naissance": "2020-02-02", "lieu_naissance": "Uvira"}'::jsonb, true)).id as naissance \gset
select test.verifier((select transmis_le is not null from public.actes where id = :'transmis'),
  'Transmission : l''heure est notée dès l''enregistrement transmis');
select test.verifier((select transmis_le is null from public.actes where id = :'brouillon'),
  '… et pas pour un acte resté « enregistré »');
update public.actes set statut = 'en_attente_paiement' where id = :'brouillon';
select test.verifier((select transmis_le is not null from public.actes where id = :'brouillon'),
  'Transmission plus tard : l''heure est notée à ce moment-là');

-- ---------------------------------------------------------------------
-- 2. Noms des agents de son entité, et rien d'autre
-- ---------------------------------------------------------------------
select test.verifier(
  (select array_agg(nom_complet order by nom_complet) = array['Abbé Justin Nkunzi', 'Bahati Mugisho', 'Neema Furaha']
   from public.agents_de_mon_entite()),
  'Agents : l''officier voit les noms de son entité (et de l''administrateur), pas ceux de Kavimvira');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.verifier((select count(*) = 4 from public.agents_de_mon_entite()), 'Agents : l''administrateur voit tous les noms');
select test.se_deconnecter();
select test.verifier((select count(*) = 0 from public.agents_de_mon_entite()), 'Agents : personne de connecté, aucun nom');

-- ---------------------------------------------------------------------
-- 3. Après le paiement
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000082');
insert into public.taux_change (entite_id, taux) values (:'mul', 2850);
select (public.encaisser(:'transmis')).id as recu \gset
select (public.encaisser(:'naissance')).id as recu2 \gset
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000081');

select test.doit_echouer(format($$update public.actes set statut = 'annule', motif_annulation = 'Erreur' where id = %L$$, :'transmis'),
  'Payé : l''officier ne peut pas l''annuler', 'annulant son reçu');
select test.doit_echouer(format($$update public.actes set observations = 'Ajout' where id = %L$$, :'transmis'),
  'Payé : le reste de l''acte est figé', 'seule l''orthographe des noms');
select test.doit_echouer(format($$update public.actes set titulaire_nom = 'NEEMA Furaha' where id = %L$$, :'transmis'),
  'Payé : un nom ne change pas sans motif', 'motif de la correction');
select test.doit_echouer(format($$update public.details_naissance set lieu_naissance = 'Bukavu' where acte_id = %L$$, :'naissance'),
  'Payé : la fiche de détails est figée', 'fiche de détails est figée');
select test.doit_echouer(format($$select public.corriger_nom_acte(%L, 'NEEMA Furaha', null, null, '  ')$$, :'transmis'),
  'Correction d''un nom : motif obligatoire', 'motif de la correction');
select test.doit_echouer(format($$select public.corriger_nom_acte(%L, 'Bisimwa P.', null, null, 'Faute')$$, :'brouillon'),
  'Correction d''un nom : réservée aux actes payés (les autres ont la fiche complète)', 'fiche complète');

select (public.corriger_nom_acte(:'transmis', '  NEEMA   Furaha ', null, 'Neema Pierre', 'Le demandeur a montré sa carte d''électeur')).id as c1 \gset
select test.verifier(
  (select titulaire_nom = 'NEEMA Furaha' and demandeur_nom = 'Neema Pierre' and motif_correction = 'Le demandeur a montré sa carte d''électeur'
          and corrige_par = '00000000-0000-0000-0000-000000000081' and corrige_le is not null and statut = 'paye'
   from public.actes where id = :'transmis'),
  'Correction d''un nom : faite, avec le motif, l''auteur et l''heure ; le statut ne change pas');
select test.se_deconnecter();  -- le journal ne se lit pas par l'officier
select test.verifier(
  (select count(*) = 1 from public.journal_audit where table_nom = 'actes' and enregistrement_id = :'transmis'
     and 'titulaire_nom' = any(champs_modifies) and nouvelles_valeurs ->> 'motif_correction' like 'Le demandeur%'
     and utilisateur_id = '00000000-0000-0000-0000-000000000081'),
  '… inscrite au journal d''audit, motif et auteur compris');
select test.se_connecter('00000000-0000-0000-0000-000000000081');

update public.actes set statut = 'delivre' where id = :'transmis';
select test.verifier((select statut = 'delivre' and delivre_par = '00000000-0000-0000-0000-000000000081' and delivre_le is not null
   from public.actes where id = :'transmis'), 'Délivré : l''officier le marque quand il remet le document');
select (public.corriger_nom_acte(:'transmis', 'NEEMA Furaha', null, 'NEEMA Pierre', 'Majuscules du nom de famille')).id as c2 \gset
select test.verifier((select demandeur_nom = 'NEEMA Pierre' from public.actes where id = :'transmis'),
  'Délivré : l''orthographe d''un nom se corrige encore (avec motif)');
select test.doit_echouer(format($$update public.actes set statut = 'annule', motif_annulation = 'Erreur' where id = %L$$, :'transmis'),
  'Délivré : l''officier ne peut pas l''annuler non plus', 'annulant son reçu');

-- Un acte pas encore payé : l'officier l'annule, avec motif
update public.actes set statut = 'annule', motif_annulation = 'Demande abandonnée' where id = :'brouillon';
select test.verifier((select statut = 'annule' from public.actes where id = :'brouillon'),
  'Pas encore payé : l''officier peut l''annuler, avec motif');
select test.se_deconnecter();

-- Un officier d'une autre entité ne corrige rien
select test.se_connecter('00000000-0000-0000-0000-000000000091');
select test.doit_echouer(format($$select public.corriger_nom_acte(%L, 'Autre', null, null, 'x')$$, :'naissance'),
  'Autre entité : refusé', 'votre entité');
select test.se_deconnecter();

-- Le Caissier annule le reçu : l'acte est annulé avec lui (opération interne, permise)
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select (public.annuler_recu(:'recu', 'Erreur de caisse')).id as r1 \gset
select test.verifier((select statut = 'annule' and motif_annulation like 'Reçu %annulé : Erreur de caisse' from public.actes where id = :'transmis'),
  'Annulation du reçu par le Caissier : l''acte payé est annulé avec lui');
select test.se_deconnecter();

-- L'administrateur garde son droit d'annuler (avec motif)
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
update public.actes set statut = 'annule', motif_annulation = 'Décision de l''administrateur' where id = :'naissance';
select test.verifier((select statut = 'annule' from public.actes where id = :'naissance'), 'Administrateur : peut toujours annuler un acte payé');
select test.se_deconnecter();

rollback;
