-- =====================================================================
-- TESTS du fichier 11 : DONNÉES DE DÉPART
-- + PARCOURS COMPLET sur les vraies données (tous les fichiers ensemble)
-- Transaction annulée à la fin (les données de départ, elles, restent).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Les 4 entités
-- ---------------------------------------------------------------------
select test.verifier(
  (select array_agg(code || ':' || type order by code) = array['BAV:chefferie', 'KAL:commune', 'KAV:commune', 'MUL:commune']
   from public.entites),
  'Les 4 entités sont installées : Bavira (chefferie), Kalundu, Kavimvira, Mulongwe (communes)'
);

-- ---------------------------------------------------------------------
-- 2. Le catalogue des 26 actes
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) = 26 and min(numero) = 1 and max(numero) = 26 and count(distinct code) = 26
   from public.types_actes),
  '26 actes numérotés de 1 à 26, chacun avec un code unique'
);
select test.verifier(
  (select bool_and(couleur is not null and actif) from public.types_actes),
  'Chaque acte a sa couleur et est actif'
);
select test.verifier(
  (select array_agg(numero order by numero) = array[5, 6, 7, 8, 15, 18]::smallint[]
   from public.types_actes where tarif_distinct_etranger),
  'Les 6 actes à tarif Étrangers distinct sont les n° 5, 6, 7, 8, 15 et 18 (comme sur la fiche)'
);
select test.verifier(
  (select string_agg(modele_fiche || '=' || n, ', ' order by modele_fiche) = 'naissance=3, mariage=4, deces=4, generique=15'
   from (select modele_fiche, count(*) n from public.types_actes group by modele_fiche) s),
  'Fiches de détails : 3 naissance, 4 mariage, 4 décès, 15 simples'
);

-- ---------------------------------------------------------------------
-- 3. La grille commune
-- ---------------------------------------------------------------------
select test.verifier(
  (select count(*) = 32 and bool_and(en_vigueur_depuis = '2026-01-01') from public.tarifs_communs),
  '32 tarifs (26 nationaux + 6 étrangers), en vigueur au 1er janvier 2026'
);
select test.verifier(
  (select count(*) = 17 and sum(montant) = 231000
   from public.tarifs_communs where categorie = 'national' and devise = 'CDF'),
  'Tarifs nationaux en FC : 17 actes, total de contrôle 231 000 FC (identique à la fiche)'
);
select test.verifier(
  (select count(*) = 9 and sum(montant) = 1550
   from public.tarifs_communs where categorie = 'national' and devise = 'USD'),
  'Tarifs nationaux en $ : 9 actes, total de contrôle 1 550 $ (identique à la fiche)'
);
select test.verifier(
  (select count(*) = 6 and sum(montant) = 165000
   from public.tarifs_communs where categorie = 'etranger'),
  'Tarifs étrangers : 6 actes, total de contrôle 165 000 FC (identique à la fiche)'
);

-- Quelques contrôles ligne par ligne, dans différentes entités
select id as mul from public.entites where code = 'MUL' \gset
select id as kal from public.entites where code = 'KAL' \gset
select id as bav from public.entites where code = 'BAV' \gset
select id as kav from public.entites where code = 'KAV' \gset

select test.verifier(
  (select montant = 60000 and devise = 'CDF'
   from public.tarif_applicable(:'mul', (select id from public.types_actes where code = 'NOTNAI'), 'national')),
  'Mulongwe, n° 01 Acte de notoriété supplétif : 60 000 FC'
);
select test.verifier(
  (select montant = 39000
   from public.tarif_applicable(:'kal', (select id from public.types_actes where code = 'ATRES'), 'etranger')),
  'Kalundu, n° 05 Attestation de résidence (étranger) : 39 000 FC'
);
select test.verifier(
  (select montant = 75 and devise = 'USD'
   from public.tarif_applicable(:'bav', (select id from public.types_actes where code = 'MAR'), 'national')),
  'Bavira, n° 03 Célébration de mariage : 75 $'
);
select test.verifier(
  (select montant = 500 and devise = 'USD'
   from public.tarif_applicable(:'kav', (select id from public.types_actes where code = 'PEXHUM'), 'national')),
  'Kavimvira, n° 14 Permis d''exhumation : 500 $'
);
select test.verifier(
  (select montant = 9000
   from public.tarif_applicable(:'mul', (select id from public.types_actes where code = 'ATDECD'), 'national')),
  'N° 12 Attestation de décès à domicile : 9 000 FC (montant ajouté à la main sur la fiche)'
);
select test.verifier(
  (select montant = 18000
   from public.tarif_applicable(:'mul', (select id from public.types_actes where code = 'CVIE'), 'etranger')),
  'N° 26 Certificat de vie, pour un étranger : 18 000 FC (pas de tarif étranger distinct)'
);

-- ---------------------------------------------------------------------
-- 4. Le fichier peut être rejoué sans rien dupliquer
-- ---------------------------------------------------------------------
\ir ../supabase/migrations/20261013001100_donnees_initiales.sql
select test.verifier(
  (select count(*) from public.entites) = 4
  and (select count(*) from public.types_actes) = 26
  and (select count(*) from public.tarifs_communs) = 32,
  'Rejouer le fichier ne crée aucun doublon (4 entités, 26 actes, 32 tarifs)'
);

-- =====================================================================
-- 5. PARCOURS COMPLET : une journée à Mulongwe, sur les vraies données
-- =====================================================================
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000012');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',        'Administrateur CDJP', 'admin',    null,   true),
  ('00000000-0000-0000-0000-000000000011', 'mulongwe.officier', 'Bahati Mugisho',      'officier', :'mul', false),
  ('00000000-0000-0000-0000-000000000012', 'mulongwe.caissier', 'Neema Furaha',        'caissier', :'mul', false);

-- 8 h 00 — L'Officier enregistre deux demandes
select test.se_connecter('00000000-0000-0000-0000-000000000011');
insert into public.actes (entite_id, type_acte_id, titulaire_nom, demandeur_nom)
  values (:'mul', (select id from public.types_actes where code = 'EXNAIS'), 'MUGISHO Bahati Jean', 'Mugisho Pierre');
insert into public.actes (entite_id, type_acte_id, titulaire_nom, categorie)
  values (:'mul', (select id from public.types_actes where code = 'ATRES'), 'John Smith', 'etranger');
select id as extrait, identifiant as id_extrait from public.actes where titulaire_nom = 'MUGISHO Bahati Jean' \gset
select id as attestation from public.actes where titulaire_nom = 'John Smith' \gset
insert into public.details_naissance (acte_id, sexe, date_naissance, lieu_naissance, nom_pere, nom_mere)
  values (:'extrait', 'M', '2015-03-21', 'Uvira', 'Mugisho Pierre', 'Bahati Claire');
update public.actes set statut = 'en_attente_paiement' where id in (:'extrait', :'attestation');
select test.verifier(
  (select montant_du = 30 and devise_du = 'USD' from public.actes where id = :'extrait')
  and (select montant_du = 39000 and devise_du = 'CDF' from public.actes where id = :'attestation'),
  'Parcours — Officier : 2 actes enregistrés et transmis ; prix tirés de la grille (30 $ et 39 000 FC)'
);
select test.se_deconnecter();

-- 8 h 30 — Le Caissier saisit le taux du jour et encaisse
select test.se_connecter('00000000-0000-0000-0000-000000000012');
insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values (:'mul', 2850, now() - interval '1 minute');
select from public.encaisser(:'extrait', 'CDF');
select from public.encaisser(:'attestation');
select test.verifier(
  (select sum(montant_recu) = 124500 and bool_and(devise_recue = 'CDF') from public.recus),
  'Parcours — Caissier : 85 500 FC (30 $ payés en francs) + 39 000 FC = 124 500 FC encaissés'
);
select test.se_deconnecter();

-- 10 h 00 — L'Officier remet l'extrait et l'archive
select test.se_connecter('00000000-0000-0000-0000-000000000011');
update public.actes set statut = 'delivre' where id = :'extrait';
select public.chemin_archive(:'extrait', 'application/pdf') as chemin \gset
insert into storage.objects (bucket_id, name) values ('archives', :'chemin');
insert into public.documents_scannes (acte_id, type_mime, taille_octets, nb_pages, empreinte_sha256, mode_import)
  values (:'extrait', 'application/pdf', 210000, 1, encode(extensions.digest('extrait signé', 'sha256'), 'hex'), 'scanner');
select test.verifier(
  (select identifiant = :'id_extrait' and a_un_scan and statut = 'delivre'
   from public.rechercher_actes('bahati mugisho') where type_code = 'EXNAIS'),
  'Parcours — Officier : extrait délivré, scanné, et retrouvé par la recherche « bahati mugisho »'
);
select test.se_deconnecter();

-- 17 h 00 — Le Caissier clôture la journée
select test.se_connecter('00000000-0000-0000-0000-000000000012');
select from public.cloturer_journee(:'mul', 0, 124500);
select test.verifier(
  (select nb_recus = 2 and ecart_cdf = 0 and ecart_usd = 0 and nb_actes_sans_scan = 1 from public.clotures_caisse),
  'Parcours — Clôture : 2 reçus, caisse juste, 1 acte payé sans scan signalé (l''attestation)'
);
select test.se_deconnecter();

-- 18 h 00 — L'admin consulte le rapport du jour et le journal
select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.verifier(
  (select recettes_equivalent_cdf = 124500 and recus_valides = 2 and jours_clotures = 1
   from public.rapport_synthese('jour') where entite_code = 'MUL')
  and (select recettes_equivalent_cdf = 124500 from public.rapport_synthese('jour') where entite_code = 'TOTAL')
  and (select count(*) = 5 from public.rapport_synthese('jour')),
  'Parcours — Admin : rapport du jour pour les 4 entités + TOTAL ; Mulongwe = 124 500 FC'
);
select test.verifier(
  (select array_agg(distinct utilisateur order by utilisateur) = array['mulongwe.caissier', 'mulongwe.officier']
          and count(*) >= 10
   from public.vue_journal_audit where entite_code = 'MUL' and utilisateur <> '(système)'),
  'Parcours — Admin : chaque geste de l''Officier et du Caissier figure au journal d''audit'
);
select test.se_deconnecter();

rollback;
