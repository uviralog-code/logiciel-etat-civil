-- =====================================================================
-- TESTS du fichier 08 : SÉCURITÉ ET DROITS D'ACCÈS
-- Une journée de travail simulée : chaque agent fait son travail, puis
-- on essaie de contourner chaque règle. Transaction annulée à la fin.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Données d'essai (préparées par l'administrateur technique)
-- ---------------------------------------------------------------------
insert into public.entites (code, nom, type) values
  ('MUL', 'Commune de Mulongwe',  'commune'),
  ('KAV', 'Commune de Kavimvira', 'commune');
select id as mul from public.entites where code = 'MUL' \gset
select id as kav from public.entites where code = 'KAV' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000011'), ('00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000021'), ('00000000-0000-0000-0000-000000000022'),
  ('00000000-0000-0000-0000-000000000019');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, actif) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Administrateur CDJP', 'admin',    null, true,  true),
  ('00000000-0000-0000-0000-000000000011', 'mulongwe.officier',  'Officier Mulongwe',   'officier', :'mul', false, true),
  ('00000000-0000-0000-0000-000000000012', 'mulongwe.caissier',  'Caissier Mulongwe',   'caissier', :'mul', false, true),
  ('00000000-0000-0000-0000-000000000021', 'kavimvira.officier', 'Officier Kavimvira',  'officier', :'kav', false, true),
  ('00000000-0000-0000-0000-000000000022', 'kavimvira.caissier', 'Caissier Kavimvira',  'caissier', :'kav', false, true),
  ('00000000-0000-0000-0000-000000000019', 'mulongwe.ancien',    'Ancien officier',     'officier', :'mul', false, false);

insert into public.types_actes (numero, code, libelle, famille, tarif_distinct_etranger, modele_fiche) values
  (22, 'EXNAIS', 'Extrait d''acte de naissance', 'extrait',     false, 'naissance'),
  ( 5, 'ATRES',  'Attestation de résidence',     'attestation', true,  'generique');
select id as nais from public.types_actes where code = 'EXNAIS' \gset
select id as res  from public.types_actes where code = 'ATRES'  \gset
insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis) values
  (:'nais', 'national', 30,    'USD', current_date - 100),
  (:'res',  'national', 18000, 'CDF', current_date - 100),
  (:'res',  'etranger', 39000, 'CDF', current_date - 100);

-- L'Officier et le Caissier de Mulongwe se sont connectés en ligne hier
update public.utilisateurs set derniere_connexion_en_ligne = now() - interval '1 day'
  where nom_utilisateur in ('mulongwe.officier', 'mulongwe.caissier');

-- Un taux existe déjà à Mulongwe (saisi la veille)
insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'mul', 2840, now() - interval '1 day');

-- Kavimvira a déjà un acte payé (préparé techniquement)
insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'kav', 2900, now() - interval '1 hour');
insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (:'kav', :'nais', 'Acte de Kavimvira', 'en_attente_paiement');
select id as acte_kav from public.actes where titulaire_nom = 'Acte de Kavimvira' \gset
select from public.encaisser(:'acte_kav');

-- ---------------------------------------------------------------------
-- 1. VISITEUR NON CONNECTÉ
-- ---------------------------------------------------------------------
set role anon;
select test.doit_echouer(
  $q$ select count(*) from public.actes $q$,
  'Un visiteur non connecté ne peut pas lire les actes', 'permission denied'
);
select test.doit_echouer(
  $q$ select count(*) from public.entites $q$,
  'Un visiteur non connecté ne peut pas lire les entités', 'permission denied'
);
select test.doit_echouer(
  format('select public.encaisser(%L)', :'acte_kav'),
  'Un visiteur non connecté ne peut pas encaisser', 'permission denied'
);
select test.verifier(
  public.journaliser_connexion('mulongwe.caissier', false, 'Mot de passe incorrect', 'PC-INCONNU') is not null,
  'Un visiteur non connecté peut seulement faire noter un échec de connexion'
);
reset role;

-- ---------------------------------------------------------------------
-- 2. L'OFFICIER DE MULONGWE AU TRAVAIL
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000011');

select test.verifier(
  (select count(*) from public.entites) = 1 and (select code from public.entites) = 'MUL',
  'Officier : ne voit que son entité (Mulongwe)'
);
select test.verifier(
  (select count(*) from public.types_actes) = 2 and (select count(*) from public.tarifs_communs) = 3,
  'Officier : consulte le catalogue et la grille commune'
);
select test.verifier(
  (select count(*) from public.utilisateurs) = 1,
  'Officier : ne voit que son propre profil'
);

insert into public.actes (entite_id, type_acte_id, titulaire_nom) values
  (:'mul', :'nais', 'X'), (:'mul', :'nais', 'Y'), (:'mul', :'nais', 'Z'),
  (:'mul', :'nais', 'W'), (:'mul', :'nais', 'V');
select test.verifier(
  (select count(*) from public.actes) = 5,
  'Officier : crée 5 actes, et ne voit pas celui de Kavimvira'
);
select id as x from public.actes where titulaire_nom = 'X' \gset
select id as y from public.actes where titulaire_nom = 'Y' \gset
select id as z from public.actes where titulaire_nom = 'Z' \gset
select id as w from public.actes where titulaire_nom = 'W' \gset
select id as v from public.actes where titulaire_nom = 'V' \gset

update public.actes set statut = 'en_attente_paiement' where titulaire_nom in ('X', 'Y', 'Z', 'W');
select test.verifier(
  (select count(*) from public.actes where statut = 'en_attente_paiement') = 4,
  'Officier : transmet 4 actes au Caissier'
);

insert into public.details_naissance (acte_id, sexe, date_naissance) values (:'x', 'F', '2016-02-02');
select test.verifier(exists (select 1 from public.details_naissance), 'Officier : remplit la fiche naissance');

select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'Intrus') $q$, :'kav', :'nais'),
  'Officier : ne peut pas créer un acte dans une autre entité', 'row-level security'
);
select test.doit_echouer(
  format($q$ update public.actes set statut = 'paye' where id = %L $q$, :'x'),
  'Officier : ne peut pas déclarer lui-même un acte « payé »', 'que par la caisse'
);
select test.doit_echouer(
  format('select public.encaisser(%L)', :'x'),
  'Officier : ne peut pas encaisser', 'row-level security'
);
select test.doit_echouer(
  format($q$ insert into public.taux_change (entite_id, taux) values (%L, 2850) $q$, :'mul'),
  'Officier : ne peut pas saisir le taux de change', 'row-level security'
);
select test.doit_echouer(
  format($q$ insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis)
             values (%L, 99, 'USD', current_date + 30) $q$, :'nais'),
  'Officier : ne peut pas toucher à la grille commune', 'row-level security'
);

insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
  values (:'mul', :'res', 'national', 20000, 'CDF', current_date + 30, 'Décision du Bourgmestre');
select test.verifier(
  (select count(*) = 1 from public.tarifs_entites),
  'Officier : ajuste un tarif pour son entité'
);
select test.doit_echouer(
  format($q$ insert into public.tarifs_entites (entite_id, type_acte_id, montant, devise, en_vigueur_depuis)
             values (%L, %L, 1, 'CDF', current_date + 30) $q$, :'kav', :'res'),
  'Officier : ne peut pas ajuster un tarif d''une autre entité', 'row-level security'
);

-- Tentative de s'attribuer le rôle d'administrateur : aucune ligne modifiée
update public.utilisateurs set role = 'admin', entite_id = null, double_verification = true
  where id = '00000000-0000-0000-0000-000000000011';
select test.verifier(public.role_courant() = 'officier', 'Officier : ne peut pas modifier son propre rôle');

select from public.mot_de_passe_change();
select test.verifier(
  (select not doit_changer_mot_de_passe from public.utilisateurs),
  'Officier : peut lever lui-même l''obligation de changer son mot de passe, une fois changé'
);
select test.verifier(
  (select count(*) from public.journal_audit) = 0,
  'Officier : ne voit pas le journal d''audit'
);
select test.verifier(
  not public.hors_ligne_autorise('00000000-0000-0000-0000-000000000012'),
  'Officier : ne peut pas interroger la règle des 7 jours pour un collègue (pourtant connecté hier)'
);
select test.verifier(
  public.hors_ligne_autorise('00000000-0000-0000-0000-000000000011'),
  'Officier : peut interroger la règle des 7 jours pour lui-même'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 3. LE CAISSIER DE MULONGWE AU TRAVAIL
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000012');

insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'mul', 2850, now() - interval '1 minute');
select from public.encaisser(:'x');
select from public.encaisser(:'y');
select from public.encaisser(:'w');
select test.verifier(
  (select count(*) from public.recus) = 3,
  'Caissier : saisit le taux et encaisse 3 actes ; ne voit pas les reçus de Kavimvira'
);

-- Z est renvoyé à l'Officier pour correction
update public.actes set statut = 'enregistre' where id = :'z';
select test.verifier(
  (select statut = 'enregistre' from public.actes where id = :'z'),
  'Caissier : renvoie un acte à l''Officier pour correction'
);

select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'Par le caissier') $q$, :'mul', :'nais'),
  'Caissier : ne peut pas créer d''acte', 'row-level security'
);
select test.doit_echouer(
  format($q$ update public.actes set titulaire_nom = 'Autre nom' where id = %L $q$, :'x'),
  'Caissier : ne peut pas modifier le contenu d''un acte', 'Caissier ne peut que renvoyer'
);
select test.doit_echouer(
  format($q$ update public.actes set statut = 'delivre' where id = %L $q$, :'x'),
  'Caissier : ne peut pas marquer un acte « délivré »', 'Caissier ne peut que renvoyer'
);
select test.doit_echouer(
  format($q$ insert into public.details_naissance (acte_id, sexe, date_naissance) values (%L, 'M', '2015-01-01') $q$, :'y'),
  'Caissier : ne peut pas remplir une fiche de détails', 'row-level security'
);
select test.doit_echouer(
  format($q$ insert into public.tarifs_entites (entite_id, type_acte_id, montant, devise, en_vigueur_depuis)
             values (%L, %L, 1, 'CDF', current_date + 40) $q$, :'mul', :'res'),
  'Caissier : ne peut pas ajuster un tarif', 'row-level security'
);
select test.doit_echouer(
  format('select public.encaisser(%L)', :'acte_kav'),
  'Caissier : ne peut pas encaisser un acte d''une autre entité (et n''apprend rien sur cet acte)', 'Acte introuvable'
);
select test.se_deconnecter();

-- L'Officier corrige et retransmet Z, délivre X et archive son scan
select test.se_connecter('00000000-0000-0000-0000-000000000011');
update public.actes set statut = 'en_attente_paiement' where id = :'z';
update public.actes set statut = 'delivre' where id = :'x';
select public.chemin_archive(:'x', 'application/pdf') as chemin_x \gset
insert into storage.objects (bucket_id, name) values ('archives', :'chemin_x');
insert into public.documents_scannes (acte_id, type_mime, taille_octets, empreinte_sha256, mode_import)
  values (:'x', 'application/pdf', 200000, encode(extensions.digest('scan X', 'sha256'), 'hex'), 'scanner');
select test.verifier(
  (select count(*) = 1 from public.documents_scannes),
  'Officier : délivre l''acte X et archive son scan'
);
select test.doit_echouer(
  $q$ insert into storage.objects (bucket_id, name) values ('archives', 'KAV/2026/intrus.pdf') $q$,
  'Officier : ne peut pas déposer de fichier dans le dossier d''une autre entité', 'row-level security'
);
delete from storage.objects where name = :'chemin_x';
update storage.objects set name = 'MUL/renomme.pdf' where name = :'chemin_x';
select test.se_deconnecter();
select test.verifier(
  exists (select 1 from storage.objects where name = :'chemin_x'),
  'Officier : ne peut ni effacer ni renommer un fichier scanné (aucun effet)'
);

-- Le Caissier consulte le scan et exonère Z
select test.se_connecter('00000000-0000-0000-0000-000000000012');
select test.verifier(
  (select count(*) = 1 from public.documents_scannes)
  and (select count(*) = 1 from storage.objects where bucket_id = 'archives'),
  'Caissier : consulte le scan et le fichier de son entité'
);
select test.doit_echouer(
  $q$ insert into storage.objects (bucket_id, name) values ('archives', 'MUL/2026/par-le-caissier.pdf') $q$,
  'Caissier : ne peut pas déposer de fichier', 'row-level security'
);
select from public.exonerer(:'z', 'Indigent');
select test.verifier(
  (select statut = 'exonere' from public.actes where id = :'z'),
  'Caissier : exonère un acte avec motif'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 4. CLOISONNEMENT ENTRE ENTITÉS
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000021');  -- Officier de Kavimvira
select test.verifier(
  (select count(*) from public.actes) = 1
  and (select count(*) from public.recus) = 1
  and (select count(*) from public.documents_scannes) = 0
  and (select count(*) from storage.objects) = 0
  and (select count(*) from public.tarifs_entites) = 0,
  'Kavimvira : ne voit aucun acte, reçu, scan, fichier ni tarif de Mulongwe'
);
select test.doit_echouer(
  format($q$ select public.chemin_archive(%L, 'application/pdf') $q$, :'x'),
  'Kavimvira : ne peut pas obtenir l''emplacement du scan d''un acte de Mulongwe', 'introuvable'
);
select test.verifier(
  public.entite_de_acte(:'x') is null and public.journee_cloturee(:'mul', public.aujourdhui()) is null,
  'Kavimvira : ne peut savoir ni à quelle entité appartient un acte de Mulongwe, ni si Mulongwe a clôturé'
);
select test.verifier(
  public.entite_de_acte(:'acte_kav') = :'kav' and public.journee_cloturee(:'kav', public.aujourdhui()) = false,
  'Kavimvira : obtient bien ces informations pour ses propres actes et sa propre caisse'
);
update public.actes set titulaire_nom = 'Piratage' where id = :'x';
select test.se_deconnecter();
select test.verifier(
  (select titulaire_nom = 'X' from public.actes where id = :'x'),
  'Kavimvira : une tentative de modifier un acte de Mulongwe reste sans effet'
);

-- ---------------------------------------------------------------------
-- 5. L'ADMINISTRATEUR
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.verifier(
  (select count(*) from public.entites) = 2
  and (select count(*) from public.actes) = 6
  and (select count(*) from public.recus) = 4
  and (select count(*) from public.utilisateurs) = 6,
  'Admin : voit les 2 entités, tous les actes, tous les reçus et tous les comptes'
);
select test.verifier(
  (select count(*) from public.journal_audit) > 0 and (select count(*) from public.journal_connexions) > 0,
  'Admin : consulte le journal d''audit et le journal des connexions'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'Par l''admin') $q$, :'mul', :'nais'),
  'Admin : ne crée pas d''acte (il supervise sans opérer)', 'row-level security'
);
select test.doit_echouer(
  format($q$ insert into public.taux_change (entite_id, taux) values (%L, 2850) $q$, :'mul'),
  'Admin : ne saisit pas le taux de change', 'row-level security'
);
select test.doit_echouer(
  format($q$ update public.actes set titulaire_nom = 'Retouché' where id = %L $q$, :'v'),
  'Admin : ne peut pas modifier le contenu d''un acte', 'ne peut qu''annuler'
);
update public.actes set statut = 'annule', motif_annulation = 'Fraude constatée lors du contrôle' where id = :'v';
select test.verifier(
  (select statut = 'annule' and annule_par = '00000000-0000-0000-0000-00000000000a' from public.actes where id = :'v'),
  'Admin : annule un acte avec motif, en son nom'
);
select from public.annuler_recu((select id from public.recus where acte_id = :'y'), 'Reçu frauduleux');
select test.verifier(
  (select r.statut = 'annule' and a.statut = 'annule'
   from public.recus r join public.actes a on a.id = r.acte_id where r.acte_id = :'y'),
  'Admin : annule un reçu avant la clôture (l''acte est annulé avec)'
);
insert into public.tarifs_communs (type_acte_id, montant, devise, en_vigueur_depuis)
  values (:'nais', 35, 'USD', current_date + 60);
select test.verifier(
  (select count(*) = 4 from public.tarifs_communs),
  'Admin : programme un nouveau tarif dans la grille commune'
);
select test.verifier(
  not exists (select 1 from public.vue_ecarts_tarifs),
  'Admin : la vue des écarts est vide aujourd''hui (l''ajustement de Mulongwe n''entre en vigueur que dans 30 jours)'
);
select test.se_deconnecter();

-- Le Caissier clôture : 2 reçus valides de 30 $ (X et W)
select test.se_connecter('00000000-0000-0000-0000-000000000012');
select from public.cloturer_journee(:'mul', 60, 0);
select test.verifier(
  (select nb_recus = 2 and nb_recus_annules = 1 and nb_exonerations = 1 and ecart_usd = 0
   from public.clotures_caisse),
  'Caissier : clôture la journée (2 reçus, 1 annulé par l''admin, 1 exonération)'
);
select test.se_deconnecter();

-- Règle A : après la clôture, même l'admin ne peut plus annuler un reçu
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.doit_echouer(
  format($q$ select public.annuler_recu((select id from public.recus where acte_id = %L), 'Trop tard') $q$, :'w'),
  'Admin : ne peut plus annuler un reçu après la clôture de la journée', 'clôturée'
);
update public.utilisateurs set actif = false where nom_utilisateur = 'kavimvira.caissier';
select test.verifier(
  (select not actif from public.utilisateurs where nom_utilisateur = 'kavimvira.caissier'),
  'Admin : désactive un compte'
);
select test.verifier(
  public.hors_ligne_autorise('00000000-0000-0000-0000-000000000012'),
  'Admin : peut interroger la règle des 7 jours pour n''importe quel agent'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 6. JOURNAL DES CONNEXIONS : CHACUN VOIT LES SIENNES
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000011');
select from public.journaliser_connexion('mulongwe.officier', true, null, 'PC-MUL-01');
select test.se_deconnecter();
select test.se_connecter('00000000-0000-0000-0000-000000000012');
select test.verifier(
  (select count(*) = 1 and bool_and(utilisateur_id = '00000000-0000-0000-0000-000000000012')
   from public.journal_connexions),
  'Caissier : voit seulement ses propres connexions (l''échec noté plus haut), pas celles de l''Officier'
);
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 7. COMPTE DÉSACTIVÉ
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000019');
select test.verifier(
  (select count(*) from public.entites) = 0
  and (select count(*) from public.actes) = 0
  and (select count(*) from public.types_actes) = 0,
  'Compte désactivé : ne voit plus rien'
);
select test.doit_echouer(
  format($q$ insert into public.actes (entite_id, type_acte_id, titulaire_nom) values (%L, %L, 'Fantôme') $q$, :'mul', :'nais'),
  'Compte désactivé : ne peut plus rien créer', 'row-level security'
);
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000022');  -- caissier de Kavimvira, désactivé à l'instant
select test.verifier(
  (select count(*) from public.recus) = 0,
  'Un compte désactivé par l''admin perd immédiatement tout accès'
);
select test.se_deconnecter();

rollback;
