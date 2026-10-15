-- =====================================================================
-- TESTS du fichier 25 : REÇUS IMPRIMÉS
-- Transaction annulée à la fin.
-- =====================================================================
begin;

select id as mul from public.entites where code = 'MUL' \gset
select id as atidc from public.types_actes where code = 'ATIDC' \gset

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000082'),
  ('00000000-0000-0000-0000-000000000092');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, double_verification, doit_changer_mot_de_passe) values
  ('00000000-0000-0000-0000-00000000000a', 'admin.cdjp',         'Abbé Justin Nkunzi', 'admin',    null,   true,  false),
  ('00000000-0000-0000-0000-000000000081', 'mulongwe.officier',  'Bahati Mugisho',     'officier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000082', 'mulongwe.caissier',  'Neema Furaha',       'caissier', :'mul', false, false),
  ('00000000-0000-0000-0000-000000000092', 'kavimvira.caissier', 'Amani Zawadi',       'caissier', (select id from public.entites where code = 'KAV'), false, false);

select test.se_connecter('00000000-0000-0000-0000-000000000081');
select (public.enregistrer_acte(:'atidc', 'national', 'Furaha Neema', null, null, null, null, null, true)).id as a1 \gset
select (public.enregistrer_acte(:'atidc', 'national', 'Bisimwa Paul', null, null, null, null, null, true)).id as a2 \gset
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000082');
select (public.encaisser_verifie(:'a1', 'CDF', 8000)).id as r1 \gset
select (public.encaisser_verifie(:'a2', 'CDF', 8000)).id as r2 \gset
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 1. Jeton de vérification
-- ---------------------------------------------------------------------
select jeton_verification as j1 from public.recus where id = :'r1' \gset
select jeton_verification as j2 from public.recus where id = :'r2' \gset
select test.verifier(:'j1' ~ '^[0-9a-f]{32}$' and :'j1' <> :'j2', 'Jeton : 32 caractères aléatoires, différent pour chaque reçu');
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.doit_echouer(format($q$ update public.recus set jeton_verification = 'abc' where id = %L $q$, :'r1'),
  'Jeton : ne se change pas', 'Un reçu ne peut pas être modifié');
select test.se_deconnecter();

-- ---------------------------------------------------------------------
-- 2. Impressions : original puis duplicatas
-- ---------------------------------------------------------------------
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.verifier(public.enregistrer_impression(:'r1') = 1, 'Impression : la première est l''original (n° 1)');
select test.verifier(public.enregistrer_impression(:'r1', 'pdf') = 2, 'Téléchargement PDF ensuite : duplicata n° 2');
select test.verifier(public.enregistrer_impression(:'r2') = 1, 'Chaque reçu a sa propre numérotation');
select test.verifier((select count(*) = 3 from public.impressions_recus), 'Le Caissier voit les impressions de son entité');
select test.doit_echouer(format($q$ select public.enregistrer_impression(%L, 'fax') $q$, :'r1'), 'Forme inconnue refusée', 'Forme d''impression inconnue');
select test.doit_echouer(format($q$ insert into public.impressions_recus (recu_id, entite_id, numero, forme) values (%L, %L, 9, 'pdf') $q$, :'r1', :'mul'),
  'Pas d''écriture directe dans les impressions');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000092');
select test.doit_echouer(format($q$ select public.enregistrer_impression(%L) $q$, :'r1'),
  'Caissier d''une autre entité : reçu introuvable', 'Reçu introuvable');
select test.verifier((select count(*) = 0 from public.impressions_recus), '… et il ne voit pas les impressions de Mulongwe');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000081');
select test.doit_echouer(format($q$ select public.enregistrer_impression(%L) $q$, :'r1'),
  'Officier : n''imprime pas les reçus', 'Reçu introuvable');
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-00000000000a');
select test.verifier(public.enregistrer_impression(:'r1') = 3, 'Administrateur : peut réimprimer (duplicata n° 3)');
select test.se_deconnecter();

select test.verifier(
  (select count(*) = 4 from public.journal_audit where table_nom = 'impressions_recus' and operation = 'INSERT'),
  'Chaque impression est inscrite au journal d''audit');
select test.doit_echouer(format($q$ delete from public.impressions_recus where recu_id = %L $q$, :'r1'),
  'Une impression ne s''efface pas');

-- ---------------------------------------------------------------------
-- 3. Vérification publique (sans connexion)
-- ---------------------------------------------------------------------
set role anon;
select test.verifier(
  (select numero_recu like 'MUL-REC-%' and entite = 'Commune de Mulongwe' and montant_recu = 8000 and devise_recue = 'CDF'
          and statut = 'valide' and annule_le is null and type_acte is not null
   from public.verifier_recu(:'j1')),
  'Vérification sans connexion : n°, entité, montant, statut « valide »');
select test.verifier((select count(*) = 0 from public.verifier_recu('0123456789abcdef0123456789abcdef')), 'Jeton inconnu : rien');
select test.verifier((select count(*) = 0 from public.verifier_recu('x'' or 1=1 --')), 'Jeton mal formé : rien');
select test.doit_echouer('select count(*) from public.recus', 'Sans connexion : aucun accès direct aux reçus');
reset role;

-- Après annulation : le QR code montre « annulé »
select test.se_connecter('00000000-0000-0000-0000-000000000082');
select test.verifier((public.annuler_recu(:'r2', 'erreur de nom')).statut = 'annule', 'Le reçu n° 2 est annulé par le Caissier');
select test.se_deconnecter();
set role anon;
select test.verifier((select statut = 'annule' and annule_le is not null from public.verifier_recu(:'j2')),
  'Reçu annulé : la vérification le dit');
reset role;
select test.verifier((select jeton_verification = :'j2' from public.recus where id = :'r2'), 'L''annulation garde le jeton');

rollback;
